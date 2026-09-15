import { createFileRoute } from "@tanstack/react-router"
import { HelpSlot } from "@/components"
import { TEST_IDS } from "@platform-internal/conformance"

import { useShellHost } from "@/lib/platform"

export const Route = createFileRoute("/help")({
  staticData: { breadcrumb: "Help" },
  component: () => {
    const host = useShellHost()
    return (
      <div data-testid={TEST_IDS.shell.helpSlot} className="flex flex-col gap-4">
        <h1 className="text-xl font-medium">Help</h1>
        {host ? <HelpSlot /> : null}
      </div>
    )
  },
})
