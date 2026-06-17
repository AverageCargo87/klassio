'use client'
// components/tutor/use-transcript-logger.ts — буфер транскрипта урока на клиенте.
// Реплики (Ани и ребёнка) копятся и шлются батчами на /api/tutor/transcript:
// периодически + перед завершением урока + при уходе со страницы. Так запись
// урока сохраняется для ЛК, но без HTTP-запроса на каждую реплику.
//
// Подходит обоим голосовым стекам (11labs tutor-lesson + Sber tutor-lesson-ru):
// оба зовут logLine('tutor'|'child', text) из onMessage и flush() при завершении.
import { useCallback, useEffect, useRef } from 'react'

interface BufferedLine { role: 'agent' | 'child'; text: string; seq: number }

const FLUSH_INTERVAL_MS = 15000
const MAX_BATCH = 200

export function useTranscriptLogger(sessionId: string) {
  const bufferRef = useRef<BufferedLine[]>([])
  const seqRef = useRef(0)
  const inFlightRef = useRef(false)

  // Отправить накопленное. При ошибке возвращаем строки в буфер (ретрай позже).
  const flush = useCallback(async () => {
    if (inFlightRef.current || bufferRef.current.length === 0) return
    inFlightRef.current = true
    const batch = bufferRef.current.splice(0, MAX_BATCH)
    try {
      const res = await fetch('/api/tutor/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, lines: batch }),
        keepalive: true, // долетит, даже если вкладка закрывается
      })
      if (!res.ok) bufferRef.current.unshift(...batch)
    } catch {
      bufferRef.current.unshift(...batch)
    } finally {
      inFlightRef.current = false
    }
  }, [sessionId])

  const logLine = useCallback((role: 'tutor' | 'child', text: string) => {
    const t = (text ?? '').trim()
    if (!t) return
    bufferRef.current.push({ role: role === 'tutor' ? 'agent' : 'child', text: t, seq: seqRef.current++ })
  }, [])

  // периодический флаш + флаш при сворачивании/закрытии вкладки + на размонтировании
  useEffect(() => {
    const id = window.setInterval(() => { void flush() }, FLUSH_INTERVAL_MS)
    const onHide = () => { void flush() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
      void flush()
    }
  }, [flush])

  return { logLine, flush }
}
