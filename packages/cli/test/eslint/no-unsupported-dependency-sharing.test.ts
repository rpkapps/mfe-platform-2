import rule from "../../src/eslint/rules/no-unsupported-dependency-sharing"
import { invalidFile, ruleTester, validFile } from "./rule-tester"

const imports = 'import { defineMfeConfig } from "@platform/vite/config"\n'
const configFile = validFile("mfe.config.ts")

ruleTester.run("no-unsupported-dependency-sharing", rule, {
  valid: [
    { code: `${imports}export default defineMfeConfig({ shared: { "date-fns": { singleton: false, scope: "default" }, react: { scope: "react19" }, zod: true } })`, filename: configFile },
    { code: `${imports}export default defineMfeConfig({ shared: { react: { singleton: false } } })`, filename: configFile },
    { code: `${imports}export default defineMfeConfig({})`, filename: configFile },
    // no package.json reachable → dependency presence is not checked, the rest still is
    { code: `${imports}export default defineMfeConfig({ shared: { anything: { scope: "react18" } } })`, filename: "/nowhere/mfe.config.ts" },
    // not a config file
    { code: `${imports}export default defineMfeConfig({ shared: { react: { singleton: true } } })`, filename: validFile("src", "not-config.ts") },
  ],
  invalid: [
    { code: `${imports}export default defineMfeConfig({ shared: { "left-pad": true } })`, filename: configFile, errors: [{ messageId: "notADependency", data: { name: "left-pad" } }] },
    { code: `${imports}export default defineMfeConfig({ shared: { react: { singleton: true }, "react-dom": { singleton: true } } })`, filename: configFile, errors: [{ messageId: "reactSingleton", data: { name: "react" } }, { messageId: "reactSingleton", data: { name: "react-dom" } }] },
    { code: `${imports}export default defineMfeConfig({ shared: { "date-fns": { scope: "shared" } } })`, filename: configFile, errors: [{ messageId: "invalidScope", data: { name: "date-fns", scope: "shared" } }] },
    { code: `${imports}export default { shared: { "date-fns": { scope: "React19" } } }`, filename: configFile, errors: [{ messageId: "invalidScope" }] },
    { code: `${imports}export default defineMfeConfig({ shared: { "date-fns": true } })`, filename: invalidFile("mfe.config.ts"), errors: [{ messageId: "notADependency", data: { name: "date-fns" } }] },
  ],
})
