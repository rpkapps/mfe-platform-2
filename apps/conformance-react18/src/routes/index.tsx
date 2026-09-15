import * as React from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useRegisterCommand } from "@platform/react"
import { REPORTS, TEST_IDS } from "@platform-internal/conformance"

import { reportPrefs } from "@/lib/storage"
import { PlainModal } from "@/widgets/plain-modal"

const ids = TEST_IDS.legacyReports

export const Route = createFileRoute("/")({
  staticData: { navigation: { title: "Reports", description: "All reports", order: 0 } },
  component: ReportsHome,
})

function ReportsHome() {
  const [count, setCount] = React.useState(0)
  const [open, setOpen] = React.useState(false)
  const format = reportPrefs.use((state) => state.format)

  useRegisterCommand({ id: "increment-report-counter", label: "Increment report counter", group: "Legacy Reports", shortcut: "mod+shift+r", handler: () => setCount((value) => value + 1) })

  return (
    <div className="flex flex-col gap-3">
      <ul className="legacy-card list-disc pl-5">
        {REPORTS.map((report) => (
          <li key={report.id}>
            <Link to="/reports/$reportId" params={{ reportId: report.id }} className="hover:underline">
              {report.title}
            </Link>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <button type="button" data-testid={ids.counter} className="rounded bg-amber-700 px-2 py-1 text-white" onClick={() => setCount((value) => value + 1)}>
          Counter {count}
        </button>
        <button type="button" data-testid={ids.openModal} className="rounded border border-amber-700 px-2 py-1" onClick={() => setOpen(true)}>
          Open modal
        </button>
        <span data-testid={ids.storageValue}>format: {format}</span>
        <button type="button" className="underline" onClick={() => reportPrefs.setKey("format", (current) => (current === "csv" ? "xlsx" : "csv"))}>
          toggle format
        </button>
      </div>
      {open && <PlainModal testId={ids.modal} title="Legacy modal" onClose={() => setOpen(false)} />}
      <p data-testid={ids.hmrLabel} className="text-xs text-slate-500">
        HMR_LABEL_V1
      </p>
    </div>
  )
}
