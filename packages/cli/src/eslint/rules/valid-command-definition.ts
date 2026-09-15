import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils"
import { normalizeShortcut } from "@platform-internal/core"

import {
  asObject,
  collectPlatformImports,
  createRule,
  effectiveMfeId,
  filenameOf,
  findProperty,
  hasSpread,
  jsxAttribute,
  jsxElementName,
  KEBAB_LOCAL_ID_RE,
  platformCalleeName,
  stringValue,
  unwrapExpression,
} from "../utils"

type MessageIds =
  | "idNotLocal"
  | "idNotKebab"
  | "labelEmpty"
  | "shortcutInvalid"
  | "shortcutDuplicateModifier"
  | "handlerOrRoute"
  | "keywordsNotStrings"

export default createRule<[], MessageIds>({
  name: "valid-command-definition",
  meta: {
    type: "problem",
    docs: {
      description:
        "Commands passed to useRegisterCommand / CommandRegistration have a local kebab-case id, a label, a valid shortcut and a handler or route.",
    },
    messages: {
      idNotLocal:
        'Command id "{{id}}" must be local: no `:` or `@` and no mfeId prefix. The platform qualifies it as `<mfeId>:<id>` (and `@<instanceId>` for widgets).',
      idNotKebab: 'Command id "{{id}}" must be kebab-case (`open-asset`, `export.csv`).',
      labelEmpty:
        "Command `label` must be a non-empty string; the palette shows it and searches it.",
      shortcutInvalid:
        'Shortcut "{{shortcut}}" is malformed. Use modifiers from mod, ctrl, alt, shift, meta joined by `+` and exactly one key (`mod+shift+k`, `alt+p`).',
      shortcutDuplicateModifier: 'Shortcut "{{shortcut}}" repeats the modifier "{{modifier}}".',
      handlerOrRoute:
        "A command needs a `handler` (sync or async, receives `{ signal, source, platform }`) or a `route` to navigate to.",
      keywordsNotStrings:
        "`keywords` must be an array of string literals (they feed the palette search index).",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    let imports = new Map<string, string>()
    const mfeId = effectiveMfeId(filenameOf(context))

    const checkCommand = (command: TSESTree.ObjectExpression) => {
      const spread = hasSpread(command)
      const id = findProperty(command, "id")
      const idValue = id ? stringValue(id.value) : null
      if (idValue !== null) {
        if (
          idValue.includes(":") ||
          idValue.includes("@") ||
          (mfeId !== null && idValue.startsWith(`${mfeId}:`))
        ) {
          context.report({ node: id!.value, messageId: "idNotLocal", data: { id: idValue } })
        } else if (!KEBAB_LOCAL_ID_RE.test(idValue)) {
          context.report({ node: id!.value, messageId: "idNotKebab", data: { id: idValue } })
        }
      }
      const label = findProperty(command, "label")
      if (label) {
        const value = stringValue(label.value)
        if (value !== null && value.trim() === "")
          context.report({ node: label.value, messageId: "labelEmpty" })
      } else if (!spread) {
        context.report({ node: command, messageId: "labelEmpty" })
      }
      const shortcut = findProperty(command, "shortcut")
      const shortcutValue = shortcut ? stringValue(shortcut.value) : null
      if (shortcutValue !== null) {
        const parts = shortcutValue
          .toLowerCase()
          .split("+")
          .map((part) => part.trim())
        const modifiers = parts.slice(0, -1)
        const duplicate = modifiers.find(
          (modifier, index) => modifiers.indexOf(modifier) !== index
        )
        if (duplicate)
          context.report({
            node: shortcut!.value,
            messageId: "shortcutDuplicateModifier",
            data: { shortcut: shortcutValue, modifier: duplicate },
          })
        else if (
          normalizeShortcut(shortcutValue) === null ||
          !/^[a-z0-9]$|^(f\d{1,2}|enter|escape|space|tab|backspace|delete|arrowup|arrowdown|arrowleft|arrowright|home|end|pageup|pagedown|[`\-=[\]\\;',./])$/.test(
            parts[parts.length - 1]!
          )
        ) {
          context.report({
            node: shortcut!.value,
            messageId: "shortcutInvalid",
            data: { shortcut: shortcutValue },
          })
        }
      }
      if (!spread && !findProperty(command, "handler") && !findProperty(command, "route")) {
        context.report({ node: command, messageId: "handlerOrRoute" })
      }
      const keywords = findProperty(command, "keywords")
      if (keywords) {
        const value = unwrapExpression(keywords.value)
        if (
          value.type === AST_NODE_TYPES.ArrayExpression &&
          value.elements.some(
            (element) =>
              element &&
              element.type !== AST_NODE_TYPES.SpreadElement &&
              stringValue(element) === null &&
              element.type !== AST_NODE_TYPES.Identifier
          )
        ) {
          context.report({ node: keywords.value, messageId: "keywordsNotStrings" })
        }
      }
    }

    return {
      Program(program) {
        imports = collectPlatformImports(program)
      },
      CallExpression(node) {
        if (platformCalleeName(node.callee, imports) !== "useRegisterCommand") return
        const command = asObject(node.arguments[0])
        if (command) checkCommand(command)
      },
      JSXOpeningElement(node) {
        if (jsxElementName(node) !== "CommandRegistration") return
        const definition = jsxAttribute(node, "definition")
        if (!definition?.value) return
        const command = asObject(definition.value)
        if (command) checkCommand(command)
      },
    }
  },
})
