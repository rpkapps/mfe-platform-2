import rule from "../../src/eslint/rules/no-unsafe-runtime-env-access"
import { ruleTester } from "./rule-tester"

ruleTester.run("no-unsafe-runtime-env-access", rule, {
  valid: [
    'import { useRuntimeEnv } from "@platform/mfe-react"\nconst env = useRuntimeEnv()',
    'import { usePlatform } from "@platform/mfe-react"\nconst runtime = usePlatform((p) => p.runtime)',
    "const mode = import.meta.env.MODE",
    "const dev = import.meta.env.DEV",
    "const node = process.env.NODE_ENV",
    'fetch("/api/assets")',
    { code: "const config = window.__PLATFORM_CONFIG__", filename: "/project/vite.config.ts" },
    {
      code: "const config = process.env.PLATFORM_ENVIRONMENT",
      filename: "/project/mfe.config.ts",
    },
    {
      code: "const config = window.__PLATFORM_CONFIG__",
      filename: "/project/src/harness.ts",
      options: [{ allow: ["**/harness.ts"] }],
    },
  ],
  invalid: [
    {
      code: "const config = window.__PLATFORM_CONFIG__",
      filename: "/project/src/a.ts",
      errors: [{ messageId: "platformConfigGlobal" }],
    },
    {
      code: "const config = globalThis.__PLATFORM_CONFIG__",
      filename: "/project/src/a.ts",
      errors: [{ messageId: "platformConfigGlobal" }],
    },
    {
      code: "const config = __PLATFORM_CONFIG__",
      filename: "/project/src/a.ts",
      errors: [{ messageId: "platformConfigGlobal" }],
    },
    {
      code: 'const response = await fetch("/platform-config.json")',
      filename: "/project/src/a.ts",
      errors: [{ messageId: "platformConfigFetch", data: { url: "/platform-config.json" } }],
    },
    {
      code: 'fetch("https://shell.example/platform-config.json?x=1")',
      filename: "/project/src/a.ts",
      errors: [{ messageId: "platformConfigFetch" }],
    },
    {
      code: "const url = import.meta.env.VITE_PLATFORM_API_URL",
      filename: "/project/src/a.ts",
      errors: [{ messageId: "viteEnv", data: { name: "VITE_PLATFORM_API_URL" } }],
    },
    {
      code: "const url = process.env.PLATFORM_MFE_ASSETS_ENV_API_BASE_URL",
      filename: "/project/src/a.ts",
      errors: [
        { messageId: "processEnv", data: { name: "PLATFORM_MFE_ASSETS_ENV_API_BASE_URL" } },
      ],
    },
  ],
})
