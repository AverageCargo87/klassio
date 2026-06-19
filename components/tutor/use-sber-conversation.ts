'use client'
// components/tutor/use-sber-conversation.ts — drop-in замена 11labs
// useConversation для RU-стека (Sber). Подключается по WS к оркестратору
// infra/h2nexus/sber-tutor/index.mjs (Франкфурт, рядом с voice-proxy) и
// повторяет контракт, который использует tutor-lesson:
//
//   const conversation = useSberConversation({ clientTools, onModeChange, onMessage, onError })
//   conversation.status                  'disconnected' | 'connecting' | 'connected'
//   conversation.startSession({...})     mic + WS + init
//   conversation.endSession()
//   conversation.setMuted(m)             mute = микрофон игнорируется, сессия живёт
//   conversation.sendUserMessage(t)      → Аня реагирует СЕЙЧАС (как у 11labs)
//   conversation.sendContextualUpdate(t) → только контекст, без реакции
//
// Голосовой ход целиком на сервере (STT→GigaChat tool-loop→TTS по-предложениям);
// браузер владеет только микрофоном (energy-VAD, цельная реплика PCM16@16k — как
// в проверенном стенде scripts/ru-voice-live-stream.mjs) и очередью аудио-чанков
// (Web Audio, по порядку; первый играет, пока следующие ещё синтезируются).
//
// WS-протокол описан в шапке infra/h2nexus/sber-tutor/index.mjs.
// Барж-ина в v1 нет: пока Аня думает/говорит, микрофон не пишется.
import { useCallback, useRef, useState } from 'react'

export type SberClientTools = Record<
  string,
  (params: Record<string, unknown>) => string | number | void | Promise<string | number | void>
>

export type SberMode = 'speaking' | 'listening' | 'thinking'

export interface UseSberConversationOptions {
  clientTools: SberClientTools
  onModeChange?: (event: { mode: SberMode }) => void
  onMessage?: (event: { message: string; role: 'user' | 'agent' }) => void
  onError?: (message: string) => void
}

export interface SberStartOptions {
  /** Подписанный wss:// URL оркестратора (минтится /api/tutor/sber-url). */
  wsUrl: string
  /** Имя учителя — приветствие + {{teacher_name}} в промпте. */
  voiceName: string
  /** Голос SaluteSpeech (Nec_24000 / May_24000 / Ost_24000). */
  voiceId?: string
  dynamicVariables: Record<string, string | number | boolean>
}

export type SberStatus = 'disconnected' | 'connecting' | 'connected'

// VAD — значения с живого стенда (ru-voice-live-stream.mjs):
// 700 мс тишины = баланс между «не перебить ребёнка» и felt-латентностью.
const VAD_THRESHOLD = 0.015
const VAD_SILENCE_MS = 700
const VAD_MIN_SPEECH_MS = 250
const VAD_MAX_UTTERANCE_MS = 15000
const READY_TIMEOUT_MS = 20000

type Phase = 'idle' | 'listening' | 'recording' | 'waiting'

export function useSberConversation(options: UseSberConversationOptions) {
  const [status, setStatus] = useState<SberStatus>('disconnected')

  // Колбэки и инструменты — через ref, чтобы WS-хендлеры не ловили stale-замыкания.
  const optsRef = useRef(options)
  optsRef.current = options

  const wsRef = useRef<WebSocket | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const procRef = useRef<ScriptProcessorNode | null>(null)

  // машина состояний микрофона (см. Phase) + накопители VAD
  const phaseRef = useRef<Phase>('idle')
  const recBufRef = useRef<Float32Array[]>([])
  const speechMsRef = useRef(0)
  const silenceMsRef = useRef(0)
  const mutedRef = useRef(false)
  const intentionalCloseRef = useRef(false)
  const readyTimerRef = useRef<number | null>(null)

  // очередь воспроизведения: чанки по порядку; agent_done + пустая очередь → снова слушаем
  const audioQueueRef = useRef<string[]>([])
  const playingRef = useRef(false)
  const agentDoneRef = useRef(false)

  const emitMode = useCallback((mode: SberMode) => {
    try { optsRef.current.onModeChange?.({ mode }) } catch (e) { console.error('[sber] onModeChange', e) }
  }, [])

  const wsSend = useCallback((obj: Record<string, unknown>) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(obj)) } catch (e) { console.error('[sber] ws send', e) }
    }
  }, [])

  const cleanup = useCallback(() => {
    if (readyTimerRef.current !== null) { window.clearTimeout(readyTimerRef.current); readyTimerRef.current = null }
    phaseRef.current = 'idle'
    recBufRef.current = []
    audioQueueRef.current = []
    playingRef.current = false
    agentDoneRef.current = false
    try { procRef.current?.disconnect() } catch { /* noop */ }
    procRef.current = null
    streamRef.current?.getTracks().forEach((t) => { try { t.stop() } catch { /* noop */ } })
    streamRef.current = null
    const ctx = ctxRef.current
    ctxRef.current = null
    if (ctx && ctx.state !== 'closed') { void ctx.close().catch(() => { /* noop */ }) }
    const ws = wsRef.current
    wsRef.current = null
    if (ws && ws.readyState <= WebSocket.OPEN) { try { ws.close(1000) } catch { /* noop */ } }
    setStatus('disconnected')
  }, [])

  // ── воспроизведение: упорядоченная очередь чанков ──────────────────────────
  const maybeResumeListening = useCallback(() => {
    if (!agentDoneRef.current || playingRef.current || audioQueueRef.current.length > 0) return
    agentDoneRef.current = false
    if (phaseRef.current === 'idle') return // сессия уже закрыта
    phaseRef.current = 'listening'
    recBufRef.current = []
    speechMsRef.current = 0
    silenceMsRef.current = 0
    emitMode('listening')
  }, [emitMode])

  const pump = useCallback(() => {
    const ctx = ctxRef.current
    const b64 = audioQueueRef.current.shift()
    if (!ctx || b64 === undefined) {
      playingRef.current = false
      maybeResumeListening()
      return
    }
    playingRef.current = true
    if (phaseRef.current !== 'idle' && phaseRef.current !== 'waiting') phaseRef.current = 'waiting'
    try {
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      ctx.decodeAudioData(bytes.buffer).then(
        (audioBuf) => {
          const ctx2 = ctxRef.current
          if (!ctx2 || phaseRef.current === 'idle') { playingRef.current = false; return }
          const src = ctx2.createBufferSource()
          src.buffer = audioBuf
          src.connect(ctx2.destination)
          src.onended = () => pump()
          src.start()
          emitMode('speaking')
        },
        (e) => { console.warn('[sber] decode', e); pump() },
      )
    } catch (e) {
      console.warn('[sber] pump', e)
      pump()
    }
  }, [emitMode, maybeResumeListening])

  const enqueueAudio = useCallback((b64: string) => {
    if (!b64) return
    audioQueueRef.current.push(b64)
    if (!playingRef.current) pump()
  }, [pump])

  // ── микрофон: energy-VAD, цельная реплика → PCM16@16k → WS binary ──────────
  const finishUtterance = useCallback(() => {
    const ctx = ctxRef.current
    const ws = wsRef.current
    const chunks = recBufRef.current
    recBufRef.current = []
    phaseRef.current = 'waiting'
    if (!ctx || !ws || ws.readyState !== WebSocket.OPEN || chunks.length === 0) {
      phaseRef.current = 'listening'
      return
    }
    emitMode('thinking') // STT идёт до серверного mode:thinking — рисуем «думаю» сразу
    const total = chunks.reduce((acc, c) => acc + c.length, 0)
    const all = new Float32Array(total)
    let off = 0
    for (const c of chunks) { all.set(c, off); off += c.length }
    const ratio = ctx.sampleRate / 16000
    const n = Math.floor(all.length / ratio)
    const pcm = new Int16Array(n)
    for (let i = 0; i < n; i++) {
      const v = all[Math.floor(i * ratio)] || 0
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)))
    }
    try { ws.send(pcm.buffer) } catch (e) {
      console.error('[sber] send audio', e)
      phaseRef.current = 'listening'
    }
  }, [emitMode])

  const handleAudioProcess = useCallback((e: AudioProcessingEvent) => {
    const ctx = ctxRef.current
    if (!ctx) return
    const data = e.inputBuffer.getChannelData(0)
    const bufMs = (data.length / ctx.sampleRate) * 1000
    const phase = phaseRef.current
    if (phase !== 'listening' && phase !== 'recording') return // нет барж-ина
    if (mutedRef.current) {
      // mute: молча сбрасываем недописанную реплику и ждём
      if (phase === 'recording') { phaseRef.current = 'listening'; recBufRef.current = [] }
      return
    }
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
    const energy = Math.sqrt(sum / data.length)
    if (phase === 'listening') {
      if (energy > VAD_THRESHOLD) {
        phaseRef.current = 'recording'
        recBufRef.current = [new Float32Array(data)]
        speechMsRef.current = bufMs
        silenceMsRef.current = 0
      }
      return
    }
    // recording
    recBufRef.current.push(new Float32Array(data))
    if (energy > VAD_THRESHOLD) { speechMsRef.current += bufMs; silenceMsRef.current = 0 }
    else silenceMsRef.current += bufMs
    const totalMs = recBufRef.current.length * bufMs
    if (
      (silenceMsRef.current >= VAD_SILENCE_MS && speechMsRef.current >= VAD_MIN_SPEECH_MS) ||
      totalMs >= VAD_MAX_UTTERANCE_MS
    ) finishUtterance()
  }, [finishUtterance])

  // ── входящие сообщения оркестратора ────────────────────────────────────────
  const handleServerMessage = useCallback((raw: string) => {
    let m: { type?: string; [k: string]: unknown }
    try { m = JSON.parse(raw) } catch { return }
    switch (m.type) {
      case 'ready': {
        if (readyTimerRef.current !== null) { window.clearTimeout(readyTimerRef.current); readyTimerRef.current = null }
        setStatus('connected')
        break
      }
      case 'mode': {
        // 'speaking'/'listening' сервера игнорируем — у браузера своя правда
        // (аудио ещё играет, когда сервер уже всё отправил). 'thinking' = сервер
        // начал ход (в т.ч. по user_text-триггеру) → гасим запись и ждём.
        if (m.mode === 'thinking') {
          if (phaseRef.current === 'listening' || phaseRef.current === 'recording') {
            phaseRef.current = 'waiting'
            recBufRef.current = []
          }
          emitMode('thinking')
        }
        break
      }
      case 'transcript': {
        const text = typeof m.text === 'string' ? m.text : ''
        const role = m.role === 'agent' ? 'agent' : 'user'
        if (text) {
          try { optsRef.current.onMessage?.({ message: text, role }) } catch (e) { console.error('[sber] onMessage', e) }
        }
        break
      }
      case 'tool_call': {
        const id = m.id
        const name = typeof m.name === 'string' ? m.name : ''
        const args = (m.args && typeof m.args === 'object' ? m.args : {}) as Record<string, unknown>
        void (async () => {
          let result = 'OK'
          try {
            const fn = optsRef.current.clientTools[name]
            if (!fn) result = `Error: неизвестный инструмент "${name}" — не используй его, работай доступными.`
            else {
              const r = await fn(args)
              result = r === undefined || r === null ? 'OK' : String(r)
            }
          } catch (e) {
            result = 'Error: ' + String((e as Error)?.message || e)
          }
          wsSend({ type: 'tool_result', id, result })
        })()
        break
      }
      case 'audio': {
        if (typeof m.b64 === 'string') enqueueAudio(m.b64)
        break
      }
      case 'agent_done': {
        agentDoneRef.current = true
        maybeResumeListening()
        break
      }
      case 'error': {
        console.error('[sber] server error:', m.message)
        try { optsRef.current.onError?.(String(m.message ?? 'server error')) } catch { /* noop */ }
        break
      }
    }
  }, [emitMode, enqueueAudio, maybeResumeListening, wsSend])

  // ── публичный API ──────────────────────────────────────────────────────────
  const startSession = useCallback(async ({ wsUrl, voiceName, voiceId, dynamicVariables }: SberStartOptions) => {
    if (wsRef.current) return
    intentionalCloseRef.current = false
    setStatus('connecting')
    try {
      // mic + AudioContext — внутри жеста клика (разблокирует autoplay)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      const ctx = new AudioContext()
      if (ctx.state === 'suspended') await ctx.resume()
      streamRef.current = stream
      ctxRef.current = ctx
      const src = ctx.createMediaStreamSource(stream)
      const proc = ctx.createScriptProcessor(4096, 1, 1)
      proc.onaudioprocess = handleAudioProcess
      src.connect(proc)
      proc.connect(ctx.destination) // proc молчит (выходной буфер не пишем) — нужен, чтобы колбэк тикал
      procRef.current = proc
      mutedRef.current = false
      phaseRef.current = 'waiting' // ждём приветствие Ани

      const ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws
      ws.onopen = () => {
        wsSend({ type: 'init', voiceName, voiceId, dynamicVariables })
      }
      ws.onmessage = (ev) => { if (typeof ev.data === 'string') handleServerMessage(ev.data) }
      ws.onerror = () => { /* onclose даст подробности */ }
      ws.onclose = () => {
        const wasIntentional = intentionalCloseRef.current
        if (wsRef.current === ws) {
          wsRef.current = null
          cleanup()
          if (!wasIntentional) {
            try { optsRef.current.onError?.('Соединение с голосовым сервисом прервано') } catch { /* noop */ }
          }
        }
      }
      readyTimerRef.current = window.setTimeout(() => {
        if (wsRef.current === ws && ws.readyState !== WebSocket.CLOSED) {
          console.error('[sber] ready timeout')
          intentionalCloseRef.current = true
          cleanup()
          try { optsRef.current.onError?.('Голосовой сервис не ответил — попробуй ещё раз') } catch { /* noop */ }
        }
      }, READY_TIMEOUT_MS)
    } catch (e) {
      console.error('[sber] startSession', e)
      intentionalCloseRef.current = true
      cleanup()
      throw e
    }
  }, [cleanup, handleAudioProcess, handleServerMessage, wsSend])

  const endSession = useCallback(() => {
    intentionalCloseRef.current = true
    wsSend({ type: 'end' })
    cleanup()
  }, [cleanup, wsSend])

  const setMuted = useCallback((muted: boolean) => { mutedRef.current = muted }, [])

  const sendUserMessage = useCallback((text: string) => {
    wsSend({ type: 'user_text', text, trigger: true })
  }, [wsSend])

  const sendContextualUpdate = useCallback((text: string) => {
    wsSend({ type: 'user_text', text, trigger: false })
  }, [wsSend])

  return { status, startSession, endSession, setMuted, sendUserMessage, sendContextualUpdate }
}
