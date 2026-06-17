// AI-резюме урока («замечания учителя» в ЛК). Стек-агностично: строится из
// сохранённого транскрипта (lib/tutor/transcript) через OpenAI — одинаково для
// 11labs и Sber-уроков. Вызывается на завершении урока. Если транскрипта нет
// или ключа нет — тихо пропускаем (резюме остаётся NULL, ЛК это переживает).
import OpenAI from 'openai'
import { db } from '@/lib/db'
import { tutorSessions } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { getTranscript } from './transcript'

const SUMMARY_MODEL = process.env.TUTOR_SUMMARY_MODEL || 'gpt-4.1-mini'

const SYSTEM = `Ты — методист. По расшифровке голосового урока ребёнка 9–10 лет с AI-репетитором составь короткое резюме для РОДИТЕЛЯ (3–5 предложений, тёплый тон, простыми словами). Структура: что прошли на уроке; как ребёнок справлялся (что получалось, где затруднялся); 1 конкретный совет, на что обратить внимание дома. Без воды, без обращения «здравствуйте». Только сам текст резюме.`

/** Сохранить готовое резюме в сессию (если уже есть текст). */
export async function setSessionSummary(sessionId: string, userId: string, summary: string): Promise<void> {
  await db
    .update(tutorSessions)
    .set({ summary: summary.slice(0, 2000) })
    .where(and(eq(tutorSessions.id, sessionId), eq(tutorSessions.userId, userId)))
}

/**
 * Сгенерировать и сохранить AI-резюме урока из его транскрипта. Возвращает текст
 * резюме или null (нет транскрипта / нет ключа / ошибка LLM — не ломаем завершение).
 */
export async function generateLessonSummary(sessionId: string, userId: string): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null
  const lines = await getTranscript(sessionId, userId)
  if (lines.length < 2) return null // пустой/обрывочный урок — резюмировать нечего

  const convo = lines
    .map((l) => `${l.role === 'agent' ? 'Учитель' : 'Ребёнок'}: ${l.text}`)
    .join('\n')
    .slice(0, 12000) // потолок на длинный урок

  try {
    const openai = new OpenAI()
    const res = await openai.chat.completions.create({
      model: SUMMARY_MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Расшифровка урока:\n\n${convo}` },
      ],
      temperature: 0.4,
      max_tokens: 320,
    })
    const summary = res.choices[0]?.message?.content?.trim()
    if (!summary) return null
    await setSessionSummary(sessionId, userId, summary)
    return summary
  } catch (e) {
    console.error('[tutor/summary] generation failed:', e)
    return null
  }
}
