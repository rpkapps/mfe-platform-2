import { createFileRoute } from "@tanstack/react-router"
import { ReleaseNotesSlot } from "@platform/host/react"
import { TEST_IDS } from "@platform-internal/conformance"

import { useShellHost } from "@/lib/platform"

export const Route = createFileRoute("/release-notes")({
  staticData: { breadcrumb: "Release notes" },
  component: () => {
    const host = useShellHost()
    return (
      <div data-testid={TEST_IDS.shell.releaseNotesSlot} className="flex flex-col gap-4">
        <h1 className="text-xl font-medium">Release notes</h1>
        {host ? <ReleaseNotesSlot /> : null}
      </div>
    )
  },
})
