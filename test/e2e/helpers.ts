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
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K")
  await expect(page.getByTestId(ids.shell.paletteInput)).toBeVisible()
}

export async function enableDevtools(page: Page) {
  await page.evaluate(() => window.localStorage.setItem("platform:devtools", "1"))
}

export async function historyIsNative(page: Page) {
  return page.evaluate(() => {
    const native = (fn: unknown) => typeof fn === "function" && Function.prototype.toString.call(fn).includes("[native code]")
    return native(window.history.pushState) && native(window.history.replaceState) && native(window.localStorage.setItem) && native(Storage.prototype.setItem) && Object.getOwnPropertyDescriptor(window, "history")?.set === undefined
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
