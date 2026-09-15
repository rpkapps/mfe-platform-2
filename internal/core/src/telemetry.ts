/**
 * Provider-neutral telemetry. The shell supplies an adapter (FARO, OpenTelemetry,
 * console…); the framework never imports a vendor. Every call is wrapped so a
 * failing adapter can never break an MFE.
 */
export type TelemetryAttributes = Record<string, string | number | boolean | null | undefined>

export interface TelemetrySpan {
  end(attributes?: TelemetryAttributes): void
  fail(error: unknown, attributes?: TelemetryAttributes): void
  /** Child span sharing this span's context. */
  child(name: string, attributes?: TelemetryAttributes): TelemetrySpan
}

export interface TelemetryContext extends TelemetryAttributes {
  mfeId?: string
  instanceId?: string
  widgetId?: string
  route?: string
  command?: string
  environment?: string
  release?: string
  sessionId?: string
  userId?: string
  boundary?: string
}

export interface Telemetry {
  track(event: string, attributes?: TelemetryAttributes): void
  error(error: unknown, attributes?: TelemetryAttributes): void
  span(name: string, attributes?: TelemetryAttributes): TelemetrySpan
  /** Telemetry enriched with more context (route, command, widget…). */
  child(context: TelemetryContext): Telemetry
  /** Effective context of this instance. */
  readonly context: TelemetryContext
}

/** What the shell implements. */
export interface TelemetryAdapter {
  track(event: string, attributes: TelemetryAttributes): void
  error(error: unknown, attributes: TelemetryAttributes): void
  spanStart?(
    name: string,
    attributes: TelemetryAttributes
  ): {
    end(attributes: TelemetryAttributes): void
    fail(error: unknown, attributes: TelemetryAttributes): void
  } | void
}

export interface TelemetryOptions {
  adapter?: TelemetryAdapter | null
  context?: TelemetryContext
  /** Called when the adapter throws; defaults to a console warning. */
  onAdapterError?: (error: unknown, operation: string) => void
}

function safe(
  operation: string,
  onError: (error: unknown, operation: string) => void,
  fn: () => void
): void {
  try {
    fn()
  } catch (error) {
    onError(error, operation)
  }
}

function defaultAdapterError(error: unknown, operation: string) {
  if (typeof console !== "undefined")
    console.warn(`[platform:TELEMETRY_FAILED] adapter threw during ${operation}`, error)
}

export function createTelemetry(options: TelemetryOptions = {}): Telemetry {
  const adapter = options.adapter ?? null
  const onError = options.onAdapterError ?? defaultAdapterError

  /**
   * One failure reaches the adapter once. A single `PlatformError` instance is
   * reported through up to three channels — the owning call site reports it with
   * its boundary, the diagnostics bus forwards the event it was emitted on, and a
   * span fails with it — so without this the shell bills two or three events for
   * one failure and only the first carries the original stack. The set is shared
   * with every child (a remote's bridge telemetry is a child of the shell's), so
   * the whole tree reports a given error once. Spans handed to an adapter that
   * implements `spanStart` are exempt: `handle.fail` is a span outcome, not an
   * error report.
   */
  const reported = new WeakSet<object>()
  const claim = (error: unknown): boolean => {
    if (typeof error !== "object" || error === null) return true
    if (reported.has(error)) return false
    reported.add(error)
    return true
  }

  const make = (baseContext: TelemetryContext): Telemetry => {
    const merge = (attributes?: TelemetryAttributes): TelemetryAttributes => ({
      ...baseContext,
      ...attributes,
    })

    const makeSpan = (
      name: string,
      attributes: TelemetryAttributes,
      parent?: string
    ): TelemetrySpan => {
      const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now()
      const merged = merge({
        ...attributes,
        "span.name": name,
        ...(parent ? { "span.parent": parent } : {}),
      })
      let handle: ReturnType<NonNullable<TelemetryAdapter["spanStart"]>> | void
      safe("spanStart", onError, () => {
        handle = adapter?.spanStart?.(name, merged)
      })
      let ended = false
      const duration = () =>
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt
      const span: TelemetrySpan = {
        end(extra) {
          if (ended) return
          ended = true
          const attrs = { ...merged, ...extra, "span.duration_ms": Math.round(duration()) }
          safe("spanEnd", onError, () => {
            if (handle) handle.end(attrs)
            else adapter?.track(`span:${name}`, attrs)
          })
        },
        fail(error, extra) {
          if (ended) return
          ended = true
          const attrs = {
            ...merged,
            ...extra,
            "span.duration_ms": Math.round(duration()),
            "span.failed": true,
          }
          safe("spanFail", onError, () => {
            if (handle) handle.fail(error, attrs)
            else if (claim(error)) adapter?.error(error, attrs)
          })
        },
        child: (childName, childAttributes) =>
          makeSpan(childName, { ...attributes, ...childAttributes }, name),
      }
      return span
    }

    const telemetry: Telemetry = {
      context: baseContext,
      track(event, attributes) {
        safe("track", onError, () => adapter?.track(event, merge(attributes)))
      },
      error(error, attributes) {
        if (!claim(error)) return
        safe("error", onError, () => adapter?.error(error, merge(attributes)))
      },
      span: (name, attributes) => makeSpan(name, attributes ?? {}),
      child: (context) => make({ ...baseContext, ...context }),
    }
    return telemetry
  }

  return make(options.context ?? {})
}

export const noopTelemetry: Telemetry = createTelemetry({ adapter: null })

export interface RecordedTelemetryEvent {
  kind: "track" | "error" | "span"
  name: string
  attributes: TelemetryAttributes
  error?: string
  at: number
}

/** In-memory adapter for tests and the developer tools' live event stream. */
export function createMemoryTelemetryAdapter(
  options: { limit?: number; onEvent?: (event: RecordedTelemetryEvent) => void } = {}
): TelemetryAdapter & { events: RecordedTelemetryEvent[]; clear(): void } {
  const events: RecordedTelemetryEvent[] = []
  const limit = options.limit ?? 500
  const push = (event: RecordedTelemetryEvent) => {
    events.push(event)
    if (events.length > limit) events.splice(0, events.length - limit)
    options.onEvent?.(event)
  }
  return {
    events,
    clear: () => events.splice(0, events.length),
    track: (name, attributes) => push({ kind: "track", name, attributes, at: Date.now() }),
    error: (error, attributes) =>
      push({
        kind: "error",
        name: error instanceof Error ? error.message : String(error),
        attributes,
        error: error instanceof Error ? error.stack : undefined,
        at: Date.now(),
      }),
    spanStart: (name, attributes) => ({
      end: (attrs) =>
        push({ kind: "span", name, attributes: { ...attributes, ...attrs }, at: Date.now() }),
      fail: (error, attrs) =>
        push({
          kind: "span",
          name,
          attributes: { ...attributes, ...attrs },
          error: error instanceof Error ? error.message : String(error),
          at: Date.now(),
        }),
    }),
  }
}

/** Console adapter for local development. */
export function createConsoleTelemetryAdapter(prefix = "[telemetry]"): TelemetryAdapter {
  return {
    track: (event, attributes) => console.debug(prefix, event, attributes),
    error: (error, attributes) => console.error(prefix, error, attributes),
  }
}

/** Fan out to several adapters (e.g. vendor + memory for devtools). */
export function composeTelemetryAdapters(...adapters: TelemetryAdapter[]): TelemetryAdapter {
  return {
    track: (event, attributes) =>
      adapters.forEach((adapter) => adapter.track(event, attributes)),
    error: (error, attributes) =>
      adapters.forEach((adapter) => adapter.error(error, attributes)),
    spanStart: (name, attributes) => {
      const handles = adapters
        .map((adapter) => adapter.spanStart?.(name, attributes))
        .filter(Boolean) as {
        end(a: TelemetryAttributes): void
        fail(e: unknown, a: TelemetryAttributes): void
      }[]
      return {
        end: (attrs) => handles.forEach((handle) => handle.end(attrs)),
        fail: (error, attrs) => handles.forEach((handle) => handle.fail(error, attrs)),
      }
    },
  }
}
