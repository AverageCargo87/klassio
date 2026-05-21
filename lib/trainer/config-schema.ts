import { z } from 'zod'

// Phase 8.7 (2026-05-21) — intro блоки: короткие теоретические врезки между
// задачами. Не имеют интерактивности, не учитываются в counter «N из M»,
// но проходятся в навигации тренажёра. Используются для Duolingo-стиля
// «прочитай → потом задачи».
export const trainerIntroSchema = z.object({
  id: z.string().min(1),               // e.g. "intro-1"
  type: z.literal('intro'),
  title: z.string().min(1),            // e.g. "Что такое столбик?"
  body: z.string().min(1),             // короткое объяснение, 2-4 предложения
})

export const trainerTaskSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['numeric-input', 'single-choice', 'matching']),
  prompt: z.string().min(1),
  correct: z.union([
    z.string(),
    z.number(),
    z.array(z.tuple([z.string(), z.string()])),
  ]),
  hints: z.array(z.string()).max(3).optional(),
  options: z.array(z.string()).optional(),
  // Phase 8.7 — короткое объяснение что показать после правильного ответа.
  // 1-2 предложения, закрепляющие концепцию.
  explanation: z.string().optional(),
  // Phase 8.7 — уровень сложности 1-3 (визуальные звёздочки в UI).
  // Не влияет на логику — только на визуальный marker.
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
})

export const trainerConfigSchema = z.object({
  title: z.string().min(1),
  // Phase 8.7 — опциональные intro блоки в начале урока (теоретическая
  // подготовка перед задачами). Если не заданы — урок начинается сразу
  // с задач (backward compatible с старыми конфигами Phase 7).
  intro: z.array(trainerIntroSchema).optional(),
  tasks: z.array(trainerTaskSchema).min(1),
})

export type TrainerIntro = z.infer<typeof trainerIntroSchema>
export type TrainerTask = z.infer<typeof trainerTaskSchema>
export type TrainerConfig = z.infer<typeof trainerConfigSchema>
