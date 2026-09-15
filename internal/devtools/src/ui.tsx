import type { ReactNode } from "react"

import { Badge } from "@tecton/react/components/badge"

/** Small presentational helpers styled by `@platform/host/styles.css` (`.platform-devtools-*`). */
export function DataTable({ columns, rows, empty = "Nothing to show." }: { columns: string[]; rows: ReactNode[][]; empty?: string }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>
  return (
    <div className="platform-devtools-table-wrap">
      <table className="platform-devtools-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, index) => (
            <tr key={index}>
              {cells.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function KeyValue({ entries }: { entries: [string, ReactNode][] }) {
  return (
    <dl className="platform-devtools-kv">
      {entries.map(([key, value]) => (
        <div key={key} className="platform-devtools-kv-row">
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function JsonBlock({ value }: { value: unknown }) {
  let text: string
  try {
    text = JSON.stringify(value, null, 2)
  } catch {
    text = String(value)
  }
  return <pre className="platform-devtools-json">{text}</pre>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="platform-devtools-empty">{children}</p>
}

export function StateBadge({ state }: { state: string }) {
  const variant = state === "mounted" || state === "succeeded" || state === "ready" ? "success" : state === "failed" || state === "error" ? "destructive" : state === "unavailable" || state === "warn" ? "warning" : state === "loading" || state === "running" || state === "mounting" || state === "resolving" || state === "negotiating" ? "info" : "secondary"
  return <Badge variant={variant}>{state}</Badge>
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="platform-devtools-section">
      <h3 className="platform-devtools-section-title">{title}</h3>
      {children}
    </section>
  )
}

export function formatTime(at: number): string {
  try {
    return new Date(at).toLocaleTimeString(undefined, { hour12: false })
  } catch {
    return String(at)
  }
}
