'use client'
// Board placeholder panel — Pencil icon + Phase 4 note (D-01, D-05).
// Will be replaced with real tldraw board in Phase 4.
import { Pencil } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export function BoardPanel() {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Pencil className="h-4 w-4" />
          Доска
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <Pencil className="h-10 w-10 opacity-20" />
        <p className="text-sm text-center">
          Здесь будет доска (Phase 4)
        </p>
      </CardContent>
    </Card>
  )
}
