import { describe, expect, it } from "vitest"

import {
  compareVersions,
  isValidRange,
  maxSatisfying,
  minVersion,
  parseVersion,
  rangeMajor,
  satisfies,
} from "../src/semver"

describe("semver", () => {
  it("parses versions", () => {
    expect(parseVersion("18.3.1")).toMatchObject({
      major: 18,
      minor: 3,
      patch: 1,
      prerelease: [],
    })
    expect(parseVersion("v19.0.0-rc.1")).toMatchObject({ major: 19, prerelease: ["rc", 1] })
    expect(parseVersion("1.2")).toBeNull()
  })
  it("compares", () => {
    expect(compareVersions("18.3.1", "19.0.0")).toBe(-1)
    expect(compareVersions("19.0.0", "19.0.0-rc.1")).toBe(1)
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0)
  })
  it("satisfies caret, tilde, wildcards and unions", () => {
    expect(satisfies("18.3.1", "^18.2.0")).toBe(true)
    expect(satisfies("19.0.0", "^18.2.0")).toBe(false)
    expect(satisfies("18.2.5", "~18.2.0")).toBe(true)
    expect(satisfies("18.3.0", "~18.2.0")).toBe(false)
    expect(satisfies("0.2.9", "^0.2.6")).toBe(true)
    expect(satisfies("0.3.0", "^0.2.6")).toBe(false)
    expect(satisfies("0.0.7", "^0.0.6")).toBe(false)
    expect(satisfies("5.0.0", "*")).toBe(true)
    expect(satisfies("5.1.0", "5.x")).toBe(true)
    expect(satisfies("6.0.0", "5.x")).toBe(false)
    expect(satisfies("19.1.0", ">=18.0.0 || >=19.0.0")).toBe(true)
    expect(satisfies("17.0.0", ">=18.0.0 <20")).toBe(false)
    expect(satisfies("19.9.9", ">=18.0.0 <20")).toBe(true)
    expect(satisfies("1.5.0", "1.2.3 - 1.6")).toBe(true)
    expect(satisfies("1.7.0", "1.2.3 - 1.6")).toBe(false)
    expect(satisfies("19.0.0-rc.1", "^19.0.0")).toBe(false)
    expect(satisfies("19.0.0-rc.1", "^19.0.0-rc.0")).toBe(true)
  })
  it("rejects malformed ranges", () => {
    expect(isValidRange("^18.2.0")).toBe(true)
    expect(isValidRange("banana")).toBe(false)
  })
  it("finds max satisfying and range majors", () => {
    expect(maxSatisfying(["18.2.0", "18.3.1", "19.0.0"], "^18.0.0")).toBe("18.3.1")
    expect(maxSatisfying(["19.0.0"], "^18.0.0")).toBeNull()
    expect(rangeMajor("^18.2.0")).toBe(18)
    expect(rangeMajor(">=17 <20")).toBe(17)
    expect(minVersion("^18.2.0")).toBe("18.2.0")
    expect(minVersion("*")).toBe("0.0.0")
  })
})
