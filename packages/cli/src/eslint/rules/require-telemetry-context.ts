import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils"

import {
  collectPlatformImports,
  createRule,
  memberChain,
  platformCalleeName,
  stringValue,
  unwrapExpression,
} from "../utils"

type MessageIds = "nonLiteralEvent" | "invalidEventName" | "missingBoundary" | "directTelemetry"

export const EVENT_NAME_RE = /^[a-z][a-z0-9]*([.:-][a-z0-9]+)*$/

function isTelemetryReceiver(
  callee: TSESTree.Expression
): { chain: string[]; receiver: string } | null {
  if (callee.type !== AST_NODE_TYPES.MemberExpression) return null
  const chain = memberChain(callee)
  if (!chain || chain.length < 2) return null
  const receiver = chain.slice(0, -1).join(".")
  return /telemetry/i.test(receiver) ? { chain, receiver } : null
}

function insideCatch(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node.parent
  while (current) {
    if (current.type === AST_NODE_TYPES.CatchClause) return true
    if (
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression
    )
      return false
    current = current.parent
  }
  return false
}

export default createRule<[], MessageIds>({
  name: "require-telemetry-context",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Telemetry events use literal, lowercase dotted names; errors reported from catch blocks carry a boundary; MFE code uses useTelemetry() instead of constructing telemetry.",
    },
    messages: {
      nonLiteralEvent:
        "`{{receiver}}.track()` event names must be string literals (`assets.export.started`) so they can be indexed and documented; build attributes, not names, dynamically.",
      invalidEventName:
        'Telemetry event name "{{name}}" must match `^[a-z][a-z0-9]*([.:-][a-z0-9]+)*$` (lowercase, dot/colon/dash separated).',
      missingBoundary:
        '`{{receiver}}.error(error)` inside a catch block has no context: pass attributes such as `{ boundary: "assets.load" }` so the failure is attributable.',
      directTelemetry:
        "MFE code must not construct telemetry (`createTelemetry`); use `useTelemetry()` (or `context.platform.telemetry` in loaders), which is already enriched with mfeId, instanceId, route and widget.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    let imports = new Map<string, string>()
    return {
      Program(program) {
        imports = collectPlatformImports(program)
      },
      CallExpression(node) {
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === "createTelemetry"
        ) {
          context.report({ node, messageId: "directTelemetry" })
          return
        }
        if (platformCalleeName(node.callee, imports) === "createTelemetry") {
          context.report({ node, messageId: "directTelemetry" })
          return
        }
        const telemetry = isTelemetryReceiver(node.callee)
        if (!telemetry) return
        const method = telemetry.chain[telemetry.chain.length - 1]
        if (method === "track") {
          const [event] = node.arguments
          if (!event) return
          const name = stringValue(event)
          if (name === null) {
            if (unwrapExpression(event).type !== AST_NODE_TYPES.SpreadElement)
              context.report({
                node: event,
                messageId: "nonLiteralEvent",
                data: { receiver: telemetry.receiver },
              })
          } else if (!EVENT_NAME_RE.test(name)) {
            context.report({ node: event, messageId: "invalidEventName", data: { name } })
          }
        } else if (method === "error") {
          if (node.arguments.length < 2 && insideCatch(node)) {
            context.report({
              node,
              messageId: "missingBoundary",
              data: { receiver: telemetry.receiver },
            })
          }
        }
      },
    }
  },
})
