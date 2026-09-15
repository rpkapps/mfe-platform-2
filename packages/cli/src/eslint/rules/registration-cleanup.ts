import { AST_NODE_TYPES } from "@typescript-eslint/utils"

import {
  collectPlatformImports,
  createRule,
  enclosingFunctionName,
  IMPERATIVE_REGISTERS,
  isComponentOrHookName,
  memberChain,
  PLATFORM_HOOKS,
  platformCalleeName,
} from "../utils"

type MessageIds = "hookOutsideComponent" | "disposerDiscarded"

const HOOKS = new Set<string>(PLATFORM_HOOKS)
const REGISTERS = new Set<string>(IMPERATIVE_REGISTERS)

export default createRule<[], MessageIds>({
  name: "registration-cleanup",
  meta: {
    type: "problem",
    docs: {
      description:
        "Platform registrations are lifecycle-bound: hooks run inside components/hooks (automatic cleanup) and imperative register calls keep their disposer.",
    },
    messages: {
      hookOutsideComponent:
        "`{{name}}` registers with the shell for the lifetime of the calling component; called {{where}}, the registration is never cleaned up. Call it from a React component or a custom `use*` hook (or render `<{{component}} definition={…} />`).",
      disposerDiscarded:
        "`{{name}}` returns a disposer that must be kept and called on cleanup (e.g. returned from `useEffect`); discarding it leaks the registration when the MFE or widget unmounts. Prefer the `useRegister*` hook, which cleans up automatically.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    let imports = new Map<string, string>()
    const componentFor = (hook: string) => {
      const map: Record<string, string> = {
        useRegisterCommand: "CommandRegistration",
        useRegisterSettingsGroup: "SettingsRegistration",
        useRegisterSettingsField: "SettingsRegistration",
        useRegisterHelp: "HelpRegistration",
        useRegisterReleaseNotes: "ReleaseNotesRegistration",
      }
      return map[hook] ?? "CommandRegistration"
    }
    return {
      Program(program) {
        imports = collectPlatformImports(program)
      },
      CallExpression(node) {
        const name = platformCalleeName(node.callee, imports)
        if (name && HOOKS.has(name)) {
          const enclosing = enclosingFunctionName(node)
          if (!enclosing.found || !isComponentOrHookName(enclosing.name)) {
            const where = !enclosing.found
              ? "at module level"
              : enclosing.name
                ? `inside \`${enclosing.name}\``
                : "inside an anonymous function"
            context.report({
              node,
              messageId: "hookOutsideComponent",
              data: { name, where, component: componentFor(name) },
            })
          }
          return
        }
        const discarded =
          node.parent?.type === AST_NODE_TYPES.ExpressionStatement ||
          (node.parent?.type === AST_NODE_TYPES.AwaitExpression &&
            node.parent.parent?.type === AST_NODE_TYPES.ExpressionStatement)
        if (!discarded) return
        if (name && REGISTERS.has(name)) {
          context.report({ node, messageId: "disposerDiscarded", data: { name } })
          return
        }
        const chain = memberChain(node.callee)
        if (
          chain &&
          chain.length >= 3 &&
          chain[chain.length - 1] === "register" &&
          chain.includes("registries")
        ) {
          context.report({
            node,
            messageId: "disposerDiscarded",
            data: { name: chain.join(".") },
          })
        }
      },
    }
  },
})
