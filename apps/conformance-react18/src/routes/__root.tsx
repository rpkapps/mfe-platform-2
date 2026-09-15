import * as React from "react"
import { createRootRoute, Link, Outlet } from "@tanstack/react-router"
import { MfeErrorBoundary, useRegisterSettingsGroup, useRuntimeEnv } from "@platform/react"
import { TEST_IDS } from "@platform-internal/conformance"
import { z } from "zod"

const ids = TEST_IDS.legacyReports

export const Route = createRootRoute({
  staticData: { breadcrumb: "Legacy Reports" },
  component: RootLayout,
  errorComponent: ({ error }) => <p role="alert">Legacy Reports failed: {error.message}</p>,
  notFoundComponent: () => <p>Report not found (MFE boundary).</p>,
})

function RootLayout() {
  const env = useRuntimeEnv()
  useRegisterSettingsGroup({
    key: "exports",
    title: "Exports",
    description: "Legacy report exports",
    fields: {
      format: { defaultValue: "csv", schema: z.enum(["csv", "xlsx"]), options: [{ value: "csv", label: "CSV" }, { value: "xlsx", label: "Excel" }] },
      includeHeaders: { defaultValue: true },
      retentionDays: { defaultValue: 30, schema: z.number().int().min(1), version: 2, migrate: (stored) => (typeof stored === "string" ? Number(stored) : undefined) },
    },
  })
  return (
    <MfeErrorBoundary>
      <div data-testid={ids.root} className="flex flex-col gap-3 p-4 text-sm text-slate-800">
        <nav className="flex items-center gap-3 border-b border-amber-700 pb-2">
          <Link to="/" className="font-medium hover:underline">
            Reports
          </Link>
          <span className="ml-auto rounded border border-amber-700 px-1 text-xs" data-testid={ids.reactVersion}>
            React {React.version}
          </span>
          <span className="text-xs" data-testid={ids.envValue}>
            {String(env.API_BASE_URL)} ({String(env.EXPORT_FORMATS)})
          </span>
        </nav>
        <Outlet />
      </div>
    </MfeErrorBoundary>
  )
}
