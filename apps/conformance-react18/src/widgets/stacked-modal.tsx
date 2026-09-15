import * as React from "react"
import { TEST_IDS } from "@platform-internal/conformance"

import { PlainModal } from "./plain-modal"

const ids = TEST_IDS.widgets

export function StackedModal({ label = "React 18 modal" }: { label?: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div data-testid={ids.stackedModal} className="legacy-card text-sm">
      <button type="button" data-testid={ids.stackedModalOpen} className="rounded border px-2 py-1" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && <PlainModal testId={ids.stackedModalDialog} title={label} onClose={() => setOpen(false)} />}
    </div>
  )
}
