import { expect, test } from "@playwright/test"

import { gotoShell, ids } from "./helpers"

test.describe("failure isolation", () => {
  test("every boundary fails alone with an actionable diagnostic", async ({ page }) => {
    await gotoShell(page, "/failures")
    const lab = page.locator("[data-failure-case]")
    await expect(lab).toHaveCount(5)
    await expect(page.locator('[data-failure-case="broken-remote"]')).toContainText(
      "MANIFEST_INVALID",
      { timeout: 30_000 }
    )
    await expect(page.locator('[data-failure-case="incompatible-remote"]')).toContainText(
      "PROTOCOL_INCOMPATIBLE"
    )
    await expect(page.locator('[data-failure-case="unavailable-remote"]')).toContainText(
      "MANIFEST_FETCH_FAILED",
      { timeout: 40_000 }
    )
    await expect(page.locator('[data-failure-case="disabled-remote"]')).toContainText(
      "REMOTE_DISABLED"
    )
    await expect(page.locator('[data-failure-case="restricted-remote"]')).toContainText(
      "PERMISSION_DENIED"
    )
    // Docs links and retry are offered.
    await expect(
      page.locator('[data-failure-case="unavailable-remote"] a[href*="docs"]')
    ).toHaveCount(1)
    await expect(
      page
        .locator('[data-failure-case="unavailable-remote"]')
        .getByRole("button", { name: /Retry/ })
    ).toBeVisible()
    // The shell keeps working.
    await page.getByRole("link", { name: "Asset Tracker" }).first().click()
    await expect(page.getByTestId(ids.assetTracker.root)).toBeVisible({ timeout: 30_000 })
  })

  test("manifest URL overrides at runtime with visible source", async ({ page }) => {
    await gotoShell(
      page,
      "/asset-tracker?platform.override.asset-tracker=http://127.0.0.1:4999/platform-manifest.json"
    )
    await expect(page.getByTestId(ids.shell.outlet)).toContainText("MANIFEST_FETCH_FAILED", {
      timeout: 40_000,
    })
    await page.evaluate(() => localStorage.setItem("platform:devtools", "1"))
    await page.reload()
    await page.getByTestId(ids.shell.devtoolsToggle).click()
    const panel = page.getByTestId(ids.shell.devtoolsPanel)
    await expect(panel).toContainText("4999")
    await expect(panel).toContainText(/source: (query|override)/i)
    // Clearing the override restores the runtime-config URL.
    await page.evaluate(() => {
      localStorage.removeItem("platform:manifest-overrides")
      sessionStorage.removeItem("platform:manifest-overrides")
    })
    await page.goto("/asset-tracker")
    await expect(page.getByTestId(ids.assetTracker.root)).toBeVisible({ timeout: 30_000 })
  })
})
