import { AST_NODE_TYPES } from "@typescript-eslint/utils"
import { CAPABILITY_BY_API, CAPABILITY_IDS, isCapabilityId } from "@platform-internal/core"

import { collectPlatformImports, createRule, filenameOf, isPlatformSource, platformCalleeName, projectRootOf, readMfeConfig, stringValue } from "../utils"

type MessageIds = "removedCapability" | "unknownCapability"

export default createRule<[], MessageIds>({
  name: "valid-capability-usage",
  meta: {
    type: "problem",
    docs: { description: "SDK APIs that imply a capability are not used when mfe.config.ts removes it, and useCapability() names a known capability." },
    messages: {
      removedCapability: "`{{api}}` requires the `{{capability}}` capability, which mfe.config.ts removes (`capabilities.remove`). Remove it from the list or stop using the API; the host would not grant it.",
      unknownCapability: 'Unknown capability "{{id}}". Known capabilities: {{known}}.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const root = projectRootOf(filenameOf(context))
    const config = root ? readMfeConfig(root) : null
    const capabilities = (config?.config.capabilities ?? {}) as { remove?: unknown }
    const removed = new Set(Array.isArray(capabilities.remove) ? capabilities.remove.filter((entry): entry is string => typeof entry === "string") : [])
    let imports = new Map<string, string>()
    return {
      Program(program) {
        imports = collectPlatformImports(program)
      },
      ImportDeclaration(node) {
        if (removed.size === 0 || !isPlatformSource(String(node.source.value))) return
        for (const specifier of node.specifiers) {
          if (specifier.type !== AST_NODE_TYPES.ImportSpecifier) continue
          const imported = specifier.imported.type === AST_NODE_TYPES.Identifier ? specifier.imported.name : String(specifier.imported.value)
          const capability = CAPABILITY_BY_API[imported]
          if (capability && removed.has(capability)) {
            context.report({ node: specifier, messageId: "removedCapability", data: { api: imported, capability } })
          }
        }
      },
      CallExpression(node) {
        if (platformCalleeName(node.callee, imports) !== "useCapability") return
        const id = stringValue(node.arguments[0])
        if (id !== null && !isCapabilityId(id)) {
          context.report({ node: node.arguments[0]!, messageId: "unknownCapability", data: { id, known: CAPABILITY_IDS.join(", ") } })
        }
      },
    }
  },
})
