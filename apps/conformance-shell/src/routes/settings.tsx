import { createFileRoute } from "@tanstack/react-router"
import { MfeOutlet, SettingsHost } from "@platform/host/react"
import { MFE_IDS, TEST_IDS } from "@platform-internal/conformance"

import { useShellHost } from "@/lib/platform"

export const Route = createFileRoute("/settings")({
  staticData: { breadcrumb: "Settings" },
  component: () => {
    const host = useShellHost()
    return (
      <div data-testid={TEST_IDS.shell.settingsHost} className="flex flex-col gap-4">
        <h1 className="text-xl font-medium">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Settings registrations are lifecycle-bound, so this shell mounts the settings owners headlessly while the page is open. Framework-managed groups render here; MFE-managed groups link to their own page.
        </p>
        {host ? <SettingsHost /> : null}
        {/* Headless mounts: the owners register their groups; nothing of them is shown. */}
        <div hidden aria-hidden="true" data-settings-owners>
          {host ? <MfeOutlet mfeId={MFE_IDS.assetTracker} routePrefix="/asset-tracker" /> : null}
          {host ? <MfeOutlet mfeId={MFE_IDS.legacyReports} routePrefix="/legacy/reports" /> : null}
        </div>
      </div>
    )
  },
})
