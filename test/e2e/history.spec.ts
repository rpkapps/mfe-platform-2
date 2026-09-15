import { expect, test } from "@playwright/test"

import { gotoShell, ids, switchProject, waitForWellPlanner } from "./helpers"

test.describe("shell-owned history", () => {
  test("MFE navigation, back, forward and deep links go through the shell", async ({
    page,
  }) => {
    await gotoShell(page, "/well-planner")
    await waitForWellPlanner(page)
    // Shell-owned state that must survive every MFE navigation below.
    await switchProject(page, "PL 050")
    await page.getByTestId(ids.wellPlanner.navWells).click()
    await expect(page).toHaveURL(/\/well-planner\/wells$/)
    await page.getByRole("link", { name: "16/2-D-12 H" }).click()
    await expect(page).toHaveURL(/\/well-planner\/wells\/w01$/)
    await expect(page.getByTestId(ids.wellPlanner.wellTitle)).toHaveText("16/2-D-12 H")
    await page.goBack()
    await expect(page).toHaveURL(/\/well-planner\/wells$/)
    await page.goForward()
    await expect(page.getByTestId(ids.wellPlanner.wellTitle)).toHaveText("16/2-D-12 H")
    // The shell was never remounted: the licence it holds survived every MFE navigation.
    await expect(page.getByTestId(`${ids.shell.projectSwitch}-value`)).toHaveText(/PL 050/)
    // Deep link straight into an MFE route.
    await page.goto("/well-planner/wells/w03")
    await expect(page.getByTestId(ids.wellPlanner.wellTitle)).toHaveText("16/2-E-3 AH")
  })

  test("legacy route prefix override is honoured", async ({ page }) => {
    await gotoShell(page, "/legacy/reports")
    await expect(page.getByTestId(ids.productionReports.root)).toBeVisible({ timeout: 30_000 })
    await page.getByRole("link", { name: "Daily production" }).click()
    await expect(page).toHaveURL(/\/legacy\/reports\/reports\/daily-production$/)
    await expect(page.getByTestId(ids.productionReports.reportTitle)).toHaveText(
      "Daily production"
    )
  })

  test("breadcrumbs come from route metadata", async ({ page }) => {
    await gotoShell(page, "/well-planner/wells/w01")
    await waitForWellPlanner(page)
    const crumbs = page.getByTestId(ids.shell.breadcrumbs)
    await expect(crumbs).toContainText("Well Planner")
    await expect(crumbs).toContainText("Wells")
    await expect(crumbs).toContainText("16/2-D-12 H")
  })
})
