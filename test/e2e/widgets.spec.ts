import { expect, test } from "@playwright/test"

import { gotoShell, ids, layerOf } from "./helpers"

test.describe("widgets and overlays", () => {
  test("widgets from four remotes mount at once with independent state", async ({ page }) => {
    await gotoShell(page, "/dashboard")
    await expect(page.getByTestId(ids.widgets.assetCard)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId(ids.widgets.kpiTile)).toHaveCount(2)
    await expect(page.getByTestId(ids.widgets.reportSummary)).toBeVisible()
    await expect(page.getByTestId(ids.widgets.counterWidget)).toHaveCount(2)
    const counters = page.getByTestId(ids.widgets.counterWidget)
    await counters.nth(0).getByTestId(ids.widgets.counterWidgetIncrement).click()
    await counters.nth(1).getByTestId(ids.widgets.counterWidgetIncrement).click()
    await counters.nth(1).getByTestId(ids.widgets.counterWidgetIncrement).click()
    await expect(counters.nth(0).getByTestId(ids.widgets.counterWidgetValue)).toHaveText("1")
    await expect(counters.nth(1).getByTestId(ids.widgets.counterWidgetValue)).toHaveText("4")
    // Unknown widget fails in isolation.
    await expect(page.locator('[data-platform-widget-state="error"]')).toHaveCount(1)
    await expect(page.getByTestId(ids.widgets.reportSummary)).toContainText("React 18")
    await expect(page.getByTestId(ids.widgets.kpiTile).first()).toContainText("React 19")
  })

  test("ordinary Tecton dialogs and plain modals stack in opening order across roots", async ({
    page,
  }) => {
    await gotoShell(page, "/dashboard")
    await expect(page.getByTestId(ids.widgets.modalWidget)).toBeVisible({ timeout: 30_000 })
    await page.getByTestId(ids.widgets.modalWidgetOpen).click()
    const first = page.getByTestId(ids.widgets.modalWidgetDialog)
    await expect(first).toBeVisible()
    // The dialog is portalled into the owner-tagged overlay root, outside the widget container.
    expect(
      await first.evaluate((el) =>
        el.closest("[data-platform-overlay-root]")?.getAttribute("data-mfe")
      )
    ).toBe("widget-a")
    await page.getByTestId(ids.widgets.modalWidgetNested).click()
    const nested = page.getByTestId(ids.widgets.modalWidgetNestedDialog)
    await expect(nested).toBeVisible()
    expect(await layerOf(page, ids.widgets.modalWidgetNestedDialog)).toBeGreaterThan(
      await layerOf(page, ids.widgets.modalWidgetDialog)
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
    await page.getByTestId(ids.widgets.stackedModalOpen).click()
    await expect(page.getByTestId(ids.widgets.stackedModalDialog)).toBeVisible()
    await page.getByTestId(ids.widgets.assetCardOpen).dispatchEvent("click")
    await expect(page.getByTestId(ids.widgets.assetCardDialog)).toBeVisible()
    expect(await layerOf(page, ids.widgets.assetCardDialog)).toBeGreaterThan(
      await layerOf(page, ids.widgets.stackedModalDialog)
    )
    expect(
      await page
        .getByTestId(ids.widgets.stackedModalDialog)
        .evaluate((el) => el.closest("[data-platform-overlay-root]")?.getAttribute("data-mfe"))
    ).toBe("legacy-reports")
  })
})
