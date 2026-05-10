// In-memory typed pub/sub bus (D-06, D-08).
// One instance per lesson page mount. Not a global singleton.
// Memory model: Map<event, Set<handler>>. No history, no replay.
import type { LessonBusEvent, EventPayload } from './events'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (payload: any) => void

export class LessonBus {
  private handlers = new Map<string, Set<AnyHandler>>()

  on<E extends LessonBusEvent['type']>(
    event: E,
    handler: (payload: EventPayload<E>) => void,
  ): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler as AnyHandler)
  }

  off<E extends LessonBusEvent['type']>(
    event: E,
    handler: (payload: EventPayload<E>) => void,
  ): void {
    this.handlers.get(event)?.delete(handler as AnyHandler)
  }

  emit<E extends LessonBusEvent['type']>(
    event: E,
    payload: EventPayload<E>,
  ): void {
    this.handlers.get(event)?.forEach((h) => h(payload))
  }

  /** Remove all subscriptions. Called on provider unmount (D-10). */
  clear(): void {
    this.handlers.clear()
  }
}
