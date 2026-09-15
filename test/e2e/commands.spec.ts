import { expect, test } from "@playwright/test"

import { enableDevtools, gotoShell, ids, openPalette, runPaletteCommand, waitForAssetTracker } from "./helpers"

test.describe("command palette", () => {
  test("registers, searches and runs MFE commands; cleans up on unmount", async ({ page }) => {
    await gotoShell(page, "/asset-tracker")
    await waitForAssetTracker(page)
    await runPaletteCommand(page, "Increment asset", /Increment asset counter/)
    await expect(page.getByTestId(ids.assetTracker.counter)).toContainText("Counter 1")
    // Shortcut dispatch through the shell.
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+I" : "Control+Shift+I")
    await expect(page.getByTestId(ids.assetTracker.counter)).toContainText("Counter 2")
    // Async command shows a running state and finishes with a notification.
    await runPaletteCommand(page, "slow sync", /Run slow sync/)
    await expect(page.getByText("Sync finished")).toBeVisible()
    // Navigation metadata, settings fields and help are searchable too.
    await openPalette(page)
    await page.getByTestId(ids.shell.paletteInput).fill("density")
    await expect(page.getByRole("menuitem", { name: /Density/ })).toBeVisible()
    await page.keyboard.press("Escape")
    await openPalette(page)
    await page.getByTestId(ids.shell.paletteInput).fill("KPI tiles")
    await expect(page.getByRole("menuitem", { name: /KPI tiles/ })).toBeVisible()
    await page.keyboard.press("Escape")
    // Leaving the MFE removes its live commands.
    await page.goto("/")
    await openPalette(page)
    await page.getByTestId(ids.shell.paletteInput).fill("Increment asset")
    await expect(page.getByRole("menuitem", { name: /Increment asset counter/ })).toHaveCount(0)
  })

  test("shortcut conflicts are rejected deterministically and visible in devtools", async ({ page }) => {
    await enableDevtools(page)
    await gotoShell(page, "/settings")
    await expect(page.locator('[data-mfe="legacy-reports"][data-platform-root]')).toHaveCount(1, { timeout: 30_000 })
    await page.getByTestId(ids.shell.devtoolsToggle).click()
    const panel = page.getByTestId(ids.shell.devtoolsPanel)
    await panel.getByRole("tab", { name: /Commands/ }).click()
    await expect(panel).toContainText("mod+shift+d")
    await expect(panel).toContainText("conflicting-shortcut")
  })
})
