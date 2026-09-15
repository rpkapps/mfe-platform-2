import { expect, test } from "@playwright/test"

import { gotoShell, ids, waitForAssetTracker } from "./helpers"

test.describe("shell-owned history", () => {
  test("MFE navigation, back, forward and deep links go through the shell", async ({ page }) => {
    await gotoShell(page, "/asset-tracker")
    await waitForAssetTracker(page)
    await page.getByTestId(ids.shell.counter).click()
    await page.getByTestId(ids.assetTracker.navAssets).click()
    await expect(page).toHaveURL(/\/asset-tracker\/assets$/)
    await page.getByRole("link", { name: "Pump 42" }).click()
    await expect(page).toHaveURL(/\/asset-tracker\/assets\/pump-42$/)
    await expect(page.getByTestId(ids.assetTracker.assetTitle)).toHaveText("Pump 42")
    await page.goBack()
    await expect(page).toHaveURL(/\/asset-tracker\/assets$/)
    await page.goForward()
    await expect(page.getByTestId(ids.assetTracker.assetTitle)).toHaveText("Pump 42")
    // The shell was never remounted: its counter survived every MFE navigation.
    await expect(page.getByTestId(ids.shell.counter)).toContainText("Shell 1")
    // Deep link straight into an MFE route.
    await page.goto("/asset-tracker/assets/valve-7")
    await expect(page.getByTestId(ids.assetTracker.assetTitle)).toHaveText("Valve 7")
  })

  test("legacy route prefix override is honoured", async ({ page }) => {
    await gotoShell(page, "/legacy/reports")
    await expect(page.getByTestId(ids.legacyReports.root)).toBeVisible({ timeout: 30_000 })
    await page.getByRole("link", { name: "Daily production" }).click()
    await expect(page).toHaveURL(/\/legacy\/reports\/reports\/daily-production$/)
    await expect(page.getByTestId(ids.legacyReports.reportTitle)).toHaveText("Daily production")
  })

  test("breadcrumbs come from route metadata", async ({ page }) => {
    await gotoShell(page, "/asset-tracker/assets/pump-42")
    await waitForAssetTracker(page)
    const crumbs = page.getByTestId(ids.shell.breadcrumbs)
    await expect(crumbs).toContainText("Asset Tracker")
    await expect(crumbs).toContainText("Assets")
    await expect(crumbs).toContainText("Pump 42")
  })
})
