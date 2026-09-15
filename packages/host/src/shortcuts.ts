import { matchesShortcut } from "@platform-internal/core"

import type { PlatformHost } from "./types"

const installed = new WeakMap<EventTarget, Map<PlatformHost, () => void>>()

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== "string") return false
  const element = target as HTMLElement
  if (element.isContentEditable) return true
  const tag = element.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

/**
 * Listen for `keydown` once per target and dispatch registered command
 * shortcuts through the host command runner. Events from inputs, textareas,
 * selects and contenteditable elements are ignored. Returns a disposer;
 * installing twice for the same host and target is a no-op.
 */
export function installShortcutListener(
  host: PlatformHost,
  target: EventTarget | null = typeof document !== "undefined" ? document : null
): () => void {
  if (!target) return () => {}
  const perTarget = installed.get(target) ?? new Map<PlatformHost, () => void>()
  installed.set(target, perTarget)
  const existing = perTarget.get(host)
  if (existing) return existing
  const onKeyDown = (event: Event) => {
    const keyboard = event as KeyboardEvent
    if (keyboard.defaultPrevented || !keyboard.key) return
    if (["Shift", "Control", "Alt", "Meta"].includes(keyboard.key)) return
    if (isEditableTarget(keyboard.target)) return
    for (const command of host.registries.commands.list()) {
      if (!command.shortcut) continue
      if (!matchesShortcut(command.shortcut, keyboard)) continue
      keyboard.preventDefault()
      void host.commands.run(command.qualifiedId, { source: "shortcut" })
      return
    }
  }
  target.addEventListener("keydown", onKeyDown)
  const dispose = () => {
    target.removeEventListener("keydown", onKeyDown)
    perTarget.delete(host)
  }
  perTarget.set(host, dispose)
  return dispose
}
