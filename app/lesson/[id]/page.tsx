// Placeholder for Phase 3 (LES-01 — three-pillar lesson page).
// In Phase 1, just confirms the route exists and is reachable from /lessons.
// Real implementation: voice + board + trainer panels arrive in Phase 3.

export default async function LessonPlaceholderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <main className="container mx-auto p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-4">Урок</h1>
      <p className="text-muted-foreground mb-2">ID урока: <code>{id}</code></p>
      <p className="text-muted-foreground">
        Страница урока появится в Phase 3 (доска + голос + тренажёр).
      </p>
      <p className="mt-6">
        <a className="underline" href="/lessons">← Назад к списку уроков</a>
      </p>
    </main>
  )
}
