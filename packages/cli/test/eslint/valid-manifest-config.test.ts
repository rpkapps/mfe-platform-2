import rule from "../../src/eslint/rules/valid-manifest-config"
import { ruleTester } from "./rule-tester"

const imports = 'import { defineMfeConfig } from "@platform/vite/config"\n'
const file = "/project/mfe.config.ts"

ruleTester.run("valid-manifest-config", rule, {
  valid: [
    { code: `${imports}export default defineMfeConfig({ mfeId: "asset-tracker", routePrefix: "/asset-tracker", displayName: "Assets", discoverable: true, navigation: { title: "Assets", icon: "box", keywords: ["a"] }, env: { API_BASE_URL: { required: false, default: "/api", description: "API" } }, shared: { "date-fns": true, react: { scope: "react19" } }, capabilities: { remove: ["notifications"] }, css: { scope: true } })`, filename: file },
    { code: `${imports}export default defineMfeConfig({})`, filename: file },
    { code: `${imports}export default defineMfeConfig({ routePrefix: "/" })`, filename: "/project/mfe.config.mts" },
    { code: `${imports}export default { displayName: "x" }`, filename: file },
    // not a config file: nothing is checked
    { code: `${imports}export default defineMfeConfig({ unknown: 1 })`, filename: "/project/src/other.ts" },
  ],
  invalid: [
    { code: `${imports}export default defineMfeConfig({ unknownOption: true })`, filename: file, errors: [{ messageId: "unknownKey", data: { key: "unknownOption", valid: "mfeId, routePrefix, displayName, description, discoverable, navigation, permissionGroups, capabilities, shared, env, css, tecton, react, tailwind, manifest, federation, runtime" } }] },
    { code: `${imports}export default defineMfeConfig({ routePrefix: "/Bad/" })`, filename: file, errors: [{ messageId: "invalidRoutePrefix", data: { value: "/Bad/" } }] },
    { code: `${imports}export default defineMfeConfig({ mfeId: "Asset Tracker" })`, filename: file, errors: [{ messageId: "invalidMfeId" }] },
    { code: `${imports}export default defineMfeConfig({ discoverable: "yes" })`, filename: file, errors: [{ messageId: "discoverableNotBoolean" }] },
    { code: `${imports}export default defineMfeConfig({ env: { API_TOKEN: { required: true }, SECRET: { default: "x" } } })`, filename: file, errors: [{ messageId: "sensitiveEnvKey", data: { key: "API_TOKEN", pattern: "SECRET, PASSWORD, TOKEN, PRIVATE, CREDENTIAL, API_KEY, *_KEY" } }, { messageId: "sensitiveEnvKey" }] },
    { code: `${imports}export default defineMfeConfig({ env: { API_BASE_URL: "/api" } })`, filename: file, errors: [{ messageId: "envValueNotObject", data: { key: "API_BASE_URL" } }] },
    { code: `${imports}export default defineMfeConfig({ env: { API_BASE_URL: { requried: true } } })`, filename: file, errors: [{ messageId: "unknownKey", data: { key: "env.API_BASE_URL.requried", valid: "required, description, default" } }] },
    { code: `${imports}export default defineMfeConfig({ shared: { lodash: "yes", "date-fns": [1] } })`, filename: file, errors: [{ messageId: "sharedValue", data: { key: "lodash" } }, { messageId: "sharedValue", data: { key: "date-fns" } }] },
    { code: `${imports}export default defineMfeConfig({ shared: { lodash: { scope: "shared", eager: true } } })`, filename: file, errors: [{ messageId: "unknownKey", data: { key: "shared.lodash.eager", valid: "version, bundle, singleton, scope" } }, { messageId: "sharedScope", data: { key: "lodash", value: "shared" } }] },
    { code: `${imports}export default defineMfeConfig({ capabilities: { add: ["teleportation"], deny: [] } })`, filename: file, errors: [{ messageId: "unknownKey", data: { key: "capabilities.deny", valid: "add, remove" } }, { messageId: "unknownCapability", data: { id: "teleportation", list: "add", known: "navigation, context, storage.local, storage.session, telemetry, commands, settings, help, release-notes, breadcrumbs, overlays, notifications, runtime-env, widgets" } }] },
    { code: `${imports}export default defineMfeConfig({ navigation: { title: 1, colour: "red" } })`, filename: file, errors: [{ messageId: "unknownKey", data: { key: "navigation.colour", valid: "title, description, icon, keywords, category, order" } }, { messageId: "navigationTitle" }] },
    { code: `${imports}export default { routePrefix: "no-slash" }`, filename: file, errors: [{ messageId: "invalidRoutePrefix" }] },
  ],
})
