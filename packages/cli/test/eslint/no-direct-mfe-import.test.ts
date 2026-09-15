import rule from "../../src/eslint/rules/no-direct-mfe-import"
import { ruleTester, validFile } from "./rule-tester"

const routeFile = validFile("src", "routes", "index.tsx")

ruleTester.run("no-direct-mfe-import", rule, {
  valid: [
    'import { createMfe } from "@platform/react"',
    'import { format } from "date-fns"',
    'import { helper } from "@acme/ui-kit"',
    'import { helper } from "remote-utils"',
    { code: 'import definition from "../mfe"', filename: routeFile },
    { code: 'import { x } from "../../mfe.config"', filename: routeFile },
    {
      code: 'import { helper } from "@acme/mfe-shared-types"',
      options: [{ allow: ["@acme/mfe-shared-*"] }],
    },
  ],
  invalid: [
    {
      code: 'import { helper } from "@acme/mfe-billing"',
      errors: [{ messageId: "mfePackage", data: { source: "@acme/mfe-billing" } }],
    },
    {
      code: 'const mod = await import("@acme/mfe-billing/widgets")',
      errors: [{ messageId: "mfePackage" }],
    },
    { code: 'export { x } from "@acme/mfe-billing"', errors: [{ messageId: "mfePackage" }] },
    { code: 'const mod = require("@acme/mfe-billing")', errors: [{ messageId: "mfePackage" }] },
    {
      code: 'import { Widget } from "remote/widgets"',
      errors: [{ messageId: "federationAlias", data: { source: "remote/widgets" } }],
    },
    {
      code: 'import { Widget } from "mfe_asset_tracker/mfe"',
      errors: [{ messageId: "federationAlias" }],
    },
    {
      code: 'import other from "../../../invalid-mfe/src/mfe"',
      filename: routeFile,
      errors: [
        {
          messageId: "outsideProject",
          data: {
            source: "../../../invalid-mfe/src/mfe",
            resolved: validFile("..", "invalid-mfe", "src", "mfe")
              .replace(/\\/g, "/")
              .replace("/valid-mfe/../", "/"),
          },
        },
      ],
    },
  ],
})
