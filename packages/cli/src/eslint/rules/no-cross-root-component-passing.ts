import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils"

import { asObject, calleeName, collectPlatformImports, createRule, findProperty, jsxAttribute, jsxElementName, memberChain, objectProperties, platformCalleeName, propertyKeyName, unwrapExpression } from "../utils"

type MessageIds = "componentValue"

const TELEMETRY_METHODS = new Set(["track", "error", "span"])
const COMMAND_FUNCTION_KEYS = new Set(["handler", "availability"])

function describeValue(node: TSESTree.Node): string | null {
  const value = unwrapExpression(node)
  if (value.type === AST_NODE_TYPES.JSXElement || value.type === AST_NODE_TYPES.JSXFragment) return "a JSX element"
  if (value.type === AST_NODE_TYPES.CallExpression) {
    const chain = memberChain(value.callee)
    const name = chain ? chain[chain.length - 1] : null
    if (name === "createElement" || name === "cloneElement") return `a \`${chain!.join(".")}()\` element`
    return null
  }
  if (value.type === AST_NODE_TYPES.Identifier && /^[A-Z]/.test(value.name) && value.name !== value.name.toUpperCase()) return `the component \`${value.name}\``
  if (value.type === AST_NODE_TYPES.ArrowFunctionExpression || value.type === AST_NODE_TYPES.FunctionExpression) {
    const body = value.body
    if (body.type === AST_NODE_TYPES.JSXElement || body.type === AST_NODE_TYPES.JSXFragment) return "a function returning JSX"
    if (body.type === AST_NODE_TYPES.BlockStatement) {
      const returnsJsx = body.body.some((statement) => statement.type === AST_NODE_TYPES.ReturnStatement && statement.argument && (statement.argument.type === AST_NODE_TYPES.JSXElement || statement.argument.type === AST_NODE_TYPES.JSXFragment))
      if (returnsJsx) return "a function returning JSX"
    }
  }
  return null
}

export default createRule<[], MessageIds>({
  name: "no-cross-root-component-passing",
  meta: {
    type: "problem",
    docs: { description: "React elements and components never cross React roots: notifications, telemetry, storage defaults, command metadata and widget props carry plain data only." },
    messages: {
      componentValue: "`{{path}}` receives {{what}}. Every MFE and widget renders in its own React root; React elements, components, hooks and contexts cannot cross that boundary. Pass plain data (strings, numbers, ids) and let the receiving side render it.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    let imports = new Map<string, string>()
    const checkValue = (node: TSESTree.Node, path: string, seen = new Set<TSESTree.Node>()) => {
      if (seen.has(node)) return
      seen.add(node)
      const what = describeValue(node)
      if (what) {
        context.report({ node, messageId: "componentValue", data: { path, what } })
        return
      }
      const value = unwrapExpression(node)
      if (value.type === AST_NODE_TYPES.ObjectExpression) {
        for (const property of objectProperties(value)) checkValue(property.value, `${path}.${propertyKeyName(property) ?? "?"}`, seen)
      } else if (value.type === AST_NODE_TYPES.ArrayExpression) {
        value.elements.forEach((element, index) => {
          if (element && element.type !== AST_NODE_TYPES.SpreadElement) checkValue(element, `${path}[${index}]`, seen)
        })
      }
    }
    const checkObject = (node: TSESTree.Node | undefined, path: string, skipKeys: Set<string> = new Set()) => {
      const object = asObject(node)
      if (!object) return
      for (const property of objectProperties(object)) {
        const key = propertyKeyName(property)
        if (key === null || skipKeys.has(key)) continue
        checkValue(property.value, `${path}.${key}`)
      }
    }
    return {
      Program(program) {
        imports = collectPlatformImports(program)
      },
      CallExpression(node) {
        const platformName = platformCalleeName(node.callee, imports)
        if (platformName === "useRegisterCommand") {
          checkObject(node.arguments[0], "useRegisterCommand", COMMAND_FUNCTION_KEYS)
          return
        }
        if (platformName === "createPlatformStorage") {
          const object = asObject(node.arguments[0])
          const defaults = object ? findProperty(object, "defaults") : null
          if (defaults) checkValue(defaults.value, "createPlatformStorage.defaults")
          return
        }
        const name = calleeName(node.callee)
        if (name === "notify") {
          checkObject(node.arguments[0], "notify")
          return
        }
        if (name === "setProps") {
          checkObject(node.arguments[0], "setProps")
          return
        }
        if (name && TELEMETRY_METHODS.has(name) && node.callee.type === AST_NODE_TYPES.MemberExpression) {
          const chain = memberChain(node.callee)
          const receiver = chain ? chain.slice(0, -1).join(".") : ""
          if (/telemetry/i.test(receiver) || receiver.endsWith("useTelemetry()")) {
            node.arguments.forEach((argument, index) => {
              if (argument.type !== AST_NODE_TYPES.SpreadElement) checkValue(argument, `${receiver}.${name}(arg ${index})`)
            })
          }
        }
      },
      JSXOpeningElement(node) {
        const element = jsxElementName(node)
        if (element !== "WidgetSlot") return
        const props = jsxAttribute(node, "props")
        if (props?.value) checkObject(props.value, "WidgetSlot props")
      },
    }
  },
})
