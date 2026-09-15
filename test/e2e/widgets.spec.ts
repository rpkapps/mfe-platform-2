import { expect, test } from "@playwright/test"

import { gotoShell, ids, layerOf } from "./helpers"

test.describe("widgets and overlays", () => {
  test("widgets from four remotes mount at once with independent state", async ({ page }) => {
    await gotoShell(page, "/dashboard")
    await expect(page.getByTestId(ids.widgets.wellSummary)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId(ids.widgets.productionKpi)).toHaveCount(2)
    await expect(page.getByTestId(ids.widgets.reportSummary)).toBeVisible()
    await expect(page.getByTestId(ids.widgets.rigStatus)).toHaveCount(2)
    // Instance-scoped storage: the two rigs count independently, at their own step.
    const rigs = page.getByTestId(ids.widgets.rigStatus)
    await rigs.nth(0).getByTestId(ids.widgets.rigStatusAdvance).click()
    await rigs.nth(1).getByTestId(ids.widgets.rigStatusAdvance).click()
    await rigs.nth(1).getByTestId(ids.widgets.rigStatusAdvance).click()
    await expect(rigs.nth(0).getByTestId(ids.widgets.rigStatusValue)).toHaveText("1")
    await expect(rigs.nth(1).getByTestId(ids.widgets.rigStatusValue)).toHaveText("4")
    // Unknown widget fails in isolation.
    await expect(page.locator('[data-platform-widget-state="error"]')).toHaveCount(1)
    await expect(page.getByTestId(ids.widgets.reportSummary)).toContainText("React 18")
    await expect(page.getByTestId(ids.widgets.productionKpi).first()).toContainText("React 19")
  })

  test("ordinary Tecton dialogs and plain modals stack in opening order across roots", async ({
    page,
  }) => {
    await gotoShell(page, "/dashboard")
    await expect(page.getByTestId(ids.widgets.fdaStatus)).toBeVisible({ timeout: 30_000 })
    await page.getByTestId(ids.widgets.fdaStatusOpen).click()
    const first = page.getByTestId(ids.widgets.fdaStatusDialog)
    await expect(first).toBeVisible()
    // The dialog is portalled into the owner-tagged overlay root, outside the widget container.
    expect(
      await first.evaluate((el) =>
        el.closest("[data-platform-overlay-root]")?.getAttribute("data-mfe")
      )
    ).toBe("subsurface-widgets")
    await page.getByTestId(ids.widgets.fdaStatusNested).click()
    const nested = page.getByTestId(ids.widgets.fdaStatusNestedDialog)
    await expect(nested).toBeVisible()
    expect(await layerOf(page, ids.widgets.fdaStatusNestedDialog)).toBeGreaterThan(
      await layerOf(page, ids.widgets.fdaStatusDialog)
    )
    await page.keyboard.press("Escape")
    await expect(nested).toBeHidden()
    await expect(first).toBeVisible()
    // Close the outer dialog through its own close button (focus is still being restored
    // from the nested dialog when the second Escape would land).
    await first.getByRole("button", { name: "Close" }).first().click()
    await expect(first).toBeHidden()
    // A React 19 Tecton dialog opened while a React 18 plain modal is up: the later opener
    // is on top. (The modal covers the page, so the second trigger receives a synthetic click.)
    await page.getByTestId(ids.widgets.exportModalOpen).click()
    await expect(page.getByTestId(ids.widgets.exportModalDialog)).toBeVisible()
    await page.getByTestId(ids.widgets.wellSummaryOpen).dispatchEvent("click")
    await expect(page.getByTestId(ids.widgets.wellSummaryDialog)).toBeVisible()
    expect(await layerOf(page, ids.widgets.wellSummaryDialog)).toBeGreaterThan(
      await layerOf(page, ids.widgets.exportModalDialog)
    )
    expect(
      await page
        .getByTestId(ids.widgets.exportModalDialog)
        .evaluate((el) => el.closest("[data-platform-overlay-root]")?.getAttribute("data-mfe"))
    ).toBe("production-reports")
  })
})
