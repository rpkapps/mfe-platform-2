import { platformConfig } from "@platform/cli/eslint"

// The platform shareable config: @eslint/js, typescript-eslint, react-hooks, jsx-a11y,
// @tanstack/eslint-plugin-router and the platform rules (@platform/*). `platform lint`
// and CI run exactly this file. Options:
//   platformConfig({ typed: true })                      // type-aware rules (projectService)
//   platformConfig({ rules: { "@platform/require-telemetry-context": "off" } })
//   platformConfig({ ignores: ["src/generated/**"] })
// Every rule is documented at https://platform.docs.local/docs/linting#<rule-name>.
export default platformConfig()
