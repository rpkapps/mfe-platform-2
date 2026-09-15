import { useEffect, useRef, type ReactNode } from "react"
import type { MountableSurface, RegisteredHelpEntry, RegisteredReleaseNote } from "@platform-internal/core"

import { Button, LinkButton } from "@tecton/react/components/button"

import { usePlatformHost, useRegistryVersion, useSubscription } from "./context"

/** Mounts a remote `MountableSurface` (help or release-note content) into a host-owned element. */
export function SurfaceMount({ surface, className, owner }: { surface: MountableSurface; className?: string; owner?: { mfeId: string } }) {
  const ref = useRef<HTMLDivElement>(null)
  const host = usePlatformHost()
  useEffect(() => {
    const element = ref.current
    if (!element) return
    let handle: { dispose(): void } | undefined
    try {
      handle = surface.mount(element)
    } catch (error) {
      host.diagnostics.emit({ type: "log", level: "warn", message: "surface mount failed", detail: error instanceof Error ? error.message : String(error), mfeId: owner?.mfeId })
      element.textContent = "This content failed to render."
    }
    return () => {
      try {
        handle?.dispose()
      } catch {
        // isolated
      }
      element.replaceChildren()
    }
  }, [surface, host, owner?.mfeId])
  return <div ref={ref} className={className} data-platform-surface="" data-mfe={owner?.mfeId} />
}

function useSurfaceEntries<T>(select: () => T[]): T[] {
  useRegistryVersion(["help", "releaseNotes"])
  const host = usePlatformHost()
  return useSubscription((listener) => host.subscribe(listener), select, (a, b) => a.length === b.length && a.every((item, index) => item === b[index]))
}

export interface HelpSlotProps {
  /** Only entries of these MFEs. */
  mfeId?: string
  /** Pre-open one entry (`?entry=` from the palette). */
  selected?: string
  emptyState?: ReactNode
  className?: string
}

/** Lists registered help entries; mountable content renders into host-owned elements. */
export function HelpSlot({ mfeId, selected, emptyState = "No help entries registered.", className }: HelpSlotProps) {
  const host = usePlatformHost()
  const entries = useSurfaceEntries<RegisteredHelpEntry>(() => host.registries.help.list().filter((entry) => !mfeId || entry.owner.mfeId === mfeId))
  if (entries.length === 0) return <p className={["platform-surface-empty", className].filter(Boolean).join(" ")}>{emptyState}</p>
  return (
    <ul className={["platform-surface-list", className].filter(Boolean).join(" ")} data-platform-help="">
      {[...entries].sort((a, b) => (a.definition.order ?? 100) - (b.definition.order ?? 100) || a.definition.title.localeCompare(b.definition.title)).map((entry) => {
        const prefix = host.routePrefixOf(entry.owner.mfeId)
        const route = entry.definition.route ? `${prefix === "/" ? "" : prefix}${entry.definition.route}` : undefined
        return (
          <li key={entry.qualifiedId} className="platform-surface-entry" data-platform-help-entry={entry.qualifiedId} data-selected={selected === entry.qualifiedId || undefined}>
            <div className="platform-surface-entry-header">
              <h3 className="platform-surface-entry-title">{entry.definition.title}</h3>
              <span className="platform-surface-entry-owner">{entry.owner.displayName ?? entry.owner.mfeId}</span>
            </div>
            {entry.definition.description ? <p className="platform-surface-entry-description">{entry.definition.description}</p> : null}
            <div className="platform-surface-entry-actions">
              {entry.definition.href ? (
                <LinkButton variant="link" size="sm" href={entry.definition.href} target="_blank" rel="noreferrer">
                  Open
                </LinkButton>
              ) : null}
              {route ? (
                <Button variant="outline" size="sm" onPress={() => host.navigation.push(route)}>
                  Go to page
                </Button>
              ) : null}
            </div>
            {entry.definition.content ? <SurfaceMount surface={entry.definition.content} owner={{ mfeId: entry.owner.mfeId }} className="platform-surface-content" /> : null}
          </li>
        )
      })}
    </ul>
  )
}

export interface ReleaseNotesSlotProps {
  mfeId?: string
  selected?: string
  emptyState?: ReactNode
  className?: string
}

/** Lists registered release notes, newest version first. */
export function ReleaseNotesSlot({ mfeId, selected, emptyState = "No release notes registered.", className }: ReleaseNotesSlotProps) {
  const host = usePlatformHost()
  const entries = useSurfaceEntries<RegisteredReleaseNote>(() => host.registries.releaseNotes.list().filter((entry) => !mfeId || entry.owner.mfeId === mfeId))
  if (entries.length === 0) return <p className={["platform-surface-empty", className].filter(Boolean).join(" ")}>{emptyState}</p>
  const sorted = [...entries].sort((a, b) => (b.definition.date ?? "").localeCompare(a.definition.date ?? "") || b.definition.version.localeCompare(a.definition.version, undefined, { numeric: true }))
  return (
    <ul className={["platform-surface-list", className].filter(Boolean).join(" ")} data-platform-release-notes="">
      {sorted.map((entry) => (
        <li key={entry.qualifiedId} className="platform-surface-entry" data-platform-release-note={entry.qualifiedId} data-selected={selected === entry.qualifiedId || undefined}>
          <div className="platform-surface-entry-header">
            <h3 className="platform-surface-entry-title">
              {entry.definition.title} <code className="platform-surface-entry-version">v{entry.definition.version}</code>
            </h3>
            <span className="platform-surface-entry-owner">
              {entry.owner.displayName ?? entry.owner.mfeId}
              {entry.definition.date ? ` · ${entry.definition.date}` : ""}
            </span>
          </div>
          {entry.definition.summary ? <p className="platform-surface-entry-description">{entry.definition.summary}</p> : null}
          {entry.definition.href ? (
            <div className="platform-surface-entry-actions">
              <LinkButton variant="link" size="sm" href={entry.definition.href} target="_blank" rel="noreferrer">
                Read more
              </LinkButton>
            </div>
          ) : null}
          {entry.definition.content ? <SurfaceMount surface={entry.definition.content} owner={{ mfeId: entry.owner.mfeId }} className="platform-surface-content" /> : null}
        </li>
      ))}
    </ul>
  )
}
