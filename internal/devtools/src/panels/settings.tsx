import { Badge } from "@tecton/react/components/badge"

import type { DevtoolsPanelRenderProps } from "../registry"
import { DataTable, Section } from "../ui"

export function SettingsPanel({ snapshot }: DevtoolsPanelRenderProps) {
  return (
    <Section title={`Settings groups (${snapshot.settings.length})`}>
      <DataTable
        columns={["Group", "Owner", "Managed by", "Fields"]}
        empty="No settings groups registered."
        rows={snapshot.settings.map((group) => [
          <span key="g">
            <strong>{group.title}</strong>
            <br />
            <code>{group.qualifiedKey}</code>
          </span>,
          group.owner.mfeId,
          <span key="m">
            <Badge variant={group.managedBy === "framework" ? "info" : "secondary"}>
              {group.managedBy}
            </Badge>
            {group.route ? (
              <>
                {" "}
                <code>{group.route}</code>
              </>
            ) : null}
          </span>,
          <ul key="f" className="platform-devtools-list">
            {group.fields.map((field) => (
              <li key={field.qualifiedKey}>
                <strong>{field.label}</strong> <code>{field.key}</code> · {field.kind}
                {field.hasOptions ? ` · options${field.asyncOptions ? " (async)" : ""}` : ""}
                {field.customRenderer ? " · custom renderer" : ""}
              </li>
            ))}
            {group.fields.length === 0 ? <li>—</li> : null}
          </ul>,
        ])}
      />
    </Section>
  )
}
