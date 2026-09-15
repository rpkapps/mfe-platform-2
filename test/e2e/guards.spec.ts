import { expect, test } from "@playwright/test"

import {
  gotoShell,
  ids,
  switchProject,
  switchUser,
  toggleTheme,
  waitForWellPlanner,
} from "./helpers"

test.describe("native TanStack guards and platform context", () => {
  test("guards use permission groups from the platform context and re-run on context changes", async ({
    page,
  }) => {
    await gotoShell(page, "/well-planner/wells/w01")
    await waitForWellPlanner(page)
    await expect(page.getByTestId(ids.wellPlanner.wellTitle)).toHaveText("16/2-D-12 H")
    // Switch to a user without wells:read: the guard redirects inside the MFE.
    await switchUser(page, "Guest User")
    await expect(page).toHaveURL(/\/well-planner\/?\?denied=w01/)
    await expect(page.getByTestId(ids.wellPlanner.userName)).toHaveText("Guest User")
  })

  test("guard errors stay inside the MFE boundary", async ({ page }) => {
    await gotoShell(page, "/well-planner/wells")
    await waitForWellPlanner(page)
    await switchUser(page, "Grace Hopper")
    await page.getByRole("link", { name: /Restricted well/ }).click()
    await expect(page.getByTestId(ids.wellPlanner.guardMessage)).toContainText("Only admins")
    await expect(page.getByTestId(ids.shell.root)).toBeVisible()
    await expect(page.getByTestId(ids.wellPlanner.root)).toBeVisible()
  })

  test("slice subscriptions do not rerender on unrelated changes", async ({ page }) => {
    await gotoShell(page, "/well-planner")
    await waitForWellPlanner(page)
    const renders = page.getByTestId(ids.wellPlanner.renderCount)
    const before = Number(await renders.textContent())
    await toggleTheme(page)
    await expect(page.getByTestId(ids.wellPlanner.themeValue)).toHaveText("light")
    await switchProject(page, "PL 050")
    expect(Number(await renders.textContent())).toBe(before)
    await switchUser(page, "Grace Hopper")
    await expect(page.getByTestId(ids.wellPlanner.userName)).toHaveText("Grace Hopper")
    expect(Number(await renders.textContent())).toBe(before + 1)
  })
})
