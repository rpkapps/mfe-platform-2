import { test } from "@playwright/test"

import { gotoShell, ids } from "./helpers"

test("probe app finder", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await gotoShell(page, "/")
  const trigger = page.getByTestId(ids.shell.appFinderTrigger)
  console.log(">>> trigger count:", await trigger.count())
  await trigger.first().click()
  await page.waitForTimeout(700)
  const roles = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[role]"))
      .filter((el) =>
        ["option", "menuitem", "listitem", "row", "gridcell"].includes(
          el.getAttribute("role") ?? ""
        )
      )
      .slice(0, 14)
      .map((el) => `${el.getAttribute("role")}=${(el.textContent ?? "").slice(0, 40)}`)
  )
  console.log(">>> roles:", roles.join(" | "))
})
