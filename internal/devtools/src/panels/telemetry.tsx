import type { DevtoolsPanelRenderProps } from "../registry"
import { DataTable, JsonBlock, Section, StateBadge, formatTime } from "../ui"

export function TelemetryPanel({ snapshot }: DevtoolsPanelRenderProps) {
  const events = [...snapshot.telemetry].reverse()
  return (
    <Section title={`Telemetry stream (last ${events.length})`}>
      <DataTable
        columns={["Time", "Kind", "Name", "Attributes"]}
        empty="No telemetry events recorded."
        rows={events.map((event) => [
          formatTime(event.at),
          <StateBadge key="k" state={event.kind === "error" ? "error" : event.kind} />,
          <span key="n">
            {event.name}
            {event.error ? <small> — {event.error}</small> : null}
          </span>,
          <JsonBlock key="a" value={event.attributes} />,
        ])}
      />
    </Section>
  )
}
