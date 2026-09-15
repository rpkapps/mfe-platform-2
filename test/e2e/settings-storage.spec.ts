import { expect, test } from "@playwright/test"

import { gotoShell, ids, waitForAssetTracker } from "./helpers"

test.describe("settings and storage", () => {
  test("framework-managed groups render, persist, validate and reset", async ({ page }) => {
    await gotoShell(page, "/settings")
    const host = page.getByTestId(ids.shell.settingsHost)
    await expect(host.getByText("Display")).toBeVisible({ timeout: 30_000 })
    await host.getByText("Display").click()
    // Inferred controls: boolean → switch, select → select, number → number input, async → loaded options.
    const showOffline = host.getByRole("switch", { name: /Show offline/ })
    await expect(showOffline).toBeChecked()
    // The Tecton switch input sits visually hidden behind its label; a click event toggles it.
    await showOffline.dispatchEvent("click")
    await expect(showOffline).not.toBeChecked()
    await expect(host.getByText("Favourite sites")).toBeHidden()
    const pageSize = host.locator('input[type="number"]').first()
    await pageSize.fill("3")
    await pageSize.blur()
    await expect(host.getByText(/at least 5|>=5|too small|minimum|greater/i)).toBeVisible()
    await pageSize.fill("50")
    await pageSize.blur()
    // Async options loaded: South Field comes from the provider.
    await expect(host.getByText("Default region")).toBeVisible()
    await expect(host.locator("select").filter({ hasText: "South Field" })).toHaveCount(1)
    await page.reload()
    await expect(page.getByTestId(ids.shell.settingsHost).getByText("Display")).toBeVisible({
      timeout: 30_000,
    })
    await page.getByTestId(ids.shell.settingsHost).getByText("Display").click()
    await expect(
      page.getByTestId(ids.shell.settingsHost).locator('input[type="number"]').first()
    ).toHaveValue("50")
    const stored = await page.evaluate(() =>
      Object.keys(localStorage).filter((key) =>
        key.startsWith("platform:asset-tracker:settings")
      )
    )
    expect(stored.length).toBeGreaterThan(0)
    await page.getByRole("button", { name: /Reset/ }).first().click()
    // MFE-managed group links to its own page.
    await expect(
      page.getByTestId(ids.shell.settingsHost).getByText(/Advanced asset settings/)
    ).toBeVisible()
  })

  test("invalid stored settings recover to defaults without crashing", async ({ page }) => {
    await gotoShell(page, "/")
    await page.evaluate(() => {
      localStorage.setItem(
        "platform:asset-tracker:settings:asset-tracker:display.pageSize",
        JSON.stringify({ v: undefined, value: "garbage" })
      )
    })
    await page.goto("/settings")
    const host = page.getByTestId(ids.shell.settingsHost)
    await expect(host.getByText("Display")).toBeVisible({ timeout: 30_000 })
    await host.getByText("Display").click()
    await expect(host.locator('input[type="number"]').first()).toHaveValue("25")
    await expect(host.getByText(/reset to its default|recovered|invalid/i)).toBeVisible()
  })

  test("schema-backed storage is namespaced, persists and syncs across tabs", async ({
    page,
    context,
  }) => {
    await gotoShell(page, "/asset-tracker")
    await waitForAssetTracker(page)
    await page.getByTestId(ids.assetTracker.storageAdd).click()
    await expect(page.getByTestId(ids.assetTracker.storageColumns)).toHaveText(
      "name,status,col3"
    )
    const keys = await page.evaluate(() => Object.keys(localStorage))
    expect(keys).toContain("platform:asset-tracker:local:dashboard")
    const second = await context.newPage()
    await second.goto("/asset-tracker")
    await expect(second.getByTestId(ids.assetTracker.storageColumns)).toHaveText(
      "name,status,col3",
      { timeout: 30_000 }
    )
    await second.getByTestId(ids.assetTracker.storageAdd).click()
    await expect(page.getByTestId(ids.assetTracker.storageColumns)).toHaveText(
      "name,status,col3,col4"
    )
    await page.getByTestId(ids.assetTracker.storageReset).click()
    await expect(page.getByTestId(ids.assetTracker.storageColumns)).toHaveText("name,status")
    await expect(second.getByTestId(ids.assetTracker.storageColumns)).toHaveText("name,status")
    // Malformed stored data recovers to defaults.
    await page.evaluate(() =>
      localStorage.setItem("platform:asset-tracker:local:dashboard", "{broken")
    )
    await page.reload()
    await waitForAssetTracker(page)
    await expect(page.getByTestId(ids.assetTracker.storageColumns)).toHaveText("name,status")
  })

  test("MFE-managed settings page owns its own state", async ({ page }) => {
    await gotoShell(page, "/asset-tracker/settings/custom")
    await expect(page.getByTestId(ids.assetTracker.customSettings)).toBeVisible({
      timeout: 30_000,
    })
    await page.getByLabel(/Session notes/).fill("hello")
    await expect(page.getByTestId(ids.assetTracker.customSettingsValue)).toHaveText(
      "5 characters"
    )
    const keys = await page.evaluate(() => Object.keys(sessionStorage))
    expect(keys).toContain("platform:asset-tracker:session:notes")
  })
})
