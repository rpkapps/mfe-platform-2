import rule from "../../src/eslint/rules/valid-mfe-identity"
import { ruleTester } from "./rule-tester"

const imports = 'import { createMfe, createWidget } from "@platform/mfe-react"\n'
const bootstrap = "/project/src/mfe.tsx"

ruleTester.run("valid-mfe-identity", rule, {
  valid: [
    {
      code: `${imports}export default createMfe({ routeTree, widgets: { "asset-card": createWidget({ component: Card }) } })`,
      filename: bootstrap,
    },
    {
      code: `${imports}const mfe = createMfe({ routeTree })\nexport default mfe`,
      filename: bootstrap,
    },
    {
      code: `${imports}import { withTecton } from "@platform/mfe-react/tecton"\nexport default withTecton(createMfe({ routeTree }))`,
      filename: bootstrap,
    },
    {
      code: `${imports}export default createMfe({ routeTree }).use(enhancer)`,
      filename: bootstrap,
    },
    {
      code: `${imports}export default createMfe({ widgets: { "asset-card": card, "asset.list": list } })`,
      filename: "/project/src/mfe.ts",
    },
    // not the bootstrap file: default export is not checked
    { code: `${imports}export default { a: 1 }`, filename: "/project/src/routes/index.tsx" },
    {
      code: `${imports}export const definition = createMfe({})`,
      filename: "/project/src/lib/definition.ts",
    },
  ],
  invalid: [
    {
      code: `${imports}export default createMfe({})\nexport const other = createMfe({})`,
      filename: bootstrap,
      errors: [{ messageId: "multipleCreateMfe" }],
    },
    {
      code: `${imports}createMfe({})\ncreateMfe({})`,
      filename: "/project/src/anything.tsx",
      errors: [{ messageId: "multipleCreateMfe" }],
    },
    {
      code: `${imports}export default { kind: "platform-remote" }`,
      filename: bootstrap,
      errors: [{ messageId: "defaultExport" }],
    },
    {
      code: `${imports}export const definition = createMfe({})`,
      filename: bootstrap,
      errors: [{ messageId: "defaultExport" }],
    },
    {
      code: `${imports}const definition = createMfe({})\nexport default function () { return definition }`,
      filename: bootstrap,
      errors: [{ messageId: "defaultExport" }],
    },
    {
      code: `${imports}export default createMfe({ widgets: { AssetCard: createWidget({ component: Card }), "asset card": x } })`,
      filename: bootstrap,
      errors: [
        { messageId: "widgetKey", data: { key: "AssetCard" } },
        { messageId: "widgetKey", data: { key: "asset card" } },
      ],
    },
  ],
})
