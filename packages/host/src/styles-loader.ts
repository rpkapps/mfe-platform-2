import { resolveRemoteUrl, type MfeManifest } from "@platform-internal/core"

const ATTRIBUTE = "data-platform-css"

/**
 * Loads the scoped stylesheets a production remote lists in `css.assets`
 * before it mounts (development servers inject their own CSS). Idempotent per
 * URL; a failing stylesheet never blocks the mount — the remote renders
 * unstyled and a diagnostic is emitted by the caller.
 */
export async function ensureRemoteStylesheets(
  manifest: MfeManifest,
  manifestUrl: string,
  doc: Document | null = typeof document !== "undefined" ? document : null
): Promise<string[]> {
  if (!doc || manifest.dev || manifest.css.assets.length === 0) return []
  const base = resolveRemoteUrl(manifestUrl, manifest.remote.baseUrl)
  const loaded: string[] = []
  await Promise.all(
    manifest.css.assets.map((asset) => {
      const href = resolveRemoteUrl(base, asset)
      loaded.push(href)
      const existing = doc.head.querySelector<HTMLLinkElement>(
        `link[${ATTRIBUTE}="${CSS.escape(href)}"]`
      )
      if (existing)
        return existing.dataset.platformCssState === "loading"
          ? waitFor(existing)
          : Promise.resolve()
      const link = doc.createElement("link")
      link.rel = "stylesheet"
      link.href = href
      link.setAttribute(ATTRIBUTE, href)
      link.setAttribute("data-mfe", manifest.mfeId)
      link.dataset.platformCssState = "loading"
      doc.head.append(link)
      return waitFor(link)
    })
  )
  return loaded
}

function waitFor(link: HTMLLinkElement): Promise<void> {
  return new Promise((resolve) => {
    const done = (state: "loaded" | "failed") => {
      link.dataset.platformCssState = state
      resolve()
    }
    link.addEventListener("load", () => done("loaded"), { once: true })
    link.addEventListener("error", () => done("failed"), { once: true })
    // Never block a mount on a slow CDN.
    setTimeout(() => done("loaded"), 5000)
  })
}
