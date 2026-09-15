import { expect, test } from "@playwright/test"

import { enableDevtools, gotoShell, ids, waitForAssetTracker } from "./helpers"

test.describe("developer tools", () => {
  test("load only with the flag, as a separate chunk, and show shared resolution", async ({
    page,
  }) => {
    const requests: string[] = []
    page.on("request", (request) => requests.push(request.url()))
    await gotoShell(page, "/dashboard")
    await expect(page.getByTestId(ids.widgets.assetCard)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId(ids.shell.devtoolsToggle)).toHaveCount(0)
    expect(requests.some((url) => /devtools|xyflow/i.test(url))).toBe(false)

    await enableDevtools(page)
    await page.reload()
    await expect(page.getByTestId(ids.widgets.assetCard)).toBeVisible({ timeout: 30_000 })
    await page.getByTestId(ids.shell.devtoolsToggle).click()
    const panel = page.getByTestId(ids.shell.devtoolsPanel)
    await expect(panel).toBeVisible()
    expect(requests.some((url) => /devtools/i.test(url))).toBe(true)
    await panel.getByRole("tab", { name: /Dependencies/ }).click()
    await expect(panel.locator(".react-flow")).toBeVisible()
    await expect(panel).toContainText("react19")
    await expect(panel).toContainText("react18")
    await panel.getByRole("tab", { name: /Overview/ }).click()
    await expect(panel).toContainText("asset-tracker")
    await expect(panel).toContainText("widget-b")
    await expect(panel).toContainText(/18\.\d+\.\d+/)
  })

  test("injects faults into the live shell and clears them again", async ({ page }) => {
    await enableDevtools(page)
    await gotoShell(page, "/asset-tracker")
    await waitForAssetTracker(page)
    await page.getByTestId(ids.shell.devtoolsToggle).click()
    const panel = page.getByTestId(ids.shell.devtoolsPanel)
    await panel.getByRole("tab", { name: /Faults/ }).click()

    // The shell's real failure path, not a mock of it: the outlet renders the
    // error boundary with the code the host raised.
    await panel
      .getByRole("switch", { name: /Unavailable/ })
      .first()
      .click()
    await page.reload()
    await expect(page.getByTestId(ids.shell.outlet)).toContainText("REMOTE_LOAD_FAILED", {
      timeout: 30_000,
    })

    await page.getByTestId(ids.shell.devtoolsToggle).click()
    await panel.getByRole("tab", { name: /Faults/ }).click()
    await panel.getByRole("button", { name: /Clear every fault/ }).click()
    await page.reload()
    await waitForAssetTracker(page)
  })
})
