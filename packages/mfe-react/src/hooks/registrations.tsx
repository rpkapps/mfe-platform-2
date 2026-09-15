import { useEffect, useMemo, useRef, type ComponentType, type DependencyList } from "react"
import {
  qualifyId,
  toPlatformError,
  type CommandDefinition,
  type CommandRunContext,
  type HelpEntryDefinition,
  type MountableSurface,
  type ReleaseNoteDefinition,
  type SettingsFieldDefinition,
  type SettingsGroupDefinition,
} from "@platform-internal/core"
import { useMountScope } from "../provider"
import { ownerFields, type MountScope } from "../scope"
import {
  createSettingsRendererSurface,
  createSurface,
  isMountableSurface,
  isSettingsRendererSurface,
} from "../surfaces"
import type {
  CommandInput,
  HelpEntryInput,
  RegisterCommandOptions,
  ReleaseNoteInput,
  SettingsFieldInput,
  SettingsFieldRegistration,
  SettingsGroupInput,
  SettingsRenderer,
} from "../types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stable identity of a definition: its non-function fields, key-sorted. */
export function stableKey(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === "function") return undefined
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(
        Object.keys(item as object)
          .sort()
          .map((key) => [key, (item as Record<string, unknown>)[key]])
      )
    }
    return item
  })
}

function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value)
  ref.current = value
  return ref
}

const now = () => Date.now()

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Wrap a command so the SDK reports its state, telemetry and diagnostics, and the handler sees the typed platform. */
export function prepareCommand(
  scope: MountScope,
  getLatest: () => CommandInput,
  options?: RegisterCommandOptions
): { definition: CommandDefinition; qualifiedId: string } {
  const input = getLatest()
  const instanceScoped = options?.instanceScoped || scope.owner.widgetId !== undefined
  const qualifiedId = qualifyId(
    scope.instance.mfeId,
    input.id,
    instanceScoped ? scope.instance.instanceId : undefined
  )
  const owner = ownerFields(scope)
  const registry = scope.bridge.registries.commands
  const handler = async (context: CommandRunContext): Promise<void> => {
    const latest = getLatest()
    const startedAt = now()
    registry.setState(qualifiedId, { status: "running", startedAt })
    scope.bridge.diagnostics.emit({
      type: "command.run",
      qualifiedId,
      outcome: "started",
      ...owner,
    })
    const telemetry = scope.bridge.telemetry.child({ command: qualifiedId })
    const span = telemetry.span("command.run", { source: context.source, ...latest.telemetry })
    try {
      if (latest.handler) {
        await latest.handler({
          signal: context.signal,
          source: context.source,
          platform: scope.contextStore.getState(),
        })
      } else if (latest.route) {
        scope.navigation.navigateWithin(latest.route)
      }
      const finishedAt = now()
      registry.setState(qualifiedId, { status: "succeeded", finishedAt })
      scope.bridge.diagnostics.emit({
        type: "command.run",
        qualifiedId,
        outcome: "succeeded",
        durationMs: finishedAt - startedAt,
        ...owner,
      })
      span.end({ outcome: "succeeded" })
    } catch (error) {
      const finishedAt = now()
      if (context.signal.aborted) {
        registry.setState(qualifiedId, { status: "idle" })
        scope.bridge.diagnostics.emit({
          type: "command.run",
          qualifiedId,
          outcome: "cancelled",
          durationMs: finishedAt - startedAt,
          ...owner,
        })
        span.end({ outcome: "cancelled" })
        return
      }
      const platformError = toPlatformError(error, {
        code: "COMMAND_FAILED",
        owner,
        source: qualifiedId,
      })
      registry.setState(qualifiedId, {
        status: "failed",
        error: platformError.message,
        failedAt: finishedAt,
      })
      scope.bridge.diagnostics.emit({
        type: "command.run",
        qualifiedId,
        outcome: "failed",
        durationMs: finishedAt - startedAt,
        error: platformError.message,
        ...owner,
      })
      span.fail(error, { outcome: "failed" })
      telemetry.error(platformError, { command: qualifiedId })
      throw platformError
    }
  }
  const { handler: _handler, availability: _availability, ...rest } = input
  const definition: CommandDefinition = {
    ...rest,
    handler,
    availability: () => getLatest().availability?.() ?? true,
  }
  return { definition, qualifiedId }
}

export interface CommandRegistrationState {
  qualifiedId: string
}

/**
 * Register a command palette command for the lifetime of the component.
 * Re-registers when `deps` change (default: the definition's data fields);
 * the latest `handler` and `availability` are always used without
 * re-registration.
 */
export function useRegisterCommand(
  definition: CommandInput,
  deps?: DependencyList,
  options?: RegisterCommandOptions
): void {
  const scope = useMountScope("useRegisterCommand")
  const latest = useLatest(definition)
  const identity = deps ? JSON.stringify(deps.map(String)) : stableKey(definition)
  const instanceScoped = options?.instanceScoped ?? false
  useEffect(() => {
    const { definition: prepared, qualifiedId } = prepareCommand(scope, () => latest.current, {
      instanceScoped,
    })
    const registry = scope.bridge.registries.commands
    const unregister = registry.register(prepared, scope.owner, { instanceScoped })
    scope.bridge.diagnostics.emit({
      type: "registration",
      kind: "command",
      action: "added",
      key: qualifiedId,
      ...ownerFields(scope),
    })
    const conflict = registry.conflicts().find((entry) => entry.rejected === qualifiedId)
    if (conflict) {
      scope.bridge.diagnostics.emit({
        type: "shortcut.conflict",
        shortcut: conflict.shortcut,
        holder: conflict.holder,
        rejected: conflict.rejected,
        ...ownerFields(scope),
      })
      scope.bridge.telemetry.track("command.shortcut-conflict", {
        shortcut: conflict.shortcut,
        holder: conflict.holder,
        rejected: conflict.rejected,
      })
    }
    return () => {
      unregister()
      scope.bridge.diagnostics.emit({
        type: "registration",
        kind: "command",
        action: "removed",
        key: qualifiedId,
        ...ownerFields(scope),
      })
    }
  }, [scope, identity, instanceScoped])
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function prepareField(
  scope: MountScope,
  getLatest: () => SettingsFieldInput<any, any> | undefined,
  input: SettingsFieldInput<any, any>
): SettingsFieldDefinition {
  const field: SettingsFieldDefinition = { ...(input as SettingsFieldDefinition) }
  if (input.renderer !== undefined) {
    field.renderer = isSettingsRendererSurface(input.renderer)
      ? input.renderer
      : createSettingsRendererSurface(
          scope,
          () => (getLatest()?.renderer ?? input.renderer) as SettingsRenderer
        )
  }
  if (typeof input.options === "function") {
    field.options = (context) => {
      const provider = getLatest()?.options ?? input.options
      return typeof provider === "function"
        ? provider({ ...context, platform: scope.contextStore.getState() })
        : (provider ?? [])
    }
  }
  for (const name of ["visibleWhen", "disabledWhen", "readOnlyWhen"] as const) {
    if (typeof input[name] === "function") {
      field[name] = (state) => (getLatest()?.[name] ?? input[name])!(state)
    }
  }
  if (typeof input.migrate === "function") {
    field.migrate = (stored, version) =>
      (getLatest()?.migrate ?? input.migrate)!(stored, version)
  }
  return field
}

/** Convert a settings group as MFE code writes it into what the registry stores (renderers become surfaces). */
export function prepareSettingsGroup(
  scope: MountScope,
  getLatest: () => SettingsGroupInput
): SettingsGroupDefinition {
  const input = getLatest()
  const fields: Record<string, SettingsFieldDefinition> = {}
  for (const [key, field] of Object.entries(input.fields)) {
    fields[key] = prepareField(scope, () => getLatest().fields[key], field)
  }
  return { ...input, fields }
}

/** Register a settings group for the lifetime of the component. */
export function useRegisterSettingsGroup(definition: SettingsGroupInput): void {
  const scope = useMountScope("useRegisterSettingsGroup")
  const latest = useLatest(definition)
  const identity = stableKey(definition)
  useEffect(() => {
    const prepared = prepareSettingsGroup(scope, () => latest.current)
    const unregister = scope.bridge.registries.settings.register(prepared, scope.owner)
    const key = `${scope.instance.mfeId}:${prepared.key}`
    scope.bridge.diagnostics.emit({
      type: "registration",
      kind: "settings",
      action: "added",
      key,
      ...ownerFields(scope),
    })
    return () => {
      unregister()
      scope.bridge.diagnostics.emit({
        type: "registration",
        kind: "settings",
        action: "removed",
        key,
        ...ownerFields(scope),
      })
    }
  }, [scope, identity])
}

/**
 * Register one field of a group independently; fields registered this way by
 * the same mount are merged into a single group registration.
 */
export function useRegisterSettingsField<TValue>(
  registration: SettingsFieldRegistration<TValue>
): void {
  const scope = useMountScope("useRegisterSettingsField")
  const latest = useLatest(registration)
  const identity = stableKey(registration)
  useEffect(() => {
    const { group, key, ...field } = latest.current
    const prepared = prepareField(
      scope,
      () => {
        const { group: _group, key: _key, ...current } = latest.current
        return current as SettingsFieldInput
      },
      field as SettingsFieldInput
    )
    return scope.root.settingsAggregator.add(group, key, prepared)
  }, [scope, identity])
}

// ---------------------------------------------------------------------------
// Help and release notes
// ---------------------------------------------------------------------------

function asArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value]
}

export function prepareHelpEntry(
  scope: MountScope,
  getLatest: () => HelpEntryInput | undefined,
  input: HelpEntryInput
): HelpEntryDefinition {
  const { content, ...rest } = input
  const definition: HelpEntryDefinition = { ...rest }
  if (content !== undefined) {
    definition.content = isMountableSurface(content)
      ? content
      : createSurface(
          scope,
          () => latestComponent(getLatest()?.content, content),
          undefined,
          "help"
        )
  }
  return definition
}

function latestComponent(
  latest: ComponentType | MountableSurface | undefined,
  fallback: ComponentType
): ComponentType {
  return typeof latest === "function" ? latest : fallback
}

export function prepareReleaseNote(
  scope: MountScope,
  getLatest: () => ReleaseNoteInput | undefined,
  input: ReleaseNoteInput
): ReleaseNoteDefinition {
  const { content, ...rest } = input
  const definition: ReleaseNoteDefinition = { ...rest }
  if (content !== undefined) {
    definition.content = isMountableSurface(content)
      ? content
      : createSurface(
          scope,
          () => latestComponent(getLatest()?.content, content),
          undefined,
          "release-note"
        )
  }
  return definition
}

/** Register help entries for the lifetime of the component. */
export function useRegisterHelp(definition: HelpEntryInput | HelpEntryInput[]): void {
  const scope = useMountScope("useRegisterHelp")
  const entries = useMemo(() => asArray(definition), [definition])
  const latest = useLatest(entries)
  const identity = stableKey(entries)
  useEffect(() => {
    const disposers = latest.current.map((entry, index) => {
      const prepared = prepareHelpEntry(scope, () => latest.current[index], entry)
      const unregister = scope.bridge.registries.help.register(prepared, scope.owner)
      const key = qualifyId(scope.instance.mfeId, entry.id)
      scope.bridge.diagnostics.emit({
        type: "registration",
        kind: "help",
        action: "added",
        key,
        ...ownerFields(scope),
      })
      return () => {
        unregister()
        scope.bridge.diagnostics.emit({
          type: "registration",
          kind: "help",
          action: "removed",
          key,
          ...ownerFields(scope),
        })
      }
    })
    return () => disposers.forEach((dispose) => dispose())
  }, [scope, identity])
}

/** Register release notes for the lifetime of the component. */
export function useRegisterReleaseNotes(
  definition: ReleaseNoteInput | ReleaseNoteInput[]
): void {
  const scope = useMountScope("useRegisterReleaseNotes")
  const entries = useMemo(() => asArray(definition), [definition])
  const latest = useLatest(entries)
  const identity = stableKey(entries)
  useEffect(() => {
    const disposers = latest.current.map((entry, index) => {
      const prepared = prepareReleaseNote(scope, () => latest.current[index], entry)
      const unregister = scope.bridge.registries.releaseNotes.register(prepared, scope.owner)
      const key = qualifyId(scope.instance.mfeId, entry.id)
      scope.bridge.diagnostics.emit({
        type: "registration",
        kind: "release-notes",
        action: "added",
        key,
        ...ownerFields(scope),
      })
      return () => {
        unregister()
        scope.bridge.diagnostics.emit({
          type: "registration",
          kind: "release-notes",
          action: "removed",
          key,
          ...ownerFields(scope),
        })
      }
    })
    return () => disposers.forEach((dispose) => dispose())
  }, [scope, identity])
}

// ---------------------------------------------------------------------------
// Declarative wrappers (thin: they call the hooks and render nothing)
// ---------------------------------------------------------------------------

export function CommandRegistration({
  definition,
  deps,
  instanceScoped,
}: {
  definition: CommandInput
  deps?: DependencyList
  instanceScoped?: boolean
}) {
  useRegisterCommand(definition, deps, { instanceScoped })
  return null
}

export function SettingsRegistration({ definition }: { definition: SettingsGroupInput }) {
  useRegisterSettingsGroup(definition)
  return null
}

export function HelpRegistration({
  definition,
}: {
  definition: HelpEntryInput | HelpEntryInput[]
}) {
  useRegisterHelp(definition)
  return null
}

export function ReleaseNotesRegistration({
  definition,
}: {
  definition: ReleaseNoteInput | ReleaseNoteInput[]
}) {
  useRegisterReleaseNotes(definition)
  return null
}
