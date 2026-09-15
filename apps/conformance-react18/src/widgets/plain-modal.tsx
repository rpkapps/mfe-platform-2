import * as React from "react"
import { createPortal } from "react-dom"
import { useOverlayContainer } from "@platform/react"

/**
 * A modal without any UI library: rendered through a React portal into the
 * MFE's shell-managed overlay root, so it stacks with Tecton dialogs from
 * other roots and stays styled by this MFE's scoped CSS.
 */
export function PlainModal({
  title,
  onClose,
  testId,
  children,
}: {
  title: string
  onClose: () => void
  testId: string
  children?: React.ReactNode
}) {
  const container = useOverlayContainer()
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])
  return createPortal(
    <div className="legacy-modal" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        className="legacy-card w-72 bg-white"
      >
        <h3 className="font-medium">{title}</h3>
        {children}
        <button type="button" className="mt-2 rounded border px-2 py-1" onClick={onClose}>
          Close
        </button>
      </div>
    </div>,
    container
  )
}
