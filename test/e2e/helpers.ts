import { expect, type Page } from "@playwright/test"
import { TEST_IDS } from "@platform-internal/conformance"

export const ids = TEST_IDS

export async function gotoShell(page: Page, path = "/") {
  await page.goto(path)
  await expect(page.getByTestId(ids.shell.root)).toBeVisible()
}

export async function waitForAssetTracker(page: Page) {
  await expect(page.getByTestId(ids.assetTracker.root)).toBeVisible({ timeout: 30_000 })
}

export async function waitForLegacyReports(page: Page) {
  await expect(page.getByTestId(ids.legacyReports.root)).toBeVisible({ timeout: 30_000 })
}

export async function openPalette(page: Page) {
  const input = page.getByTestId(ids.shell.paletteInput)
  if (await input.isVisible()) return
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K")
  await expect(input).toBeVisible()
}

export async function enableDevtools(page: Page) {
  // localStorage needs an origin: open the shell first when the page is still blank.
  if (page.url() === "about:blank") await page.goto("/")
  await page.evaluate(() => window.localStorage.setItem("platform:devtools", "1"))
}

/**
 * Signature of the History and Storage entry points. The shell's own TanStack
 * Router browser history wraps pushState/replaceState once to observe
 * navigations (a shell choice, made before any remote loads); the platform and
 * the remotes must leave everything exactly as they found it.
 */
export async function historySignature(page: Page) {
  return page.evaluate(() => {
    const source = (fn: unknown) => (typeof fn === "function" ? Function.prototype.toString.call(fn) : String(fn))
    return {
      pushState: source(window.history.pushState),
      replaceState: source(window.history.replaceState),
      localSet: source(window.localStorage.setItem),
      sessionSet: source(window.sessionStorage.setItem),
      storageProto: source(Storage.prototype.setItem),
      historyOwn: Object.getOwnPropertyDescriptor(window, "history")?.set === undefined,
      storageNative: source(Storage.prototype.setItem).includes("[native code]") && source(window.localStorage.setItem).includes("[native code]"),
    }
  })
}

/** z-index of the closest overlay layer wrapper for an element. */
export async function layerOf(page: Page, testId: string): Promise<number> {
  return page.evaluate((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`)
    if (!element) return -1
    let node: HTMLElement | null = element as HTMLElement
    while (node && !node.hasAttribute("data-platform-layer")) node = node.parentElement
    return node ? Number(node.style.zIndex) : -1
  }, testId)
}
