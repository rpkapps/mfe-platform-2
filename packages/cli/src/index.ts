/**
 * Programmatic surface of `@platform/cli`: every command the `platform`
 * binary exposes, plus the helpers the scaffold, validation and lint rules
 * share. The ESLint plugin and flat config live in `@platform/cli/eslint`.
 */
export { create, dependencySpecs, resolveTectonLink, templateContext, titleCase, PLATFORM_VERSION_RANGE, TECTON_GIT_SPEC } from "./commands/create"
export type { CreateOptions, CreateResult, DependencySpecs, PackageManager } from "./commands/create"
export { dev } from "./commands/dev"
export type { DevOptions, DevResult } from "./commands/dev"
export { build, manifestFileName, summarizeManifest } from "./commands/build"
export type { BuildOptions, BuildResult } from "./commands/build"
export { manifest, readManifest } from "./commands/manifest"
export type { ManifestOptions, ManifestResult } from "./commands/manifest"
export { validate, formatFinding, defaultExportsCreateMfe, hasGeneratedBanner, regenerateRouteTree } from "./commands/validate"
export type { Finding, FindingLevel, ValidateOptions, ValidateResult } from "./commands/validate"
export { lint, findEslintConfig } from "./commands/lint"
export type { LintOptions, LintResult } from "./commands/lint"
export { test } from "./commands/test"
export type { TestOptions, TestResult } from "./commands/test"
export { CliError, CLI_ERROR_CODES, formatError, isCliError, exitCodeFor } from "./errors"
export type { CliErrorCode, CliErrorOptions } from "./errors"
export { renderTemplate, renderTemplateDir, replaceTokens, targetFileName, writeRenderedFiles } from "./template"
export type { RenderedFile, TemplateContext } from "./template"
export {
  MFE_CONFIG_KEYS,
  SHARED_ENTRY_KEYS,
  ENV_DECLARATION_KEYS,
  NAVIGATION_KEYS,
  SHARE_SCOPE_RE,
  mfeConfigSchema,
  checkMfeConfig,
  readStaticMfeConfig,
  parseMfeConfigSource,
  findMfeConfigFile,
  isMfeConfigFile,
  evaluateStatic,
  stripDynamic,
  DYNAMIC,
} from "./mfe-config"
export type { MfeConfig, StaticMfeConfig, StaticValue, ConfigIssue } from "./mfe-config"
export { findProjectRoot, requireProjectRoot, readPackageJson, readIdentity, resolveMfeId, loadProjectModule, resolveProjectModule, projectRequire, IDENTITY_FILE } from "./project"
export type { PackageJson, Identity } from "./project"
export { cliPackageRoot, cliVersion, templatesDir } from "./package-root"
export { globToRegExp, matchesAny, normalizePath } from "./glob"
