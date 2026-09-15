import rule from "../../src/eslint/rules/valid-command-definition"
import { ruleTester, validFile } from "./rule-tester"

const imports = 'import { useRegisterCommand, CommandRegistration } from "@platform/react"\n'

ruleTester.run("valid-command-definition", rule, {
  valid: [
    `${imports}useRegisterCommand({ id: "say-hello", label: "Say hello", shortcut: "mod+shift+h", keywords: ["hi", "hello"], handler: () => {} })`,
    `${imports}useRegisterCommand({ id: "go-to-assets", label: "Assets", route: "/assets" })`,
    `${imports}useRegisterCommand({ id: "export.csv", label: "Export", shortcut: "Ctrl+Alt+E", handler })`,
    `${imports}useRegisterCommand({ id: "next", label: "Next", shortcut: "arrowright", handler })`,
    `${imports}useRegisterCommand({ ...base, id: "x" })`,
    `${imports}useRegisterCommand({ id: "x", label: t("label"), keywords: KEYWORDS, handler })`,
    { code: `${imports}const el = <CommandRegistration definition={{ id: "open", label: "Open", handler: () => {} }} />`, filename: "/project/src/a.tsx" },
  ],
  invalid: [
    { code: `${imports}useRegisterCommand({ id: "asset-tracker:open", label: "Open", handler })`, errors: [{ messageId: "idNotLocal", data: { id: "asset-tracker:open" } }] },
    { code: `${imports}useRegisterCommand({ id: "open@1", label: "Open", handler })`, errors: [{ messageId: "idNotLocal" }] },
    { code: `${imports}useRegisterCommand({ id: "valid-mfe:open", label: "Open", handler })`, filename: validFile("src", "routes", "index.tsx"), errors: [{ messageId: "idNotLocal" }] },
    { code: `${imports}useRegisterCommand({ id: "OpenAsset", label: "Open", handler })`, errors: [{ messageId: "idNotKebab", data: { id: "OpenAsset" } }] },
    { code: `${imports}useRegisterCommand({ id: "open", label: "", handler })`, errors: [{ messageId: "labelEmpty" }] },
    { code: `${imports}useRegisterCommand({ id: "open", handler })`, errors: [{ messageId: "labelEmpty" }] },
    { code: `${imports}useRegisterCommand({ id: "open", label: "Open", shortcut: "super+k", handler })`, errors: [{ messageId: "shortcutInvalid", data: { shortcut: "super+k" } }] },
    { code: `${imports}useRegisterCommand({ id: "open", label: "Open", shortcut: "mod+kk", handler })`, errors: [{ messageId: "shortcutInvalid" }] },
    { code: `${imports}useRegisterCommand({ id: "open", label: "Open", shortcut: "mod+shift", handler })`, errors: [{ messageId: "shortcutInvalid" }] },
    { code: `${imports}useRegisterCommand({ id: "open", label: "Open", shortcut: "ctrl+ctrl+k", handler })`, errors: [{ messageId: "shortcutDuplicateModifier", data: { shortcut: "ctrl+ctrl+k", modifier: "ctrl" } }] },
    { code: `${imports}useRegisterCommand({ id: "open", label: "Open" })`, errors: [{ messageId: "handlerOrRoute" }] },
    { code: `${imports}useRegisterCommand({ id: "open", label: "Open", keywords: ["a", 1], handler })`, errors: [{ messageId: "keywordsNotStrings" }] },
    { code: `${imports}const el = <CommandRegistration definition={{ id: "Open", label: "Open" }} />`, filename: "/project/src/a.tsx", errors: [{ messageId: "idNotKebab" }, { messageId: "handlerOrRoute" }] },
  ],
})
