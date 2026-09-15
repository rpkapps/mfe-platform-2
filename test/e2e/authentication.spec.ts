import { expect, test } from "@playwright/test"

import { PORTS } from "@platform-internal/conformance"

import { gotoShell, ids, waitForWellPlanner } from "./helpers"

const planner = ids.wellPlanner

test.describe("credential port", () => {
  test("attaches the shell's token same-origin and refuses every other origin", async ({
    page,
  }) => {
    const authorized: string[] = []
    // Record the Authorization header the remote's fetch actually sent.
    await page.route("**/platform-config.json", async (route) => {
      const header = route.request().headers()["authorization"]
      if (header) authorized.push(header)
      await route.continue()
    })
    // Nothing may reach this origin at all; the request must never be made.
    let crossOriginRequests = 0
    await page.route("https://tokens.example/**", async (route) => {
      crossOriginRequests += 1
      await route.abort()
    })

    await gotoShell(page, "/well-planner")
    await waitForWellPlanner(page)

    await page.getByTestId(planner.authFetch).click()
    await expect(page.getByTestId(planner.authResult)).toHaveText(/^ok 200$/, {
      timeout: 15_000,
    })
    expect(authorized.some((value) => value.startsWith("Bearer conformance.wells."))).toBe(true)

    await page.getByTestId(planner.authFetchCrossOrigin).click()
    await expect(page.getByTestId(planner.authResult)).toHaveText("refused AUTH_UNAVAILABLE", {
      timeout: 15_000,
    })
    expect(crossOriginRequests).toBe(0)
  })

  test("the auth capability is inferred from the SDK usage and approved by the host", async ({
    page,
  }) => {
    await gotoShell(page, "/well-planner")
    await waitForWellPlanner(page)
    const capabilities = await page.evaluate(async (port: number) => {
      const response = await fetch(`http://127.0.0.1:${port}/platform-manifest.json`, {
        cache: "no-store",
      })
      return ((await response.json()) as { capabilities: string[] }).capabilities
    }, PORTS.wellPlanner)
    expect(capabilities).toContain("auth")
  })
})
