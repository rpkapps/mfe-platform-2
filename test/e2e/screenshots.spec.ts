import { expect, test } from "@playwright/test"

import { enableDevtools, gotoShell, ids, toggleTheme } from "./helpers"

/**
 * A screenshot of every surface the shell owns. These assert almost nothing on
 * purpose: their value is the PNG. Playwright keeps `test-results/` as a CI
 * artefact, so a layout regression — an unreadable panel, a remote that
 * ignores the theme, chrome drawn over content — is visible in the run rather
 * than found by eye weeks later.
 */
const OUT = "test-results/screenshots"

test.describe.configure({ mode: "serial" })

test("01 landing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await gotoShell(page, "/")
  await expect(page.getByTestId(ids.shell.appFinder)).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: `${OUT}/01-landing.png`, fullPage: true })
})

test("02 wells list", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await gotoShell(page, "/well-planner/wells")
  await expect(page.getByTestId(ids.wellPlanner.wellTable)).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: `${OUT}/02-wells.png`, fullPage: true })
})

test("03 concept select", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await gotoShell(page, "/well-planner")
  await expect(page.getByTestId(ids.wellPlanner.root)).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: `${OUT}/03-concept-select.png`, fullPage: true })
})

test("04 well detail", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await gotoShell(page, "/well-planner/wells/w01")
  await expect(page.getByTestId(ids.wellPlanner.wellTitle)).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: `${OUT}/04-well-detail.png`, fullPage: true })
})

test("05 dashboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await gotoShell(page, "/dashboard")
  await expect(page.getByTestId(ids.widgets.wellSummary)).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: `${OUT}/05-dashboard.png`, fullPage: true })
})

test("06 reports", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await gotoShell(page, "/legacy/reports")
  await expect(page.getByTestId(ids.productionReports.root)).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: `${OUT}/06-reports.png`, fullPage: true })
})

test("07 settings", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await gotoShell(page, "/settings")
  const host = page.getByTestId(ids.shell.settingsHost)
  await expect(host).toBeVisible({ timeout: 30_000 })
  await expect(host.getByText("Display")).toBeVisible({ timeout: 30_000 })
  await host.getByText("Display").click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/07-settings.png`, fullPage: true })
})

test("08 failure lab", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 })
  await gotoShell(page, "/failures")
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/08-failures.png`, fullPage: true })
})

test("09 devtools dock", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await enableDevtools(page)
  await gotoShell(page, "/dashboard")
  await expect(page.getByTestId(ids.widgets.wellSummary)).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: `${OUT}/09a-launcher.png` })
  await page.getByTestId(ids.shell.devtoolsToggle).click()
  const panel = page.getByTestId(ids.shell.devtoolsPanel)
  await expect(panel).toBeVisible()
  await page.screenshot({ path: `${OUT}/09b-dock.png` })
  await panel.getByRole("tab", { name: /Dependencies/ }).click()
  await expect(panel.locator(".react-flow")).toBeVisible()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/09c-graph.png` })
  await panel.getByRole("tab", { name: /Faults/ }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/09d-faults.png` })
})

test("10 palette and light theme", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await gotoShell(page, "/well-planner")
  await expect(page.getByTestId(ids.wellPlanner.root)).toBeVisible({ timeout: 30_000 })
  await page.getByTestId(ids.shell.paletteTrigger).click()
  const input = page.getByTestId(ids.shell.paletteInput)
  await expect(input).toBeVisible()
  await input.fill("well")
  await expect(page.getByRole("menuitem").first()).toBeVisible()
  await page.screenshot({ path: `${OUT}/10a-palette.png` })
  // react-aria's search field takes the first Escape to clear the query; the
  // second one reaches the dialog.
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  await expect(input).toBeHidden()
  // The light theme is the half nobody looks at, which is exactly why it is
  // worth a picture: a remote that hardcodes a dark ground shows up here.
  await toggleTheme(page)
  await page.keyboard.press("Escape")
  await expect(page.locator("html.dark")).toHaveCount(0)
  // Let the user menu finish its exit animation, or it ghosts over the page.
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/10b-light.png` })
})
