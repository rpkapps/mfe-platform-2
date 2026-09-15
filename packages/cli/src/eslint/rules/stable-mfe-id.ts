import { MFE_ID_RE } from "@platform-internal/core"

import {
  asObject,
  collectPlatformImports,
  createRule,
  filenameOf,
  findProperty,
  platformCalleeName,
  projectRootOf,
  readIdentity,
  stringValue,
  unwrapExpression,
} from "../utils"
import { AST_NODE_TYPES } from "@typescript-eslint/utils"

type MessageIds = "nonLiteral" | "invalidId" | "identityMismatch"

export default createRule<[], MessageIds>({
  name: "stable-mfe-id",
  meta: {
    type: "problem",
    docs: {
      description:
        "`createMfe({ mfeId })` must be a stable kebab-case literal matching the persisted identity (.platform/identity.json).",
    },
    messages: {
      nonLiteral:
        "`mfeId` must be a string literal: it namespaces storage keys, commands and settings and is persisted in `.platform/identity.json`. Omit it (inferred from package.json and injected by @platform/vite) or write the literal.",
      invalidId:
        '`mfeId` "{{value}}" is not kebab-case (`asset-tracker`): lowercase letters, digits and single dashes, starting with a letter.',
      identityMismatch:
        '`mfeId` "{{value}}" differs from the persisted identity "{{persisted}}" in `.platform/identity.json`. The identity is stable on purpose (storage, settings and command namespaces depend on it); to rename, change `mfeId` in mfe.config.ts and update the identity file deliberately.',
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
        const name =
          platformCalleeName(node.callee, imports) ??
          (node.callee.type === AST_NODE_TYPES.Identifier ? node.callee.name : null)
        if (name !== "createMfe") return
        const object = asObject(node.arguments[0])
        if (!object) return
        const property = findProperty(object, "mfeId")
        if (!property) return
        const value = stringValue(property.value)
        if (value === null) {
          const unwrapped = unwrapExpression(property.value)
          if (
            unwrapped.type === AST_NODE_TYPES.Identifier &&
            unwrapped.name === "__PLATFORM_MFE_ID__"
          )
            return
          context.report({ node: property.value, messageId: "nonLiteral" })
          return
        }
        if (!MFE_ID_RE.test(value)) {
          context.report({ node: property.value, messageId: "invalidId", data: { value } })
          return
        }
        const root = projectRootOf(filenameOf(context))
        const identity = root ? readIdentity(root) : null
        if (identity && identity.mfeId !== value) {
          context.report({
            node: property.value,
            messageId: "identityMismatch",
            data: { value, persisted: identity.mfeId },
          })
        }
      },
    }
  },
})
