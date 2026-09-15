import { resolve } from "node:path"

import type { Plugin } from "vite"

import type { PlatformContext } from "./context"

/** Global registry of live MFE routers by `mfeId`, maintained by `@platform/mfe-react`. */
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

/**
 * Whether a Vite module id names a file in the remote's routes directory.
 *
 * Module ids always use forward slashes, while a path built with `resolve`
 * follows the platform. Comparing the two directly matched nothing on Windows,
 * so no route file was rewritten there: every remote's `__root__` then
 * overwrote the shell's root route, and the shell rendered the remote's layout
 * with its own React while the remote's hooks called into a second copy.
 */
export function isRouteFile(id: string, routesDirectory: string): boolean {
  // Vite's own `normalizePath` only rewrites separators when it runs on
  // Windows, so the conversion is explicit: a module id never contains a
  // backslash, and this is the only comparison it is used for.
  const posix = (path: string) => path.replace(/\\/g, "/")
  const file = posix(id.split("?")[0]!)
  const directory = posix(routesDirectory)
  return file === directory || file.startsWith(`${directory}/`)
}

export function platformRouterHmrPlugin(context: PlatformContext): Plugin {
  return {
    name: "platform:router-hmr",
    // Development server only; `vite --mode test` gets no dev plugins.
    apply: (_config, env) => env.command === "serve" && env.mode !== "test",
    transform(code, id) {
      const config = context.config()
      if (!isRouteFile(id, resolve(config.root, config.routesDirectory))) return null
      const rewritten = rewriteRouterHmrGlue(code, config.mfeId)
      return rewritten === code ? null : { code: rewritten, map: null }
    },
  }
}
