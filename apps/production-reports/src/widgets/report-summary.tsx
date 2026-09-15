import * as React from "react"
import { useNavigation, usePlatform } from "@platform/mfe-react"
import { TEST_IDS } from "@platform-internal/conformance"

export interface ReportSummaryProps {
  reportId: string
  title: string
  owner: string
  period: string
  /** Headline figure, already formatted by the surface. */
  headline: string
}

/** Props only: the surface supplies the report, the widget renders it. */
export function ReportSummary({
  reportId,
  title,
  owner,
  period,
  headline,
}: ReportSummaryProps) {
  const navigation = useNavigation()
  const user = usePlatform((p) => p.user?.displayName ?? "anonymous")
  return (
    <div
      data-testid={TEST_IDS.widgets.reportSummary}
      className="legacy-card flex flex-col gap-2 text-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{title}</p>
        <span className="legacy-chip">{owner}</span>
      </div>
      <p className="legacy-figure text-xl">{headline}</p>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        {period} · for {user} · React {React.version}
      </p>
      <button
        type="button"
        data-testid={TEST_IDS.widgets.reportSummaryOpen}
        className="self-start text-xs underline"
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
