import * as React from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useRegisterCommand } from "@platform/mfe-react"
import { REPORTS, TEST_IDS } from "@platform-internal/conformance"

import { reportPrefs } from "@/lib/storage"
import { PlainModal } from "@/widgets/plain-modal"

const ids = TEST_IDS.productionReports

export const Route = createFileRoute("/")({
  staticData: { navigation: { title: "Reports", description: "All reports", order: 0 } },
  component: ReportsHome,
})

function ReportsHome() {
  const [exported, setExported] = React.useState(0)
  const [open, setOpen] = React.useState(false)
  const format = reportPrefs.use((state) => state.format)

  useRegisterCommand({
    id: "increment-report-counter",
    label: "Queue a report export",
    group: "Production Reports",
    shortcut: "mod+shift+r",
    handler: () => setExported((value) => value + 1),
  })

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <p className="text-xs tracking-wide text-amber-500 uppercase">Nordsee Energy</p>
        <h1 className="text-xl font-semibold">Production reports</h1>
        <p className="max-w-prose text-sm text-slate-600 dark:text-slate-400">
          Daily production and quarterly emissions for the licence. Reports are generated
          overnight and exported in the format set under Exports.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {REPORTS.map((report) => (
          <article key={report.id} className="legacy-card flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-medium">
                <Link
                  to="/reports/$reportId"
                  params={{ reportId: report.id }}
                  className="hover:underline"
                >
                  {report.title}
                </Link>
              </h2>
              <span className="legacy-chip">{report.owner}</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">{report.period}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {report.rows.slice(0, 2).map((row) => (
                <React.Fragment key={row.label}>
                  <dt className="text-slate-600 dark:text-slate-400">{row.label}</dt>
                  <dd className="legacy-figure text-right">
                    {row.value.toLocaleString("en-GB")} {row.unit}
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          </article>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-amber-500/30 pt-3">
        <button
          type="button"
          data-testid={ids.counter}
          className="rounded bg-amber-600 px-2 py-1 text-white hover:bg-amber-500"
          onClick={() => setExported((value) => value + 1)}
        >
          Queued {exported}
        </button>
        <button
          type="button"
          data-testid={ids.openModal}
          className="rounded border border-amber-500 px-2 py-1"
          onClick={() => setOpen(true)}
        >
          Schedule export
        </button>
        <span data-testid={ids.storageValue} className="text-xs">
          format: {format}
        </span>
        <button
          type="button"
          className="text-xs underline"
          onClick={() =>
            reportPrefs.setKey("format", (current) => (current === "csv" ? "xlsx" : "csv"))
          }
        >
          toggle format
        </button>
      </div>
      {open && (
        <PlainModal testId={ids.modal} title="Schedule export" onClose={() => setOpen(false)} />
      )}
      <p data-testid={ids.hmrLabel} className="text-xs text-slate-500 dark:text-slate-400">
        HMR_LABEL_V1
      </p>
    </div>
  )
}
