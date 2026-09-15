import rule from "../../src/eslint/rules/no-raw-browser-storage"
import { ruleTester } from "./rule-tester"

ruleTester.run("no-raw-browser-storage", rule, {
  valid: [
    'import { createPlatformStorage } from "@platform/mfe-react"\nexport const store = createPlatformStorage({ scope: "local", key: "x", defaults: {} })',
    "const localStorage = new Map()\nlocalStorage.get('x')",
    "const cookie = document.cookie",
    "const settings = { localStorage: true }\nsettings.localStorage",
    {
      code: 'localStorage.setItem("a", "b")',
      options: [{ allow: ["**/*.test.ts"] }],
      filename: "/project/src/a.test.ts",
    },
  ],
  invalid: [
    {
      code: 'localStorage.setItem("a", "b")',
      errors: [{ messageId: "rawStorage", data: { name: "localStorage" } }],
    },
    {
      code: 'const v = sessionStorage.getItem("a")',
      errors: [{ messageId: "rawStorage", data: { name: "sessionStorage" } }],
    },
    {
      code: "window.localStorage.clear()",
      errors: [{ messageId: "rawStorage", data: { name: "window.localStorage" } }],
    },
    {
      code: "globalThis.sessionStorage.clear()",
      errors: [{ messageId: "rawStorage", data: { name: "globalThis.sessionStorage" } }],
    },
    { code: 'document.cookie = "a=b"', errors: [{ messageId: "cookieWrite" }] },
    { code: 'window.document.cookie = "a=b"', errors: [{ messageId: "cookieWrite" }] },
    {
      code: 'localStorage.setItem("a", "b")',
      options: [{ allow: ["**/*.test.ts"] }],
      filename: "/project/src/a.ts",
      errors: [{ messageId: "rawStorage" }],
    },
  ],
})
