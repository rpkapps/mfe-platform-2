/**
 * `@platform/cli/eslint`: the platform ESLint plugin (`plugin`) and the
 * shareable flat configuration (`platformConfig()`), which every scaffolded
 * MFE uses through its generated `eslint.config.ts`:
 *
 * ```ts
 * import { platformConfig } from "@platform/cli/eslint"
 * export default platformConfig()
 * ```
 *
 * `platform lint` and CI run this exact configuration.
 */
import js from "@eslint/js"
import tanstackRouter from "@tanstack/eslint-plugin-router"
import type { TSESLint } from "@typescript-eslint/utils"
import jsxA11y from "eslint-plugin-jsx-a11y"
import reactHooks from "eslint-plugin-react-hooks"
import globals from "globals"
import tseslint from "typescript-eslint"

import noCrossRootComponentPassing from "./rules/no-cross-root-component-passing"
import noDirectMfeImport from "./rules/no-direct-mfe-import"
import noDirectModuleFederation from "./rules/no-direct-module-federation"
import noGeneratedFileEdits from "./rules/no-generated-file-edits"
import noRawBrowserStorage from "./rules/no-raw-browser-storage"
import noUnsafeRuntimeEnvAccess from "./rules/no-unsafe-runtime-env-access"
import noUnsupportedDependencySharing from "./rules/no-unsupported-dependency-sharing"
import registrationCleanup from "./rules/registration-cleanup"
import requireTelemetryContext from "./rules/require-telemetry-context"
import stableMfeId from "./rules/stable-mfe-id"
import validCapabilityUsage from "./rules/valid-capability-usage"
import validCommandDefinition from "./rules/valid-command-definition"
import validManifestConfig from "./rules/valid-manifest-config"
import validMfeIdentity from "./rules/valid-mfe-identity"
import validRoutePrefix from "./rules/valid-route-prefix"
import validSettingsDefinition from "./rules/valid-settings-definition"
import { LINT_DOCS_URL } from "./utils"

export { LINT_DOCS_URL }

export const PLUGIN_NAME = "@platform"
export const PLUGIN_VERSION = "0.1.0"

export const rules = {
  "no-raw-browser-storage": noRawBrowserStorage,
  "no-direct-module-federation": noDirectModuleFederation,
  "no-generated-file-edits": noGeneratedFileEdits,
  "registration-cleanup": registrationCleanup,
  "stable-mfe-id": stableMfeId,
  "valid-settings-definition": validSettingsDefinition,
  "valid-command-definition": validCommandDefinition,
  "valid-capability-usage": validCapabilityUsage,
  "valid-manifest-config": validManifestConfig,
  "no-cross-root-component-passing": noCrossRootComponentPassing,
  "require-telemetry-context": requireTelemetryContext,
  "valid-route-prefix": validRoutePrefix,
  "valid-mfe-identity": validMfeIdentity,
  "no-unsupported-dependency-sharing": noUnsupportedDependencySharing,
  "no-unsafe-runtime-env-access": noUnsafeRuntimeEnvAccess,
  "no-direct-mfe-import": noDirectMfeImport,
}

export type PlatformRuleName = keyof typeof rules

export type Severity = "off" | "warn" | "error" | 0 | 1 | 2

/** Recommended severities: errors for boundary violations and invalid definitions, warnings for context hygiene. */
export const RECOMMENDED_RULES: Record<`${typeof PLUGIN_NAME}/${PlatformRuleName}`, Severity> = {
  "@platform/no-raw-browser-storage": "error",
  "@platform/no-direct-module-federation": "error",
  "@platform/no-generated-file-edits": "error",
  "@platform/registration-cleanup": "warn",
  "@platform/stable-mfe-id": "error",
  "@platform/valid-settings-definition": "error",
  "@platform/valid-command-definition": "error",
  "@platform/valid-capability-usage": "error",
  "@platform/valid-manifest-config": "error",
  "@platform/no-cross-root-component-passing": "error",
  "@platform/require-telemetry-context": "warn",
  "@platform/valid-route-prefix": "error",
  "@platform/valid-mfe-identity": "error",
  "@platform/no-unsupported-dependency-sharing": "error",
  "@platform/no-unsafe-runtime-env-access": "error",
  "@platform/no-direct-mfe-import": "error",
}

/** Files the platform tooling generates; they are never linted. */
export const GENERATED_IGNORES = ["**/routeTree.gen.ts", "**/*.gen.ts", "**/*.gen.tsx", "**/.platform/**", "**/dist/**", "**/node_modules/**", "**/platform-manifest.json", "**/coverage/**", "**/playwright-report/**", "**/test-results/**"]

export interface PlatformPlugin extends TSESLint.FlatConfig.Plugin {
  meta: { name: string; version: string }
  rules: typeof rules
  configs: { recommended: TSESLint.FlatConfig.Config }
}

export const plugin: PlatformPlugin = {
  meta: { name: "@platform/eslint-plugin", version: PLUGIN_VERSION },
  rules,
  configs: { recommended: {} },
}

const recommended: TSESLint.FlatConfig.Config = {
  name: "@platform/recommended",
  plugins: { [PLUGIN_NAME]: plugin },
  rules: { ...RECOMMENDED_RULES },
}
plugin.configs.recommended = recommended

export interface PlatformConfigOptions {
  /** Type-aware linting (`recommendedTypeChecked` + `parserOptions.projectService`). Default false. */
  typed?: boolean
  /** eslint-plugin-react-hooks recommended rules. Default true. */
  react?: boolean
  /** @tanstack/eslint-plugin-router recommended rules. Default true. */
  tanstackRouter?: boolean
  /** eslint-plugin-jsx-a11y recommended rules. Default true. */
  a11y?: boolean
  /** Rule severity / option overrides applied last (`{ "@platform/require-telemetry-context": "off" }`). */
  rules?: Record<string, Severity | [Severity, ...unknown[]]>
  /** Extra ignore globs (added to the generated-file exclusions). */
  ignores?: string[]
  /** `tsconfigRootDir` for typed linting (defaults to ESLint's cwd). */
  tsconfigRootDir?: string
  /** Extra flat config entries appended before the overrides (escape hatch for local additions). */
  extends?: TSESLint.FlatConfig.ConfigArray
}

type FlatConfig = TSESLint.FlatConfig.Config

function asConfigArray(value: unknown): FlatConfig[] {
  return (Array.isArray(value) ? value : [value]) as FlatConfig[]
}

/**
 * The platform flat config: generated-file ignores, `@eslint/js` recommended,
 * typescript-eslint recommended (or type-checked), react-hooks, jsx-a11y,
 * TanStack Router, browser + node globals and the platform rules.
 */
export function platformConfig(options: PlatformConfigOptions = {}): TSESLint.FlatConfig.ConfigArray {
  const { typed = false, react = true, tanstackRouter = true, a11y = true } = options
  const config: FlatConfig[] = [
    { name: "@platform/ignores", ignores: [...GENERATED_IGNORES, ...(options.ignores ?? [])] },
    { ...js.configs.recommended, name: "@eslint/js/recommended" },
    ...(typed ? asConfigArray(tseslint.configs.recommendedTypeChecked) : asConfigArray(tseslint.configs.recommended)),
    {
      name: "@platform/language",
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        globals: { ...globals.browser, ...globals.node, ...globals.es2021 },
        parserOptions: {
          ecmaFeatures: { jsx: true },
          ...(typed ? { projectService: true, tsconfigRootDir: options.tsconfigRootDir ?? process.cwd() } : {}),
        },
      },
      linterOptions: { reportUnusedDisableDirectives: "warn" },
    },
    ...(typed
      ? [
          {
            ...(tseslint.configs.disableTypeChecked as FlatConfig),
            name: "@platform/untyped-scripts",
            files: ["**/*.js", "**/*.mjs", "**/*.cjs", "**/*.config.ts", "**/*.config.mts"],
          },
        ]
      : []),
  ]
  if (react) {
    const reactConfig = (reactHooks as unknown as { configs: { flat?: { recommended: FlatConfig }; recommended: FlatConfig } }).configs
    const flat = reactConfig.flat?.recommended ?? reactConfig.recommended
    config.push({ ...flat, name: "react-hooks/recommended", files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"] })
  }
  if (a11y) {
    const flat = (jsxA11y as unknown as { flatConfigs: { recommended: FlatConfig } }).flatConfigs.recommended
    config.push({ ...flat, name: "jsx-a11y/recommended", files: ["**/*.{jsx,tsx}"] })
  }
  if (tanstackRouter) {
    const flat = (tanstackRouter as unknown as { configs: { "flat/recommended": FlatConfig | FlatConfig[] } }).configs["flat/recommended"]
    config.push(...asConfigArray(flat).map((entry, index) => ({ ...entry, name: entry.name ?? `@tanstack/router/recommended${index ? `-${index}` : ""}` })))
  }
  config.push(recommended)
  config.push({
    name: "@platform/typescript-conventions",
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports", fixStyle: "inline-type-imports" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "prefer-const": "error",
    },
  })
  config.push({
    name: "@platform/tests",
    files: ["**/*.test.{ts,tsx}", "**/__tests__/**", "**/e2e/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@platform/no-raw-browser-storage": "off",
      "@platform/no-unsafe-runtime-env-access": "off",
    },
  })
  if (options.extends) config.push(...asConfigArray(options.extends))
  if (options.rules) config.push({ name: "@platform/overrides", rules: options.rules as TSESLint.FlatConfig.Rules })
  return config
}

export default plugin
