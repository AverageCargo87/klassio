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
//
// BARGE-IN (перебивание): пока Аня ГОВОРИТ (playback), VAD продолжает слушать по
// повышенному порогу. Если ребёнок заговорил ≥ BARGE_MIN_MS — глушим её аудио
// мгновенно, выбрасываем хвост её хода и начинаем писать реплику ребёнка. Плюс
// шлём оркестратору {type:'interrupt'} (старые оркестраторы без поддержки просто
// игнорируют неизвестный тип — тогда её голос всё равно замолкает локально, но
// ответ на перебивание придёт после того, как старый ход догенерится на сервере).
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
const VAD_SILENCE_MS = 700
// 320мс минимум речи: короткие шумы (стук, скрип) не считаются репликой —
// иначе пустой STT превращался в «(не расслышала)» → «повтори» при молчании.
const VAD_MIN_SPEECH_MS = 320
const VAD_MAX_UTTERANCE_MS = 15000
const READY_TIMEOUT_MS = 20000
// Сторож «завис в думает»: канал ученик(РФ)↔оркестратор(Франкфурт) бывает полу-мёртвым —
// ребёнок сказал, аудио ушло в никуда, ответа нет, а «Аня думает» висит вечно.
// Реальные ходы доходят до первого звука <7с; 22с = заведомо мёртвый сокет.
const THINK_TIMEOUT_MS = 22000

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
  const thinkTimerRef = useRef<number | null>(null)   // сторож «завис в думает»
  const cleanupRef = useRef<() => void>(() => {})     // чтобы сторож дёрнул cleanup без цикла зависимостей

  // очередь воспроизведения: чанки по порядку; agent_done + пустая очередь → снова слушаем
  const audioQueueRef = useRef<string[]>([])
  const playingRef = useRef(false)
  const agentDoneRef = useRef(false)
  // нахлёст-запись + обрыв хода действием
  const currentSrcRef = useRef<AudioBufferSourceNode | null>(null) // играющий чанк — чтобы оборвать
  const droppingAudioRef = useRef(false)   // после interrupt дропаем хвост старого хода
  const awaitingNewTurnRef = useRef(false) // ждём mode:thinking нового хода (не резюмим слушание)
  const bargeMsRef = useRef(0)             // накопленная речь ребёнка поверх голоса Ани
  const overlapSilRef = useRef(0)          // тишина после нахлёст-реплики
  // Адаптивный порог мика: жёсткий 0.015 «не слышал» тихие микрофоны (спайк 07-03).
  const noiseFloorRef = useRef(0.004)
  const vadThr = () => Math.min(0.03, Math.max(0.008, noiseFloorRef.current * 3 + 0.003))

  const emitMode = useCallback((mode: SberMode) => {
    // Сторож «думает»: ставим при входе в thinking, снимаем при speaking/listening
    // (= сервер жив и отвечает). Если сокет полу-мёртв — режимов больше не будет,
    // сторож сработает и разморозит UI (см. THINK_TIMEOUT_MS).
    if (thinkTimerRef.current !== null) { window.clearTimeout(thinkTimerRef.current); thinkTimerRef.current = null }
    if (mode === 'thinking') {
      thinkTimerRef.current = window.setTimeout(() => {
        thinkTimerRef.current = null
        console.error('[sber] think watchdog — сервер молчит >', THINK_TIMEOUT_MS, 'мс, размораживаю UI')
        intentionalCloseRef.current = true
        cleanupRef.current()
        try { optsRef.current.onError?.('Связь с Аней прервалась. Нажми «Начать урок», чтобы продолжить.') } catch { /* noop */ }
      }, THINK_TIMEOUT_MS)
    }
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
    if (thinkTimerRef.current !== null) { window.clearTimeout(thinkTimerRef.current); thinkTimerRef.current = null }
    phaseRef.current = 'idle'
    recBufRef.current = []
    audioQueueRef.current = []
    playingRef.current = false
    agentDoneRef.current = false
    droppingAudioRef.current = false
    awaitingNewTurnRef.current = false
    bargeMsRef.current = 0
    overlapSilRef.current = 0
    try { currentSrcRef.current?.stop() } catch { /* noop */ }
    currentSrcRef.current = null
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
  cleanupRef.current = cleanup // сторож «думает» дёргает cleanup через ref (без цикла зависимостей)

  // ── воспроизведение: упорядоченная очередь чанков ──────────────────────────
  const maybeResumeListening = useCallback(() => {
    // Ждём ответ нового хода после перебивания — не резюмим по agent_done старого.
    if (awaitingNewTurnRef.current) return
    if (!agentDoneRef.current || playingRef.current || audioQueueRef.current.length > 0) return
    agentDoneRef.current = false
    // Резюмим слушание ТОЛЬКО из фазы ожидания ответа Ани. Если ребёнок сейчас
    // говорит (recording) или уже слушаем — не трогаем (иначе стёрли бы запись).
    if (phaseRef.current !== 'waiting') return
    phaseRef.current = 'listening'
    recBufRef.current = []
    speechMsRef.current = 0
    silenceMsRef.current = 0
    bargeMsRef.current = 0
    overlapSilRef.current = 0
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
          currentSrcRef.current = src
          src.onended = () => {
            if (currentSrcRef.current === src) currentSrcRef.current = null
            pump()
          }
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
    if (droppingAudioRef.current) return // хвост перебитого хода — не проигрываем
    audioQueueRef.current.push(b64)
    if (!playingRef.current) pump()
  }, [pump])

  // Обрыв хода ДЕЙСТВИЕМ (клик по ответу в тренажёре): глушим хвост её реплики
  // локально и просим оркестратор прервать ход — дальше придёт свежая реакция,
  // без «отработки очереди» устаревших фраз. Голосом Аню не перебиваем (колонки).
  const interruptTurn = useCallback(() => {
    droppingAudioRef.current = true
    awaitingNewTurnRef.current = true
    audioQueueRef.current = []
    try { currentSrcRef.current?.stop() } catch { /* noop */ }
    currentSrcRef.current = null
    playingRef.current = false
    agentDoneRef.current = false
    wsSend({ type: 'interrupt' }) // без поддержки на сервере — тихо игнорируется
  }, [wsSend])

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
    if (mutedRef.current) {
      // mute: микрофон выключен — ни записи, ни нахлёста
      if (phase === 'recording') { phaseRef.current = 'listening'; recBufRef.current = [] }
      bargeMsRef.current = 0
      overlapSilRef.current = 0
      return
    }
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
    const energy = Math.sqrt(sum / data.length)

    // СТРОГИЙ ПОЛУДУПЛЕКС: пока Аня думает/говорит — микрофон игнорируется ПОЛНОСТЬЮ.
    // Ловля нахлёста (запись поверх её речи) на колонках ловила эхо её голоса →
    // фантомные пустые реплики → «(не расслышала)» → «повтори, пожалуйста» при
    // молчащем ребёнке (мик-тест 2026-07-07). Дешевле честно просить дождаться
    // паузы (подсказка над микрофоном), чем гадать, эхо это или ребёнок.
    if (phase === 'waiting') { bargeMsRef.current = 0; overlapSilRef.current = 0; recBufRef.current = []; return }

    if (phase !== 'listening' && phase !== 'recording') return
    const thr = vadThr()
    if (phase === 'listening') {
      if (energy > thr) {
        phaseRef.current = 'recording'
        recBufRef.current = [new Float32Array(data)]
        speechMsRef.current = bufMs
        silenceMsRef.current = 0
      } else {
        noiseFloorRef.current = noiseFloorRef.current * 0.95 + energy * 0.05 // учим шумовой пол
      }
      return
    }
    // recording
    recBufRef.current.push(new Float32Array(data))
    if (energy > thr) { speechMsRef.current += bufMs; silenceMsRef.current = 0 }
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
          // Новый ход начался (в т.ч. ответ на перебивание) → снять флаги
          // перебивания и разрешить аудио нового хода; погасить stale agent_done.
          droppingAudioRef.current = false
          awaitingNewTurnRef.current = false
          agentDoneRef.current = false
          if (phaseRef.current === 'listening' || phaseRef.current === 'recording') {
            phaseRef.current = 'waiting'
            recBufRef.current = []
            bargeMsRef.current = 0
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

  return { status, startSession, endSession, setMuted, sendUserMessage, sendContextualUpdate, interrupt: interruptTurn }
}
