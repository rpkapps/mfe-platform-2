import { RuleTester } from "@typescript-eslint/rule-tester"
import { afterAll, describe, it } from "vitest"
import tseslint from "typescript-eslint"
import { join } from "node:path"

RuleTester.afterAll = afterAll
RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only
RuleTester.itSkip = it.skip

export const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 2022, sourceType: "module" },
  },
})

export const FIXTURES = join(import.meta.dirname, "..", "fixtures")
export const VALID_MFE = join(FIXTURES, "valid-mfe")
export const INVALID_MFE = join(FIXTURES, "invalid-mfe")
export const validFile = (...segments: string[]) => join(VALID_MFE, ...segments)
export const invalidFile = (...segments: string[]) => join(INVALID_MFE, ...segments)
