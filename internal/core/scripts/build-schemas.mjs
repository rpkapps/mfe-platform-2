// Emits the machine-readable JSON Schemas (manifest, runtime configuration,
// capabilities, registrations, settings, diagnostics, protocol compatibility,
// shared dependencies) into internal/core/schemas/. The docs site copies them
// to /schemas/<name>.json.
import { mkdirSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const { PUBLISHED_SCHEMAS, toJsonSchema } = await import("../dist/index.js")

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "schemas")
mkdirSync(out, { recursive: true })
const names = Object.keys(PUBLISHED_SCHEMAS)
for (const name of names) {
  writeFileSync(join(out, `${name}.json`), JSON.stringify(toJsonSchema(name), null, 2) + "\n")
}
writeFileSync(join(out, "index.json"), JSON.stringify({ schemas: names.map((name) => ({ name, file: `${name}.json` })) }, null, 2) + "\n")
console.log(`wrote ${names.length} schemas to ${out}`)
