import { parse, type ParseResult } from "@babel/parser"
import traverseModule from "@babel/traverse"
import type { NodePath, TraverseOptions } from "@babel/traverse"
import * as t from "@babel/types"

/** `@babel/traverse` ships a CJS default export; interop differs between loaders. */
const traverse: typeof traverseModule = ((traverseModule as unknown as { default?: typeof traverseModule }).default ?? traverseModule) as typeof traverseModule

export type { NodePath }

export function parseSource(code: string, file: string): ParseResult<t.File> {
  return parse(code, {
    sourceType: "module",
    sourceFilename: file,
    plugins: ["typescript", "jsx", "decorators", "importAttributes"],
    errorRecovery: true,
    allowReturnOutsideFunction: true,
    allowUndeclaredExports: true,
  })
}

export function traverseAst(ast: t.Node, visitor: TraverseOptions): void {
  traverse(ast, visitor)
}

/** Strip TypeScript wrappers (`as`, `satisfies`, `!`, `<T>x`) and parentheses. */
export function unwrapExpression(node: t.Node | null | undefined): t.Node | null | undefined {
  let current = node
  for (;;) {
    if (!current) return current
    if (t.isTSAsExpression(current) || t.isTSSatisfiesExpression(current) || t.isTSNonNullExpression(current) || t.isTSTypeAssertion(current) || t.isParenthesizedExpression(current) || t.isTSInstantiationExpression(current)) {
      current = current.expression
      continue
    }
    return current
  }
}

export type Literal = string | number | boolean | null | Literal[] | { [key: string]: Literal }

export type LiteralResult = { ok: true; value: Literal } | { ok: false; reason: string }

export function propertyKeyName(property: t.ObjectProperty | t.ObjectMethod): string | undefined {
  if (property.computed) {
    const key = unwrapExpression(property.key)
    return t.isStringLiteral(key) ? key.value : undefined
  }
  if (t.isIdentifier(property.key)) return property.key.name
  if (t.isStringLiteral(property.key)) return property.key.value
  if (t.isNumericLiteral(property.key)) return String(property.key.value)
  return undefined
}

/**
 * Evaluate a JSON-like literal expression. Anything that needs runtime
 * evaluation (identifiers, calls, spreads, template expressions) fails softly
 * so callers can mark the value as dynamic instead of throwing on user code.
 */
export function literalValue(input: t.Node | null | undefined): LiteralResult {
  const node = unwrapExpression(input)
  if (!node) return { ok: false, reason: "missing" }
  if (t.isStringLiteral(node)) return { ok: true, value: node.value }
  if (t.isNumericLiteral(node)) return { ok: true, value: node.value }
  if (t.isBooleanLiteral(node)) return { ok: true, value: node.value }
  if (t.isNullLiteral(node)) return { ok: true, value: null }
  if (t.isTemplateLiteral(node) && node.expressions.length === 0) return { ok: true, value: node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join("") }
  if (t.isUnaryExpression(node) && (node.operator === "-" || node.operator === "+")) {
    const inner = literalValue(node.argument)
    if (inner.ok && typeof inner.value === "number") return { ok: true, value: node.operator === "-" ? -inner.value : inner.value }
    return { ok: false, reason: "non-numeric unary" }
  }
  if (t.isArrayExpression(node)) {
    const values: Literal[] = []
    for (const element of node.elements) {
      if (!element || t.isSpreadElement(element)) return { ok: false, reason: "array spread" }
      const value = literalValue(element)
      if (!value.ok) return value
      values.push(value.value)
    }
    return { ok: true, value: values }
  }
  if (t.isObjectExpression(node)) {
    const object: { [key: string]: Literal } = {}
    for (const property of node.properties) {
      if (!t.isObjectProperty(property)) return { ok: false, reason: t.isSpreadElement(property) ? "object spread" : "method" }
      const key = propertyKeyName(property)
      if (key === undefined) return { ok: false, reason: "computed key" }
      const value = literalValue(property.value)
      if (!value.ok) return value
      object[key] = value.value
    }
    return { ok: true, value: object }
  }
  return { ok: false, reason: node.type }
}

/** Object literal properties by name (non-computed keys only), unwrapped. */
export function objectProperties(node: t.Node | null | undefined): Map<string, t.ObjectProperty | t.ObjectMethod> {
  const map = new Map<string, t.ObjectProperty | t.ObjectMethod>()
  const object = unwrapExpression(node)
  if (!t.isObjectExpression(object)) return map
  for (const property of object.properties) {
    if (t.isObjectProperty(property) || t.isObjectMethod(property)) {
      const key = propertyKeyName(property)
      if (key !== undefined) map.set(key, property)
    }
  }
  return map
}

export function propertyValue(property: t.ObjectProperty | t.ObjectMethod | undefined): t.Node | undefined {
  if (!property) return undefined
  if (t.isObjectMethod(property)) return property
  return unwrapExpression(property.value) ?? undefined
}

export function isFunctionNode(node: t.Node | null | undefined): boolean {
  const value = unwrapExpression(node)
  return t.isFunction(value) || t.isObjectMethod(value)
}

export function stringLiteral(node: t.Node | null | undefined): string | undefined {
  const value = literalValue(node)
  return value.ok && typeof value.value === "string" ? value.value : undefined
}

export function stringArray(node: t.Node | null | undefined): string[] | undefined {
  const array = unwrapExpression(node)
  if (!t.isArrayExpression(array)) return undefined
  const values: string[] = []
  for (const element of array.elements) {
    const value = stringLiteral(element)
    if (value !== undefined) values.push(value)
  }
  return values
}

export function booleanLiteral(node: t.Node | null | undefined): boolean | undefined {
  const value = literalValue(node)
  return value.ok && typeof value.value === "boolean" ? value.value : undefined
}

export function numberLiteral(node: t.Node | null | undefined): number | undefined {
  const value = literalValue(node)
  return value.ok && typeof value.value === "number" ? value.value : undefined
}

/** The callee name of `name(...)` or `ns.name(...)`. */
export function calleeName(node: t.CallExpression): string | undefined {
  const callee = unwrapExpression(node.callee)
  if (t.isIdentifier(callee)) return callee.name
  if (t.isMemberExpression(callee) && !callee.computed && t.isIdentifier(callee.property)) return callee.property.name
  return undefined
}

export { t }
