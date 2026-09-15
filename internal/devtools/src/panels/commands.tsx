import { Badge } from "@tecton/react/components/badge"

import type { DevtoolsPanelRenderProps } from "../registry"
import { DataTable, Section, StateBadge } from "../ui"

export function CommandsPanel({ snapshot }: DevtoolsPanelRenderProps) {
  const { registered, conflicts, states } = snapshot.commands
  return (
    <>
      <Section title={`Registered commands (${registered.length})`}>
        <DataTable
          columns={["Command", "Owner", "Shortcut", "Group", "Route", "State"]}
          empty="No commands registered."
          rows={registered.map((command) => {
            const state = states[command.qualifiedId]
            return [
              <span key="c">
                <strong>{command.label}</strong>
                <br />
                <code>{command.qualifiedId}</code>
                {command.description ? <small> — {command.description}</small> : null}
              </span>,
              <span key="o">
                {command.owner.mfeId}
                <br />
                <small>{command.owner.instanceId}</small>
              </span>,
              command.shortcut ? <kbd key="s">{command.shortcut}</kbd> : "—",
              command.group ?? "—",
              command.route ? <code key="r">{command.route}</code> : "—",
              state ? (
                <span key="st">
                  <StateBadge state={state.status} />
                  {state.status === "failed" ? <small> {state.error}</small> : null}
                </span>
              ) : (
                "—"
              ),
            ]
          })}
        />
      </Section>
      <Section title={`Shortcut conflicts (${conflicts.length})`}>
        <DataTable
          columns={["Shortcut", "Holder", "Rejected"]}
          empty="No shortcut conflicts."
          rows={conflicts.map((conflict) => [
            <kbd key="k">{conflict.shortcut}</kbd>,
            <code key="h">{conflict.holder}</code>,
            <span key="r">
              <code>{conflict.rejected}</code> <Badge variant="warning">rejected</Badge>
            </span>,
          ])}
        />
      </Section>
    </>
  )
}
