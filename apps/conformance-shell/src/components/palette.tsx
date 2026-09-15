import { useCallback, useEffect, useMemo, useState } from "react"
import { matchesShortcut, normalizeShortcut, type CommandState } from "@platform-internal/core"
import type { Key } from "react-aria-components"

import { Badge } from "@tecton/react/components/badge"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@tecton/react/components/command"

import {
  createCommandSearchIndex,
  SEARCH_GROUPS,
  type SearchKind,
  type SearchResult,
} from "@platform/host"
import { usePlatformHost, useRegistryVersion } from "@platform/host-react"

export interface CommandPaletteProps {
  /** Shortcut opening the palette (default `mod+k`). */
  hotkey?: string | null
  placeholder?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Shell settings page; setting results navigate to `<settingsPath>?group=<key>&field=<key>`. */
  settingsPath?: string
  /** Shell help page for help results without a route or href. */
  helpPath?: string
  /** Shell release notes page. */
  releaseNotesPath?: string
  limit?: number
}

const GROUP_ORDER: SearchKind[] = [
  "command",
  "navigate",
  "setting",
  "help",
  "release-note",
  "breadcrumb",
]

function stateBadge(state: CommandState | undefined) {
  if (!state || state.status === "idle") return null
  if (state.status === "running") return <Badge variant="info">running</Badge>
  if (state.status === "failed") return <Badge variant="destructive">failed</Badge>
  return <Badge variant="success">done</Badge>
}

/** Shell-owned command palette over the host search index (commands, navigation, settings, help, release notes, breadcrumbs). */
export function CommandPalette({
  hotkey = "mod+k",
  placeholder = "Search commands, pages, settings…",
  open: controlledOpen,
  onOpenChange,
  settingsPath = "/settings",
  helpPath = "/help",
  releaseNotesPath = "/release-notes",
  limit = 40,
}: CommandPaletteProps) {
  const host = usePlatformHost()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = useCallback(
    (next: boolean) => {
      setInternalOpen(next)
      onOpenChange?.(next)
    },
    [onOpenChange]
  )
  const [query, setQuery] = useState("")
  const version = useRegistryVersion()
  const index = useMemo(() => createCommandSearchIndex(host), [host])
  const results = useMemo(
    () => (open ? index.search(query, { limit }) : []),
    [index, query, limit, open, version]
  )
  const groups = useMemo(() => {
    const byKind = new Map<SearchKind, SearchResult[]>()
    for (const result of results)
      byKind.set(result.kind, [...(byKind.get(result.kind) ?? []), result])
    return GROUP_ORDER.filter((kind) => byKind.has(kind)).map((kind) => ({
      kind,
      heading: SEARCH_GROUPS[kind],
      items: byKind.get(kind)!,
    }))
  }, [results])
  const [lastError, setLastError] = useState<string | null>(null)

  useEffect(() => {
    if (!hotkey || typeof document === "undefined") return
    const normalized = normalizeShortcut(hotkey)
    if (!normalized) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (matchesShortcut(normalized, event)) {
        event.preventDefault()
        setOpen(!open)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [hotkey, open, setOpen])

  useEffect(() => {
    if (!open) {
      setQuery("")
      setLastError(null)
    }
  }, [open])

  const activate = useCallback(
    (key: Key) => {
      const entry = results.find((result) => result.id === String(key))
      if (!entry || entry.disabled) return
      if (
        entry.kind === "command" &&
        entry.qualifiedId &&
        host.registries.commands.get(entry.qualifiedId)
      ) {
        setLastError(null)
        void host.commands.run(entry.qualifiedId, { source: "palette" }).then((result) => {
          if (result.outcome === "failed" && result.error)
            setLastError(`${entry.label}: ${result.error.message}`)
        })
        setOpen(false)
        return
      }
      if (entry.href) host.navigation.push(entry.href)
      else if (entry.external && typeof window !== "undefined")
        window.open(entry.external, "_blank", "noopener")
      else if (entry.kind === "setting" && entry.settings && entry.mfeId)
        host.navigation.push(
          `${settingsPath}?group=${encodeURIComponent(`${entry.mfeId}:${entry.settings.groupKey}`)}${entry.settings.fieldKey ? `&field=${encodeURIComponent(entry.settings.fieldKey)}` : ""}`
        )
      else if (entry.kind === "help" && entry.qualifiedId)
        host.navigation.push(`${helpPath}?entry=${encodeURIComponent(entry.qualifiedId)}`)
      else if (entry.kind === "release-note" && entry.qualifiedId)
        host.navigation.push(
          `${releaseNotesPath}?entry=${encodeURIComponent(entry.qualifiedId)}`
        )
      setOpen(false)
    },
    [results, host, setOpen, settingsPath, helpPath, releaseNotesPath]
  )

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Search commands, pages, settings, help and release notes"
      className="platform-palette"
    >
      <Command
        inputValue={query}
        onInputChange={setQuery}
        filter={() => true}
        className="platform-palette-command"
      >
        <CommandInput placeholder={placeholder} data-testid="shell-palette-input" />
        <CommandList
          aria-label="Results"
          onAction={activate}
          renderEmptyState={() => (
            <CommandEmpty>
              {query ? `No results for "${query}"` : "Nothing registered yet"}
            </CommandEmpty>
          )}
          className="platform-palette-list"
        >
          {groups.map((group) => (
            <CommandGroup
              key={group.kind}
              heading={group.heading}
              data-platform-palette-group={group.kind}
            >
              {group.items.map((item) => (
                <CommandItem
                  key={item.id}
                  id={item.id}
                  textValue={item.label}
                  isDisabled={item.disabled}
                  data-platform-palette-kind={item.kind}
                  data-testid="shell-palette-item"
                >
                  <span className="platform-palette-item">
                    <span className="platform-palette-item-label">{item.label}</span>
                    {item.description ? (
                      <span className="platform-palette-item-description">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                  {item.state ? stateBadge(item.state) : null}
                  {item.shortcut ? <CommandShortcut>{item.shortcut}</CommandShortcut> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
        {lastError ? (
          <p className="platform-palette-error" role="alert">
            {lastError}
          </p>
        ) : null}
      </Command>
    </CommandDialog>
  )
}
