import rule from "../../src/eslint/rules/no-direct-module-federation"
import { ruleTester } from "./rule-tester"

ruleTester.run("no-direct-module-federation", rule, {
  valid: [
    'import { createMfe } from "@platform/react"',
    'import { platform } from "@platform/vite"',
    'const federation = { init() {} }\nfederation.init()',
    'const mod = await import("./local")',
  ],
  invalid: [
    { code: 'import { loadRemote } from "@module-federation/runtime"', errors: [{ messageId: "federationImport", data: { source: "@module-federation/runtime" } }] },
    { code: 'import { loadRemote, init } from "@module-federation/runtime"\ninit({})\nloadRemote("x")', errors: [{ messageId: "federationImport" }, { messageId: "federationApi", data: { name: "init" } }, { messageId: "federationApi", data: { name: "loadRemote" } }] },
    { code: 'import * as mf from "@module-federation/enhanced/runtime"\nmf.registerRemotes([])', errors: [{ messageId: "federationImport" }, { messageId: "federationApi", data: { name: "mf.registerRemotes" } }] },
    { code: 'const mod = await import("@module-federation/runtime")', errors: [{ messageId: "federationImport" }] },
    { code: 'const mf = require("@module-federation/runtime")', errors: [{ messageId: "federationImport" }] },
    { code: 'export * from "@module-federation/sdk"', errors: [{ messageId: "federationImport" }] },
    { code: "const scopes = __federation_shared__", errors: [{ messageId: "federationGlobal", data: { name: "__federation_shared__" } }] },
    { code: "window.__federation__.remotes", errors: [{ messageId: "federationGlobal", data: { name: "__federation__" } }] },
  ],
})
