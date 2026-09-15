import { useMemo, useState } from "react"
import type { DiagnosticLevel } from "@platform-internal/core"
import { redactSnapshot, serializeSnapshot } from "@platform-internal/diagnostics"

import { Button } from "@tecton/react/components/button"

import type { DevtoolsPanelRenderProps } from "../registry"
import { DataTable, JsonBlock, Section, StateBadge, formatTime } from "../ui"

const LEVELS: DiagnosticLevel[] = ["debug", "info", "warn", "error"]
const ORDER: Record<DiagnosticLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

export function DiagnosticsPanel({ snapshot }: DevtoolsPanelRenderProps) {
  const [minLevel, setMinLevel] = useState<DiagnosticLevel>("info")
  const [copied, setCopied] = useState<string | null>(null)
  const events = useMemo(
    () =>
      [...snapshot.diagnostics]
        .filter((event) => ORDER[event.level] >= ORDER[minLevel])
        .reverse(),
    [snapshot, minLevel]
  )
  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      setCopied("clipboard unavailable")
    }
  }
  return (
    <>
      <Section title="Snapshot">
        <div className="platform-devtools-toolbar">
          <Button
            size="xs"
            variant="outline"
            onPress={() => void copy("snapshot", serializeSnapshot(redactSnapshot(snapshot)))}
          >
            Copy snapshot JSON
          </Button>
          <Button
            size="xs"
            variant="outline"
            onPress={() => void copy("events", JSON.stringify(events, null, 2))}
          >
            Copy events JSON
          </Button>
          {copied ? <small aria-live="polite">copied {copied}</small> : null}
          <label className="platform-devtools-filter">
            Level
            <select
              value={minLevel}
              onChange={(event) => setMinLevel(event.target.value as DiagnosticLevel)}
              aria-label="Minimum diagnostic level"
            >
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Section>
      <Section title={`Events (${events.length})`}>
        <DataTable
          columns={["#", "Time", "Level", "Type", "Owner", "Detail"]}
          empty="No diagnostics at this level."
          rows={events.map((event) => [
            event.id,
            formatTime(event.at),
            <StateBadge key="l" state={event.level} />,
            <code key="t">{event.type}</code>,
            <span key="o">
              {event.mfeId ?? "—"}
              {event.instanceId ? (
                <>
                  <br />
                  <small>{event.instanceId}</small>
                </>
              ) : null}
            </span>,
            <JsonBlock key="d" value={detailOf(event as unknown as Record<string, unknown>)} />,
          ])}
        />
      </Section>
    </>
  )
}

function detailOf(event: Record<string, unknown>): unknown {
  const {
    id: _id,
    at: _at,
    level: _level,
    type: _type,
    mfeId: _m,
    instanceId: _i,
    widgetId: _w,
    ...rest
  } = event
  return rest
}
