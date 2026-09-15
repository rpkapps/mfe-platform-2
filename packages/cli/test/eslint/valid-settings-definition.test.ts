import rule from "../../src/eslint/rules/valid-settings-definition"
import { ruleTester } from "./rule-tester"

const imports = 'import { useRegisterSettingsGroup, useRegisterSettingsField, SettingsRegistration } from "@platform/react"\nimport { z } from "zod"\n'

ruleTester.run("valid-settings-definition", rule, {
  valid: [
    `${imports}useRegisterSettingsGroup({ key: "display", title: "Display", fields: { density: { defaultValue: "comfortable", schema: z.enum(["compact", "comfortable"]), options: [{ value: "compact", label: "Compact" }] }, showOffline: { defaultValue: true }, region: { defaultValue: "eu", options: async ({ signal }) => [] } } })`,
    `${imports}useRegisterSettingsGroup({ key: "advanced", title: "Advanced", managedBy: "mfe", route: "/settings/custom", fields: {} })`,
    `${imports}useRegisterSettingsGroup({ key: "x", fields })`,
    `${imports}useRegisterSettingsField({ group: "display", key: "page-size", defaultValue: 25 })`,
    { code: `${imports}const el = <SettingsRegistration definition={{ key: "display", fields: { density: { defaultValue: "x" } } }} />`, filename: "/project/src/a.tsx" },
    `${imports}useRegisterSettingsGroup({ key: "display", fields: { density: { ...shared } } })`,
  ],
  invalid: [
    { code: `${imports}useRegisterSettingsGroup({ key: "Display Settings", fields: {} })`, errors: [{ messageId: "keyNotKebab", data: { key: "Display Settings" } }] },
    { code: `${imports}useRegisterSettingsGroup({ key: "display", fields: [{ key: "density" }] })`, errors: [{ messageId: "fieldsNotObject" }] },
    { code: `${imports}useRegisterSettingsGroup({ key: "display", fields: { density: { label: "Density" } } })`, errors: [{ messageId: "missingDefaultValue", data: { field: "density" } }] },
    { code: `${imports}useRegisterSettingsGroup({ key: "display", fields: { density: { defaultValue: "a", value: "b" } } })`, errors: [{ messageId: "valueProperty", data: { field: "density" } }] },
    { code: `${imports}useRegisterSettingsGroup({ key: "advanced", managedBy: "mfe", fields: {} })`, errors: [{ messageId: "mfeManagedNeedsRoute" }] },
    { code: `${imports}useRegisterSettingsGroup({ key: "display", fields: { density: { defaultValue: "a", options: [{ value: "a" }, "b"] } } })`, errors: [{ messageId: "optionShape", data: { field: "density", index: "0" } }, { messageId: "optionShape", data: { field: "density", index: "1" } }] },
    { code: `${imports}useRegisterSettingsGroup({ key: "display", fields: { density: { defaultValue: "a", schema: { type: "string" } } } })`, errors: [{ messageId: "schemaObjectLiteral", data: { field: "density" } }] },
    { code: `${imports}useRegisterSettingsGroup({ key: "display", fields: { density: { defaultValue: "a" }, "density": { defaultValue: "b" } } })`, errors: [{ messageId: "duplicateField", data: { field: "density" } }] },
    { code: `${imports}useRegisterSettingsField({ key: "page-size", defaultValue: 25 })`, errors: [{ messageId: "fieldNeedsKeyAndGroup" }] },
    { code: `${imports}useRegisterSettingsField({ group: "display", key: "PageSize", value: 25 })`, errors: [{ messageId: "keyNotKebab" }, { messageId: "missingDefaultValue" }, { messageId: "valueProperty" }] },
    { code: `${imports}const el = <SettingsRegistration definition={{ key: "display", fields: { density: { value: "x" } } }} />`, filename: "/project/src/a.tsx", errors: [{ messageId: "missingDefaultValue" }, { messageId: "valueProperty" }] },
  ],
})
