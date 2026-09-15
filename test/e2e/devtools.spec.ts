import { expect, test, type Page } from "@playwright/test"

import {
  enableDevtools,
  gotoShell,
  gotoShellPage,
  ids,
  openApp,
  waitForWellPlanner,
} from "./helpers"

/**
 * Navigate away and back so the outlet unmounts and mounts again on the same
 * host. The landing route mounts no remote, so it stays reachable while a
 * remote is faulted.
 */
async function remount(page: Page) {
  await gotoShellPage(page, "Home")
  await expect(page.getByRole("heading", { name: "Conformance shell" })).toBeVisible({
    timeout: 30_000,
  })
  await openApp(page, "Well Planner")
}

test.describe("developer tools", () => {
  test("load only with the flag, as a separate chunk, and show shared resolution", async ({
    page,
  }) => {
    const requests: string[] = []
    page.on("request", (request) => requests.push(request.url()))
    await gotoShell(page, "/dashboard")
    await expect(page.getByTestId(ids.widgets.wellSummary)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId(ids.shell.devtoolsToggle)).toHaveCount(0)
    expect(requests.some((url) => /devtools|xyflow/i.test(url))).toBe(false)

    await enableDevtools(page)
    await page.reload()
    await expect(page.getByTestId(ids.widgets.wellSummary)).toBeVisible({ timeout: 30_000 })
    await page.getByTestId(ids.shell.devtoolsToggle).click()
    const panel = page.getByTestId(ids.shell.devtoolsPanel)
    await expect(panel).toBeVisible()
    expect(requests.some((url) => /devtools/i.test(url))).toBe(true)
    await panel.getByRole("tab", { name: /Dependencies/ }).click()
    await expect(panel.locator(".react-flow")).toBeVisible()
    await expect(panel).toContainText("react19")
    await expect(panel).toContainText("react18")
    await panel.getByRole("tab", { name: /Overview/ }).click()
    await expect(panel).toContainText("well-planner")
    await expect(panel).toContainText("field-widgets")
    await expect(panel).toContainText(/18\.\d+\.\d+/)
  })

  test("injects faults into the live shell and clears them again", async ({ page }) => {
    await enableDevtools(page)
    await gotoShell(page, "/well-planner")
    await waitForWellPlanner(page)
    await page.getByTestId(ids.shell.devtoolsToggle).click()
    const panel = page.getByTestId(ids.shell.devtoolsPanel)
    await panel.getByRole("tab", { name: /Faults/ }).click()
    const unavailable = panel.getByRole("switch", { name: /Unavailable/ }).first()

    // Faults live in the host, so navigating away and back is enough to take the
    // faulted path — and a reload, which builds a new host, clears them.
    // The Tecton switch input sits visually hidden behind its label; a click event toggles it.
    await unavailable.dispatchEvent("click")
    await expect(unavailable).toBeChecked()
    await remount(page)
    // The shell's real failure path, not a mock of it: the outlet renders the
    // error boundary with the code the host raised.
    await expect(page.getByTestId(ids.shell.outlet)).toContainText("REMOTE_LOAD_FAILED", {
      timeout: 30_000,
    })

    await panel.getByRole("tab", { name: /Faults/ }).click()
    await panel.getByRole("button", { name: /Clear every fault/ }).click()
    await expect(unavailable).not.toBeChecked()
    await remount(page)
    await waitForWellPlanner(page)

    // A reload is the other way out: faults are per-host, in memory, and never persisted.
    await unavailable.dispatchEvent("click")
    await page.reload()
    await waitForWellPlanner(page)
  })
})
