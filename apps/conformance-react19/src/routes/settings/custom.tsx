import { createFileRoute } from "@tanstack/react-router"
import { TEST_IDS } from "@platform-internal/conformance"

import { Button } from "@tecton/react/components/button"

import { sessionNotes } from "@/lib/storage"

const ids = TEST_IDS.assetTracker

export const Route = createFileRoute("/settings/custom")({
  staticData: { breadcrumb: "Advanced" },
  component: CustomSettingsPage,
})

/** A fully MFE-managed settings page: it owns state, persistence and validation. */
function CustomSettingsPage() {
  const notes = sessionNotes.use()
  return (
    <div data-testid={ids.customSettings} className="flex flex-col gap-2">
      <label className="text-sm font-medium" htmlFor="asset-notes">
        Session notes (session storage, MFE-managed)
      </label>
      <textarea id="asset-notes" className="min-h-20 rounded-md border border-input bg-background p-2 text-sm" value={notes} onChange={(event) => sessionNotes.set(event.target.value)} />
      <p data-testid={ids.customSettingsValue} className="text-xs text-muted-foreground">
        {notes.length} characters
      </p>
      <Button size="sm" variant="outline" onPress={() => sessionNotes.reset()}>
        Clear
      </Button>
    </div>
  )
}
