import { PlatformError } from "../errors"
import { isValidLocalId, qualifyId } from "../identity"
import { createEmitter, type Emitter } from "../store"

/** Owner of a registration: which remote, which mount. */
export interface RegistrationOwner {
  mfeId: string
  instanceId: string
  widgetId?: string
  /** Display name for the palette and devtools. */
  displayName?: string
}

export interface CommandRunContext {
  signal: AbortSignal
  /** Where the command was invoked from. */
  source: "palette" | "shortcut" | "api"
  /** Free-form platform context snapshot passed by the host (typed on the SDK side). */
  platform: unknown
}

export interface CommandDefinition {
  /** Local id; the platform namespaces it with `mfeId` (and `instanceId` for widgets). */
  id: string
  label: string
  description?: string
  group?: string
  keywords?: string[]
  /** `mod+shift+k`, `ctrl+alt+p`… (`mod` is ⌘ on macOS, Ctrl elsewhere). */
  shortcut?: string
  /** Permission groups required to see and run the command. */
  permissionGroups?: string[]
  /** Return `false` to hide the command (evaluated when the palette opens). */
  availability?: () => boolean
  /** Sync or async handler; long handlers receive an AbortSignal. */
  handler: (context: CommandRunContext) => void | Promise<void>
  /** Attributes merged into telemetry events for this command. */
  telemetry?: Record<string, string | number | boolean>
  /** Navigate to this MFE-relative route (`/assets`) instead of running a handler. */
  route?: string
  icon?: string
}

export interface RegisteredCommand {
  /** Fully qualified id: `<mfeId>:<id>` or `<mfeId>:<id>@<instanceId>`. */
  qualifiedId: string
  definition: CommandDefinition
  owner: RegistrationOwner
  /** Normalised shortcut, or undefined when rejected/absent. */
  shortcut?: string
  registeredAt: number
}

export type CommandState =
  | { status: "idle" }
  | { status: "running"; startedAt: number }
  | { status: "failed"; error: string; failedAt: number }
  | { status: "succeeded"; finishedAt: number }

export interface ShortcutConflict {
  shortcut: string
  holder: string
  rejected: string
  at: number
}

export interface CommandRegistryEvents extends Record<string, unknown> {
  change: { commands: RegisteredCommand[] }
  conflict: ShortcutConflict
  state: { qualifiedId: string; state: CommandState }
}

const MODIFIERS = ["mod", "ctrl", "alt", "shift", "meta"] as const

/** Normalise `Mod+Shift+K` → `mod+shift+k`; returns null for malformed shortcuts. */
export function normalizeShortcut(shortcut: string): string | null {
  const parts = shortcut
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return null
  const key = parts[parts.length - 1]!
  const modifiers = parts.slice(0, -1)
  if (modifiers.some((modifier) => !(MODIFIERS as readonly string[]).includes(modifier)))
    return null
  if ((MODIFIERS as readonly string[]).includes(key)) return null
  if (key.length === 0) return null
  const ordered = MODIFIERS.filter((modifier) => modifiers.includes(modifier))
  return [...ordered, key].join("+")
}

/** Match a keyboard event against a normalised shortcut. */
export function matchesShortcut(
  shortcut: string,
  event: {
    key: string
    ctrlKey: boolean
    metaKey: boolean
    altKey: boolean
    shiftKey: boolean
  },
  platform: "mac" | "other" = typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform)
    ? "mac"
    : "other"
): boolean {
  const parts = shortcut.split("+")
  const key = parts[parts.length - 1]!
  const modifiers = new Set(parts.slice(0, -1))
  const mod = platform === "mac" ? event.metaKey : event.ctrlKey
  const wantMod = modifiers.has("mod")
  const wantCtrl = modifiers.has("ctrl")
  const wantMeta = modifiers.has("meta")
  if (event.key.toLowerCase() !== key) return false
  if (wantMod !== (mod && !(platform === "mac" ? wantMeta : wantCtrl))) {
    if (!(wantMod && mod)) return false
  }
  if (!wantMod && platform === "mac" && event.metaKey !== wantMeta) return false
  if (!wantMod && platform !== "mac" && event.ctrlKey !== wantCtrl) return false
  if (wantMod && platform === "mac" && event.ctrlKey !== wantCtrl) return false
  if (wantMod && platform !== "mac" && event.metaKey !== wantMeta) return false
  if (event.altKey !== modifiers.has("alt")) return false
  if (event.shiftKey !== modifiers.has("shift")) return false
  return true
}

export function validateCommandDefinition(
  definition: CommandDefinition,
  owner: RegistrationOwner
): void {
  if (!isValidLocalId(definition.id)) {
    throw new PlatformError({
      code: "COMMAND_INVALID",
      message: `Command id "${definition.id}" is not a local kebab-case id.`,
      owner,
      source: definition.id,
    })
  }
  if (!definition.label) {
    throw new PlatformError({
      code: "COMMAND_INVALID",
      message: `Command "${definition.id}" needs a label.`,
      owner,
      source: definition.id,
    })
  }
  if (typeof definition.handler !== "function" && !definition.route) {
    throw new PlatformError({
      code: "COMMAND_INVALID",
      message: `Command "${definition.id}" needs a handler or a route.`,
      owner,
      source: definition.id,
    })
  }
  if (definition.shortcut !== undefined && normalizeShortcut(definition.shortcut) === null) {
    throw new PlatformError({
      code: "COMMAND_INVALID",
      message: `Command "${definition.id}" has a malformed shortcut "${definition.shortcut}".`,
      owner,
      source: definition.id,
    })
  }
}

export interface CommandRegistry {
  register(
    definition: CommandDefinition,
    owner: RegistrationOwner,
    options?: { instanceScoped?: boolean }
  ): () => void
  list(): RegisteredCommand[]
  get(qualifiedId: string): RegisteredCommand | undefined
  conflicts(): ShortcutConflict[]
  states(): Record<string, CommandState>
  setState(qualifiedId: string, state: CommandState): void
  /** Find the command holding a normalised shortcut. */
  byShortcut(shortcut: string): RegisteredCommand | undefined
  events: Emitter<CommandRegistryEvents>
  clearOwner(instanceId: string): void
}

export function createCommandRegistry(): CommandRegistry {
  const commands = new Map<string, RegisteredCommand>()
  const shortcuts = new Map<string, string>() // shortcut → qualifiedId
  const conflicts: ShortcutConflict[] = []
  const states: Record<string, CommandState> = {}
  const events = createEmitter<CommandRegistryEvents>()
  const emitChange = () => events.emit("change", { commands: Array.from(commands.values()) })
  const registry: CommandRegistry = {
    events,
    register(definition, owner, options) {
      validateCommandDefinition(definition, owner)
      const qualifiedId = qualifyId(
        owner.mfeId,
        definition.id,
        options?.instanceScoped || owner.widgetId ? owner.instanceId : undefined
      )
      if (commands.has(qualifiedId)) {
        throw new PlatformError({
          code: "COMMAND_INVALID",
          message: `Command "${qualifiedId}" is already registered by this owner.`,
          owner,
          source: definition.id,
        })
      }
      let shortcut: string | undefined
      if (definition.shortcut) {
        const normalised = normalizeShortcut(definition.shortcut)!
        const holder = shortcuts.get(normalised)
        if (holder && commands.has(holder)) {
          // Deterministic: the first registration keeps the shortcut; the newcomer is registered without it.
          const conflict: ShortcutConflict = {
            shortcut: normalised,
            holder,
            rejected: qualifiedId,
            at: Date.now(),
          }
          conflicts.push(conflict)
          events.emit("conflict", conflict)
        } else {
          shortcuts.set(normalised, qualifiedId)
          shortcut = normalised
        }
      }
      const registered: RegisteredCommand = {
        qualifiedId,
        definition,
        owner,
        shortcut,
        registeredAt: Date.now(),
      }
      commands.set(qualifiedId, registered)
      states[qualifiedId] = { status: "idle" }
      emitChange()
      return () => {
        if (commands.get(qualifiedId) !== registered) return
        commands.delete(qualifiedId)
        delete states[qualifiedId]
        if (shortcut && shortcuts.get(shortcut) === qualifiedId) shortcuts.delete(shortcut)
        for (let index = conflicts.length - 1; index >= 0; index -= 1) {
          if (
            conflicts[index]!.rejected === qualifiedId ||
            conflicts[index]!.holder === qualifiedId
          )
            conflicts.splice(index, 1)
        }
        emitChange()
      }
    },
    list: () => Array.from(commands.values()),
    get: (qualifiedId) => commands.get(qualifiedId),
    conflicts: () => [...conflicts],
    states: () => ({ ...states }),
    setState(qualifiedId, state) {
      if (!commands.has(qualifiedId)) return
      states[qualifiedId] = state
      events.emit("state", { qualifiedId, state })
    },
    byShortcut(shortcut) {
      const id = shortcuts.get(shortcut)
      return id ? commands.get(id) : undefined
    },
    clearOwner(instanceId) {
      for (const [id, command] of Array.from(commands.entries())) {
        if (command.owner.instanceId === instanceId) {
          commands.delete(id)
          delete states[id]
          if (command.shortcut && shortcuts.get(command.shortcut) === id)
            shortcuts.delete(command.shortcut)
        }
      }
      emitChange()
    },
  }
  return registry
}

/** Serialisable shape for search indexes, manifests and devtools. */
export function describeCommand(command: RegisteredCommand): {
  qualifiedId: string
  id: string
  label: string
  description?: string
  group?: string
  keywords: string[]
  shortcut?: string
  owner: RegistrationOwner
  route?: string
} {
  const { definition, owner } = command
  return {
    qualifiedId: command.qualifiedId,
    id: definition.id,
    label: definition.label,
    description: definition.description,
    group: definition.group,
    keywords: definition.keywords ?? [],
    shortcut: command.shortcut,
    owner,
    route: definition.route,
  }
}
