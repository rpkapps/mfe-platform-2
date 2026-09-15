declare module "eslint-plugin-jsx-a11y" {
  import type { TSESLint } from "@typescript-eslint/utils"

  const plugin: TSESLint.FlatConfig.Plugin & {
    flatConfigs: { recommended: TSESLint.FlatConfig.Config; strict: TSESLint.FlatConfig.Config }
  }
  export default plugin
}
