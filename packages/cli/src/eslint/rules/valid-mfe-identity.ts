import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils"

import { asObject, collectPlatformImports, createRule, filenameOf, findProperty, KEBAB_LOCAL_ID_RE, objectProperties, platformCalleeName, propertyKeyName, unwrapExpression } from "../utils"

type MessageIds = "multipleCreateMfe" | "defaultExport" | "widgetKey"

export default createRule<[], MessageIds>({
  name: "valid-mfe-identity",
  meta: {
    type: "problem",
    docs: { description: "One createMfe() per module, default-exported from src/mfe.tsx, with kebab-case widget keys." },
    messages: {
      multipleCreateMfe: "`createMfe()` is called more than once in this file; an MFE has exactly one definition (src/mfe.tsx). Widgets belong in `createMfe({ widgets })`, not in separate definitions.",
      defaultExport: "`src/mfe.tsx` must default-export the `createMfe({...})` call (directly, or a binding holding it): the generated entry imports the default export as the remote definition.",
      widgetKey: 'Widget key "{{key}}" must be kebab-case (`asset-card`): it becomes the widget id in the manifest and in `WidgetSlot` references.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const filename = filenameOf(context)
    const isBootstrap = /\/src\/mfe\.tsx?$/.test(filename)
    let imports = new Map<string, string>()
    let createMfeCalls = 0
    const createMfeBindings = new Set<string>()
    let defaultExport: TSESTree.ExportDefaultDeclaration | null = null

    const isCreateMfeCall = (node: TSESTree.Node, depth = 0): boolean => {
      const value = unwrapExpression(node)
      if (value.type === AST_NODE_TYPES.CallExpression) {
        const callee = value.callee
        if (callee.type === AST_NODE_TYPES.Identifier && (callee.name === "createMfe" || imports.get(callee.name) === "createMfe")) return true
        if (callee.type === AST_NODE_TYPES.MemberExpression && callee.property.type === AST_NODE_TYPES.Identifier && callee.property.name === "createMfe") return true
        if (depth < 3 && value.arguments.some((argument) => argument.type !== AST_NODE_TYPES.SpreadElement && isCreateMfeCall(argument, depth + 1))) return true
        if (depth < 3 && callee.type === AST_NODE_TYPES.MemberExpression && isCreateMfeCall(callee.object, depth + 1)) return true
      }
      if (value.type === AST_NODE_TYPES.Identifier) return createMfeBindings.has(value.name)
      return false
    }

    return {
      Program(program) {
        imports = collectPlatformImports(program)
      },
      VariableDeclarator(node) {
        if (node.id.type === AST_NODE_TYPES.Identifier && node.init && isCreateMfeCall(node.init)) createMfeBindings.add(node.id.name)
      },
      CallExpression(node) {
        const name = platformCalleeName(node.callee, imports) ?? (node.callee.type === AST_NODE_TYPES.Identifier ? node.callee.name : null)
        if (name !== "createMfe") return
        createMfeCalls += 1
        if (createMfeCalls > 1) context.report({ node, messageId: "multipleCreateMfe" })
        const options = asObject(node.arguments[0])
        const widgets = options ? findProperty(options, "widgets") : null
        const widgetsObject = widgets ? asObject(widgets.value) : null
        if (widgetsObject) {
          for (const property of objectProperties(widgetsObject)) {
            const key = propertyKeyName(property)
            if (key !== null && !KEBAB_LOCAL_ID_RE.test(key)) context.report({ node: property.key, messageId: "widgetKey", data: { key } })
          }
        }
      },
      ExportDefaultDeclaration(node) {
        defaultExport = node
      },
      "Program:exit"() {
        if (!isBootstrap) return
        if (!defaultExport) {
          context.report({ node: context.sourceCode.ast, messageId: "defaultExport" })
          return
        }
        const declaration = defaultExport.declaration as TSESTree.Node
        if (!isCreateMfeCall(declaration)) context.report({ node: defaultExport, messageId: "defaultExport" })
      },
    }
  },
})
