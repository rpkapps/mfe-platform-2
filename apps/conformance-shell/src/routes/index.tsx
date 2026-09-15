import { createFileRoute, Link } from "@tanstack/react-router"
import { AppFinder } from "@platform/host/react"
import { TEST_IDS } from "@platform-internal/conformance"

import { useShellHost } from "@/lib/platform"

export const Route = createFileRoute("/")({
  component: Home,
})

function Home() {
  const host = useShellHost()
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-medium">Conformance shell</h1>
      <p className="text-muted-foreground max-w-prose text-sm">
        A TanStack Start shell hosting React 19 and React 18 remotes side by side. Discoverable
        MFEs appear in the App Finder; hidden widget libraries do not, yet their widgets,
        commands, help and release notes are available.
      </p>
      <div data-testid={TEST_IDS.shell.appFinder}>
        {host ? (
          <AppFinder />
        ) : (
          <p className="text-muted-foreground text-sm">Starting platform…</p>
        )}
      </div>
      <ul className="list-disc pl-5 text-sm">
        <li>
          <Link to="/$" params={{ _splat: "asset-tracker" }} className="underline">
            /asset-tracker
          </Link>{" "}
          — React 19 + Tecton MFE
        </li>
        <li>
          <Link to="/$" params={{ _splat: "legacy/reports" }} className="underline">
            /legacy/reports
          </Link>{" "}
          — React 18 MFE with a legacy route prefix
        </li>
        <li>
          <Link to="/dashboard" className="underline">
            /dashboard
          </Link>{" "}
          — widgets from four remotes at once
        </li>
      </ul>
    </div>
  )
}
