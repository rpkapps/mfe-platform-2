import { createFileRoute } from "@tanstack/react-router"
import { HelpSlot } from "@/components"
import { TEST_IDS } from "@platform-internal/conformance"

import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderTitle,
} from "@tecton/react/tecton/page-header"

import { useShellHost } from "@/lib/platform"

export const Route = createFileRoute("/help")({
  staticData: { breadcrumb: "Help" },
  component: () => {
    const host = useShellHost()
    return (
      <div data-testid={TEST_IDS.shell.helpSlot} className="flex flex-col gap-6">
        <PageHeader>
          <PageHeaderContent>
            <PageHeaderEyebrow>Support</PageHeaderEyebrow>
            <PageHeaderTitle>Help</PageHeaderTitle>
            <PageHeaderDescription>
              Every help entry registered by a mounted application, plus the entries hidden
              widget libraries contribute without ever appearing in the app finder.
            </PageHeaderDescription>
          </PageHeaderContent>
        </PageHeader>
        {host ? <HelpSlot /> : null}
      </div>
    )
  },
})
