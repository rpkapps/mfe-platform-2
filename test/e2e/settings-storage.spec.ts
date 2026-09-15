import { expect, test } from "@playwright/test"

import { gotoShell, ids, waitForWellPlanner } from "./helpers"

test.describe("settings and storage", () => {
  test("framework-managed groups render, persist, validate and reset", async ({ page }) => {
    await gotoShell(page, "/settings")
    const host = page.getByTestId(ids.shell.settingsHost)
    await expect(host.getByText("Display")).toBeVisible({ timeout: 30_000 })
    await host.getByText("Display").click()
    // Inferred controls: boolean → switch, select → select, number → number input, async → loaded options.
    const showAbandoned = host.getByRole("switch", { name: /Show abandoned/ })
    await expect(showAbandoned).toBeChecked()
    // The Tecton switch input sits visually hidden behind its label; a click event toggles it.
    await showAbandoned.dispatchEvent("click")
    await expect(showAbandoned).not.toBeChecked()
    await expect(host.getByText("Watched fields")).toBeHidden()
    const pageSize = host.locator('input[type="number"]').first()
    await pageSize.fill("3")
    await pageSize.blur()
    await expect(host.getByText(/at least 5|>=5|too small|minimum|greater/i)).toBeVisible()
    await pageSize.fill("50")
    await pageSize.blur()
    // Async options loaded: South Field comes from the provider.
    await expect(host.getByText("Default field")).toBeVisible()
    await expect(host.locator("select").filter({ hasText: "Gullfaks" })).toHaveCount(1)
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
        key.startsWith("platform:well-planner:settings")
      )
    )
    expect(stored.length).toBeGreaterThan(0)
    await page.getByRole("button", { name: /Reset/ }).first().click()
    // MFE-managed group links to its own page.
    await expect(
      page.getByTestId(ids.shell.settingsHost).getByText(/Advanced well settings/)
    ).toBeVisible()
  })

  test("invalid stored settings recover to defaults without crashing", async ({ page }) => {
    await gotoShell(page, "/")
    await page.evaluate(() => {
      localStorage.setItem(
        "platform:well-planner:settings:well-planner:display.pageSize",
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
    await gotoShell(page, "/well-planner")
    await waitForWellPlanner(page)
    await page.getByTestId(ids.wellPlanner.storageAdd).click()
    await expect(page.getByTestId(ids.wellPlanner.storageColumns)).toHaveText("npv,irr,capex")
    const keys = await page.evaluate(() => Object.keys(localStorage))
    expect(keys).toContain("platform:well-planner:local:dashboard")
    const second = await context.newPage()
    await second.goto("/well-planner")
    await expect(second.getByTestId(ids.wellPlanner.storageColumns)).toHaveText(
      "npv,irr,capex",
      { timeout: 30_000 }
    )
    await second.getByTestId(ids.wellPlanner.storageAdd).click()
    await expect(page.getByTestId(ids.wellPlanner.storageColumns)).toHaveText(
      "npv,irr,capex,firstOil"
    )
    await page.getByTestId(ids.wellPlanner.storageReset).click()
    await expect(page.getByTestId(ids.wellPlanner.storageColumns)).toHaveText("npv,irr")
    await expect(second.getByTestId(ids.wellPlanner.storageColumns)).toHaveText("npv,irr")
    // Malformed stored data recovers to defaults.
    await page.evaluate(() =>
      localStorage.setItem("platform:well-planner:local:dashboard", "{broken")
    )
    await page.reload()
    await waitForWellPlanner(page)
    await expect(page.getByTestId(ids.wellPlanner.storageColumns)).toHaveText("npv,irr")
  })

  test("MFE-managed settings page owns its own state", async ({ page }) => {
    await gotoShell(page, "/well-planner/settings/custom")
    await expect(page.getByTestId(ids.wellPlanner.customSettings)).toBeVisible({
      timeout: 30_000,
    })
    await page.getByLabel(/Session notes/).fill("hello")
    await expect(page.getByTestId(ids.wellPlanner.customSettingsValue)).toHaveText(
      "5 characters"
    )
    const keys = await page.evaluate(() => Object.keys(sessionStorage))
    expect(keys).toContain("platform:well-planner:session:notes")
  })
})
