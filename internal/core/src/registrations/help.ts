import { PlatformError } from "../errors"
import { isValidLocalId, qualifyId } from "../identity"
import { createEmitter, type Emitter } from "../store"
import type { RegistrationOwner } from "./commands"

export interface HelpEntryDefinition {
  id: string
  title: string
  description?: string
  keywords?: string[]
  /** External URL. */
  href?: string
  /** MFE-relative route. */
  route?: string
  /** Optional rich content mounted by the MFE (SDK wraps a component into mount/dispose). */
  content?: MountableSurface
  order?: number
}

export interface ReleaseNoteDefinition {
  id: string
  version: string
  title: string
  date?: string
  summary?: string
  keywords?: string[]
  href?: string
  content?: MountableSurface
}

/**
 * Interactive remote content crosses the boundary as metadata plus
 * mount/dispose callbacks: the owner renders it into a host-provided element
 * with its own React root. No React values cross roots.
 */
export interface MountableSurface {
  mount(container: HTMLElement): { dispose(): void }
}

export interface RegisteredHelpEntry {
  qualifiedId: string
  definition: HelpEntryDefinition
  owner: RegistrationOwner
}

export interface RegisteredReleaseNote {
  qualifiedId: string
  definition: ReleaseNoteDefinition
  owner: RegistrationOwner
}

export interface SurfaceRegistryEvents<T> extends Record<string, unknown> {
  change: { entries: T[] }
}

export interface SurfaceRegistry<TDefinition extends { id: string }, TRegistered> {
  register(definition: TDefinition, owner: RegistrationOwner): () => void
  list(): TRegistered[]
  events: Emitter<SurfaceRegistryEvents<TRegistered>>
  clearOwner(instanceId: string): void
}

function createSurfaceRegistry<
  TDefinition extends { id: string; title: string },
  TRegistered extends { qualifiedId: string; owner: RegistrationOwner },
>(
  kind: string,
  make: (qualifiedId: string, definition: TDefinition, owner: RegistrationOwner) => TRegistered
): SurfaceRegistry<TDefinition, TRegistered> {
  const entries = new Map<string, TRegistered>()
  const events = createEmitter<SurfaceRegistryEvents<TRegistered>>()
  const emitChange = () => events.emit("change", { entries: Array.from(entries.values()) })
  return {
    events,
    register(definition, owner) {
      if (!isValidLocalId(definition.id)) {
        throw new PlatformError({
          code: "COMMAND_INVALID",
          message: `${kind} id "${definition.id}" is not a local kebab-case id.`,
          owner,
          source: definition.id,
        })
      }
      if (!definition.title) {
        throw new PlatformError({
          code: "COMMAND_INVALID",
          message: `${kind} "${definition.id}" needs a title.`,
          owner,
          source: definition.id,
        })
      }
      const qualifiedId = qualifyId(owner.mfeId, definition.id)
      const registered = make(qualifiedId, definition, owner)
      entries.set(qualifiedId, registered)
      emitChange()
      return () => {
        if (entries.get(qualifiedId) !== registered) return
        entries.delete(qualifiedId)
        emitChange()
      }
    },
    list: () => Array.from(entries.values()),
    clearOwner(instanceId) {
      for (const [id, entry] of Array.from(entries.entries()))
        if (entry.owner.instanceId === instanceId) entries.delete(id)
      emitChange()
    },
  }
}

export type HelpRegistry = SurfaceRegistry<HelpEntryDefinition, RegisteredHelpEntry>
export type ReleaseNotesRegistry = SurfaceRegistry<ReleaseNoteDefinition, RegisteredReleaseNote>

export function createHelpRegistry(): HelpRegistry {
  return createSurfaceRegistry<HelpEntryDefinition, RegisteredHelpEntry>(
    "Help entry",
    (qualifiedId, definition, owner) => ({ qualifiedId, definition, owner })
  )
}

export function createReleaseNotesRegistry(): ReleaseNotesRegistry {
  return createSurfaceRegistry<ReleaseNoteDefinition, RegisteredReleaseNote>(
    "Release note",
    (qualifiedId, definition, owner) => ({ qualifiedId, definition, owner })
  )
}
