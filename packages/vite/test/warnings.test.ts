import { describe, expect, it } from "vitest"

import { isSharedVersionSkewWarning } from "../src/plugin/warnings"

const sharedReact =
  "[IMPORT_IS_UNDEFINED] Import `use` will always be undefined because there is no matching " +
  "export in '\\0virtual:mf:__mfe_internal__mfe_legacy_reports__mf_owner__13266__loadShare__react__loadShare__.js'"

describe("isSharedVersionSkewWarning", () => {
  it("drops an undefined import from a shared package's virtual module", () => {
    expect(
      isSharedVersionSkewWarning({ code: "IMPORT_IS_UNDEFINED", message: sharedReact })
    ).toBe(true)
  })

  it("keeps an undefined import from an ordinary module", () => {
    expect(
      isSharedVersionSkewWarning({
        code: "IMPORT_IS_UNDEFINED",
        message:
          "[IMPORT_IS_UNDEFINED] Import `missing` will always be undefined because there is no " +
          "matching export in 'src/lib/data.ts'",
      })
    ).toBe(false)
  })

  it("keeps other warnings about the same module", () => {
    expect(
      isSharedVersionSkewWarning({ code: "CIRCULAR_DEPENDENCY", message: sharedReact })
    ).toBe(false)
  })

  it("tolerates a warning without a code or message", () => {
    expect(isSharedVersionSkewWarning({})).toBe(false)
  })
})
