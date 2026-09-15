import { createFileRoute } from "@tanstack/react-router"
import { ReleaseNotesSlot } from "@/components"
import { TEST_IDS } from "@platform-internal/conformance"

import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderTitle,
} from "@tecton/react/tecton/page-header"

import { useShellHost } from "@/lib/platform"

export const Route = createFileRoute("/release-notes")({
  staticData: { breadcrumb: "Release notes" },
  component: () => {
    const host = useShellHost()
    return (
      <div data-testid={TEST_IDS.shell.releaseNotesSlot} className="flex flex-col gap-6">
        <PageHeader>
          <PageHeaderContent>
            <PageHeaderEyebrow>What&rsquo;s new</PageHeaderEyebrow>
            <PageHeaderTitle>Release notes</PageHeaderTitle>
            <PageHeaderDescription>
              Each application publishes its own notes; the shell only collects and orders them.
            </PageHeaderDescription>
          </PageHeaderContent>
        </PageHeader>
        {host ? <ReleaseNotesSlot /> : null}
      </div>
    )
  },
})
