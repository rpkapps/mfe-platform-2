import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

import type { RouteMetadata } from "@platform-internal/core"

import {
  booleanLiteral,
  isFunctionNode,
  literalValue,
  numberLiteral,
  objectProperties,
  parseSource,
  propertyValue,
  stringArray,
  stringLiteral,
  t,
  traverseAst,
  unwrapExpression,
} from "./ast"

const ROUTE_FILE_RE = /\.(tsx|ts|jsx|js)$/
const TEST_FILE_RE = /\.(test|spec)\.[tj]sx?$/

/**
 * Route path of a file relative to the routes directory, following TanStack
 * Router's file conventions (flat `a.b.tsx` and directory `a/b.tsx` routes,
 * `index` and `route` tokens, `_pathless` layouts, `(groups)`, `$param`, `$`
 * splats, `[.]` escapes, `.lazy` companions). Returns `null` for files that
 * are not leaf routes (`__root`, pathless layouts, ignored `-` files).
 */
export function routePathFromFile(relativeFile: string): string | null {
  const normalized = relativeFile.replace(/\\/g, "/").replace(/^\.\//, "")
  if (!ROUTE_FILE_RE.test(normalized) || TEST_FILE_RE.test(normalized)) return null
  const withoutExtension = normalized.replace(ROUTE_FILE_RE, "").replace(/\.lazy$/, "")
  const directories = withoutExtension.split("/")
  const base = directories.pop() ?? ""
  if (base === "__root" || directories.some((directory) => directory === "__root")) return null
  if (base.startsWith("-") || directories.some((directory) => directory.startsWith("-")))
    return null
  const rawSegments = [...directories.flatMap(splitFlat), ...splitFlat(base)]
  const segments: string[] = []
  let lastKept = false
  for (const [index, raw] of rawSegments.entries()) {
    const isLast = index === rawSegments.length - 1
    const segment = raw.replace(/\[(.*?)\]/g, "$1")
    if (segment === "index" || segment === "route") {
      lastKept = true
      continue
    }
    if (segment.startsWith("(") && segment.endsWith(")")) {
      lastKept = false
      continue
    }
    if (segment.startsWith("_")) {
      lastKept = false
      continue
    }
    const trimmed = segment.endsWith("_") ? segment.slice(0, -1) : segment
    if (trimmed === "") {
      lastKept = false
      continue
    }
    segments.push(trimmed)
    if (isLast) lastKept = true
  }
  if (rawSegments.length > 0 && !lastKept) return null
  return segments.length === 0 ? "/" : `/${segments.join("/")}`
}

function splitFlat(part: string): string[] {
  const segments: string[] = []
  let current = ""
  let depth = 0
  for (const char of part) {
    if (char === "[") depth += 1
    if (char === "]") depth = Math.max(0, depth - 1)
    if (char === "." && depth === 0) {
      segments.push(current)
      current = ""
      continue
    }
    current += char
  }
  segments.push(current)
  return segments.filter((segment) => segment !== "")
}

/** Join a route prefix and a route path without duplicate slashes. */
export function joinRoutePath(prefix: string, path: string): string {
  const base = prefix === "/" ? "" : prefix.replace(/\/$/, "")
  const suffix = path === "/" ? "" : path
  const joined = `${base}${suffix}`
  return joined === "" ? "/" : joined
}

export interface RouteFileAnalysis {
  guarded: boolean
  breadcrumb?: RouteMetadata["breadcrumb"]
  navigation?: RouteMetadata["navigation"]
  permissionGroups?: string[]
  warnings: string[]
}

/**
 * Extract static route metadata from the `createFileRoute("/x")({ ... })`
 * options object: `beforeLoad` presence (guard), `staticData.breadcrumb`,
 * `staticData.navigation` and `staticData.permissionGroups`. Non-literal
 * values are reported as dynamic; user code is never a build failure here.
 */
export function analyzeRouteSource(code: string, file: string): RouteFileAnalysis {
  const analysis: RouteFileAnalysis = { guarded: false, warnings: [] }
  let ast
  try {
    ast = parseSource(code, file)
  } catch (error) {
    analysis.warnings.push(
      `${file}: could not parse route file (${error instanceof Error ? error.message : String(error)})`
    )
    return analysis
  }
  let options: t.ObjectExpression | undefined
  traverseAst(ast, {
    CallExpression(path) {
      if (options) return
      const callee = unwrapExpression(path.node.callee)
      if (!t.isCallExpression(callee)) return
      const inner = unwrapExpression(callee.callee)
      if (!t.isIdentifier(inner) || inner.name !== "createFileRoute") return
      const argument = unwrapExpression(path.node.arguments[0])
      if (t.isObjectExpression(argument)) options = argument
    },
  })
  if (!options) return analysis
  const properties = objectProperties(options)
  analysis.guarded = properties.has("beforeLoad")
  const staticData = propertyValue(properties.get("staticData"))
  if (!staticData) return analysis
  if (!t.isObjectExpression(staticData)) {
    analysis.warnings.push(
      `${file}: staticData is not an object literal; breadcrumb, navigation and permission groups are not inferred.`
    )
    return analysis
  }
  const data = objectProperties(staticData)
  const breadcrumb = propertyValue(data.get("breadcrumb"))
  if (breadcrumb) {
    const text = stringLiteral(breadcrumb)
    if (text !== undefined) analysis.breadcrumb = text
    else if (t.isObjectExpression(breadcrumb)) {
      const crumb = objectProperties(breadcrumb)
      const labelNode = propertyValue(crumb.get("label"))
      const label = stringLiteral(labelNode)
      const result: { label?: string; dynamic?: boolean; hidden?: boolean } = {}
      if (label !== undefined) result.label = label
      const dynamic = booleanLiteral(propertyValue(crumb.get("dynamic")))
      if (dynamic === true || (labelNode && label === undefined) || crumb.has("fromLoader"))
        result.dynamic = true
      const hidden = booleanLiteral(propertyValue(crumb.get("hidden")))
      if (hidden !== undefined) result.hidden = hidden
      analysis.breadcrumb = result
    } else if (isFunctionNode(breadcrumb)) analysis.breadcrumb = { dynamic: true }
    else {
      analysis.breadcrumb = { dynamic: true }
      analysis.warnings.push(
        `${file}: staticData.breadcrumb is not a literal; it is treated as dynamic.`
      )
    }
  }
  const navigation = propertyValue(data.get("navigation"))
  if (navigation) {
    const nav = objectProperties(navigation)
    const title = stringLiteral(propertyValue(nav.get("title")))
    if (title === undefined)
      analysis.warnings.push(
        `${file}: staticData.navigation needs a literal string title to be inferred.`
      )
    else {
      const entry: NonNullable<RouteMetadata["navigation"]> = { title }
      const description = stringLiteral(propertyValue(nav.get("description")))
      if (description !== undefined) entry.description = description
      const keywords = stringArray(propertyValue(nav.get("keywords")))
      if (keywords) entry.keywords = keywords
      const icon = stringLiteral(propertyValue(nav.get("icon")))
      if (icon !== undefined) entry.icon = icon
      const order = numberLiteral(propertyValue(nav.get("order")))
      if (order !== undefined) entry.order = order
      const hidden = booleanLiteral(propertyValue(nav.get("hidden")))
      if (hidden !== undefined) entry.hidden = hidden
      analysis.navigation = entry
    }
  }
  const groups = propertyValue(data.get("permissionGroups"))
  if (groups) {
    const list = literalValue(groups)
    if (list.ok && Array.isArray(list.value))
      analysis.permissionGroups = list.value.filter(
        (value): value is string => typeof value === "string"
      )
    else
      analysis.warnings.push(
        `${file}: staticData.permissionGroups is not an array of string literals; it is ignored.`
      )
  }
  return analysis
}

export interface RouteFileEntry {
  /** Absolute path. */
  file: string
  /** Relative to the routes directory, posix separators. */
  relative: string
  path: string
  lazy: boolean
}

/** Every leaf route file under `routesDirectory` with its derived path. */
export function listRouteFiles(routesDirectory: string): RouteFileEntry[] {
  if (!existsSync(routesDirectory) || !statSync(routesDirectory).isDirectory()) return []
  const entries: RouteFileEntry[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name)
      const stat = statSync(file)
      if (stat.isDirectory()) {
        if (!name.startsWith("-") && name !== "node_modules") walk(file)
        continue
      }
      const rel = relative(routesDirectory, file).replace(/\\/g, "/")
      const path = routePathFromFile(rel)
      if (path === null) continue
      entries.push({ file, relative: rel, path, lazy: /\.lazy\.[tj]sx?$/.test(rel) })
    }
  }
  walk(routesDirectory)
  return entries
}

export interface DeriveRoutesOptions {
  root: string
  routesDirectory: string
  routePrefix: string
}

export interface DerivedRoutes {
  routes: RouteMetadata[]
  warnings: string[]
  /** Whether the routes directory exists and contains at least one route file. */
  hasRoutes: boolean
}

/** Route metadata for the manifest: one entry per path, `.lazy` companions merged. */
export function deriveRoutes(options: DeriveRoutesOptions): DerivedRoutes {
  const files = listRouteFiles(options.routesDirectory)
  const byPath = new Map<string, RouteFileEntry[]>()
  for (const entry of files) {
    const list = byPath.get(entry.path) ?? []
    list.push(entry)
    byPath.set(entry.path, list)
  }
  const routes: RouteMetadata[] = []
  const warnings: string[] = []
  for (const [path, entries] of byPath) {
    const primary = entries.find((entry) => !entry.lazy) ?? entries[0]!
    const analysis = analyzeRouteSource(readFileSync(primary.file, "utf8"), primary.file)
    warnings.push(...analysis.warnings)
    const route: RouteMetadata = {
      path,
      fullPath: joinRoutePath(options.routePrefix, path),
      file: relative(options.root, primary.file).replace(/\\/g, "/"),
      guarded: analysis.guarded,
    }
    if (analysis.breadcrumb !== undefined) route.breadcrumb = analysis.breadcrumb
    if (analysis.navigation) route.navigation = analysis.navigation
    if (analysis.permissionGroups) route.permissionGroups = analysis.permissionGroups
    routes.push(route)
  }
  routes.sort((a, b) => a.path.localeCompare(b.path))
  return { routes, warnings, hasRoutes: files.length > 0 }
}
