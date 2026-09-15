import { expect, test } from "@playwright/test"

import { PORTS } from "@platform-internal/conformance"

import { gotoShell, ids, waitForAssetTracker } from "./helpers"

const tracker = ids.assetTracker

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

    await gotoShell(page, "/asset-tracker")
    await waitForAssetTracker(page)

    await page.getByTestId(tracker.authFetch).click()
    await expect(page.getByTestId(tracker.authResult)).toHaveText(/^ok 200$/, {
      timeout: 15_000,
    })
    expect(authorized.some((value) => value.startsWith("Bearer conformance.assets."))).toBe(
      true
    )

    await page.getByTestId(tracker.authFetchCrossOrigin).click()
    await expect(page.getByTestId(tracker.authResult)).toHaveText("refused AUTH_UNAVAILABLE", {
      timeout: 15_000,
    })
    expect(crossOriginRequests).toBe(0)
  })

  test("the auth capability is inferred from the SDK usage and approved by the host", async ({
    page,
  }) => {
    await gotoShell(page, "/asset-tracker")
    await waitForAssetTracker(page)
    const capabilities = await page.evaluate(async (port: number) => {
      const response = await fetch(`http://127.0.0.1:${port}/platform-manifest.json`, {
        cache: "no-store",
      })
      return ((await response.json()) as { capabilities: string[] }).capabilities
    }, PORTS.assetTracker)
    expect(capabilities).toContain("auth")
  })
})
