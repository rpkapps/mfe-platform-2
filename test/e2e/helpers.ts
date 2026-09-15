import { expect, type Page } from "@playwright/test"
import { TEST_IDS } from "@platform-internal/conformance"

export const ids = TEST_IDS

export async function gotoShell(page: Page, path = "/") {
  await page.goto(path)
  await expect(page.getByTestId(ids.shell.root)).toBeVisible()
}

export async function waitForWellPlanner(page: Page) {
  await expect(page.getByTestId(ids.wellPlanner.root)).toBeVisible({ timeout: 30_000 })
}

export async function waitForProductionReports(page: Page) {
  await expect(page.getByTestId(ids.productionReports.root)).toBeVisible({ timeout: 30_000 })
}

/**
 * Switch application the way the shell intends it: through the app finder in
 * the header. There is no per-MFE link in the nav — the finder is the
 * switcher, and every discoverable remote appears in it.
 */
export async function openApp(page: Page, name: string) {
  await page.getByTestId(ids.shell.appFinderTrigger).first().click()
  // Items carry a two-letter code before the name, so match on the name only.
  await page
    .getByRole("menuitem", { name: new RegExp(name) })
    .first()
    .click()
}

/** Back to the shell's own pages, which own no MFE. */
export async function gotoShellPage(page: Page, name: string) {
  await page.getByRole("link", { name, exact: true }).first().click()
}

/**
 * The user, licence and theme controls live in the header's user menu now,
 * the way a real shell arranges them — not as three bare `<select>`s.
 */
export async function openUserMenu(page: Page) {
  await page
    .getByRole("button", { name: /^Account:/ })
    .first()
    .click()
}

export async function switchUser(page: Page, displayName: string) {
  await openUserMenu(page)
  await page
    .getByRole("menuitem", { name: new RegExp(displayName) })
    .first()
    .click()
}

export async function switchProject(page: Page, name: string) {
  await openUserMenu(page)
  await page
    .getByRole("menuitem", { name: new RegExp(name) })
    .first()
    .click()
}

export async function toggleTheme(page: Page) {
  await openUserMenu(page)
  await page.getByTestId(ids.shell.themeToggle).click()
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
    const source = (fn: unknown) =>
      typeof fn === "function" ? Function.prototype.toString.call(fn) : String(fn)
    return {
      pushState: source(window.history.pushState),
      replaceState: source(window.history.replaceState),
      localSet: source(window.localStorage.setItem),
      sessionSet: source(window.sessionStorage.setItem),
      storageProto: source(Storage.prototype.setItem),
      historyOwn: Object.getOwnPropertyDescriptor(window, "history")?.set === undefined,
      storageNative:
        source(Storage.prototype.setItem).includes("[native code]") &&
        source(window.localStorage.setItem).includes("[native code]"),
    }
  })
}

/** z-index of the closest overlay layer wrapper for an element (layers are tagged asynchronously). */
export async function layerOf(page: Page, testId: string): Promise<number> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const layer = await readLayer(page, testId)
    if (layer >= 0) return layer
    await page.waitForTimeout(100)
  }
  return readLayer(page, testId)
}

async function readLayer(page: Page, testId: string): Promise<number> {
  return page.evaluate((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`)
    if (!element) return -1
    let node: HTMLElement | null = element as HTMLElement
    while (node && !node.hasAttribute("data-platform-layer")) node = node.parentElement
    return node ? Number(node.style.zIndex) : -1
  }, testId)
}

/** Open the palette, search, run the first matching entry and wait for the palette to close. */
export async function runPaletteCommand(page: Page, query: string, name: RegExp) {
  const input = page.getByTestId(ids.shell.paletteInput)
  await expect(input).toBeHidden()
  await openPalette(page)
  await input.fill(query)
  await page.getByRole("menuitem", { name }).click()
  await expect(input).toBeHidden()
}
