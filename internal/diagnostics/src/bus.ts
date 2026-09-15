import {
  levelFor,
  type DiagnosticEvent,
  type DiagnosticInput,
  type DiagnosticLevel,
  type DiagnosticSink,
  type Telemetry,
} from "@platform-internal/core"

export interface DiagnosticsFilter {
  level?: DiagnosticLevel | DiagnosticLevel[]
  /** Minimum level (`warn` returns warnings and errors). */
  minLevel?: DiagnosticLevel
  mfeId?: string
  instanceId?: string
  widgetId?: string
  type?: DiagnosticEvent["type"] | DiagnosticEvent["type"][]
  /** Only events with `at >= since`. */
  since?: number
  /** Only events with `id > afterId` (incremental reads). */
  afterId?: number
  limit?: number
}

export type DiagnosticsListener = (event: DiagnosticEvent) => void

export interface DiagnosticsBusOptions {
  /** Ring buffer size (default 1000). */
  limit?: number
  /** Errors and warnings are forwarded to telemetry when provided. */
  telemetry?: Telemetry
  /** Clock override for tests. */
  now?: () => number
}

/**
 * The host's diagnostic event bus: a `DiagnosticSink` that assigns ids,
 * timestamps and levels, keeps a bounded ring buffer, notifies subscribers
 * and forwards warnings and errors to telemetry. It never throws: a failing
 * listener or adapter is isolated from the emitter.
 */
export interface DiagnosticsBus extends DiagnosticSink {
  emit(input: DiagnosticInput): DiagnosticEvent | undefined
  subscribe(listener: DiagnosticsListener): () => void
  list(filter?: DiagnosticsFilter): DiagnosticEvent[]
  clear(): void
  /** Number of events emitted so far (including evicted ones). */
  readonly count: number
  /** Sink whose events are tagged with an owner. */
  scoped(owner: { mfeId?: string; instanceId?: string; widgetId?: string }): DiagnosticSink
}

const LEVEL_ORDER: Record<DiagnosticLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

export function createDiagnosticsBus(options: DiagnosticsBusOptions = {}): DiagnosticsBus {
  const limit = Math.max(1, options.limit ?? 1000)
  const now = options.now ?? Date.now
  const events: DiagnosticEvent[] = []
  const listeners = new Set<DiagnosticsListener>()
  let nextId = 1

  const forward = (event: DiagnosticEvent) => {
    const telemetry = options.telemetry
    if (!telemetry) return
    if (event.level !== "error" && event.level !== "warn") return
    try {
      const attributes = {
        "diagnostic.type": event.type,
        "diagnostic.level": event.level,
        mfeId: event.mfeId,
        instanceId: event.instanceId,
        widgetId: event.widgetId,
      }
      if ("error" in event && event.error && typeof event.error === "object") {
        telemetry.error(new Error(event.error.message), {
          ...attributes,
          "error.code": event.error.code,
        })
      } else {
        telemetry.track(`diagnostic:${event.type}`, attributes)
      }
    } catch {
      // telemetry failures never reach the emitter
    }
  }

  const bus: DiagnosticsBus = {
    get count() {
      return nextId - 1
    },
    emit(input) {
      try {
        const { level, ...rest } = input
        const event = {
          ...rest,
          id: nextId++,
          at: now(),
          level: level ?? levelFor(input.type),
        } as DiagnosticEvent
        events.push(event)
        if (events.length > limit) events.splice(0, events.length - limit)
        for (const listener of Array.from(listeners)) {
          try {
            listener(event)
          } catch {
            // a failing subscriber never breaks the bus
          }
        }
        forward(event)
        return event
      } catch {
        return undefined
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    list(filter = {}) {
      const levels = filter.level
        ? new Set(Array.isArray(filter.level) ? filter.level : [filter.level])
        : null
      const types = filter.type
        ? new Set<string>(Array.isArray(filter.type) ? filter.type : [filter.type])
        : null
      const min = filter.minLevel ? LEVEL_ORDER[filter.minLevel] : -1
      let result = events.filter(
        (event) =>
          (!levels || levels.has(event.level)) &&
          LEVEL_ORDER[event.level] >= min &&
          (!types || types.has(event.type)) &&
          (filter.mfeId === undefined || event.mfeId === filter.mfeId) &&
          (filter.instanceId === undefined || event.instanceId === filter.instanceId) &&
          (filter.widgetId === undefined || event.widgetId === filter.widgetId) &&
          (filter.since === undefined || event.at >= filter.since) &&
          (filter.afterId === undefined || event.id > filter.afterId)
      )
      if (filter.limit !== undefined && result.length > filter.limit) {
        result = result.slice(result.length - filter.limit)
      }
      return result
    },
    clear() {
      events.splice(0, events.length)
    },
    scoped(owner) {
      return {
        emit: (input) =>
          bus.emit({
            ...input,
            mfeId: input.mfeId ?? owner.mfeId,
            instanceId: input.instanceId ?? owner.instanceId,
            widgetId: input.widgetId ?? owner.widgetId,
          } as DiagnosticInput),
      }
    },
  }
  return bus
}
