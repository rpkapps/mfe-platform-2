import rule from "../../src/eslint/rules/valid-route-prefix"
import { ruleTester, validFile } from "./rule-tester"

ruleTester.run("valid-route-prefix", rule, {
  valid: [
    'export default defineMfeConfig({ routePrefix: "/asset-tracker" })',
    'export default defineMfeConfig({ routePrefix: "/reports/legacy" })',
    'platform({ routePrefix: "/" })',
    "createMfe({ routePrefix: prefix })",
    {
      code: 'export const Route = createFileRoute("/assets/$assetId")({})',
      filename: validFile("src", "routes", "assets", "$assetId.tsx"),
    },
    {
      code: 'export const Route = createFileRoute("/valid-mfe-extra")({})',
      filename: validFile("src", "routes", "valid-mfe-extra.tsx"),
    },
    // outside src/routes nothing is prefix-checked
    {
      code: 'createFileRoute("/valid-mfe/assets")({})',
      filename: validFile("src", "other.tsx"),
    },
  ],
  invalid: [
    {
      code: 'export default defineMfeConfig({ routePrefix: "asset-tracker" })',
      errors: [{ messageId: "invalidPrefix", data: { value: "asset-tracker" } }],
    },
    { code: 'platform({ routePrefix: "/Assets/" })', errors: [{ messageId: "invalidPrefix" }] },
    { code: 'createMfe({ routePrefix: "/a//b" })', errors: [{ messageId: "invalidPrefix" }] },
    {
      code: 'export const Route = createFileRoute("/valid-mfe/assets")({})',
      filename: validFile("src", "routes", "assets.tsx"),
      errors: [
        {
          messageId: "hardcodedPrefix",
          data: { path: "/valid-mfe/assets", prefix: "/valid-mfe", relative: "/assets" },
        },
      ],
    },
    {
      code: 'export const Route = createFileRoute("/valid-mfe")({})',
      filename: validFile("src", "routes", "index.tsx"),
      errors: [
        {
          messageId: "hardcodedPrefix",
          data: { path: "/valid-mfe", prefix: "/valid-mfe", relative: "/" },
        },
      ],
    },
  ],
})
