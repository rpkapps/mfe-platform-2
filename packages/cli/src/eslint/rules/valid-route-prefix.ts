import { AST_NODE_TYPES } from "@typescript-eslint/utils"
import { isValidRoutePrefix } from "@platform-internal/core"

import {
  createRule,
  effectiveRoutePrefix,
  filenameOf,
  propertyKeyName,
  stringValue,
} from "../utils"

type MessageIds = "invalidPrefix" | "hardcodedPrefix"

export default createRule<[], MessageIds>({
  name: "valid-route-prefix",
  meta: {
    type: "problem",
    docs: {
      description:
        "`routePrefix` literals are valid and route files never hard-code the MFE's prefix (routes are prefix-relative).",
    },
    messages: {
      invalidPrefix:
        'routePrefix "{{value}}" is invalid: it starts with `/`, uses lowercase segments and has no trailing slash (`/asset-tracker`, `/reports/legacy`).',
      hardcodedPrefix:
        'Route path "{{path}}" hard-codes the MFE route prefix "{{prefix}}". Route files are prefix-relative: write `createFileRoute("{{relative}}")` and let the shell mount the MFE under its prefix (mfe.config.ts → routePrefix).',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const filename = filenameOf(context)
    const isRouteFile = /\/src\/routes\//.test(filename)
    const prefix = isRouteFile ? effectiveRoutePrefix(filename) : null
    return {
      Property(node) {
        if (propertyKeyName(node) !== "routePrefix") return
        const value = stringValue(node.value)
        if (value !== null && !isValidRoutePrefix(value))
          context.report({ node: node.value, messageId: "invalidPrefix", data: { value } })
      },
      CallExpression(node) {
        if (!prefix || prefix === "/") return
        if (
          node.callee.type !== AST_NODE_TYPES.Identifier ||
          node.callee.name !== "createFileRoute"
        )
          return
        const path = stringValue(node.arguments[0])
        if (path === null) return
        if (path === prefix || path.startsWith(`${prefix}/`)) {
          const relative = path === prefix ? "/" : path.slice(prefix.length)
          context.report({
            node: node.arguments[0]!,
            messageId: "hardcodedPrefix",
            data: { path, prefix, relative },
          })
        }
      },
    }
  },
})
