import { useMemo } from "react"
import type { Key } from "react-aria-components"

import { AppFinder as TectonAppFinder, AppFinderGroup, AppFinderInput, AppFinderItem, AppFinderList, AppFinderMenu, AppFinderTrigger, type AppFinderTone } from "@tecton/react/tecton/app-finder"

import { useHostSelector, usePlatformHost, useShellLocation } from "./context"

const TONES: AppFinderTone[] = ["blue", "green", "violet", "saffron", "pink", "azure", "lime", "orchid", "mauve", "lilac", "red", "yellow"]

function codeOf(name: string): string {
  const words = name.split(/[\s-_]+/).filter(Boolean)
  return (words.length >= 2 ? `${words[0]![0]}${words[1]![0]}` : name.slice(0, 2)).toUpperCase()
}

function toneOf(id: string): AppFinderTone {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return TONES[hash % TONES.length]!
}

export interface AppFinderProps {
  /** Name shown when no MFE owns the current route. */
  shellName?: string
  className?: string
  /** Extra apps (shell pages) listed after the remotes. */
  extra?: { id: string; name: string; href: string; description?: string; category?: string; keywords?: string[] }[]
}

/** Application switcher over discoverable, enabled remotes (hidden MFEs are never listed). */
export function AppFinder({ shellName = "Home", className, extra = [] }: AppFinderProps) {
  const host = usePlatformHost()
  const location = useShellLocation()
  const remotes = useHostSelector((h) => h.remotes.list().filter((record) => record.enabled && record.discoverable && (!record.manifest || record.manifest.kind === "mfe")), (a, b) => a.length === b.length && a.every((r, i) => r === b[i]))
  const current = host.remotes.matchRoute(location.pathname)
  const groups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; href: string; description?: string; keywords: string[]; order: number }[]>()
    for (const record of remotes) {
      const manifest = record.manifest
      const name = manifest?.navigation?.title ?? record.displayName ?? record.mfeId
      const category = manifest?.navigation?.category ?? "Applications"
      map.set(category, [...(map.get(category) ?? []), { id: record.mfeId, name, href: host.routePrefixOf(record.mfeId), description: manifest?.navigation?.description ?? manifest?.description, keywords: [record.mfeId, ...(manifest?.navigation?.keywords ?? [])], order: manifest?.navigation?.order ?? 100 }])
    }
    for (const app of extra) map.set(app.category ?? "Shell", [...(map.get(app.category ?? "Shell") ?? []), { id: app.id, name: app.name, href: app.href, description: app.description, keywords: app.keywords ?? [], order: 1000 }])
    return Array.from(map.entries()).map(([category, apps]) => ({ category, apps: apps.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)) }))
  }, [remotes, extra, host])
  const currentApp = groups.flatMap((group) => group.apps).find((app) => app.id === current?.mfeId)
  const onAction = (key: Key) => {
    const app = groups.flatMap((group) => group.apps).find((entry) => entry.id === String(key))
    if (app) host.navigation.push(app.href)
  }
  return (
    <TectonAppFinder>
      <AppFinderTrigger name={currentApp?.name ?? shellName} tone={currentApp ? toneOf(currentApp.id) : "neutral"} className={className} data-platform-app-finder="">
        {currentApp ? codeOf(currentApp.name) : codeOf(shellName)}
      </AppFinderTrigger>
      <AppFinderMenu aria-label="Applications">
        <AppFinderInput placeholder="Search applications…" />
        <AppFinderList onAction={onAction} emptyMessage="No applications match">
          {groups.map((group) => (
            <AppFinderGroup key={group.category} heading={group.category}>
              {group.apps.map((app) => (
                <AppFinderItem key={app.id} id={app.id} name={app.name} description={app.description} keywords={app.keywords} icon={codeOf(app.name)} tone={toneOf(app.id)} isCurrent={app.id === current?.mfeId} />
              ))}
            </AppFinderGroup>
          ))}
        </AppFinderList>
      </AppFinderMenu>
    </TectonAppFinder>
  )
}
