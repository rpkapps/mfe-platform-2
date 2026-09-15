import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

export const MONOREPO_ROOT = resolve(import.meta.dirname, "..", "..", "..")
export const CLI_ROOT = resolve(import.meta.dirname, "..")

export function makeTempDir(prefix = "platform-cli-"): { dir: string; cleanup(): void } {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}
