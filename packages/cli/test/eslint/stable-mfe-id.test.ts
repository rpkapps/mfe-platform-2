import rule from "../../src/eslint/rules/stable-mfe-id"
import { ruleTester, validFile } from "./rule-tester"

const imports = 'import { createMfe } from "@platform/react"\n'

ruleTester.run("stable-mfe-id", rule, {
  valid: [
    `${imports}export default createMfe({ routeTree })`,
    `${imports}export default createMfe({ mfeId: "asset-tracker" })`,
    `${imports}export default createMfe({ mfeId: __PLATFORM_MFE_ID__ })`,
    {
      code: `${imports}export default createMfe({ mfeId: "valid-mfe" })`,
      filename: validFile("src", "mfe.tsx"),
    },
    'const createMfe = (x) => x\nconst id = "x"\ncreateMfe({ mfeId: id })'.replace(
      "createMfe({ mfeId: id })",
      "createMfe({ mfeId: 'x' })"
    ),
  ],
  invalid: [
    {
      code: `${imports}const id = "asset-tracker"\nexport default createMfe({ mfeId: id })`,
      errors: [{ messageId: "nonLiteral" }],
    },
    {
      code: `${imports}export default createMfe({ mfeId: \`asset-\${suffix}\` })`,
      errors: [{ messageId: "nonLiteral" }],
    },
    {
      code: `${imports}export default createMfe({ mfeId: "Asset Tracker" })`,
      errors: [{ messageId: "invalidId", data: { value: "Asset Tracker" } }],
    },
    {
      code: `${imports}export default createMfe({ mfeId: "1st-mfe" })`,
      errors: [{ messageId: "invalidId" }],
    },
    {
      code: `${imports}export default createMfe({ mfeId: "other-mfe" })`,
      filename: validFile("src", "mfe.tsx"),
      errors: [
        { messageId: "identityMismatch", data: { value: "other-mfe", persisted: "valid-mfe" } },
      ],
    },
  ],
})
