import { createHash } from "node:crypto"

/** Short, stable hash of any JSON-serialisable value (keys sorted). */
export function stableHash(value: unknown, length = 12): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, length)
}

export function hashString(value: string, length = 12): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length)
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key]
      if (entry === undefined) continue
      sorted[key] =
        typeof entry === "function"
          ? `[function ${(entry as { name?: string }).name || "anonymous"}]`
          : sortKeys(entry)
    }
    return sorted
  }
  return value
}
