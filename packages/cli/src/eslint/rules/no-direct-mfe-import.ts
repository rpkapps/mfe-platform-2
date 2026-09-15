import { dirname, resolve } from "node:path"

import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils"

import { matchesAny, normalizePath } from "../../glob"
import { createRule, filenameOf, projectRootOf, stringValue } from "../utils"

type Options = [{ allow?: string[] }]
type MessageIds = "mfePackage" | "federationAlias" | "outsideProject"

const MFE_PACKAGE_RE = /^@[^/]+\/mfe-/
const FEDERATION_ALIAS_RE = /^(remote|mfe_[a-z0-9_]+)\//

export default createRule<Options, MessageIds>({
  name: "no-direct-mfe-import",
  meta: {
    type: "problem",
    docs: { description: "MFEs never import other MFEs (packages named @scope/mfe-*, federation aliases, or sources outside the project); they compose through widgets, commands and navigation." },
    messages: {
      mfePackage: "Importing `{{source}}` couples this MFE to another one's source. Direct MFE-to-MFE imports are not supported: expose a widget (`createWidget`) or navigate to its routes (`useNavigation()`).",
      federationAlias: "`{{source}}` is a federation alias; remotes are loaded by the host, not imported. Use widgets and navigation to compose MFEs.",
      outsideProject: "`{{source}}` resolves outside this project ({{resolved}}). An MFE is built and deployed on its own; share code through a published package.",
    },
    schema: [
      {
        type: "object",
        properties: { allow: { type: "array", items: { type: "string" }, description: "Import specifiers (globs) that are allowed." } },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{ allow: [] }],
  create(context, [options]) {
    const filename = filenameOf(context)
    const root = projectRootOf(filename)
    const allow = options.allow ?? []
    const check = (node: TSESTree.Node, source: string | null) => {
      if (source === null) return
      if (allow.length && matchesAny(source, allow)) return
      if (MFE_PACKAGE_RE.test(source)) {
        context.report({ node, messageId: "mfePackage", data: { source } })
        return
      }
      if (FEDERATION_ALIAS_RE.test(source)) {
        context.report({ node, messageId: "federationAlias", data: { source } })
        return
      }
      if (root && source.startsWith(".")) {
        const resolved = normalizePath(resolve(dirname(filename), source))
        const rootPath = normalizePath(root)
        if (resolved !== rootPath && !resolved.startsWith(`${rootPath}/`)) {
          context.report({ node, messageId: "outsideProject", data: { source, resolved } })
        }
      }
    }
    return {
      ImportDeclaration(node) {
        check(node, String(node.source.value))
      },
      ImportExpression(node) {
        check(node, stringValue(node.source))
      },
      ExportAllDeclaration(node) {
        check(node, String(node.source.value))
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, String(node.source.value))
      },
      CallExpression(node) {
        if (node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === "require") check(node, stringValue(node.arguments[0]))
      },
    }
  },
})
