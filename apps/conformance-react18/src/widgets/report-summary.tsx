import * as React from "react"
import { useNavigation, usePlatform } from "@platform/mfe-react"
import { REPORTS, TEST_IDS } from "@platform-internal/conformance"

export function ReportSummary({ reportId }: { reportId: string }) {
  const report = REPORTS.find((candidate) => candidate.id === reportId)
  const navigation = useNavigation()
  const user = usePlatform((p) => p.user?.displayName ?? "anonymous")
  return (
    <div data-testid={TEST_IDS.widgets.reportSummary} className="legacy-card text-sm">
      <p className="font-medium">{report?.title ?? reportId}</p>
      <p className="text-xs">
        for {user} · React {React.version}
      </p>
      <button
        type="button"
        className="underline"
        onClick={() => navigation.navigate(`/legacy/reports/reports/${reportId}`)}
      >
        Open report
      </button>
      <p data-testid={TEST_IDS.widgets.hmrLabel} className="text-xs">
        WIDGET_HMR_V1
      </p>
    </div>
  )
}
