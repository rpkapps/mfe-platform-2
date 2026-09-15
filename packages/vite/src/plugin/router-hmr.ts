import { resolve } from "node:path"

import type { Plugin } from "vite"

import type { PlatformContext } from "./context"

/** Global registry of live MFE routers by `mfeId`, maintained by `@platform/react`. */
export const ROUTER_REGISTRY_KEY = "__PLATFORM_TSR_ROUTERS__"

const GLOBAL_ROUTER = "window.__TSR_ROUTER__"

/**
 * Point the route-level HMR glue of `@tanstack/router-plugin` at the remote's
 * own router.
 *
 * The plugin injects code into every route file that finds the live route by
 * id on `window.__TSR_ROUTER__` — the one router a page is assumed to have —
 * and, when the module (re)evaluates, copies the module's options onto it.
 * Inside a shell that router is the shell's, and every remote's root route is
 * also called `__root__`: the remote's route file would overwrite the shell's
 * root route with its own component. Rewriting the lookup to the platform's
 * per-remote registry (`globalThis.__PLATFORM_TSR_ROUTERS__[mfeId]`, filled by
 * the SDK while the remote is mounted) keeps route HMR working for the remote
 * and leaves the shell's router alone. Development server only.
 */
export function rewriteRouterHmrGlue(code: string, mfeId: string): string {
  if (!code.includes(GLOBAL_ROUTER)) return code
  const target = `(globalThis.${ROUTER_REGISTRY_KEY}?.[${JSON.stringify(mfeId)}] ?? { routesById: {} })`
  return code.split(GLOBAL_ROUTER).join(target)
}

export function platformRouterHmrPlugin(context: PlatformContext): Plugin {
  return {
    name: "platform:router-hmr",
    // Development server only; `vite --mode test` gets no dev plugins.
    apply: (_config, env) => env.command === "serve" && env.mode !== "test",
    transform(code, id) {
      const config = context.config()
      const file = id.split("?")[0]!
      const routesDirectory = resolve(config.root, config.routesDirectory)
      if (!file.startsWith(routesDirectory)) return null
      const rewritten = rewriteRouterHmrGlue(code, config.mfeId)
      return rewritten === code ? null : { code: rewritten, map: null }
    },
  }
}
