import { expect, test } from "@playwright/test"

/**
 * Runs against the local shell harness started by `platform dev` (see playwright.config.ts).
 * The harness provides a realistic platform context, the command palette, settings host
 * and widget slots, so the MFE is exercised exactly as inside a shell.
 */
test.describe("__DISPLAY_NAME__ in the harness", () => {
  test("renders the dashboard", async ({ page }) => {
    await page.goto("/__platform/harness/")
    await expect(page.getByRole("heading", { name: /^Hello / })).toBeVisible()
    await expect(page.getByText("Dashboard columns")).toBeVisible()
  })

  test("exposes its command in the palette", async ({ page }) => {
    await page.goto("/__platform/harness/")
    await expect(page.getByRole("heading", { name: /^Hello / })).toBeVisible()
    await page.keyboard.press("ControlOrMeta+k")
    const palette = page.getByRole("dialog")
    await expect(palette).toBeVisible()
    await palette.getByRole("combobox").fill("Say hello")
    await expect(palette.getByRole("option", { name: /Say hello/ })).toBeVisible()
  })
})
