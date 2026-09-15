import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils"
import {
  CAPABILITY_IDS,
  isCapabilityId,
  isSensitiveKey,
  isValidRoutePrefix,
  MFE_ID_RE,
} from "@platform-internal/core"

import {
  CSS_KEYS,
  ENV_DECLARATION_KEYS,
  isMfeConfigFile,
  MFE_CONFIG_KEYS,
  NAVIGATION_KEYS,
  SHARE_SCOPE_RE,
  SHARED_ENTRY_KEYS,
} from "../../mfe-config"
import {
  asObject,
  createRule,
  filenameOf,
  findProperty,
  objectProperties,
  propertyKeyName,
  stringValue,
  unwrapExpression,
} from "../utils"

type MessageIds =
  | "unknownKey"
  | "invalidRoutePrefix"
  | "invalidMfeId"
  | "discoverableNotBoolean"
  | "sensitiveEnvKey"
  | "envValueNotObject"
  | "sharedValue"
  | "sharedScope"
  | "unknownCapability"
  | "navigationTitle"

const KNOWN = new Set<string>(MFE_CONFIG_KEYS)

function isBooleanLiteral(node: TSESTree.Node): boolean {
  const unwrapped = unwrapExpression(node)
  return unwrapped.type === AST_NODE_TYPES.Literal && typeof unwrapped.value === "boolean"
}

export default createRule<[], MessageIds>({
  name: "valid-manifest-config",
  meta: {
    type: "problem",
    docs: {
      description:
        "`defineMfeConfig({...})` in mfe.config.ts uses known keys with valid values (routePrefix, mfeId, env, shared, capabilities, navigation).",
    },
    messages: {
      unknownKey: 'Unknown mfe.config key "{{key}}". Valid keys: {{valid}}.',
      invalidRoutePrefix:
        'routePrefix "{{value}}" is invalid: it starts with `/`, uses lowercase segments (`/asset-tracker`, `/reports/legacy`) and has no trailing slash.',
      invalidMfeId: 'mfeId "{{value}}" must be kebab-case, starting with a letter.',
      discoverableNotBoolean: "`discoverable` must be a boolean literal.",
      sensitiveEnvKey:
        'Runtime env key "{{key}}" looks sensitive ({{pattern}}). Runtime env values are public and shipped to the browser; the host entrypoint refuses such names.',
      envValueNotObject:
        "env.{{key}} must be a declaration object (`{ required?, description?, default? }`).",
      sharedValue:
        "shared.{{key}} must be a boolean or `{ version?, bundle?, singleton?, scope? }`.",
      sharedScope:
        'shared.{{key}}.scope "{{value}}" is invalid: share scopes are `default` or `react<major>` (`react18`, `react19`).',
      unknownCapability:
        'Unknown capability "{{id}}" in capabilities.{{list}}. Known: {{known}}.',
      navigationTitle: "navigation.title must be a string.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    if (!isMfeConfigFile(filenameOf(context))) return {}

    const checkObjectKeys = (
      object: TSESTree.ObjectExpression,
      valid: readonly string[],
      prefix: string
    ) => {
      for (const property of objectProperties(object)) {
        const key = propertyKeyName(property)
        if (key !== null && !valid.includes(key))
          context.report({
            node: property,
            messageId: "unknownKey",
            data: { key: `${prefix}${key}`, valid: valid.join(", ") },
          })
      }
    }

    const checkConfig = (config: TSESTree.ObjectExpression) => {
      for (const property of objectProperties(config)) {
        const key = propertyKeyName(property)
        if (key !== null && !KNOWN.has(key))
          context.report({
            node: property,
            messageId: "unknownKey",
            data: { key, valid: MFE_CONFIG_KEYS.join(", ") },
          })
      }
      const routePrefix = findProperty(config, "routePrefix")
      const routePrefixValue = routePrefix ? stringValue(routePrefix.value) : null
      if (routePrefixValue !== null && !isValidRoutePrefix(routePrefixValue))
        context.report({
          node: routePrefix!.value,
          messageId: "invalidRoutePrefix",
          data: { value: routePrefixValue },
        })
      const mfeId = findProperty(config, "mfeId")
      const mfeIdValue = mfeId ? stringValue(mfeId.value) : null
      if (mfeIdValue !== null && !MFE_ID_RE.test(mfeIdValue))
        context.report({
          node: mfeId!.value,
          messageId: "invalidMfeId",
          data: { value: mfeIdValue },
        })
      const discoverable = findProperty(config, "discoverable")
      if (
        discoverable &&
        unwrapExpression(discoverable.value).type === AST_NODE_TYPES.Literal &&
        !isBooleanLiteral(discoverable.value)
      )
        context.report({ node: discoverable.value, messageId: "discoverableNotBoolean" })

      const env = findProperty(config, "env")
      const envObject = env ? asObject(env.value) : null
      if (envObject) {
        for (const property of objectProperties(envObject)) {
          const key = propertyKeyName(property)
          if (key === null) continue
          if (isSensitiveKey(key))
            context.report({
              node: property,
              messageId: "sensitiveEnvKey",
              data: {
                key,
                pattern: "SECRET, PASSWORD, TOKEN, PRIVATE, CREDENTIAL, API_KEY, *_KEY",
              },
            })
          const declaration = asObject(property.value)
          if (!declaration) {
            if (
              unwrapExpression(property.value).type === AST_NODE_TYPES.Literal ||
              unwrapExpression(property.value).type === AST_NODE_TYPES.ArrayExpression
            )
              context.report({
                node: property.value,
                messageId: "envValueNotObject",
                data: { key },
              })
            continue
          }
          checkObjectKeys(declaration, ENV_DECLARATION_KEYS, `env.${key}.`)
        }
      }

      const shared = findProperty(config, "shared")
      const sharedObject = shared ? asObject(shared.value) : null
      if (sharedObject) {
        for (const property of objectProperties(sharedObject)) {
          const key = propertyKeyName(property)
          if (key === null) continue
          const entry = asObject(property.value)
          if (entry) {
            checkObjectKeys(entry, SHARED_ENTRY_KEYS, `shared.${key}.`)
            const scope = findProperty(entry, "scope")
            const scopeValue = scope ? stringValue(scope.value) : null
            if (scopeValue !== null && !SHARE_SCOPE_RE.test(scopeValue))
              context.report({
                node: scope!.value,
                messageId: "sharedScope",
                data: { key, value: scopeValue },
              })
          } else if (
            !isBooleanLiteral(property.value) &&
            unwrapExpression(property.value).type === AST_NODE_TYPES.Literal
          ) {
            context.report({ node: property.value, messageId: "sharedValue", data: { key } })
          } else if (unwrapExpression(property.value).type === AST_NODE_TYPES.ArrayExpression) {
            context.report({ node: property.value, messageId: "sharedValue", data: { key } })
          }
        }
      }

      const capabilities = findProperty(config, "capabilities")
      const capabilitiesObject = capabilities ? asObject(capabilities.value) : null
      if (capabilitiesObject) {
        checkObjectKeys(capabilitiesObject, ["add", "remove"], "capabilities.")
        for (const list of ["add", "remove"]) {
          const property = findProperty(capabilitiesObject, list)
          const array = property ? unwrapExpression(property.value) : null
          if (!array || array.type !== AST_NODE_TYPES.ArrayExpression) continue
          for (const element of array.elements) {
            const id = element ? stringValue(element) : null
            if (id !== null && !isCapabilityId(id))
              context.report({
                node: element!,
                messageId: "unknownCapability",
                data: { id, list, known: CAPABILITY_IDS.join(", ") },
              })
          }
        }
      }

      const navigation = findProperty(config, "navigation")
      const navigationObject = navigation ? asObject(navigation.value) : null
      if (navigationObject) {
        checkObjectKeys(navigationObject, NAVIGATION_KEYS, "navigation.")
        const title = findProperty(navigationObject, "title")
        if (
          title &&
          unwrapExpression(title.value).type === AST_NODE_TYPES.Literal &&
          stringValue(title.value) === null
        )
          context.report({ node: title.value, messageId: "navigationTitle" })
      }

      const css = findProperty(config, "css")
      const cssObject = css ? asObject(css.value) : null
      if (cssObject) checkObjectKeys(cssObject, CSS_KEYS, "css.")
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
