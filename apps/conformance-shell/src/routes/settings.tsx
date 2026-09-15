import { createFileRoute } from "@tanstack/react-router"
import { MfeOutlet } from "@platform/host-react"

import { SettingsHost } from "@/components"
import { MFE_IDS, TEST_IDS } from "@platform-internal/conformance"

import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderTitle,
} from "@tecton/react/tecton/page-header"

import { useShellHost } from "@/lib/platform"

export const Route = createFileRoute("/settings")({
  staticData: { breadcrumb: "Settings" },
  component: () => {
    const host = useShellHost()
    return (
      <div data-testid={TEST_IDS.shell.settingsHost} className="flex flex-col gap-6">
        <PageHeader>
          <PageHeaderContent>
            <PageHeaderEyebrow>Workspace</PageHeaderEyebrow>
            <PageHeaderTitle>Settings</PageHeaderTitle>
            <PageHeaderDescription>
              Settings registrations are lifecycle-bound, so this shell mounts the owners
              headlessly while the page is open. Framework-managed groups render here;
              MFE-managed groups link to their own page.
            </PageHeaderDescription>
          </PageHeaderContent>
        </PageHeader>
        {host ? <SettingsHost /> : null}
        {/* Headless mounts: the owners register their groups; nothing of them is shown. */}
        <div hidden aria-hidden="true" data-settings-owners>
          {host ? <MfeOutlet mfeId={MFE_IDS.wellPlanner} routePrefix="/well-planner" /> : null}
          {host ? (
            <MfeOutlet mfeId={MFE_IDS.productionReports} routePrefix="/legacy/reports" />
          ) : null}
        </div>
      </div>
    )
  },
})
