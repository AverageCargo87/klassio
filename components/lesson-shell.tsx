'use client'
// LessonShell: client component wrapping LessonBusProvider + 3-panel adaptive layout.
// Receives only serializable props from the server component (strings, not Dates).
// Layout strategy (D-01..D-05):
//   - Desktop (lg: ≥1024px): 2-column CSS Grid (1fr 24rem), right col sub-grid (12rem 1fr)
//   - Tablet (md: 768-1023px): single-column flex (board 60vh, voice 15vh, trainer 25vh)
//   - Mobile (<md): prompt shown, lesson layout hidden
// Single render of each panel — no duplicates. Layout driven by Tailwind responsive classes.
// Per D-12: "Завершить урок" button with AlertDialog confirm.
// T-03-03-06: lessonId is UUID (not sequential), topic is user-facing data — acceptable disclosure.
import { useTransition } from 'react'
import { LessonBusProvider } from '@/lib/lesson-bus'
import { BoardPanel } from '@/components/panels/board-panel'
import { VoicePanel } from '@/components/panels/voice-panel'
import { TrainerPanel } from '@/components/panels/trainer-panel'
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
            <span className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium transition-all outline-none">
              ← Вернуться в расписание
            </span>
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

        {/* Responsive panel container:
            - Tablet (md to lg): flex-col stack (board 60vh, voice 15vh, trainer 25vh)
            - Desktop (lg: ≥1024px): CSS Grid 2-column (1fr 24rem)
            Panels rendered ONCE — layout driven by parent container classes.
        */}
        <div className="flex-1 overflow-hidden p-2 gap-2 flex flex-col lg:grid"
          style={{
            // Desktop: 2 columns (board | right-col)
            gridTemplateColumns: '1fr 24rem',
            // Desktop: right column gets sub-grid (applied inline via --grid-* vars not possible here;
            // right col is separate div below)
          }}
        >
          {/* Board: tall on tablet (60vh), fills height on desktop */}
          <div className="min-h-0 h-[60vh] lg:h-full">
            <BoardPanel />
          </div>

          {/* Right column: voice (15vh tablet / 12rem desktop) + trainer (fills rest) */}
          <div
            className="flex flex-col gap-2 min-h-0"
            style={{ gridTemplateRows: '12rem 1fr', display: 'flex' }}
          >
            <div className="min-h-0 h-[15vh] lg:h-48 shrink-0">
              <VoicePanel />
            </div>
            <div className="min-h-0 flex-1 h-[25vh] lg:h-auto">
              <TrainerPanel />
            </div>
          </div>
        </div>
      </div>
    </LessonBusProvider>
  )
}
