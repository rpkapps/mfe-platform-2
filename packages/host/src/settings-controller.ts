import {
  createStore,
  resolveFieldValue,
  validateCommit,
  type FieldValidationState,
  type RegisteredSettingsGroup,
  type SettingsFieldDefinition,
  type SettingsFieldMeta,
  type SettingsOption,
  type SettingsValuePort,
  type Store,
} from "@platform-internal/core"

import { createSettingsValuePort } from "./bridge"
import type { PlatformHost } from "./types"

export interface SettingsFieldState {
  value: unknown
  /** Value as persisted (before an uncommitted edit). */
  committed: unknown
  origin: "stored" | "default" | "migrated"
  validation: FieldValidationState
  options: SettingsOption[] | null
  optionsStatus: "idle" | "loading" | "ready" | "error"
  optionsError?: string
  /** The current value is not among the loaded options. */
  stale: boolean
  visible: boolean
  disabled: boolean
  readOnly: boolean
  /** Current values of every field of the group (dependency values). */
  groupValues: Record<string, unknown>
  ids: { input: string; label: string; description: string; error: string }
  meta: SettingsFieldMeta
  isDefault: boolean
}

/** The typed controller handed to custom renderers (`renderer.mount(container, controller)`). */
export interface SettingsFieldController<TValue = unknown> {
  readonly qualifiedKey: string
  readonly value: TValue
  readonly defaultValue: TValue
  setValue(next: TValue): { ok: boolean; message?: string }
  reset(): void
  readonly validation: FieldValidationState
  readonly loading: boolean
  readonly error: string | undefined
  readonly options: SettingsOption<TValue>[] | null
  readonly stale: boolean
  readonly disabled: boolean
  readonly readOnly: boolean
  readonly ids: SettingsFieldState["ids"]
  readonly state: Record<string, unknown>
  readonly meta: SettingsFieldMeta
  loadOptions(options?: { force?: boolean }): Promise<void>
}

export interface SettingsController extends Store<SettingsFieldState> {
  readonly qualifiedKey: string
  readonly field: SettingsFieldDefinition
  readonly meta: SettingsFieldMeta
  setValue(next: unknown): { ok: boolean; message?: string }
  reset(): void
  loadOptions(options?: { force?: boolean }): Promise<void>
  retryOptions(): Promise<void>
  /** Plain-object view for custom renderers (fresh object per call). */
  controller(): SettingsFieldController
  dispose(): void
}

interface OptionsCacheEntry {
  at: number
  stateKey: string
  options: SettingsOption[]
}

const optionsCache = new WeakMap<SettingsFieldDefinition, OptionsCacheEntry>()

function stateKeyOf(values: Record<string, unknown>): string {
  try {
    return JSON.stringify(values)
  } catch {
    return String(Date.now())
  }
}

function includesValue(options: SettingsOption[], value: unknown): boolean {
  const same = (a: unknown, b: unknown) => Object.is(a, b) || (typeof a === "object" && typeof b === "object" && JSON.stringify(a) === JSON.stringify(b))
  if (Array.isArray(value)) return value.every((item) => options.some((option) => same(option.value, item)))
  return options.some((option) => same(option.value, value))
}

function readGroupValues(group: RegisteredSettingsGroup, port: SettingsValuePort): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(group.definition.fields ?? {})) {
    const meta = group.fields.find((f) => f.key === key)
    const qualifiedKey = meta?.qualifiedKey ?? `${group.owner.mfeId}:${group.definition.key}.${key}`
    try {
      values[key] = resolveFieldValue(field as SettingsFieldDefinition, port.read(qualifiedKey)).value
    } catch {
      values[key] = (field as SettingsFieldDefinition).defaultValue
    }
  }
  return values
}

/**
 * Framework-managed settings field service: resolves the persisted value
 * (validation + migration), commits with validation, resets, evaluates
 * predicates against the group's values and loads async options with
 * abort, caching, retry and stale-selection detection.
 */
export function settingsController(host: PlatformHost, group: RegisteredSettingsGroup | string, fieldKey: string): SettingsController {
  const registered = typeof group === "string" ? host.registries.settings.get(group) : group
  if (!registered) throw new Error(`Unknown settings group "${String(group)}".`)
  const field = registered.definition.fields?.[fieldKey] as SettingsFieldDefinition | undefined
  const meta = registered.fields.find((entry) => entry.key === fieldKey)
  if (!field || !meta) throw new Error(`Unknown settings field "${fieldKey}" in group "${registered.qualifiedKey}".`)
  const qualifiedKey = meta.qualifiedKey
  const port = createSettingsValuePort(host.storage, registered.owner.mfeId, host.diagnostics.scoped({ mfeId: registered.owner.mfeId }))
  const diagnostics = host.diagnostics.scoped({ mfeId: registered.owner.mfeId, instanceId: registered.owner.instanceId })
  const idBase = `platform-setting-${qualifiedKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`
  const ids = { input: `${idBase}-input`, label: `${idBase}-label`, description: `${idBase}-description`, error: `${idBase}-error` }

  const evaluate = (predicate: ((state: Record<string, unknown>) => boolean) | undefined, values: Record<string, unknown>, fallback: boolean) => {
    if (!predicate) return fallback
    try {
      return Boolean(predicate(values))
    } catch (error) {
      diagnostics.emit({ type: "log", level: "warn", message: `predicate of ${qualifiedKey} threw`, detail: String(error) })
      return fallback
    }
  }

  const resolve = (): Partial<SettingsFieldState> => {
    const stored = port.read(qualifiedKey)
    const resolved = resolveFieldValue(field, stored)
    if (!resolved.validation.valid) {
      diagnostics.emit({ type: "settings.invalid", key: qualifiedKey, message: resolved.validation.message, recovered: resolved.validation.recovered })
    }
    const groupValues = readGroupValues(registered, port)
    groupValues[fieldKey] = resolved.value
    return {
      value: resolved.value,
      committed: resolved.value,
      origin: resolved.origin,
      validation: resolved.validation,
      groupValues,
      visible: evaluate(field.visibleWhen, groupValues, true),
      disabled: evaluate(field.disabledWhen, groupValues, false),
      readOnly: evaluate(field.readOnlyWhen, groupValues, false),
      isDefault: stored === undefined,
    }
  }

  const staticOptions = Array.isArray(field.options) ? (field.options as SettingsOption[]) : null
  const initial = resolve()
  const store = createStore<SettingsFieldState>({
    value: initial.value,
    committed: initial.committed,
    origin: initial.origin ?? "default",
    validation: initial.validation ?? { valid: true },
    options: staticOptions,
    optionsStatus: staticOptions ? "ready" : typeof field.options === "function" ? "idle" : "ready",
    stale: staticOptions ? !includesValue(staticOptions, initial.value) : false,
    visible: initial.visible ?? true,
    disabled: initial.disabled ?? false,
    readOnly: initial.readOnly ?? false,
    groupValues: initial.groupValues ?? {},
    ids,
    meta,
    isDefault: initial.isDefault ?? true,
  })

  let controller: AbortController | null = null
  let disposed = false

  const loadOptions = async (loadOptions: { force?: boolean } = {}) => {
    if (typeof field.options !== "function") return
    const provider = field.options
    const groupValues = store.getState().groupValues
    const stateKey = stateKeyOf(groupValues)
    const cacheMs = field.optionsCacheMs ?? 60_000
    const cached = optionsCache.get(field)
    if (!loadOptions.force && cached && cached.stateKey === stateKey && Date.now() - cached.at < cacheMs) {
      store.patch({ options: cached.options, optionsStatus: "ready", optionsError: undefined, stale: !includesValue(cached.options, store.getState().value) })
      return
    }
    controller?.abort()
    const current = new AbortController()
    controller = current
    store.patch({ optionsStatus: "loading", optionsError: undefined })
    try {
      const result = await provider({ signal: current.signal, state: groupValues, platform: host.exposedContext.getState() })
      if (current.signal.aborted || disposed) return
      const options = Array.isArray(result) ? result : []
      optionsCache.set(field, { at: Date.now(), stateKey, options })
      store.patch({ options, optionsStatus: "ready", optionsError: undefined, stale: !includesValue(options, store.getState().value) })
    } catch (error) {
      if (current.signal.aborted || disposed) return
      const message = error instanceof Error ? error.message : String(error)
      diagnostics.emit({ type: "log", level: "warn", message: `async options of ${qualifiedKey} failed: ${message}` })
      store.patch({ optionsStatus: "error", optionsError: message })
    } finally {
      if (controller === current) controller = null
    }
  }

  const unsubscribers = registered.fields.map((entry) =>
    port.subscribe(entry.qualifiedKey, () => {
      if (disposed) return
      const previousKey = stateKeyOf(store.getState().groupValues)
      const next = resolve()
      const options = store.getState().options
      store.patch({ ...next, stale: options ? !includesValue(options, next.value) : false })
      if (typeof field.options === "function" && stateKeyOf(next.groupValues ?? {}) !== previousKey && store.getState().optionsStatus !== "idle") void loadOptions()
    })
  )

  const setValue = (next: unknown) => {
    const state = store.getState()
    if (state.readOnly || state.disabled) return { ok: false, message: state.readOnly ? "This setting is read-only." : "This setting is disabled." }
    const check = validateCommit(field, next)
    if (!check.ok) {
      store.patch({ value: next, validation: { valid: false, message: check.message, recovered: "none" } })
      diagnostics.emit({ type: "settings.invalid", key: qualifiedKey, message: check.message, recovered: "none" })
      return { ok: false, message: check.message }
    }
    try {
      port.write(qualifiedKey, { v: field.version, value: check.value })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      store.patch({ validation: { valid: false, message, recovered: "none" } })
      return { ok: false, message }
    }
    // The storage subscription refreshes the state; make the change visible synchronously too.
    const refreshed = resolve()
    store.patch({ ...refreshed, stale: store.getState().options ? !includesValue(store.getState().options!, refreshed.value) : false })
    host.telemetry.track("settings.changed", { mfeId: registered.owner.mfeId, key: qualifiedKey })
    return { ok: true }
  }

  const reset = () => {
    port.remove(qualifiedKey)
    const refreshed = resolve()
    store.patch({ ...refreshed, stale: store.getState().options ? !includesValue(store.getState().options!, refreshed.value) : false })
  }

  const service: SettingsController = {
    qualifiedKey,
    field,
    meta,
    getState: store.getState,
    subscribe: store.subscribe,
    select: store.select,
    setState: store.setState,
    patch: store.patch,
    setValue,
    reset,
    loadOptions,
    retryOptions: () => loadOptions({ force: true }),
    controller() {
      const state = store.getState()
      return {
        qualifiedKey,
        value: state.value,
        defaultValue: field.defaultValue,
        setValue,
        reset,
        validation: state.validation,
        loading: state.optionsStatus === "loading",
        error: state.validation.valid ? state.optionsError : state.validation.message,
        options: state.options as SettingsOption<unknown>[] | null,
        stale: state.stale,
        disabled: state.disabled,
        readOnly: state.readOnly,
        ids: state.ids,
        state: state.groupValues,
        meta,
        loadOptions,
      }
    },
    dispose() {
      disposed = true
      controller?.abort()
      for (const unsubscribe of unsubscribers) unsubscribe()
    },
  }
  return service
}

/** Values of every field of a framework-managed group (for the search index and devtools). */
export function readSettingsGroupValues(host: PlatformHost, group: RegisteredSettingsGroup): Record<string, unknown> {
  return readGroupValues(group, createSettingsValuePort(host.storage, group.owner.mfeId))
}
