import { describe, expect, it } from "vitest"

import { rewriteRouterHmrGlue, ROUTER_REGISTRY_KEY } from "../src/plugin/router-hmr"

describe("rewriteRouterHmrGlue", () => {
  it("points the router plugin's HMR lookup at the remote's own router", () => {
    const glue = [
      "const existingRoute = typeof window !== 'undefined' && initialRouteId",
      "  ? window.__TSR_ROUTER__?.routesById?.[initialRouteId]",
      "  : undefined",
      "function handleRouteUpdate(routeId, newRoute) {",
      "  const router = window.__TSR_ROUTER__;",
      "  const oldRoute = router.routesById[routeId];",
      "}",
    ].join("\n")
    const rewritten = rewriteRouterHmrGlue(glue, "asset-tracker")
    expect(rewritten).not.toContain("window.__TSR_ROUTER__")
    expect(rewritten).toContain(`globalThis.${ROUTER_REGISTRY_KEY}?.["asset-tracker"]`)
    // The fallback keeps the injected code safe when no router of the remote is mounted.
    expect(rewritten).toContain("?? { routesById: {} })")
    expect(rewritten.match(/__PLATFORM_TSR_ROUTERS__/g)).toHaveLength(2)
  })

  it("leaves modules without the glue untouched", () => {
    const code = "export const Route = createFileRoute('/')({ component: Home })"
    expect(rewriteRouterHmrGlue(code, "asset-tracker")).toBe(code)
  })
})
