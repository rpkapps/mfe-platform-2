import { expect, test } from "@playwright/test"

import { gotoShell, ids, waitForAssetTracker } from "./helpers"

test.describe("native TanStack guards and platform context", () => {
  test("guards use permission groups from the platform context and re-run on context changes", async ({ page }) => {
    await gotoShell(page, "/asset-tracker/assets/pump-42")
    await waitForAssetTracker(page)
    await expect(page.getByTestId(ids.assetTracker.assetTitle)).toHaveText("Pump 42")
    // Switch to a user without assets:read: the guard redirects inside the MFE.
    await page.getByTestId(ids.shell.userSwitch).selectOption("restricted")
    await expect(page).toHaveURL(/\/asset-tracker\/?\?denied=pump-42/)
    await expect(page.getByTestId(ids.assetTracker.userName)).toHaveText("Guest User")
  })

  test("guard errors stay inside the MFE boundary", async ({ page }) => {
    await gotoShell(page, "/asset-tracker/assets")
    await waitForAssetTracker(page)
    await page.getByTestId(ids.shell.userSwitch).selectOption("viewer")
    await page.getByRole("link", { name: /Restricted asset/ }).click()
    await expect(page.getByTestId(ids.assetTracker.guardMessage)).toContainText("Only admins")
    await expect(page.getByTestId(ids.shell.root)).toBeVisible()
    await expect(page.getByTestId(ids.assetTracker.root)).toBeVisible()
  })

  test("slice subscriptions do not rerender on unrelated changes", async ({ page }) => {
    await gotoShell(page, "/asset-tracker")
    await waitForAssetTracker(page)
    const renders = page.getByTestId(ids.assetTracker.renderCount)
    const before = Number(await renders.textContent())
    await page.getByTestId(ids.shell.themeToggle).click()
    await expect(page.getByTestId(ids.assetTracker.themeValue)).toHaveText("light")
    await page.getByTestId(ids.shell.projectSwitch).selectOption("1")
    expect(Number(await renders.textContent())).toBe(before)
    await page.getByTestId(ids.shell.userSwitch).selectOption("viewer")
    await expect(page.getByTestId(ids.assetTracker.userName)).toHaveText("Grace Hopper")
    expect(Number(await renders.textContent())).toBe(before + 1)
  })
})
