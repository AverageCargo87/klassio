import { z } from 'zod'

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
})

export const trainerConfigSchema = z.object({
  title: z.string().min(1),
  tasks: z.array(trainerTaskSchema).min(1),
})

export type TrainerTask = z.infer<typeof trainerTaskSchema>
export type TrainerConfig = z.infer<typeof trainerConfigSchema>
