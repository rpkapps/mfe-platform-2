import { expect, test } from "@playwright/test"

import { gotoShell, historySignature, ids, waitForAssetTracker, waitForLegacyReports } from "./helpers"

test.describe("shell and remotes", () => {
  test("React 19 and React 18 remotes load in isolated roots", async ({ page }) => {
    await gotoShell(page, "/asset-tracker")
    await waitForAssetTracker(page)
    await expect(page.getByTestId(ids.assetTracker.reactVersion)).toContainText("React 19")
    await expect(page.locator('[data-mfe="asset-tracker"][data-platform-root]')).toHaveCount(1)

    await page.getByRole("link", { name: "Legacy Reports" }).first().click()
    await waitForLegacyReports(page)
    await expect(page.getByTestId(ids.legacyReports.reactVersion)).toContainText("React 18")
    await expect(page.locator('[data-mfe="legacy-reports"][data-platform-root]')).toHaveCount(1)
    await expect(page.locator('[data-mfe="asset-tracker"][data-platform-root]')).toHaveCount(0)
  })

  test("no History API or storage monkeypatching by the platform or the remotes", async ({ page }) => {
    await gotoShell(page, "/")
    const before = await historySignature(page)
    expect(before.storageNative).toBe(true)
    expect(before.historyOwn).toBe(true)
    // Load a React 19 remote, a React 18 remote and every widget without leaving the page.
    await page.getByRole("link", { name: "Asset Tracker" }).first().click()
    await waitForAssetTracker(page)
    await page.getByRole("link", { name: "Legacy Reports" }).first().click()
    await waitForLegacyReports(page)
    await page.getByRole("link", { name: "Dashboard" }).first().click()
    await expect(page.getByTestId(ids.widgets.assetCard)).toBeVisible({ timeout: 30_000 })
    const after = await historySignature(page)
    expect(after).toEqual(before)
  })

  test("CSS stays scoped to the owning remote", async ({ page }) => {
    await gotoShell(page, "/legacy/reports")
    await waitForLegacyReports(page)
    // The legacy remote declares `:root { --legacy-accent }`; scoped, it must not reach the shell root.
    const rootAccent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--legacy-accent").trim())
    expect(rootAccent).toBe("")
    const scopedAccent = await page.evaluate(() => getComputedStyle(document.querySelector('[data-mfe="legacy-reports"]')!).getPropertyValue("--legacy-accent").trim())
    expect(scopedAccent).not.toBe("")
    // A `.legacy-card` outside the remote gets no border.
    const outside = await page.evaluate(() => {
      const probe = document.createElement("div")
      probe.className = "legacy-card"
      document.body.append(probe)
      const width = getComputedStyle(probe).borderTopWidth
      probe.remove()
      return width
    })
    expect(outside).toBe("0px")
  })

  test("runtime environment reaches each MFE, secrets never do", async ({ page, request }) => {
    await gotoShell(page, "/asset-tracker")
    await waitForAssetTracker(page)
    await expect(page.getByTestId(ids.assetTracker.envValue)).toHaveText("https://api.example.com/assets")
    const config = await request.get("/platform-config.json")
    const text = await config.text()
    expect(text).not.toContain("must-never-appear")
    expect(text).not.toContain("API_TOKEN")
  })
})
