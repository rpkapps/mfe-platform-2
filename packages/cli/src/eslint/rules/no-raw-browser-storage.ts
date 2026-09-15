import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils"

import { matchesAny } from "../../glob"
import { createRule, filenameOf, globalIdentifierReferences } from "../utils"

const STORAGE_NAMES = new Set(["localStorage", "sessionStorage"])
const GLOBAL_OBJECTS = new Set(["window", "globalThis", "self", "top", "parent"])

type Options = [{ allow?: string[] }]
type MessageIds = "rawStorage" | "cookieWrite"

export default createRule<Options, MessageIds>({
  name: "no-raw-browser-storage",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow raw localStorage/sessionStorage/document.cookie access; use createPlatformStorage (namespaced, schema-backed, cross-tab aware).",
    },
    messages: {
      rawStorage: "Raw `{{name}}` access is outside the platform storage contract: keys are not namespaced by mfeId, not validated and not synchronised. Use `createPlatformStorage({ scope, key, schema, defaults })` from @platform/react.",
      cookieWrite: "Writing `document.cookie` from MFE code is not supported; platform-managed state goes through `createPlatformStorage` or the settings API.",
    },
    schema: [
      {
        type: "object",
        properties: { allow: { type: "array", items: { type: "string" }, description: "File globs where raw storage access is allowed (tests, adapters)." } },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{ allow: [] }],
  create(context, [options]) {
    const filename = filenameOf(context)
    if (options.allow && options.allow.length > 0 && matchesAny(filename, options.allow)) return {}
    const reported = new WeakSet<TSESTree.Node>()
    const report = (node: TSESTree.Node, name: string) => {
      if (reported.has(node)) return
      reported.add(node)
      context.report({ node, messageId: "rawStorage", data: { name } })
    }
    return {
      Program(program) {
        for (const identifier of globalIdentifierReferences(context, program, STORAGE_NAMES)) report(identifier, identifier.name)
      },
      MemberExpression(node) {
        if (node.computed || node.property.type !== AST_NODE_TYPES.Identifier) return
        if (!STORAGE_NAMES.has(node.property.name)) return
        const object = node.object
        if (object.type === AST_NODE_TYPES.Identifier && GLOBAL_OBJECTS.has(object.name)) {
          report(node, `${object.name}.${node.property.name}`)
        }
      },
      AssignmentExpression(node) {
        const left = node.left
        if (left.type !== AST_NODE_TYPES.MemberExpression || left.computed || left.property.type !== AST_NODE_TYPES.Identifier) return
        if (left.property.name !== "cookie") return
        const object = left.object
        const isDocument = (object.type === AST_NODE_TYPES.Identifier && object.name === "document") || (object.type === AST_NODE_TYPES.MemberExpression && !object.computed && object.property.type === AST_NODE_TYPES.Identifier && object.property.name === "document")
        if (isDocument) context.report({ node, messageId: "cookieWrite" })
      },
    }
  },
})
