import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"

import { AST_NODE_TYPES, ESLintUtils, type TSESLint, type TSESTree } from "@typescript-eslint/utils"
import { DOCS_BASE_URL } from "@platform-internal/core"

import { readStaticMfeConfig, type StaticMfeConfig } from "../mfe-config"
import { normalizePath } from "../glob"

export const LINT_DOCS_URL = `${DOCS_BASE_URL}/linting`

/** Every rule documents itself at `https://platform.docs.local/docs/linting#<rule-name>`. */
export const createRule = ESLintUtils.RuleCreator((name) => `${LINT_DOCS_URL}#${name}`)

export const PLATFORM_PACKAGES = ["@platform/react", "@platform/react/tecton", "@platform/react/testing"]

export function isPlatformSource(source: string): boolean {
  return source === "@platform/react" || source.startsWith("@platform/react/")
}

// ---------------------------------------------------------------------------
// Project lookups (cached per directory; rules run on many files)
// ---------------------------------------------------------------------------

const rootCache = new Map<string, string | null>()

/** Closest directory with a package.json above the linted file (null for virtual files). */
export function projectRootOf(filename: string): string | null {
  if (!filename || filename === "<input>" || filename === "<text>") return null
  const start = dirname(filename)
  if (rootCache.has(start)) return rootCache.get(start)!
  let current = start
  let found: string | null = null
  for (;;) {
    if (existsSync(join(current, "package.json"))) {
      found = current
      break
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  rootCache.set(start, found)
  return found
}

interface CachedJson<T> {
  mtime: number
  value: T | null
}

const identityCache = new Map<string, CachedJson<{ mfeId: string }>>()
const packageCache = new Map<string, CachedJson<Record<string, unknown>>>()

function mtimeOf(file: string): number {
  try {
    return statSync(file).mtimeMs
  } catch {
    return -1
  }
}

function readCachedJson<T>(cache: Map<string, CachedJson<T>>, file: string): T | null {
  const mtime = mtimeOf(file)
  const cached = cache.get(file)
  if (cached && cached.mtime === mtime) return cached.value
  let value: T | null = null
  if (mtime !== -1) {
    try {
      value = JSON.parse(readFileSync(file, "utf8")) as T
    } catch {
      value = null
    }
  }
  cache.set(file, { mtime, value })
  return value
}

export function readIdentity(projectRoot: string): { mfeId: string } | null {
  const identity = readCachedJson<{ mfeId?: unknown }>(identityCache, join(projectRoot, ".platform", "identity.json"))
  return identity && typeof identity.mfeId === "string" ? { mfeId: identity.mfeId } : null
}

export function readPackageJson(projectRoot: string): Record<string, unknown> | null {
  return readCachedJson<Record<string, unknown>>(packageCache, join(projectRoot, "package.json"))
}

export function readMfeConfig(projectRoot: string): StaticMfeConfig | null {
  try {
    return readStaticMfeConfig(projectRoot)
  } catch {
    return null
  }
}

/** Effective mfeId for a linted file: identity file → mfe.config → package name (null when unknown). */
export function effectiveMfeId(filename: string): string | null {
  const root = projectRootOf(filename)
  if (!root) return null
  const identity = readIdentity(root)
  if (identity) return identity.mfeId
  const config = readMfeConfig(root)
  if (config && typeof config.config.mfeId === "string") return config.config.mfeId
  const pkg = readPackageJson(root)
  const name = pkg && typeof pkg.name === "string" ? pkg.name : null
  if (!name) return null
  const base = name.includes("/") ? name.slice(name.lastIndexOf("/") + 1) : name
  return base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || null
}

/** Effective route prefix for a linted file (`routePrefix` from mfe.config or `/${mfeId}`). */
export function effectiveRoutePrefix(filename: string): string | null {
  const root = projectRootOf(filename)
  if (!root) return null
  const config = readMfeConfig(root)
  if (config && typeof config.config.routePrefix === "string") return config.config.routePrefix
  const mfeId = effectiveMfeId(filename)
  return mfeId ? `/${mfeId}` : null
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

export function propertyKeyName(property: TSESTree.Property | TSESTree.JSXAttribute): string | null {
  if (property.type === AST_NODE_TYPES.JSXAttribute) return property.name.type === AST_NODE_TYPES.JSXIdentifier ? property.name.name : null
  if (property.computed) {
    return property.key.type === AST_NODE_TYPES.Literal && typeof property.key.value === "string" ? property.key.value : null
  }
  if (property.key.type === AST_NODE_TYPES.Identifier) return property.key.name
  if (property.key.type === AST_NODE_TYPES.Literal) return String(property.key.value)
  return null
}

export function findProperty(object: TSESTree.ObjectExpression, name: string): TSESTree.Property | null {
  for (const property of object.properties) {
    if (property.type === AST_NODE_TYPES.Property && propertyKeyName(property) === name) return property
  }
  return null
}

export function objectProperties(object: TSESTree.ObjectExpression): TSESTree.Property[] {
  return object.properties.filter((property): property is TSESTree.Property => property.type === AST_NODE_TYPES.Property)
}

export function hasSpread(object: TSESTree.ObjectExpression): boolean {
  return object.properties.some((property) => property.type === AST_NODE_TYPES.SpreadElement)
}

/** String value of a literal / expression-free template literal, else null. */
export function stringValue(node: TSESTree.Node | null | undefined): string | null {
  if (!node) return null
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === "string") return node.value
  if (node.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? null
  if (node.type === AST_NODE_TYPES.TSAsExpression || node.type === AST_NODE_TYPES.TSSatisfiesExpression || node.type === AST_NODE_TYPES.TSNonNullExpression) return stringValue(node.expression)
  if (node.type === AST_NODE_TYPES.JSXExpressionContainer) return stringValue(node.expression as TSESTree.Node)
  return null
}

export function unwrapExpression(node: TSESTree.Node): TSESTree.Node {
  let current = node
  for (;;) {
    if (current.type === AST_NODE_TYPES.TSAsExpression || current.type === AST_NODE_TYPES.TSSatisfiesExpression || current.type === AST_NODE_TYPES.TSNonNullExpression || current.type === AST_NODE_TYPES.TSTypeAssertion) {
      current = current.expression
    } else if (current.type === AST_NODE_TYPES.JSXExpressionContainer && current.expression.type !== AST_NODE_TYPES.JSXEmptyExpression) {
      current = current.expression
    } else {
      return current
    }
  }
}

export function asObject(node: TSESTree.Node | null | undefined): TSESTree.ObjectExpression | null {
  if (!node) return null
  const unwrapped = unwrapExpression(node)
  return unwrapped.type === AST_NODE_TYPES.ObjectExpression ? unwrapped : null
}

export function isFunctionNode(node: TSESTree.Node): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration {
  return node.type === AST_NODE_TYPES.ArrowFunctionExpression || node.type === AST_NODE_TYPES.FunctionExpression || node.type === AST_NODE_TYPES.FunctionDeclaration
}

export function calleeName(callee: TSESTree.Expression): string | null {
  if (callee.type === AST_NODE_TYPES.Identifier) return callee.name
  if (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed && callee.property.type === AST_NODE_TYPES.Identifier) return callee.property.name
  return null
}

/** `a.b.c` → ["a", "b", "c"] (null when a segment is computed / not an identifier). */
export function memberChain(node: TSESTree.Node): string[] | null {
  const parts: string[] = []
  let current: TSESTree.Node = node
  for (;;) {
    if (current.type === AST_NODE_TYPES.MemberExpression) {
      if (current.computed || current.property.type !== AST_NODE_TYPES.Identifier) return null
      parts.unshift(current.property.name)
      current = current.object
    } else if (current.type === AST_NODE_TYPES.Identifier) {
      parts.unshift(current.name)
      return parts
    } else if (current.type === AST_NODE_TYPES.ThisExpression) {
      parts.unshift("this")
      return parts
    } else if (current.type === AST_NODE_TYPES.MetaProperty) {
      parts.unshift(`${current.meta.name}.${current.property.name}`)
      return parts
    } else if (current.type === AST_NODE_TYPES.CallExpression) {
      const inner = memberChain(current.callee)
      if (!inner) return null
      parts.unshift(`${inner.join(".")}()`)
      return parts
    } else if (current.type === AST_NODE_TYPES.TSNonNullExpression || current.type === AST_NODE_TYPES.TSAsExpression || current.type === AST_NODE_TYPES.ChainExpression) {
      current = current.expression
    } else {
      return null
    }
  }
}

/** Name of the function a node lives in, React style: `function Foo`, `const useX = () =>`, `memo(function Bar…)`. */
export function enclosingFunctionName(node: TSESTree.Node): { found: boolean; name: string | null; node: TSESTree.Node | null } {
  let current: TSESTree.Node | undefined = node.parent
  while (current) {
    if (isFunctionNode(current)) {
      const named = functionName(current)
      return { found: true, name: named, node: current }
    }
    current = current.parent
  }
  return { found: false, name: null, node: null }
}

export function functionName(fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration): string | null {
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration && fn.id) return fn.id.name
  if (fn.type === AST_NODE_TYPES.FunctionExpression && fn.id) return fn.id.name
  let parent: TSESTree.Node | undefined = fn.parent
  // memo(() => …), forwardRef(function …)
  while (parent && parent.type === AST_NODE_TYPES.CallExpression) parent = parent.parent
  if (!parent) return null
  if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.id.type === AST_NODE_TYPES.Identifier) return parent.id.name
  if (parent.type === AST_NODE_TYPES.Property && !parent.computed) return propertyKeyName(parent)
  if (parent.type === AST_NODE_TYPES.MethodDefinition && parent.key.type === AST_NODE_TYPES.Identifier) return parent.key.name
  if (parent.type === AST_NODE_TYPES.AssignmentExpression && parent.left.type === AST_NODE_TYPES.Identifier) return parent.left.name
  if (parent.type === AST_NODE_TYPES.ExportDefaultDeclaration) return "default"
  return null
}

export function isComponentOrHookName(name: string | null): boolean {
  if (name === null) return false
  if (name === "default") return true
  return /^use[A-Z0-9_]/.test(name) || /^[A-Z]/.test(name)
}

/** Track which local identifiers were imported from `@platform/react` (and what they were called there). */
export function collectPlatformImports(program: TSESTree.Program): Map<string, string> {
  const imports = new Map<string, string>()
  for (const statement of program.body) {
    if (statement.type !== AST_NODE_TYPES.ImportDeclaration) continue
    if (!isPlatformSource(String(statement.source.value))) continue
    for (const specifier of statement.specifiers) {
      if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
        const imported = specifier.imported.type === AST_NODE_TYPES.Identifier ? specifier.imported.name : String(specifier.imported.value)
        imports.set(specifier.local.name, imported)
      } else if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
        imports.set(specifier.local.name, "*")
      }
    }
  }
  return imports
}

/** Resolve a callee to its `@platform/react` export name (`useRegisterCommand`, or `platform.useRegisterCommand`). */
export function platformCalleeName(callee: TSESTree.Expression, imports: Map<string, string>): string | null {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    const imported = imports.get(callee.name)
    return imported && imported !== "*" ? imported : null
  }
  if (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed && callee.object.type === AST_NODE_TYPES.Identifier && callee.property.type === AST_NODE_TYPES.Identifier) {
    return imports.get(callee.object.name) === "*" ? callee.property.name : null
  }
  return null
}

export function jsxElementName(node: TSESTree.JSXOpeningElement): string | null {
  if (node.name.type === AST_NODE_TYPES.JSXIdentifier) return node.name.name
  if (node.name.type === AST_NODE_TYPES.JSXMemberExpression && node.name.property.type === AST_NODE_TYPES.JSXIdentifier) return node.name.property.name
  return null
}

export function jsxAttribute(node: TSESTree.JSXOpeningElement, name: string): TSESTree.JSXAttribute | null {
  for (const attribute of node.attributes) {
    if (attribute.type === AST_NODE_TYPES.JSXAttribute && propertyKeyName(attribute) === name) return attribute
  }
  return null
}

export function filenameOf(context: Readonly<TSESLint.RuleContext<string, unknown[]>>): string {
  return normalizePath(context.filename)
}

export function baseName(filename: string): string {
  const normalised = normalizePath(filename)
  return normalised.slice(normalised.lastIndexOf("/") + 1)
}

export const PLATFORM_HOOKS = [
  "usePlatform",
  "useNavigation",
  "useCapability",
  "usePermissions",
  "useTelemetry",
  "useRuntimeEnv",
  "useNotifications",
  "useMfeInstance",
  "useRegisterCommand",
  "useRegisterSettingsGroup",
  "useRegisterSettingsField",
  "useRegisterHelp",
  "useRegisterReleaseNotes",
  "useBreadcrumb",
  "usePlatformStorage",
] as const

export const IMPERATIVE_REGISTERS = ["registerCommand", "registerSettingsGroup", "registerSettingsField", "registerHelp", "registerReleaseNotes", "registerBreadcrumb"] as const

export const KEBAB_LOCAL_ID_RE = /^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/

/**
 * Identifier references to global names (unresolved references plus references to
 * globals declared through `languageOptions.globals`, which ESLint resolves).
 */
export function globalIdentifierReferences(context: Readonly<TSESLint.RuleContext<string, unknown[]>>, program: TSESTree.Program, names: ReadonlySet<string>): TSESTree.Identifier[] {
  let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(program)
  while (scope && scope.type !== "global" && scope.upper) scope = scope.upper
  if (!scope) return []
  const found: TSESTree.Identifier[] = []
  for (const reference of scope.through) {
    if (names.has(reference.identifier.name)) found.push(reference.identifier as TSESTree.Identifier)
  }
  for (const variable of scope.variables) {
    if (!names.has(variable.name) || variable.defs.length > 0) continue
    for (const reference of variable.references) found.push(reference.identifier as TSESTree.Identifier)
  }
  return found
}
