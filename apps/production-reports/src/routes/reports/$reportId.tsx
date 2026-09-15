import { createFileRoute, redirect } from "@tanstack/react-router"
import { REPORTS, TEST_IDS } from "@platform-internal/conformance"

const ids = TEST_IDS.productionReports

export const Route = createFileRoute("/reports/$reportId")({
  staticData: { breadcrumb: { fromLoader: "breadcrumb" }, permissionGroups: ["reports:read"] },
  beforeLoad: ({ context, params }) => {
    if (!context.platform.permissions.hasGroup("reports:read")) throw redirect({ to: "/" })
    if (
      params.reportId === "quarterly-emissions" &&
      !context.platform.permissions.hasGroup("reports:export")
    ) {
      throw new Error("reports:export is required for emissions reports")
    }
  },
  loader: ({ params }) => {
    const report = REPORTS.find((candidate) => candidate.id === params.reportId)
    if (!report) throw new Error(`Unknown report ${params.reportId}`)
    return { report, breadcrumb: report.title }
  },
  errorComponent: ({ error }: { error: unknown }) => (
    <p role="alert" data-testid={ids.guardMessage}>
      {error instanceof Error ? error.message : String(error)}
    </p>
  ),
  component: ReportDetail,
})

function ReportDetail() {
  const { report } = Route.useLoaderData()
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <p className="text-xs tracking-wide text-amber-500 uppercase">{report.period}</p>
        <h2 data-testid={ids.reportTitle} className="text-lg font-semibold">
          {report.title}
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Owned by <span className="legacy-chip">{report.owner}</span>
        </p>
      </header>
      <div className="legacy-card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <caption className="sr-only">{report.title} figures</caption>
          <thead>
            <tr className="border-b border-amber-500/30 text-left">
              <th scope="col" className="px-3 py-2 text-xs font-medium">
                Measure
              </th>
              <th scope="col" className="px-3 py-2 text-right text-xs font-medium">
                Value
              </th>
              <th scope="col" className="px-3 py-2 text-xs font-medium">
                Unit
              </th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.label} className="border-b border-amber-500/15 last:border-0">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  {row.label}
                </th>
                <td className="legacy-figure px-3 py-2 text-right">
                  {row.value.toLocaleString("en-GB")}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                  {row.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
