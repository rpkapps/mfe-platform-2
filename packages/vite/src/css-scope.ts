import postcss, { type AtRule, type Rule } from "postcss"
import selectorParser from "postcss-selector-parser"

export interface ScopeCssOptions {
  /** Owner value: the `mfeId` carried by the MFE root element. */
  owner: string
  /** Attribute name (default `data-mfe`). */
  ownerAttribute?: string
  /** Prefix for renamed `@keyframes` (default `mfe-<owner>`). */
  keyframesPrefix?: string
  /** Drop `@font-face` rules (foundation `shell`: fonts come from the shell). */
  dropFontFaces?: boolean
}

export interface ScopeCssResult {
  css: string
  warnings: string[]
}

const KEYFRAMES_RE = /^(-\w+-)?keyframes$/i
const UNSCOPED_AT_RULES =
  /^((-\w+-)?keyframes|font-face|property|page|counter-style|font-feature-values|font-palette-values)$/i
const ANIMATION_DECL_RE = /^(-\w+-)?animation(-name)?$/i

/**
 * Build-time selector scoping: every selector becomes a descendant of the
 * owner element (`[data-mfe="owner"] .btn`), document-level selectors
 * (`:root`, `html`, `:host`, `body`) become the owner element itself, so
 * custom properties declared on `:root` keep working inside the MFE.
 * `@keyframes` are renamed with the owner prefix (and their `animation`
 * references rewritten), `@font-face` is dropped for shell-provided fonts,
 * `@property` is kept as is (it is document-global by design), nested
 * at-rules (`@layer`, `@media`, `@supports`, `@container`) are recursed. The
 * transform is idempotent: already scoped rules and renamed keyframes are
 * left untouched.
 */
export function scopeCss(css: string, options: ScopeCssOptions): ScopeCssResult {
  const attribute = options.ownerAttribute ?? "data-mfe"
  const owner = options.owner
  const prefix = options.keyframesPrefix ?? `mfe-${owner}`
  const warnings: string[] = []
  const root = postcss.parse(css)

  const renamed = new Map<string, string>()
  root.walkAtRules(KEYFRAMES_RE, (atRule) => {
    const name = atRule.params.trim()
    if (!name || name.startsWith(`${prefix}-`)) return
    const next = `${prefix}-${name}`
    renamed.set(name, next)
    atRule.params = next
  })

  if (options.dropFontFaces) {
    root.walkAtRules(/^font-face$/i, (atRule) => {
      atRule.remove()
    })
  }

  let propertyWarned = false
  let importWarned = false
  root.walkAtRules((atRule) => {
    if (/^property$/i.test(atRule.name) && !propertyWarned) {
      propertyWarned = true
      warnings.push(
        `@property rules are document-global and were kept unscoped (${atRule.params.trim()}${countAtRules(root, /^property$/i) > 1 ? ", …" : ""}).`
      )
    }
    if (/^import$/i.test(atRule.name) && !importWarned) {
      importWarned = true
      warnings.push(
        `@import rules were left as is; imported stylesheets are not scoped (${atRule.params.trim()}).`
      )
    }
  })

  const isOwnerAttribute = (node: selectorParser.Node): boolean =>
    selectorParser.isAttribute(node) && node.attribute === attribute && node.value === owner
  const createOwner = () => {
    const node = selectorParser.attribute({
      attribute,
      operator: "=",
      value: owner,
      quoteMark: '"',
      raws: {},
    })
    node.setValue(owner, { quoteMark: '"' })
    return node
  }
  const isRootLike = (node: selectorParser.Node): boolean => {
    if (selectorParser.isPseudoClass(node)) {
      const value = node.value.toLowerCase()
      return value === ":root" || value === ":host"
    }
    if (selectorParser.isTag(node)) {
      const value = node.value.toLowerCase()
      return value === "html" || value === "body"
    }
    return false
  }

  const replaceRootLike = (
    container: selectorParser.Container,
    firstCompoundOnly: boolean
  ): boolean => {
    let rooted = false
    let compound = 0
    for (const node of [...container.nodes]) {
      if (selectorParser.isCombinator(node)) {
        compound += 1
        continue
      }
      if (firstCompoundOnly && compound > 0) break
      if (isRootLike(node)) {
        node.replaceWith(createOwner())
        if (compound === 0) rooted = true
        continue
      }
      if (
        selectorParser.isPseudoClass(node) &&
        node.nodes.length > 0 &&
        /^:(is|where|not|has)$/i.test(node.value)
      ) {
        for (const inner of node.nodes) {
          if (
            replaceRootLike(inner, false) &&
            compound === 0 &&
            !/^:(not|has)$/i.test(node.value)
          )
            rooted = true
        }
      }
    }
    return rooted
  }

  const collapseOwnerChains = (selector: selectorParser.Selector) => {
    const nodes = selector.nodes
    for (let index = 0; index + 2 < nodes.length; index += 1) {
      const [first, combinator, second] = [nodes[index], nodes[index + 1], nodes[index + 2]]
      if (!first || !combinator || !second) continue
      const before = nodes[index - 1]
      const after = nodes[index + 3]
      const firstAlone =
        isOwnerAttribute(first) && (before === undefined || selectorParser.isCombinator(before))
      const secondAlone =
        isOwnerAttribute(second) && (after === undefined || selectorParser.isCombinator(after))
      if (
        firstAlone &&
        secondAlone &&
        selectorParser.isCombinator(combinator) &&
        combinator.value.trim() === ""
      ) {
        combinator.remove()
        second.remove()
        index -= 1
      }
    }
  }

  const processor = selectorParser((selectors) => {
    selectors.each((selector) => {
      const first = selector.nodes[0]
      if (!first) return
      if (isOwnerAttribute(first) || selectorParser.isNesting(first)) return
      const rooted = replaceRootLike(selector, false)
      collapseOwnerChains(selector)
      if (rooted) return
      const leading = selector.nodes[0]
      const before = leading?.spaces.before ?? ""
      if (leading) leading.spaces.before = ""
      const ownerNode = createOwner()
      ownerNode.spaces.before = before
      selector.prepend(selectorParser.combinator({ value: " " }))
      selector.prepend(ownerNode)
    })
  })

  root.walkRules((rule) => {
    if (isUnscopable(rule)) return
    try {
      rule.selector = processor.processSync(rule.selector, { lossless: true })
    } catch (error) {
      warnings.push(
        `Selector "${rule.selector}" could not be parsed and was left unscoped (${error instanceof Error ? error.message : String(error)}).`
      )
      return
    }
    const unique = [...new Set(rule.selectors.map((selector) => selector.trim()))]
    if (unique.length !== rule.selectors.length) rule.selectors = unique
  })

  if (renamed.size > 0) {
    root.walkDecls(ANIMATION_DECL_RE, (decl) => {
      decl.value = rewriteAnimationNames(decl.value, renamed)
    })
  }

  return { css: root.toString(), warnings }
}

function countAtRules(root: postcss.Root, name: RegExp): number {
  let count = 0
  root.walkAtRules(name, () => {
    count += 1
  })
  return count
}

function isUnscopable(rule: Rule): boolean {
  let parent: postcss.Container | undefined = rule.parent as postcss.Container | undefined
  while (parent && parent.type !== "root" && parent.type !== "document") {
    if (parent.type === "rule") return true
    if (parent.type === "atrule" && UNSCOPED_AT_RULES.test((parent as AtRule).name)) return true
    parent = parent.parent as postcss.Container | undefined
  }
  return false
}

/** Rename keyframe identifiers inside `animation` / `animation-name` values. */
export function rewriteAnimationNames(value: string, renamed: Map<string, string>): string {
  return value.replace(
    /(?<![\w-])([A-Za-z_][\w-]*)(?![\w-(])/g,
    (match) => renamed.get(match) ?? match
  )
}

/** True when the stylesheet carries the owner attribute (quoted, or unquoted after minification). */
export function isScoped(css: string, owner: string, ownerAttribute = "data-mfe"): boolean {
  return (
    css.includes(`[${ownerAttribute}="${owner}"]`) ||
    css.includes(`[${ownerAttribute}=${owner}]`)
  )
}
