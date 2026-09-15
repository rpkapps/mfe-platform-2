import { AST_NODE_TYPES } from "@typescript-eslint/utils"

import { matchesAny } from "../../glob"
import { createRule, filenameOf, memberChain, stringValue } from "../utils"

type Options = [{ allow?: string[] }]
type MessageIds = "platformConfigGlobal" | "platformConfigFetch" | "viteEnv" | "processEnv"

const DEFAULT_ALLOW = ["**/vite.config.*", "**/mfe.config.*", "**/playwright.config.*", "**/vitest.config.*"]

export default createRule<Options, MessageIds>({
  name: "no-unsafe-runtime-env-access",
  meta: {
    type: "problem",
    docs: { description: "Runtime configuration is read through useRuntimeEnv() / context.platform.runtime, never from window.__PLATFORM_CONFIG__, /platform-config.json, import.meta.env or process.env." },
    messages: {
      platformConfigGlobal: "`__PLATFORM_CONFIG__` is the host's raw runtime configuration; MFEs receive only their own allow-listed `env` block through `useRuntimeEnv()` (or `usePlatform((p) => p.runtime)`).",
      platformConfigFetch: "Fetching `{{url}}` reads the whole runtime configuration; declare the keys you need in mfe.config.ts (`env`) and read them with `useRuntimeEnv()`.",
      viteEnv: "`import.meta.env.{{name}}` is baked in at build time; platform runtime values change per deployment without rebuilding. Declare the key in mfe.config.ts (`env`) and read `useRuntimeEnv()`.",
      processEnv: "`process.env.{{name}}` does not exist in the browser; declare the key in mfe.config.ts (`env`) and read `useRuntimeEnv()`.",
    },
    schema: [
      {
        type: "object",
        properties: { allow: { type: "array", items: { type: "string" }, description: "File globs exempt from the rule (build/config files are exempt by default)." } },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{ allow: [] }],
  create(context, [options]) {
    const filename = filenameOf(context)
    if (matchesAny(filename, [...DEFAULT_ALLOW, ...(options.allow ?? [])])) return {}
    return {
      Program(program) {
        for (const reference of context.sourceCode.getScope(program).through) {
          if (reference.identifier.name === "__PLATFORM_CONFIG__") context.report({ node: reference.identifier, messageId: "platformConfigGlobal" })
        }
      },
      MemberExpression(node) {
        const chain = memberChain(node)
        if (!chain) return
        const last = chain[chain.length - 1]!
        if (last === "__PLATFORM_CONFIG__" && chain.length === 2 && ["window", "globalThis", "self"].includes(chain[0]!)) {
          context.report({ node, messageId: "platformConfigGlobal" })
          return
        }
        if (chain.length === 3 && chain[0] === "import.meta" && chain[1] === "env" && /^VITE_PLATFORM_/.test(last)) {
          context.report({ node, messageId: "viteEnv", data: { name: last } })
          return
        }
        if (chain.length === 3 && chain[0] === "process" && chain[1] === "env" && /^PLATFORM_/.test(last)) {
          context.report({ node, messageId: "processEnv", data: { name: last } })
        }
      },
      CallExpression(node) {
        if (node.callee.type !== AST_NODE_TYPES.Identifier || node.callee.name !== "fetch") return
        const url = stringValue(node.arguments[0])
        if (url !== null && /(^|\/)platform-config\.json(\?|$)/.test(url)) context.report({ node, messageId: "platformConfigFetch", data: { url } })
      },
    }
  },
})
