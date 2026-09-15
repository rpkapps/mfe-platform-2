import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { readIdentity, resolveIdentity } from "../src/identity"

const dirs: string[] = []
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), "platform-vite-identity-"))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("resolveIdentity", () => {
  it("infers the mfeId from the package name on first run and persists it", () => {
    const root = temp()
    const identity = resolveIdentity({ root, packageName: "@acme/Asset Tracker" })
    expect(identity).toMatchObject({ mfeId: "asset-tracker", source: "inferred", written: true })
    const file = join(root, ".platform", "identity.json")
    expect(existsSync(file)).toBe(true)
    const persisted = JSON.parse(readFileSync(file, "utf8"))
    expect(persisted.mfeId).toBe("asset-tracker")
    expect(typeof persisted.createdAt).toBe("string")
    expect(readFileSync(file, "utf8")).toBe(`${JSON.stringify(persisted, null, 2)}\n`)
    expect(readFileSync(join(root, ".platform", ".gitignore"), "utf8")).toBe("*\n!identity.json\n!.gitignore\n")
  })

  it("keeps the persisted id when the package is renamed", () => {
    const root = temp()
    resolveIdentity({ root, packageName: "first-name" })
    const second = resolveIdentity({ root, packageName: "second-name" })
    expect(second).toMatchObject({ mfeId: "first-name", source: "identity", written: false })
  })

  it("lets an explicit id win and updates the file, keeping createdAt", () => {
    const root = temp()
    const first = resolveIdentity({ root, packageName: "first-name" })
    const created = readIdentity(root)?.createdAt
    const explicit = resolveIdentity({ root, packageName: "first-name", configMfeId: "renamed" })
    expect(explicit).toMatchObject({ mfeId: "renamed", source: "config", written: true })
    expect(readIdentity(root)).toEqual({ mfeId: "renamed", createdAt: created })
    expect(first.mfeId).toBe("first-name")
    const option = resolveIdentity({ root, optionMfeId: "from-option", configMfeId: "renamed" })
    expect(option).toMatchObject({ mfeId: "from-option", source: "option", written: true })
    expect(resolveIdentity({ root, optionMfeId: "from-option" }).written).toBe(false)
  })

  it("rejects invalid ids with a PlatformError", () => {
    const root = temp()
    expect(() => resolveIdentity({ root, configMfeId: "Not Valid" })).toThrowError(/MFE_ID_INVALID|not a valid mfeId/)
    expect(existsSync(join(root, ".platform", "identity.json"))).toBe(false)
  })

  it("can run read-only", () => {
    const root = temp()
    const identity = resolveIdentity({ root, packageName: "read-only", persist: false })
    expect(identity).toMatchObject({ mfeId: "read-only", written: false })
    expect(existsSync(join(root, ".platform"))).toBe(false)
  })
})
