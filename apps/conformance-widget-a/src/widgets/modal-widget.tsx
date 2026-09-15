import { TEST_IDS } from "@platform-internal/conformance"

import { Button } from "@tecton/react/components/button"
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@tecton/react/components/dialog"

const ids = TEST_IDS.widgets

/** Opens a dialog, and from it a second one: proves ordering across roots and nesting. */
export function ModalWidget({ label = "Open widget dialog" }: { label?: string }) {
  return (
    <div data-testid={ids.modalWidget} className="rounded-md border border-border p-3">
      <DialogTrigger>
        <Button data-testid={ids.modalWidgetOpen}>{label}</Button>
        <Dialog data-testid={ids.modalWidgetDialog}>
          <DialogHeader>
            <DialogTitle>Widget dialog</DialogTitle>
            <DialogDescription>Rendered by a hidden React 19 widget library.</DialogDescription>
          </DialogHeader>
          <DialogTrigger>
            <Button variant="outline" data-testid={ids.modalWidgetNested}>
              Open nested dialog
            </Button>
            <Dialog data-testid={ids.modalWidgetNestedDialog}>
              <DialogHeader>
                <DialogTitle>Nested dialog</DialogTitle>
                <DialogDescription>Stacked above the first one by the shell overlay manager.</DialogDescription>
              </DialogHeader>
              <DialogFooter showCloseButton />
            </Dialog>
          </DialogTrigger>
          <DialogFooter showCloseButton />
        </Dialog>
      </DialogTrigger>
    </div>
  )
}
