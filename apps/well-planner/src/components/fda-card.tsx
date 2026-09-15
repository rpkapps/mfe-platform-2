import type { ReactNode } from "react"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@tecton/react/components/card"
import { Badge } from "@tecton/react/components/badge"
import { Button } from "@tecton/react/components/button"
import { Separator } from "@tecton/react/components/separator"
import { Meter } from "@tecton/react/tecton/meter"
import { Stat, StatGroup, StatLabel, StatValue } from "@tecton/react/tecton/stat"
import {
  FDA_STATUS_META,
  GRADE_SEGMENTS,
  type Fda,
  type Grade,
} from "@platform-internal/conformance"

/** Label and meter colour per grade — the same mapping everywhere a grade is shown. */
const GRADE_META: Record<Grade, { label: string; color: "success" | "warning" | "error" }> = {
  low: { label: "Low", color: "success" },
  moderate: { label: "Moderate", color: "warning" },
  high: { label: "High", color: "error" },
}

function GradeMeter({ label, grade }: { label: string; grade: Grade }) {
  const meta = GRADE_META[grade]
  return (
    <Meter
      size="sm"
      label={label}
      segments={6}
      color={meta.color}
      value={GRADE_SEGMENTS[grade]}
      maxValue={6}
      valueLabel={meta.label}
    />
  )
}

const KPI_LABELS: Record<string, { label: string; render: (fda: Fda) => ReactNode }> = {
  npv: {
    label: "NPV",
    render: (fda) => <StatValue unit="mmusd">{fda.npv.toFixed(1)}</StatValue>,
  },
  irr: { label: "IRR", render: (fda) => <StatValue unit="%">{fda.irr.toFixed(1)}</StatValue> },
  capex: {
    label: "CAPEX",
    render: (fda) => <StatValue unit="mmusd">{fda.capex.toFixed(1)}</StatValue>,
  },
  firstOil: { label: "First oil", render: (fda) => <StatValue>{fda.firstOil}</StatValue> },
  wells: { label: "Wells", render: (fda) => <StatValue>{fda.wells}</StatValue> },
  updated: { label: "Updated", render: (fda) => <StatValue>{fda.updated}</StatValue> },
}

export interface FdaCardProps {
  fda: Fda
  /** KPI keys to show, from the dashboard's persisted preference. */
  columns: readonly string[]
  onCompare?: () => void
  children?: ReactNode
}

/** One field development alternative: economics, grades and the actions on it. */
export function FdaCard({ fda, columns, onCompare, children }: FdaCardProps) {
  const status = FDA_STATUS_META[fda.status]
  const kpis = columns
    .map((key) => KPI_LABELS[key])
    .filter((kpi): kpi is (typeof KPI_LABELS)[string] => kpi !== undefined)
  return (
    <Card>
      <CardHeader>
        <CardDescription className="font-mono">{fda.code}</CardDescription>
        <CardTitle>{fda.title}</CardTitle>
        <CardAction>
          <Badge variant={status.tone} appearance="outline">
            {status.label}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">{fda.description}</p>
        <p className="text-muted-foreground text-xs">
          {fda.wells} wells · updated {fda.updated}
        </p>
        <Separator />
        {kpis.length > 0 ? (
          <StatGroup>
            {kpis.map((kpi) => (
              <Stat key={kpi.label} size="sm">
                <StatLabel>{kpi.label}</StatLabel>
                {kpi.render(fda)}
              </Stat>
            ))}
          </StatGroup>
        ) : null}
        <div className="flex flex-col gap-2">
          <GradeMeter label="Complexity" grade={fda.complexity} />
          <GradeMeter label="Risk" grade={fda.risk} />
          <GradeMeter label="Emissions" grade={fda.emissions} />
        </div>
        <div className="flex items-center gap-2">
          {onCompare ? (
            <Button size="sm" variant="ghost" onPress={onCompare}>
              Compare
            </Button>
          ) : null}
          {children}
        </div>
      </CardContent>
    </Card>
  )
}
