import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils"

import { asObject, collectPlatformImports, createRule, findProperty, hasSpread, jsxAttribute, jsxElementName, KEBAB_LOCAL_ID_RE, objectProperties, platformCalleeName, propertyKeyName, stringValue, unwrapExpression } from "../utils"

type MessageIds = "keyNotKebab" | "fieldsNotObject" | "missingDefaultValue" | "valueProperty" | "mfeManagedNeedsRoute" | "optionShape" | "schemaObjectLiteral" | "duplicateField" | "fieldNeedsKeyAndGroup"

export default createRule<[], MessageIds>({
  name: "valid-settings-definition",
  meta: {
    type: "problem",
    docs: { description: "Settings groups and fields passed to useRegisterSettingsGroup / SettingsRegistration / useRegisterSettingsField are well-formed." },
    messages: {
      keyNotKebab: 'Settings key "{{key}}" must be kebab-case (`display`, `asset-list`); the platform namespaces it as `<mfeId>:<key>`.',
      fieldsNotObject: "`fields` must be an object literal keyed by field key (`{ density: { defaultValue: … } }`); the framework infers labels and controls from it.",
      missingDefaultValue: 'Field "{{field}}" has no `defaultValue`. Every field needs one: the framework owns the current persisted value and resets to the default when stored data is invalid.',
      valueProperty: 'Field "{{field}}" declares `value`; the initial state is `defaultValue` and the persisted value is owned by the framework (renderers receive it through the controller).',
      mfeManagedNeedsRoute: '`managedBy: "mfe"` requires `route` (the MFE-relative route that renders the settings page).',
      optionShape: 'Option {{index}} of field "{{field}}" must be `{ value, label }` (plus optional description, disabled, keywords).',
      schemaObjectLiteral: 'Field "{{field}}" passes a plain object as `schema`; pass a Standard Schema instance (zod, valibot, arktype…) so values are validated on commit.',
      duplicateField: 'Field key "{{field}}" is declared twice in this group; keys must be unique within a group.',
      fieldNeedsKeyAndGroup: "`useRegisterSettingsField` needs `key` and `group` (the group key or definition it merges into).",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    let imports = new Map<string, string>()

    const checkField = (field: TSESTree.ObjectExpression, name: string, node: TSESTree.Node) => {
      const properties = objectProperties(field)
      const has = (key: string) => properties.some((property) => propertyKeyName(property) === key)
      if (!has("defaultValue") && !hasSpread(field)) context.report({ node, messageId: "missingDefaultValue", data: { field: name } })
      if (has("value")) context.report({ node: findProperty(field, "value")!, messageId: "valueProperty", data: { field: name } })
      const schema = findProperty(field, "schema")
      if (schema && asObject(schema.value)) context.report({ node: schema.value, messageId: "schemaObjectLiteral", data: { field: name } })
      const options = findProperty(field, "options")
      if (options) {
        const value = unwrapExpression(options.value)
        if (value.type === AST_NODE_TYPES.ArrayExpression) {
          value.elements.forEach((element, index) => {
            if (!element || element.type === AST_NODE_TYPES.SpreadElement) return
            const option = asObject(element)
            if (!option) {
              context.report({ node: element, messageId: "optionShape", data: { field: name, index: String(index) } })
              return
            }
            if (hasSpread(option)) return
            if (!findProperty(option, "value") || !findProperty(option, "label")) {
              context.report({ node: element, messageId: "optionShape", data: { field: name, index: String(index) } })
            }
          })
        }
      }
    }

    const checkGroup = (group: TSESTree.ObjectExpression) => {
      const key = findProperty(group, "key")
      if (key) {
        const value = stringValue(key.value)
        if (value !== null && !KEBAB_LOCAL_ID_RE.test(value)) context.report({ node: key.value, messageId: "keyNotKebab", data: { key: value } })
      }
      const managedBy = findProperty(group, "managedBy")
      if (managedBy && stringValue(managedBy.value) === "mfe" && !findProperty(group, "route")) {
        context.report({ node: managedBy, messageId: "mfeManagedNeedsRoute" })
      }
      const fields = findProperty(group, "fields")
      if (!fields) return
      const fieldsObject = asObject(fields.value)
      if (!fieldsObject) {
        const unwrapped = unwrapExpression(fields.value)
        if (unwrapped.type === AST_NODE_TYPES.ArrayExpression || unwrapped.type === AST_NODE_TYPES.Literal) context.report({ node: fields.value, messageId: "fieldsNotObject" })
        return
      }
      const seen = new Set<string>()
      for (const property of objectProperties(fieldsObject)) {
        const name = propertyKeyName(property) ?? "<computed>"
        if (seen.has(name)) context.report({ node: property, messageId: "duplicateField", data: { field: name } })
        seen.add(name)
        const field = asObject(property.value)
        if (field) checkField(field, name, property)
      }
    }

    const checkSingleField = (field: TSESTree.ObjectExpression, node: TSESTree.Node) => {
      if (hasSpread(field)) return
      const key = findProperty(field, "key")
      const group = findProperty(field, "group")
      if (!key || !group) context.report({ node, messageId: "fieldNeedsKeyAndGroup" })
      const keyValue = key ? stringValue(key.value) : null
      if (keyValue !== null && !KEBAB_LOCAL_ID_RE.test(keyValue)) context.report({ node: key!.value, messageId: "keyNotKebab", data: { key: keyValue } })
      const groupValue = group ? stringValue(group.value) : null
      if (groupValue !== null && !KEBAB_LOCAL_ID_RE.test(groupValue)) context.report({ node: group!.value, messageId: "keyNotKebab", data: { key: groupValue } })
      checkField(field, keyValue ?? "<field>", node)
    }

    return {
      Program(program) {
        imports = collectPlatformImports(program)
      },
      CallExpression(node) {
        const name = platformCalleeName(node.callee, imports)
        if (name === "useRegisterSettingsGroup") {
          const group = asObject(node.arguments[0])
          if (group) checkGroup(group)
        } else if (name === "useRegisterSettingsField") {
          const field = asObject(node.arguments[0])
          if (field) checkSingleField(field, node.arguments[0]!)
        }
      },
      JSXOpeningElement(node) {
        if (jsxElementName(node) !== "SettingsRegistration") return
        const definition = jsxAttribute(node, "definition")
        if (!definition?.value) return
        const group = asObject(definition.value)
        if (group) checkGroup(group)
      },
    }
  },
})
