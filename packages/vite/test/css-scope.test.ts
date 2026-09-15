import { describe, expect, it } from "vitest"

import { rewriteAnimationNames, scopeCss } from "../src/css-scope"

const owner = "asset-tracker"
const scope = (css: string, extra: Partial<Parameters<typeof scopeCss>[1]> = {}) =>
  scopeCss(css, { owner, ...extra })
const compact = (css: string) => css.replace(/\s+/g, " ").trim()

describe("scopeCss", () => {
  it("replaces :root, html, :host and body with the owner element", () => {
    const { css } = scope(
      `:root { --a: 1 } html { color: red } :host { --b: 2 } body { margin: 0 } html.dark .x { color: blue }`
    )
    expect(compact(css)).toBe(
      `[data-mfe="asset-tracker"] { --a: 1 } [data-mfe="asset-tracker"] { color: red } [data-mfe="asset-tracker"] { --b: 2 } [data-mfe="asset-tracker"] { margin: 0 } [data-mfe="asset-tracker"].dark .x { color: blue }`
    )
  })

  it("scopes ordinary selectors as descendants and dedupes selector lists", () => {
    const { css } = scope(
      `.btn, .card > .title { color: red } :root, :host { --x: 1 } * { box-sizing: border-box } ::selection { color: red } *::before, ::backdrop { margin: 0 }`
    )
    expect(compact(css)).toBe(
      `[data-mfe="asset-tracker"] .btn, [data-mfe="asset-tracker"] .card > .title { color: red } [data-mfe="asset-tracker"] { --x: 1 } [data-mfe="asset-tracker"] * { box-sizing: border-box } [data-mfe="asset-tracker"] ::selection { color: red } [data-mfe="asset-tracker"] *::before, [data-mfe="asset-tracker"] ::backdrop { margin: 0 }`
    )
  })

  it("collapses html body chains and handles :is/:where wrappers", () => {
    const { css } = scope(
      `html body .x { color: red } :where(:root) { --a: 1 } :is(html, .dark) .y { color: blue }`
    )
    expect(compact(css)).toBe(
      `[data-mfe="asset-tracker"] .x { color: red } :where([data-mfe="asset-tracker"]) { --a: 1 } :is([data-mfe="asset-tracker"], .dark) .y { color: blue }`
    )
  })

  it("renames keyframes and rewrites animation declarations", () => {
    const { css } = scope(
      `@keyframes spin { to { transform: rotate(360deg) } } .a { animation: spin 1s linear infinite, fade-in 2s } .b { animation-name: fade-in } @keyframes fade-in { from { opacity: 0 } }`
    )
    const out = compact(css)
    expect(out).toContain(
      `@keyframes mfe-asset-tracker-spin { to { transform: rotate(360deg) } }`
    )
    expect(out).toContain(
      `[data-mfe="asset-tracker"] .a { animation: mfe-asset-tracker-spin 1s linear infinite, mfe-asset-tracker-fade-in 2s }`
    )
    expect(out).toContain(
      `[data-mfe="asset-tracker"] .b { animation-name: mfe-asset-tracker-fade-in }`
    )
    expect(out).toContain(`@keyframes mfe-asset-tracker-fade-in`)
    expect(out).not.toContain(`[data-mfe="asset-tracker"] to`)
  })

  it("uses a custom keyframes prefix and does not touch var() references", () => {
    expect(
      rewriteAnimationNames(
        "var(--spin) spin 1s cubic-bezier(0, 0, 1, 1)",
        new Map([["spin", "x-spin"]])
      )
    ).toBe("var(--spin) x-spin 1s cubic-bezier(0, 0, 1, 1)")
    const { css } = scope(`@keyframes spin { to { opacity: 1 } } .a { animation: spin 1s }`, {
      keyframesPrefix: "k",
    })
    expect(compact(css)).toContain("@keyframes k-spin")
    expect(compact(css)).toContain("animation: k-spin 1s")
  })

  it("drops font faces when asked and keeps @property with a warning", () => {
    const input = `@font-face { font-family: X; src: url(x.woff2) } @property --tw-x { syntax: "*"; inherits: false } .a { color: red }`
    const dropped = scope(input, { dropFontFaces: true })
    expect(dropped.css).not.toContain("@font-face")
    expect(dropped.css).toContain(`@property --tw-x`)
    expect(dropped.warnings.some((warning) => warning.includes("@property"))).toBe(true)
    const kept = scope(input)
    expect(kept.css).toContain("@font-face")
  })

  it("recurses into nested at-rules and leaves nested rules to their parent", () => {
    const { css } = scope(
      `@layer base { @media (min-width: 640px) { @supports (display: grid) { @container (min-width: 1px) { .g { display: grid } } } } } .p { color: red; &:hover { color: blue } .child { color: green } }`
    )
    const out = compact(css)
    expect(out).toContain(
      `@layer base { @media (min-width: 640px) { @supports (display: grid) { @container (min-width: 1px) { [data-mfe="asset-tracker"] .g { display: grid } } } } }`
    )
    expect(out).toContain(
      `[data-mfe="asset-tracker"] .p { color: red; &:hover { color: blue } .child { color: green } }`
    )
  })

  it("is idempotent", () => {
    const input = `:root { --a: 1 } .a { color: red } @keyframes spin { to { opacity: 1 } } .b { animation: spin 1s } @font-face { font-family: X }`
    const once = scope(input, { dropFontFaces: true })
    const twice = scope(once.css, { dropFontFaces: true })
    expect(twice.css).toBe(once.css)
  })

  it("supports a custom owner attribute", () => {
    const { css } = scope(`.a { color: red } :root { --a: 1 }`, {
      ownerAttribute: "data-owner",
    })
    expect(compact(css)).toBe(
      `[data-owner="asset-tracker"] .a { color: red } [data-owner="asset-tracker"] { --a: 1 }`
    )
  })

  it("keeps Tailwind v4 output working (theme tokens on the owner, resets scoped, utilities scoped)", () => {
    const tailwind = `@layer theme, base, components, utilities;
@layer theme {
  :root, :host {
    --font-sans: ui-sans-serif, system-ui;
    --color-blue-500: oklch(62.3% 0.214 259.815);
  }
}
@layer base {
  *, ::after, ::before, ::backdrop, ::file-selector-button { box-sizing: border-box; margin: 0; border: 0 solid; }
  html, :host { line-height: 1.5; font-family: var(--font-sans); }
  body { line-height: inherit; }
}
@layer utilities {
  .flex { display: flex; }
  .sm\\:hidden { @media (width >= 40rem) { display: none; } }
  .bg-blue-500 { background-color: var(--color-blue-500); }
}
@property --tw-border-style { syntax: "*"; inherits: false; initial-value: solid; }
@supports (((-webkit-hyphens: none)) and (not (margin-trim: inline))) or ((-moz-orient: inline) and (not (color: rgb(from red r g b)))) {
  @layer properties { *, ::before, ::after, ::backdrop { --tw-border-style: solid; } }
}`
    const { css } = scope(tailwind)
    const out = compact(css)
    expect(out).toContain(
      `@layer theme { [data-mfe="asset-tracker"] { --font-sans: ui-sans-serif, system-ui; --color-blue-500: oklch(62.3% 0.214 259.815); } }`
    )
    expect(out).toContain(
      `[data-mfe="asset-tracker"] *, [data-mfe="asset-tracker"] ::after, [data-mfe="asset-tracker"] ::before, [data-mfe="asset-tracker"] ::backdrop, [data-mfe="asset-tracker"] ::file-selector-button { box-sizing: border-box`
    )
    expect(out).toContain(
      `[data-mfe="asset-tracker"] { line-height: 1.5; font-family: var(--font-sans); }`
    )
    expect(out).toContain(`[data-mfe="asset-tracker"] .flex { display: flex; }`)
    expect(out).toContain(
      `[data-mfe="asset-tracker"] .sm\\:hidden { @media (width >= 40rem) { display: none; } }`
    )
    expect(out).toContain(
      `@layer properties { [data-mfe="asset-tracker"] *, [data-mfe="asset-tracker"] ::before`
    )
    expect(out).toContain(`@property --tw-border-style`)
    expect(out).not.toMatch(/(^|[\s{])(:root|html|body)\b/)
  })
})
