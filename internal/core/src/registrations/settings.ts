import { PlatformError } from "../errors"
import { isValidLocalId } from "../identity"
import { formatIssues, inferKind, isStandardSchema, validateSync, type AnySchema, type InferredKind } from "../standard-schema"
import { createEmitter, type Emitter } from "../store"
import type { RegistrationOwner } from "./commands"

export type SettingsValue = unknown

export interface SettingsOption<TValue = unknown> {
  value: TValue
  label: string
  description?: string
  disabled?: boolean
  keywords?: string[]
}

export interface AsyncOptionsContext<TState = Record<string, unknown>> {
  signal: AbortSignal
  /** Current values of the group (`dependency` values). */
  state: TState
  /** Typed platform capabilities (typed on the SDK side). */
  platform: unknown
}

export type OptionsProvider<TValue = unknown, TState = Record<string, unknown>> = SettingsOption<TValue>[] | ((context: AsyncOptionsContext<TState>) => Promise<SettingsOption<TValue>[]> | SettingsOption<TValue>[])

export type Predicate<TState = Record<string, unknown>> = (state: TState) => boolean

export interface SettingsFieldDefinition<TValue = unknown, TState = Record<string, unknown>> {
  /** Initial value. Never named `value`: the framework owns the current value. */
  defaultValue: TValue
  label?: string
  description?: string
  keywords?: string[]
  /** Standard Schema validating stored and committed values. */
  schema?: AnySchema<TValue>
  options?: OptionsProvider<TValue, TState>
  /** Custom control; the renderer receives a typed controller (SDK type). Must not write to browser storage. */
  renderer?: unknown
  /** Explicit control kind when inference is not enough. */
  kind?: InferredKind
  serialize?: { stringify: (value: TValue) => string; parse: (raw: string) => TValue }
  /** Fix up stored data produced by an older schema; return `undefined` to reset. */
  migrate?: (stored: unknown, version: number | undefined) => TValue | undefined
  /** Schema version stored alongside the value for `migrate`. */
  version?: number
  visibleWhen?: Predicate<TState>
  disabledWhen?: Predicate<TState>
  readOnlyWhen?: Predicate<TState>
  /** Cache async options for this many milliseconds (default 60 000). */
  optionsCacheMs?: number
  min?: number
  max?: number
  step?: number
  placeholder?: string
}

export interface SettingsGroupDefinition<TFields extends Record<string, SettingsFieldDefinition<any, any>> = Record<string, SettingsFieldDefinition>> {
  /** Local key, namespaced by the platform. */
  key: string
  title?: string
  description?: string
  keywords?: string[]
  /** Placement group in the settings host (defaults to the MFE's display name). */
  group?: string
  fields: TFields
  managedBy?: "framework" | "mfe"
  /** For `managedBy: "mfe"`: MFE-relative route of the settings page. */
  route?: string
  order?: number
  icon?: string
}

export interface SettingsFieldMeta {
  qualifiedKey: string
  groupKey: string
  key: string
  label: string
  description?: string
  keywords: string[]
  kind: InferredKind
  hasOptions: boolean
  asyncOptions: boolean
  customRenderer: boolean
}

export interface RegisteredSettingsGroup {
  /** `<mfeId>:<groupKey>` */
  qualifiedKey: string
  definition: SettingsGroupDefinition
  owner: RegistrationOwner
  fields: SettingsFieldMeta[]
  registeredAt: number
}

export interface SettingsRegistryEvents extends Record<string, unknown> {
  change: { groups: RegisteredSettingsGroup[] }
}

/** `displayDensity` → `Display density`; `api_base_url` → `Api base url`. */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/[-_.]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

export function inferFieldKind(field: SettingsFieldDefinition): InferredKind {
  if (field.kind) return field.kind
  return inferKind(field.defaultValue, field.options !== undefined)
}

export function validateSettingsGroup(definition: SettingsGroupDefinition, owner: RegistrationOwner): void {
  if (!isValidLocalId(definition.key)) {
    throw new PlatformError({ code: "SETTINGS_INVALID", message: `Settings group key "${definition.key}" is not a local kebab-case key.`, owner, source: definition.key })
  }
  if (definition.managedBy === "mfe" && !definition.route) {
    throw new PlatformError({ code: "SETTINGS_INVALID", message: `Settings group "${definition.key}" is managed by the MFE and needs a \`route\`.`, owner, source: definition.key })
  }
  for (const [key, field] of Object.entries(definition.fields ?? {})) {
    if (!field || typeof field !== "object") {
      throw new PlatformError({ code: "SETTINGS_INVALID", message: `Field "${key}" of group "${definition.key}" is not a field definition.`, owner, source: `${definition.key}.${key}` })
    }
    if (!("defaultValue" in field)) {
      throw new PlatformError({ code: "SETTINGS_INVALID", message: `Field "${key}" of group "${definition.key}" needs \`defaultValue\`.`, owner, source: `${definition.key}.${key}` })
    }
    if ("value" in field) {
      throw new PlatformError({ code: "SETTINGS_INVALID", message: `Field "${key}" of group "${definition.key}" uses \`value\`; use \`defaultValue\` — the framework owns the current value.`, owner, source: `${definition.key}.${key}` })
    }
    if (field.schema !== undefined && !isStandardSchema(field.schema)) {
      throw new PlatformError({ code: "SETTINGS_INVALID", message: `Field "${key}" of group "${definition.key}" has a schema that is not Standard Schema compatible.`, owner, source: `${definition.key}.${key}` })
    }
    if (field.schema) {
      const result = validateSync(field.schema, field.defaultValue)
      if (!result.ok) {
        throw new PlatformError({ code: "SETTINGS_INVALID", message: `Default value of "${definition.key}.${key}" fails its schema: ${formatIssues(result.issues)}`, owner, source: `${definition.key}.${key}` })
      }
    }
  }
}

export function describeFields(mfeId: string, definition: SettingsGroupDefinition): SettingsFieldMeta[] {
  return Object.entries(definition.fields ?? {}).map(([key, field]) => ({
    qualifiedKey: `${mfeId}:${definition.key}.${key}`,
    groupKey: definition.key,
    key,
    label: field.label ?? humanizeKey(key),
    description: field.description,
    keywords: field.keywords ?? [],
    kind: inferFieldKind(field),
    hasOptions: field.options !== undefined,
    asyncOptions: typeof field.options === "function",
    customRenderer: field.renderer !== undefined,
  }))
}

export interface SettingsRegistry {
  register(definition: SettingsGroupDefinition, owner: RegistrationOwner): () => void
  list(): RegisteredSettingsGroup[]
  get(qualifiedKey: string): RegisteredSettingsGroup | undefined
  events: Emitter<SettingsRegistryEvents>
  clearOwner(instanceId: string): void
}

export function createSettingsRegistry(): SettingsRegistry {
  const groups = new Map<string, RegisteredSettingsGroup>()
  const events = createEmitter<SettingsRegistryEvents>()
  const emitChange = () => events.emit("change", { groups: Array.from(groups.values()) })
  return {
    events,
    register(definition, owner) {
      validateSettingsGroup(definition, owner)
      const qualifiedKey = `${owner.mfeId}:${definition.key}`
      const existing = groups.get(qualifiedKey)
      if (existing && existing.owner.instanceId !== owner.instanceId) {
        // Two live mounts of the same MFE (e.g. widgets) may register the same group; the first one wins, the second is a no-op.
        return () => {}
      }
      const registered: RegisteredSettingsGroup = { qualifiedKey, definition, owner, fields: describeFields(owner.mfeId, definition), registeredAt: Date.now() }
      groups.set(qualifiedKey, registered)
      emitChange()
      return () => {
        if (groups.get(qualifiedKey) !== registered) return
        groups.delete(qualifiedKey)
        emitChange()
      }
    },
    list: () => Array.from(groups.values()),
    get: (qualifiedKey) => groups.get(qualifiedKey),
    clearOwner(instanceId) {
      for (const [key, group] of Array.from(groups.entries())) if (group.owner.instanceId === instanceId) groups.delete(key)
      emitChange()
    },
  }
}

/** Persisted envelope for a settings value. */
export interface StoredSettingsValue {
  v: number | undefined
  value: unknown
}

export type FieldValidationState = { valid: true } | { valid: false; message: string; recovered: "default" | "migrated" | "none" }

export interface ResolvedFieldValue<TValue = unknown> {
  value: TValue
  validation: FieldValidationState
  /** `stored` when the persisted value was used, `default` when defaults applied, `migrated` after a migration. */
  origin: "stored" | "default" | "migrated"
}

/**
 * Turn a persisted envelope into a usable value: validate against the schema,
 * run the declared migration for older versions or invalid data, otherwise
 * reset to the default with a recoverable validation state. Errors are
 * isolated to the field.
 */
export function resolveFieldValue<TValue>(field: SettingsFieldDefinition<TValue, any>, stored: StoredSettingsValue | undefined): ResolvedFieldValue<TValue> {
  if (stored === undefined) return { value: field.defaultValue, validation: { valid: true }, origin: "default" }
  const validate = (value: unknown): { ok: true; value: TValue } | { ok: false; message: string } => {
    if (!field.schema) return { ok: true, value: value as TValue }
    const result = validateSync(field.schema, value)
    return result.ok ? { ok: true, value: result.value as TValue } : { ok: false, message: formatIssues(result.issues) }
  }
  const versionMismatch = field.version !== undefined && stored.v !== field.version
  if (!versionMismatch) {
    const direct = validate(stored.value)
    if (direct.ok) return { value: direct.value, validation: { valid: true }, origin: "stored" }
    if (!field.migrate) return { value: field.defaultValue, validation: { valid: false, message: direct.message, recovered: "default" }, origin: "default" }
  }
  if (field.migrate) {
    try {
      const migrated = field.migrate(stored.value, stored.v)
      if (migrated !== undefined) {
        const check = validate(migrated)
        if (check.ok) return { value: check.value, validation: { valid: true }, origin: "migrated" }
        return { value: field.defaultValue, validation: { valid: false, message: `migration produced an invalid value: ${check.message}`, recovered: "default" }, origin: "default" }
      }
    } catch (error) {
      return { value: field.defaultValue, validation: { valid: false, message: `migration failed: ${error instanceof Error ? error.message : String(error)}`, recovered: "default" }, origin: "default" }
    }
  }
  const message = versionMismatch ? `stored version ${String(stored.v)} does not match ${String(field.version)}` : "stored value is invalid"
  return { value: field.defaultValue, validation: { valid: false, message, recovered: "default" }, origin: "default" }
}

/** Validate a value the user wants to commit. */
export function validateCommit<TValue>(field: SettingsFieldDefinition<TValue, any>, value: unknown): { ok: true; value: TValue } | { ok: false; message: string } {
  if (!field.schema) return { ok: true, value: value as TValue }
  const result = validateSync(field.schema, value)
  return result.ok ? { ok: true, value: result.value as TValue } : { ok: false, message: formatIssues(result.issues) }
}
