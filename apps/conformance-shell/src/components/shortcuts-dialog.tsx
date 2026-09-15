import { useMemo } from "react"
import { usePlatformHost, useRegistryVersion, useSubscription } from "@platform/host-react"
import { TEST_IDS } from "@platform-internal/conformance"

import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tecton/react/components/dialog"
import { Empty, EmptyDescription, EmptyTitle } from "@tecton/react/components/empty"
import { Kbd } from "@tecton/react/components/kbd"
import { Separator } from "@tecton/react/components/separator"

const ids = TEST_IDS.shell

export interface ShortcutsDialogProps {
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Every shortcut the host knows about, grouped by the command group that owns
 * it. The list is the command registry, so a remote's shortcuts appear the
 * moment it mounts and disappear when it unmounts.
 *
 * Tecton's `Dialog` is the whole overlay — `ModalOverlay` + `Modal` + `Dialog`
 * — so it takes `isOpen` itself. Wrapping it in a `DialogTrigger` instead,
 * which expects a pressable child *and* an overlay, makes react-aria warn
 * about a `PressResponder` with nothing to press.
 */
export function ShortcutsDialog({ isOpen, onOpenChange }: ShortcutsDialogProps) {
  const host = usePlatformHost()
  useRegistryVersion(["commands"])
  // Select the registry's own entries — mapping to fresh objects here would
  // make every snapshot unequal and spin `useSyncExternalStore` forever.
  const entries = useSubscription(
    (listener) => host.registries.commands.events.on("change", listener),
    () => host.registries.commands.list().filter((entry) => entry.definition.shortcut),
    (a, b) => a.length === b.length && a.every((item, index) => item === b[index])
  )
  const commands = useMemo(
    () =>
      entries.map((entry) => ({
        id: entry.qualifiedId,
        label: entry.definition.label,
        group: entry.definition.group ?? "Other",
        shortcut: entry.definition.shortcut!,
      })),
    [entries]
  )
  const groups = [...new Set(commands.map((command) => command.group))].sort()
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      data-testid={ids.shortcutsDialog}
      className="max-w-lg"
    >
      <DialogHeader>
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>
          Shortcuts registered by the shell and by every mounted application.
        </DialogDescription>
      </DialogHeader>
      {groups.length === 0 ? (
        <Empty>
          <EmptyTitle>No shortcuts registered</EmptyTitle>
          <EmptyDescription>
            Mount an application and its shortcuts will appear here.
          </EmptyDescription>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group, index) => (
            <div key={group} className="flex flex-col gap-2">
              {index > 0 ? <Separator /> : null}
              <p className="text-muted-foreground text-xs tracking-wide uppercase">{group}</p>
              <ul className="flex flex-col gap-1.5">
                {commands
                  .filter((command) => command.group === group)
                  .map((command) => (
                    <li key={command.id} className="flex items-center justify-between gap-4">
                      <span className="text-sm">{command.label}</span>
                      <Kbd>{command.shortcut}</Kbd>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <DialogFooter showCloseButton />
    </Dialog>
  )
}
