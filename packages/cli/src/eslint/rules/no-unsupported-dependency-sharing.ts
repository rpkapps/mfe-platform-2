import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils"

import { isMfeConfigFile, SHARE_SCOPE_RE } from "../../mfe-config"
import {
  asObject,
  createRule,
  filenameOf,
  findProperty,
  objectProperties,
  projectRootOf,
  propertyKeyName,
  readPackageJson,
  stringValue,
  unwrapExpression,
} from "../utils"

type MessageIds = "notADependency" | "reactSingleton" | "invalidScope"

const VERSION_GROUP_PACKAGES = new Set(["react", "react-dom"])

export default createRule<[], MessageIds>({
  name: "no-unsupported-dependency-sharing",
  meta: {
    type: "problem",
    docs: {
      description:
        "`shared` entries in mfe.config.ts name real dependencies, never make React a singleton and use valid share scopes.",
    },
    messages: {
      notADependency:
        'shared.{{name}}: "{{name}}" is not a dependency of this project (package.json); shared entries are inferred from dependencies, add the package first.',
      reactSingleton:
        "shared.{{name}}: `{{name}}` is shared by version group (`react18`, `react19` share scopes), never as a singleton — a React 19 provider must not satisfy a React 18 remote.",
      invalidScope:
        'shared.{{name}}.scope "{{scope}}" is invalid: use `default` for framework-neutral packages or `react<major>` for React-bound packages.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const filename = filenameOf(context)
    if (!isMfeConfigFile(filename)) return {}
    const root = projectRootOf(filename)
    const pkg = root ? readPackageJson(root) : null
    const dependencies = pkg
      ? new Set([
          ...Object.keys((pkg.dependencies as Record<string, string>) ?? {}),
          ...Object.keys((pkg.peerDependencies as Record<string, string>) ?? {}),
          ...Object.keys((pkg.devDependencies as Record<string, string>) ?? {}),
        ])
      : null

    const checkShared = (shared: TSESTree.ObjectExpression) => {
      for (const property of objectProperties(shared)) {
        const name = propertyKeyName(property)
        if (name === null) continue
        if (dependencies && !dependencies.has(name))
          context.report({ node: property.key, messageId: "notADependency", data: { name } })
        const entry = asObject(property.value)
        if (!entry) continue
        const singleton = findProperty(entry, "singleton")
        if (singleton && VERSION_GROUP_PACKAGES.has(name)) {
          const value = unwrapExpression(singleton.value)
          if (value.type === AST_NODE_TYPES.Literal && value.value === true)
            context.report({ node: singleton, messageId: "reactSingleton", data: { name } })
        }
        const scope = findProperty(entry, "scope")
        const scopeValue = scope ? stringValue(scope.value) : null
        if (scopeValue !== null && !SHARE_SCOPE_RE.test(scopeValue))
          context.report({
            node: scope!.value,
            messageId: "invalidScope",
            data: { name, scope: scopeValue },
          })
      }
    }

    const checkConfig = (config: TSESTree.ObjectExpression) => {
      const shared = findProperty(config, "shared")
      const object = shared ? asObject(shared.value) : null
      if (object) checkShared(object)
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type !== AST_NODE_TYPES.Identifier ||
          node.callee.name !== "defineMfeConfig"
        )
          return
        const config = asObject(node.arguments[0])
        if (config) checkConfig(config)
      },
      ExportDefaultDeclaration(node) {
        const config = asObject(node.declaration as TSESTree.Node)
        if (config) checkConfig(config)
      },
    }
  },
})
