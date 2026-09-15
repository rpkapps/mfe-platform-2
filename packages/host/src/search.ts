import {
  announceBreadcrumbs,
  manifestRoutePrefix,
  type BreadcrumbEntry,
  type CommandState,
} from "@platform-internal/core"

import { commandHref, isCommandAvailable } from "./commands"
import type { PlatformHost } from "./types"

export type SearchKind =
  "command" | "navigate" | "setting" | "help" | "release-note" | "breadcrumb"

export interface SearchEntry {
  kind: SearchKind
  id: string
  label: string
  description?: string
  keywords: string[]
  /** Section heading in the palette. */
  group: string
  mfeId?: string
  /** Where "run" goes for navigation-like entries. */
  href?: string
  /** External link (help entries). */
  external?: string
  qualifiedId?: string
  shortcut?: string
  state?: CommandState
  /** Whether the entry can be activated (unavailable commands are listed but disabled). */
  disabled?: boolean
  /** Settings group / field placement. */
  settings?: { groupKey: string; fieldKey?: string; managedBy: "framework" | "mfe" }
}

export interface SearchResult extends SearchEntry {
  score: number
}

export interface CommandSearchIndex {
  entries(): SearchEntry[]
  search(query: string, options?: { limit?: number; kinds?: SearchKind[] }): SearchResult[]
}

export const SEARCH_GROUPS: Record<SearchKind, string> = {
  command: "Commands",
  navigate: "Navigate",
  setting: "Settings",
  help: "Help",
  "release-note": "Release notes",
  breadcrumb: "Breadcrumbs",
}

function fuzzy(needle: string, haystack: string): number {
  // Subsequence match; rewards contiguous runs.
  let index = 0
  let score = 0
  let run = 0
  for (const char of haystack) {
    if (index < needle.length && char === needle[index]) {
      index += 1
      run += 1
      score += run
    } else run = 0
  }
  return index === needle.length ? score / (haystack.length || 1) : 0
}

/** Score an entry against a lower-cased query; 0 means no match. */
export function scoreEntry(entry: SearchEntry, query: string): number {
  if (!query) return 1
  const label = entry.label.toLowerCase()
  if (label === query) return 100
  if (label.startsWith(query)) return 80
  const words = label.split(/\s+/)
  if (words.some((word) => word.startsWith(query))) return 70
  if (label.includes(query)) return 60
  const keywords = entry.keywords.map((keyword) => keyword.toLowerCase())
  if (keywords.some((keyword) => keyword === query)) return 55
  if (keywords.some((keyword) => keyword.includes(query))) return 45
  const description = entry.description?.toLowerCase() ?? ""
  if (description.includes(query)) return 30
  if (entry.mfeId && entry.mfeId.includes(query)) return 20
  const fuzz = fuzzy(query.replace(/\s+/g, ""), label.replace(/\s+/g, ""))
  return fuzz > 0 ? 5 + Math.min(10, fuzz * 10) : 0
}

function breadcrumbHref(entry: BreadcrumbEntry): string | undefined {
  return entry.href
}

export function collectEntries(host: PlatformHost): SearchEntry[] {
  const entries: SearchEntry[] = []
  const seen = new Set<string>()
  const states = host.registries.commands.states()
  for (const command of host.registries.commands.list()) {
    const key = `command:${command.qualifiedId}`
    seen.add(key)
    entries.push({
      kind: "command",
      id: key,
      qualifiedId: command.qualifiedId,
      label: command.definition.label,
      description: command.definition.description,
      keywords: [...(command.definition.keywords ?? []), command.definition.group ?? ""].filter(
        Boolean
      ),
      group: SEARCH_GROUPS.command,
      mfeId: command.owner.mfeId,
      href: commandHref(host, command),
      shortcut: command.shortcut,
      state: states[command.qualifiedId],
      disabled: !isCommandAvailable(host, command),
    })
  }
  for (const record of host.remotes.list()) {
    const manifest = record.manifest
    const prefix = host.routePrefixOf(record.mfeId)
    const displayName = record.displayName ?? manifest?.displayName ?? record.mfeId
    if (!record.enabled) continue
    if (manifest) {
      if (manifest.discoverable && manifest.kind === "mfe") {
        entries.push({
          kind: "navigate",
          id: `navigate:${record.mfeId}`,
          label: manifest.navigation?.title ?? displayName,
          description: manifest.navigation?.description ?? manifest.description,
          keywords: [
            ...(manifest.navigation?.keywords ?? []),
            manifest.navigation?.category ?? "",
            record.mfeId,
          ].filter(Boolean),
          group: SEARCH_GROUPS.navigate,
          mfeId: record.mfeId,
          href: manifestRoutePrefix(manifest),
        })
      }
      for (const route of manifest.routes) {
        if (!route.navigation || route.navigation.hidden) continue
        entries.push({
          kind: "navigate",
          id: `navigate:${record.mfeId}:${route.fullPath}`,
          label: route.navigation.title,
          description: route.navigation.description ?? `${displayName} · ${route.fullPath}`,
          keywords: [...(route.navigation.keywords ?? []), record.mfeId],
          group: SEARCH_GROUPS.navigate,
          mfeId: record.mfeId,
          href: route.fullPath,
        })
      }
      for (const command of manifest.commands) {
        const qualifiedId = `${record.mfeId}:${command.id}`
        if (seen.has(`command:${qualifiedId}`) || !command.route) continue
        entries.push({
          kind: "command",
          id: `manifest-command:${qualifiedId}`,
          qualifiedId,
          label: command.label,
          description: command.description,
          keywords: [...(command.keywords ?? []), command.group ?? ""].filter(Boolean),
          group: SEARCH_GROUPS.command,
          mfeId: record.mfeId,
          href: `${prefix === "/" ? "" : prefix}${command.route.startsWith("/") ? command.route : `/${command.route}`}`,
          shortcut: command.shortcut,
        })
      }
      for (const contribution of manifest.settings) {
        const qualifiedKey = `${record.mfeId}:${contribution.key}`
        if (host.registries.settings.get(qualifiedKey)) continue
        entries.push({
          kind: "setting",
          id: `setting:${qualifiedKey}`,
          label: contribution.title,
          description: contribution.description ?? `${displayName} settings`,
          keywords: [...(contribution.keywords ?? []), record.mfeId],
          group: SEARCH_GROUPS.setting,
          mfeId: record.mfeId,
          href:
            contribution.managedBy === "mfe" && contribution.route
              ? `${prefix === "/" ? "" : prefix}${contribution.route}`
              : undefined,
          settings: { groupKey: contribution.key, managedBy: contribution.managedBy },
        })
        for (const field of contribution.fields) {
          entries.push({
            kind: "setting",
            id: `setting:${qualifiedKey}.${field.key}`,
            label: field.label ?? field.key,
            description: field.description ?? `${contribution.title} · ${displayName}`,
            keywords: [...(field.keywords ?? []), contribution.title],
            group: SEARCH_GROUPS.setting,
            mfeId: record.mfeId,
            settings: {
              groupKey: contribution.key,
              fieldKey: field.key,
              managedBy: contribution.managedBy,
            },
          })
        }
      }
      for (const entry of manifest.help) {
        const qualifiedId = `${record.mfeId}:${entry.id}`
        if (
          host.registries.help
            .list()
            .some((registered) => registered.qualifiedId === qualifiedId)
        )
          continue
        entries.push({
          kind: "help",
          id: `help:${qualifiedId}`,
          qualifiedId,
          label: entry.title,
          description: entry.description,
          keywords: entry.keywords ?? [],
          group: SEARCH_GROUPS.help,
          mfeId: record.mfeId,
          href: entry.route ? `${prefix === "/" ? "" : prefix}${entry.route}` : undefined,
          external: entry.href,
        })
      }
      for (const note of manifest.releaseNotes) {
        const qualifiedId = `${record.mfeId}:${note.id}`
        if (
          host.registries.releaseNotes
            .list()
            .some((registered) => registered.qualifiedId === qualifiedId)
        )
          continue
        entries.push({
          kind: "release-note",
          id: `release-note:${qualifiedId}`,
          qualifiedId,
          label: `${note.title} (${note.version})`,
          description: note.summary,
          keywords: [...(note.keywords ?? []), note.version],
          group: SEARCH_GROUPS["release-note"],
          mfeId: record.mfeId,
          external: note.href,
        })
      }
    } else if (record.discoverable && record.registry) {
      entries.push({
        kind: "navigate",
        id: `navigate:${record.mfeId}`,
        label: displayName,
        description: "Not loaded yet",
        keywords: [record.mfeId],
        group: SEARCH_GROUPS.navigate,
        mfeId: record.mfeId,
        href: prefix,
      })
    }
  }
  for (const group of host.registries.settings.list()) {
    const prefix = host.routePrefixOf(group.owner.mfeId)
    const managedBy = group.definition.managedBy ?? "framework"
    const title = group.definition.title ?? group.definition.key
    entries.push({
      kind: "setting",
      id: `setting:${group.qualifiedKey}`,
      label: title,
      description:
        group.definition.description ??
        `${group.owner.displayName ?? group.owner.mfeId} settings`,
      keywords: [...(group.definition.keywords ?? []), group.owner.mfeId],
      group: SEARCH_GROUPS.setting,
      mfeId: group.owner.mfeId,
      href:
        managedBy === "mfe" && group.definition.route
          ? `${prefix === "/" ? "" : prefix}${group.definition.route}`
          : undefined,
      settings: { groupKey: group.definition.key, managedBy },
    })
    if (managedBy === "framework") {
      for (const field of group.fields) {
        entries.push({
          kind: "setting",
          id: `setting:${field.qualifiedKey}`,
          label: field.label,
          description:
            field.description ?? `${title} · ${group.owner.displayName ?? group.owner.mfeId}`,
          keywords: [...field.keywords, title],
          group: SEARCH_GROUPS.setting,
          mfeId: group.owner.mfeId,
          settings: { groupKey: group.definition.key, fieldKey: field.key, managedBy },
        })
      }
    }
  }
  for (const entry of host.registries.help.list()) {
    const prefix = host.routePrefixOf(entry.owner.mfeId)
    entries.push({
      kind: "help",
      id: `help:${entry.qualifiedId}`,
      qualifiedId: entry.qualifiedId,
      label: entry.definition.title,
      description: entry.definition.description,
      keywords: entry.definition.keywords ?? [],
      group: SEARCH_GROUPS.help,
      mfeId: entry.owner.mfeId,
      href: entry.definition.route
        ? `${prefix === "/" ? "" : prefix}${entry.definition.route}`
        : undefined,
      external: entry.definition.href,
    })
  }
  for (const note of host.registries.releaseNotes.list()) {
    entries.push({
      kind: "release-note",
      id: `release-note:${note.qualifiedId}`,
      qualifiedId: note.qualifiedId,
      label: `${note.definition.title} (${note.definition.version})`,
      description: note.definition.summary,
      keywords: [...(note.definition.keywords ?? []), note.definition.version],
      group: SEARCH_GROUPS["release-note"],
      mfeId: note.owner.mfeId,
      external: note.definition.href,
    })
  }
  const trail = host.breadcrumbs.current()
  for (const crumb of trail) {
    if (crumb.hidden || !crumb.label) continue
    entries.push({
      kind: "breadcrumb",
      id: `breadcrumb:${crumb.key}`,
      label: crumb.label,
      description: announceBreadcrumbs([crumb]),
      keywords: [crumb.kind],
      group: SEARCH_GROUPS.breadcrumb,
      href: breadcrumbHref(crumb),
      disabled: !crumb.href,
    })
  }
  return entries
}

const KIND_ORDER: SearchKind[] = [
  "command",
  "navigate",
  "setting",
  "help",
  "release-note",
  "breadcrumb",
]

/** Search index over commands, MFE navigation metadata, settings, help, release notes and the current breadcrumb trail. */
export function createCommandSearchIndex(host: PlatformHost): CommandSearchIndex {
  return {
    entries: () => collectEntries(host),
    search(query, options = {}) {
      const normalized = query.trim().toLowerCase()
      const limit = options.limit ?? 50
      const kinds = options.kinds ? new Set(options.kinds) : null
      const results: SearchResult[] = []
      for (const entry of collectEntries(host)) {
        if (kinds && !kinds.has(entry.kind)) continue
        const score = scoreEntry(entry, normalized)
        if (score > 0) results.push({ ...entry, score })
      }
      results.sort(
        (a, b) =>
          b.score - a.score ||
          KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
          a.label.localeCompare(b.label)
      )
      return results.slice(0, limit)
    },
  }
}
