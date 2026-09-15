import type { ReactNode } from "react"
import type { RegisteredHelpEntry, RegisteredReleaseNote } from "@platform-internal/core"
import {
  SurfaceMount,
  usePlatformHost,
  useRegistryVersion,
  useSubscription,
} from "@platform/host-react"

import { Badge } from "@tecton/react/components/badge"
import { Button, LinkButton } from "@tecton/react/components/button"
import { Empty, EmptyDescription, EmptyTitle } from "@tecton/react/components/empty"

function useSurfaceEntries<T>(select: () => T[]): T[] {
  useRegistryVersion(["help", "releaseNotes"])
  const host = usePlatformHost()
  return useSubscription(
    (listener) => host.subscribe(listener),
    select,
    (a, b) => a.length === b.length && a.every((item, index) => item === b[index])
  )
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
export function HelpSlot({
  mfeId,
  selected,
  emptyState = "No help entries registered.",
  className,
}: HelpSlotProps) {
  const host = usePlatformHost()
  const entries = useSurfaceEntries<RegisteredHelpEntry>(() =>
    host.registries.help.list().filter((entry) => !mfeId || entry.owner.mfeId === mfeId)
  )
  if (entries.length === 0)
    return (
      <Empty className={className}>
        <EmptyTitle>Nothing registered yet</EmptyTitle>
        <EmptyDescription>{emptyState}</EmptyDescription>
      </Empty>
    )
  return (
    <ul
      className={["platform-surface-list", className].filter(Boolean).join(" ")}
      data-platform-help=""
    >
      {[...entries]
        .sort(
          (a, b) =>
            (a.definition.order ?? 100) - (b.definition.order ?? 100) ||
            a.definition.title.localeCompare(b.definition.title)
        )
        .map((entry) => {
          const prefix = host.routePrefixOf(entry.owner.mfeId)
          const route = entry.definition.route
            ? `${prefix === "/" ? "" : prefix}${entry.definition.route}`
            : undefined
          return (
            <li
              key={entry.qualifiedId}
              className="platform-surface-entry"
              data-platform-help-entry={entry.qualifiedId}
              data-selected={selected === entry.qualifiedId || undefined}
            >
              <div className="platform-surface-entry-header">
                <h3 className="platform-surface-entry-title">{entry.definition.title}</h3>
                <Badge
                  variant="secondary"
                  appearance="outline"
                  className="platform-surface-entry-owner"
                >
                  {entry.owner.displayName ?? entry.owner.mfeId}
                </Badge>
              </div>
              {entry.definition.description ? (
                <p className="platform-surface-entry-description">
                  {entry.definition.description}
                </p>
              ) : null}
              <div className="platform-surface-entry-actions">
                {entry.definition.href ? (
                  <LinkButton
                    variant="link"
                    size="sm"
                    href={entry.definition.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </LinkButton>
                ) : null}
                {route ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => host.navigation.push(route)}
                  >
                    Go to page
                  </Button>
                ) : null}
              </div>
              {entry.definition.content ? (
                <SurfaceMount
                  surface={entry.definition.content}
                  owner={{ mfeId: entry.owner.mfeId }}
                  className="platform-surface-content"
                />
              ) : null}
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
export function ReleaseNotesSlot({
  mfeId,
  selected,
  emptyState = "No release notes registered.",
  className,
}: ReleaseNotesSlotProps) {
  const host = usePlatformHost()
  const entries = useSurfaceEntries<RegisteredReleaseNote>(() =>
    host.registries.releaseNotes.list().filter((entry) => !mfeId || entry.owner.mfeId === mfeId)
  )
  if (entries.length === 0)
    return (
      <Empty className={className}>
        <EmptyTitle>Nothing registered yet</EmptyTitle>
        <EmptyDescription>{emptyState}</EmptyDescription>
      </Empty>
    )
  const sorted = [...entries].sort(
    (a, b) =>
      (b.definition.date ?? "").localeCompare(a.definition.date ?? "") ||
      b.definition.version.localeCompare(a.definition.version, undefined, { numeric: true })
  )
  return (
    <ul
      className={["platform-surface-list", className].filter(Boolean).join(" ")}
      data-platform-release-notes=""
    >
      {sorted.map((entry) => (
        <li
          key={entry.qualifiedId}
          className="platform-surface-entry"
          data-platform-release-note={entry.qualifiedId}
          data-selected={selected === entry.qualifiedId || undefined}
        >
          <div className="platform-surface-entry-header">
            <h3 className="platform-surface-entry-title">
              {entry.definition.title}{" "}
              <code className="platform-surface-entry-version">
                v{entry.definition.version}
              </code>
            </h3>
            <Badge
              variant="secondary"
              appearance="outline"
              className="platform-surface-entry-owner"
            >
              {entry.owner.displayName ?? entry.owner.mfeId}
              {entry.definition.date ? ` · ${entry.definition.date}` : ""}
            </Badge>
          </div>
          {entry.definition.summary ? (
            <p className="platform-surface-entry-description">{entry.definition.summary}</p>
          ) : null}
          {entry.definition.href ? (
            <div className="platform-surface-entry-actions">
              <LinkButton
                variant="link"
                size="sm"
                href={entry.definition.href}
                target="_blank"
                rel="noreferrer"
              >
                Read more
              </LinkButton>
            </div>
          ) : null}
          {entry.definition.content ? (
            <SurfaceMount
              surface={entry.definition.content}
              owner={{ mfeId: entry.owner.mfeId }}
              className="platform-surface-content"
            />
          ) : null}
        </li>
      ))}
    </ul>
  )
}
