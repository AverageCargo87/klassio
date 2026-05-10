'use client'
// LessonShell: client component wrapping LessonBusProvider + 3-panel adaptive layout.
// Receives only serializable props from the server component (strings, not Dates).
// Per D-01..D-05: CSS Grid on desktop (lg:), Flexbox stack on tablet (md:),
//   mobile prompt for < md (D-03, D-17).
// Per D-12: "Завершить урок" button with AlertDialog confirm.
// Per quality constraint #7: uses shadcn AlertDialog.
// T-03-03-06: lessonId is UUID (not sequential), topic is user-facing data — acceptable disclosure.
import { useTransition } from 'react'
import { LessonBusProvider } from '@/lib/lesson-bus'
import { BoardPanel } from '@/components/panels/board-panel'
import { VoicePanel } from '@/components/panels/voice-panel'
import { TrainerPanel } from '@/components/panels/trainer-panel'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { endLesson } from '@/app/lesson/[id]/end-lesson'

interface LessonShellProps {
  lessonId: string
  topic: string
}

export function LessonShell({ lessonId, topic }: LessonShellProps) {
  const [isPending, startTransition] = useTransition()

  function handleEndLesson() {
    startTransition(async () => {
      await endLesson(lessonId)
    })
  }

  return (
    <LessonBusProvider>
      {/* Mobile prompt (D-03, D-17) — shown only below md breakpoint (<768px) */}
      <div className="md:hidden flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-4">
          <div className="text-4xl">🖥️</div>
          <h1 className="text-lg font-semibold">Урок лучше смотреть на большом экране</h1>
          <p className="text-muted-foreground text-sm">
            Klassio лучше работает на планшете или ноутбуке. Пожалуйста, открой урок с устройства побольше.
          </p>
          <a href="/lessons">
            <Button variant="outline" size="sm">← Вернуться в расписание</Button>
          </a>
        </div>
      </div>

      {/* Tablet + Desktop lesson layout (md: ≥768px) */}
      <div className="hidden md:flex flex-col min-h-screen">
        {/* Top header bar with topic + end-lesson button */}
        <header className="flex items-center justify-between px-4 py-2 border-b bg-background/80 backdrop-blur-sm shrink-0">
          <h1 className="text-sm font-medium truncate max-w-[60%]">{topic}</h1>
          <AlertDialog>
            <AlertDialogTrigger
              className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-[min(var(--radius-md),12px)] border border-transparent bg-clip-padding bg-primary px-2.5 text-[0.8rem] font-medium text-primary-foreground whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              disabled={isPending}
            >
              {isPending ? 'Завершаем…' : 'Завершить урок'}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Точно завершить урок?</AlertDialogTitle>
                <AlertDialogDescription>
                  После завершения урок будет отмечен как проведённый. Это действие нельзя отменить.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction onClick={handleEndLesson} disabled={isPending}>
                  Завершить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </header>

        {/* Tablet (md to lg): vertical stack — D-02 */}
        <div className="flex-1 flex flex-col gap-2 p-2 lg:hidden overflow-auto">
          <div className="h-[60vh] min-h-0">
            <BoardPanel />
          </div>
          <div className="h-[15vh] min-h-0">
            <VoicePanel />
          </div>
          <div className="h-[25vh] min-h-0">
            <TrainerPanel />
          </div>
        </div>

        {/* Desktop (lg: ≥1024px): CSS Grid 2-column — D-01, D-15 */}
        <div
          className="hidden lg:grid flex-1 gap-2 p-2 overflow-hidden"
          style={{ gridTemplateColumns: '1fr 24rem' }}
        >
          {/* Board: full height left column */}
          <div className="min-h-0">
            <BoardPanel />
          </div>

          {/* Right column: voice top (12rem fixed) + trainer fills rest — D-15 */}
          <div
            className="grid min-h-0 gap-2"
            style={{ gridTemplateRows: '12rem 1fr' }}
          >
            <div className="min-h-0">
              <VoicePanel />
            </div>
            <div className="min-h-0">
              <TrainerPanel />
            </div>
          </div>
        </div>
      </div>
    </LessonBusProvider>
  )
}
