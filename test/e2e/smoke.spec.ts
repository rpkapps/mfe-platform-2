import { expect, test } from "@playwright/test"

import {
  gotoShell,
  gotoShellPage,
  historySignature,
  ids,
  openApp,
  waitForProductionReports,
  waitForWellPlanner,
} from "./helpers"

test.describe("shell and remotes", () => {
  test("React 19 and React 18 remotes load in isolated roots", async ({ page }) => {
    await gotoShell(page, "/well-planner")
    await waitForWellPlanner(page)
    await expect(page.getByTestId(ids.wellPlanner.reactVersion)).toContainText("React 19")
    await expect(page.locator('[data-mfe="well-planner"][data-platform-root]')).toHaveCount(1)

    await openApp(page, "Production Reports")
    await waitForProductionReports(page)
    await expect(page.getByTestId(ids.productionReports.reactVersion)).toContainText("React 18")
    await expect(
      page.locator('[data-mfe="production-reports"][data-platform-root]')
    ).toHaveCount(1)
    await expect(page.locator('[data-mfe="well-planner"][data-platform-root]')).toHaveCount(0)
  })

  test("no History API or storage monkeypatching by the platform or the remotes", async ({
    page,
  }) => {
    await gotoShell(page, "/")
    const before = await historySignature(page)
    expect(before.storageNative).toBe(true)
    expect(before.historyOwn).toBe(true)
    // Load a React 19 remote, a React 18 remote and every widget without leaving the page.
    await openApp(page, "Well Planner")
    await waitForWellPlanner(page)
    await openApp(page, "Production Reports")
    await waitForProductionReports(page)
    await gotoShellPage(page, "Dashboard")
    await expect(page.getByTestId(ids.widgets.wellSummary)).toBeVisible({ timeout: 30_000 })
    const after = await historySignature(page)
    expect(after).toEqual(before)
  })

  test("CSS stays scoped to the owning remote", async ({ page }) => {
    await gotoShell(page, "/legacy/reports")
    await waitForProductionReports(page)
    // The legacy remote declares `:root { --legacy-accent }`; scoped, it must not reach the shell root.
    const rootAccent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--legacy-accent").trim()
    )
    expect(rootAccent).toBe("")
    const scopedAccent = await page.evaluate(() =>
      getComputedStyle(document.querySelector('[data-mfe="production-reports"]')!)
        .getPropertyValue("--legacy-accent")
        .trim()
    )
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
    await gotoShell(page, "/well-planner")
    await waitForWellPlanner(page)
    await expect(page.getByTestId(ids.wellPlanner.envValue)).toHaveText(
      "https://api.example.com/wells"
    )
    const config = await request.get("/platform-config.json")
    const text = await config.text()
    expect(text).not.toContain("must-never-appear")
    expect(text).not.toContain("API_TOKEN")
  })
})
