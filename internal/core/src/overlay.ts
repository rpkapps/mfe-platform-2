import type { DiagnosticSink } from "./diagnostics"

/**
 * Centralised overlay management. The manager creates body-level, owner-tagged
 * portal roots (`<div data-platform-overlay-root data-mfe="asset-tracker">`) so
 * overlays escape MFE containers while carrying the owner attribute that their
 * scoped styles and theme tokens depend on. Layer order is allocated
 * deterministically as overlays open; focus trapping, focus restoration and
 * Escape handling stay with the overlay library (React Aria) — the manager
 * only observes. Nothing in the DOM or React is patched.
 */
export interface OverlayOwner {
  mfeId: string
  instanceId: string
  widgetId?: string
}

export interface OverlayRootOptions {
  owner: OverlayOwner
  /** Contained mode: the root is placed inside the owner container instead of the body. */
  contained?: boolean
  /** Extra attributes (theme, density…). */
  attributes?: Record<string, string>
  /** Element to insert into for contained mode. */
  container?: HTMLElement
}

export interface OverlayRoot {
  element: HTMLElement
  owner: OverlayOwner
  dispose(): void
}

export interface OverlayLayer {
  id: number
  owner: OverlayOwner
  element: Element
  zIndex: number
  openedAt: number
}

export interface OverlayManagerState {
  roots: { owner: OverlayOwner; contained: boolean }[]
  layers: OverlayLayer[]
  /** Highest z-index in use. */
  top: number
}

export interface OverlayManager {
  createRoot(options: OverlayRootOptions): OverlayRoot
  getState(): OverlayManagerState
  subscribe(listener: () => void): () => void
  /** Whether any modal overlay is open (used by the shell to inert its chrome). */
  hasOpenModal(): boolean
  dispose(): void
}

export interface OverlayManagerOptions {
  document?: Document
  ownerAttribute?: string
  /** Base z-index for platform overlays. Layers stack above it. */
  baseZIndex?: number
  diagnostics?: DiagnosticSink
  /** Selector matching an overlay element inside a root (React Aria modal overlays and popovers). */
  overlaySelector?: string
}

export function createOverlayManager(options: OverlayManagerOptions = {}): OverlayManager {
  const doc = options.document ?? (typeof document !== "undefined" ? document : null)
  const ownerAttribute = options.ownerAttribute ?? "data-mfe"
  const baseZIndex = options.baseZIndex ?? 1000
  const overlaySelector = options.overlaySelector ?? ":scope > *"
  const listeners = new Set<() => void>()
  const roots = new Map<
    HTMLElement,
    { owner: OverlayOwner; contained: boolean; observer: MutationObserver | null }
  >()
  const layers = new Map<Element, OverlayLayer>()
  let nextLayerId = 1
  const notify = () => {
    for (const listener of Array.from(listeners)) listener()
  }
  const relayer = () => {
    // Deterministic: order of opening; later overlays stack higher.
    const ordered = Array.from(layers.values()).sort(
      (a, b) => a.openedAt - b.openedAt || a.id - b.id
    )
    ordered.forEach((layer, index) => {
      layer.zIndex = baseZIndex + index * 10
      if (layer.element instanceof HTMLElement) {
        layer.element.style.setProperty("--platform-layer", String(layer.zIndex))
        layer.element.style.zIndex = String(layer.zIndex)
        layer.element.setAttribute("data-platform-layer", String(index + 1))
      }
    })
  }
  const sync = (root: HTMLElement, owner: OverlayOwner) => {
    const present = new Set(Array.from(root.querySelectorAll(overlaySelector)))
    let changed = false
    for (const [element, layer] of Array.from(layers.entries())) {
      if (root.contains(element) && !present.has(element)) {
        layers.delete(element)
        changed = true
        options.diagnostics?.emit({
          type: "overlay.closed",
          layer: layer.id,
          mfeId: owner.mfeId,
          instanceId: owner.instanceId,
          widgetId: owner.widgetId,
        })
      }
    }
    for (const element of present) {
      if (!layers.has(element)) {
        const layer: OverlayLayer = {
          id: nextLayerId++,
          owner,
          element,
          zIndex: 0,
          openedAt: Date.now(),
        }
        layers.set(element, layer)
        changed = true
        options.diagnostics?.emit({
          type: "overlay.opened",
          layer: layer.id,
          ownerAttribute: `${ownerAttribute}="${owner.mfeId}"`,
          mfeId: owner.mfeId,
          instanceId: owner.instanceId,
          widgetId: owner.widgetId,
        })
      }
    }
    if (changed) {
      relayer()
      if (doc?.body) doc.body.setAttribute("data-platform-modal-count", String(layers.size))
      notify()
    }
  }
  const manager: OverlayManager = {
    createRoot({ owner, contained = false, attributes = {}, container }) {
      if (!doc) throw new Error("Overlay manager needs a document.")
      const element = doc.createElement("div")
      element.setAttribute("data-platform-overlay-root", "")
      element.setAttribute(ownerAttribute, owner.mfeId)
      element.setAttribute("data-platform-instance", owner.instanceId)
      if (owner.widgetId) element.setAttribute("data-platform-widget", owner.widgetId)
      if (contained) element.setAttribute("data-platform-contained", "")
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value)
      element.style.position = contained ? "relative" : "static"
      element.style.zIndex = String(baseZIndex)
      const parent = contained ? (container ?? doc.body) : doc.body
      parent.append(element)
      const observer =
        typeof MutationObserver !== "undefined"
          ? new MutationObserver(() => sync(element, owner))
          : null
      observer?.observe(element, { childList: true })
      roots.set(element, { owner, contained, observer })
      notify()
      return {
        element,
        owner,
        dispose() {
          observer?.disconnect()
          for (const [layerElement] of Array.from(layers.entries()))
            if (element.contains(layerElement)) layers.delete(layerElement)
          roots.delete(element)
          element.remove()
          relayer()
          if (doc.body) doc.body.setAttribute("data-platform-modal-count", String(layers.size))
          notify()
        },
      }
    },
    getState: () => ({
      roots: Array.from(roots.values()).map(({ owner, contained }) => ({ owner, contained })),
      layers: Array.from(layers.values()),
      top: Math.max(baseZIndex, ...Array.from(layers.values()).map((layer) => layer.zIndex)),
    }),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    hasOpenModal: () => layers.size > 0,
    dispose() {
      for (const [element, root] of Array.from(roots.entries())) {
        root.observer?.disconnect()
        element.remove()
      }
      roots.clear()
      layers.clear()
      notify()
    },
  }
  return manager
}
