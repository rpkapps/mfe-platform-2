import { announceBreadcrumbs } from "@platform-internal/core"

import type { DevtoolsPanelRenderProps } from "../registry"
import { DataTable, KeyValue, Section, StateBadge } from "../ui"

export function BreadcrumbsPanel({ snapshot }: DevtoolsPanelRenderProps) {
  const { breadcrumbs } = snapshot
  const active = breadcrumbs.activeInstanceId ? breadcrumbs.trails[breadcrumbs.activeInstanceId] : undefined
  const current = [...breadcrumbs.shell, ...(active?.entries ?? [])]
  return (
    <>
      <Section title="Current trail">
        <KeyValue entries={[["Renderer", breadcrumbs.renderer], ["Active instance", breadcrumbs.activeInstanceId ?? "—"], ["Announcement", announceBreadcrumbs(current) || "—"]]} />
        <DataTable columns={["Key", "Label", "Href", "Kind", "State", "Hidden"]} empty="No breadcrumb entries." rows={current.map((entry) => [<code key="k">{entry.key}</code>, entry.label ?? "—", entry.href ? <code key="h">{entry.href}</code> : "—", entry.kind, <StateBadge key="s" state={entry.state} />, entry.hidden ? "yes" : "no"])} />
      </Section>
      <Section title="Published trails">
        <DataTable columns={["Instance", "MFE", "Entries", "Updated"]} empty="No trails published." rows={Object.values(breadcrumbs.trails).map((trail) => [<code key="i">{trail.owner.instanceId}</code>, trail.owner.mfeId, trail.entries.map((entry) => entry.label ?? entry.key).join(" › "), new Date(trail.updatedAt).toLocaleTimeString()])} />
      </Section>
    </>
  )
}
