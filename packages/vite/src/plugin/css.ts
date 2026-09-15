import type { Plugin } from "vite"

import { scopeCss } from "../css-scope"
import type { PlatformContext } from "./context"

export const CSS_ID_RE = /\.(css|scss|sass|less|styl|stylus|pcss|postcss)(\?[^?]*)?$/
const SKIP_QUERY_RE = /[?&](url|raw|worker|sharedworker)\b/

export function isCssId(id: string): boolean {
  return CSS_ID_RE.test(id) && !SKIP_QUERY_RE.test(id) && !id.includes("/.vite/")
}

/**
 * Scope every stylesheet of the remote (author CSS and Tailwind's generated
 * output, which arrives under the same id) under the owner attribute. The
 * transform runs as a normal plugin: after `vite:css` (preprocessors, PostCSS)
 * and Tailwind's `pre` generation, before `vite:css-post` turns the CSS into a
 * JS module in dev or collects it for the bundle in build. The core plugin
 * (`enforce: "post"`) scopes the emitted `.css` assets once more in
 * `generateBundle` as a safety net (the transform is idempotent).
 */
export function platformCssPlugin(context: PlatformContext): Plugin {
  const warned = new Set<string>()
  return {
    name: "platform:css-scope",
    apply: (_config, env) => env.mode !== "test",
    transform(code, id) {
      if (!isCssId(id)) return null
      const config = context.config()
      if (!config.css.scope) return null
      const result = scopeCss(code, {
        owner: config.mfeId,
        ownerAttribute: config.css.ownerAttribute,
        dropFontFaces: config.css.foundation === "shell",
      })
      for (const warning of result.warnings) {
        const key = `${id}:${warning}`
        if (warned.has(key)) continue
        warned.add(key)
        this.warn(`[platform:css] ${warning}`)
      }
      return { code: result.css, map: null }
    },
  }
}
