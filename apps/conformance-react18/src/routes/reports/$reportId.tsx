import { createFileRoute, redirect } from "@tanstack/react-router"
import { REPORTS, TEST_IDS } from "@platform-internal/conformance"

const ids = TEST_IDS.legacyReports

export const Route = createFileRoute("/reports/$reportId")({
  staticData: { breadcrumb: { fromLoader: "breadcrumb" }, permissionGroups: ["reports:read"] },
  beforeLoad: ({ context, params }) => {
    if (!context.platform.permissions.hasGroup("reports:read")) throw redirect({ to: "/" })
    if (params.reportId === "quarterly-emissions" && !context.platform.permissions.hasGroup("reports:export")) {
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
    <div className="legacy-card">
      <h2 data-testid={ids.reportTitle} className="font-medium">
        {report.title}
      </h2>
      <p className="text-xs">owner: {report.owner}</p>
    </div>
  )
}
