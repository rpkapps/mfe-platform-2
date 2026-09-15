/**
 * Small semver subset used for dependency negotiation in the browser and at
 * build time: exact versions, `^`, `~`, comparison operators, `x`/`*`
 * wildcards, hyphen ranges and `||` unions. Pre-release identifiers compare
 * lower than the release, as in npm.
 */
export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: (string | number)[]
  raw: string
}

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

export function parseVersion(input: string): ParsedVersion | null {
  const match = VERSION_RE.exec(input.trim())
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]
      ? match[4].split(".").map((id) => (/^\d+$/.test(id) ? Number(id) : id))
      : [],
    raw: input.trim(),
  }
}

function comparePrerelease(a: (string | number)[], b: (string | number)[]): number {
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1
  if (b.length === 0) return -1
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const left = a[index]
    const right = b[index]
    if (left === undefined) return -1
    if (right === undefined) return 1
    if (left === right) continue
    if (typeof left === "number" && typeof right === "number") return left < right ? -1 : 1
    if (typeof left === "number") return -1
    if (typeof right === "number") return 1
    return left < right ? -1 : 1
  }
  return 0
}

export function compareVersions(a: string | ParsedVersion, b: string | ParsedVersion): number {
  const left = typeof a === "string" ? parseVersion(a) : a
  const right = typeof b === "string" ? parseVersion(b) : b
  if (!left || !right) throw new Error(`Invalid version: ${!left ? String(a) : String(b)}`)
  if (left.major !== right.major) return left.major < right.major ? -1 : 1
  if (left.minor !== right.minor) return left.minor < right.minor ? -1 : 1
  if (left.patch !== right.patch) return left.patch < right.patch ? -1 : 1
  return comparePrerelease(left.prerelease, right.prerelease)
}

interface Comparator {
  operator: ">=" | ">" | "<=" | "<" | "="
  version: ParsedVersion
}

function makeVersion(major: number, minor: number, patch: number): ParsedVersion {
  return { major, minor, patch, prerelease: [], raw: `${major}.${minor}.${patch}` }
}

function partial(input: string): {
  major: number | null
  minor: number | null
  patch: number | null
  prerelease: (string | number)[]
} | null {
  const trimmed = input.trim().replace(/^v/, "")
  const match =
    /^(\d+|x|X|\*)?(?:\.(\d+|x|X|\*))?(?:\.(\d+|x|X|\*))?(?:-([0-9A-Za-z.-]+))?$/.exec(trimmed)
  if (!match || trimmed === "")
    return trimmed === "" ? { major: null, minor: null, patch: null, prerelease: [] } : null
  const num = (value: string | undefined) =>
    value === undefined || /^[xX*]$/.test(value) ? null : Number(value)
  return {
    major: num(match[1]),
    minor: num(match[2]),
    patch: num(match[3]),
    prerelease: match[4]
      ? match[4].split(".").map((id) => (/^\d+$/.test(id) ? Number(id) : id))
      : [],
  }
}

function comparatorsFor(token: string): Comparator[] | null {
  const trimmed = token.trim()
  if (trimmed === "" || trimmed === "*" || trimmed === "x" || trimmed === "X") return []
  const opMatch = /^(>=|<=|>|<|=|\^|~)?\s*(.+)$/.exec(trimmed)
  if (!opMatch) return null
  const operator = opMatch[1] ?? ""
  const part = partial(opMatch[2] ?? "")
  if (!part) return null
  const { major, minor, patch, prerelease } = part
  if (major === null) return []
  const exact = minor !== null && patch !== null
  const low: ParsedVersion = {
    major,
    minor: minor ?? 0,
    patch: patch ?? 0,
    prerelease,
    raw: "",
  }
  switch (operator) {
    case "^": {
      if (major > 0)
        return [
          { operator: ">=", version: low },
          { operator: "<", version: makeVersion(major + 1, 0, 0) },
        ]
      if (minor === null)
        return [
          { operator: ">=", version: low },
          { operator: "<", version: makeVersion(major + 1, 0, 0) },
        ]
      if (minor > 0 || patch === null)
        return [
          { operator: ">=", version: low },
          { operator: "<", version: makeVersion(0, minor + 1, 0) },
        ]
      return [
        { operator: ">=", version: low },
        { operator: "<", version: makeVersion(0, minor, patch + 1) },
      ]
    }
    case "~": {
      if (minor === null)
        return [
          { operator: ">=", version: low },
          { operator: "<", version: makeVersion(major + 1, 0, 0) },
        ]
      return [
        { operator: ">=", version: low },
        { operator: "<", version: makeVersion(major, minor + 1, 0) },
      ]
    }
    case ">=":
      return [{ operator: ">=", version: low }]
    case ">":
      if (exact) return [{ operator: ">", version: low }]
      if (minor === null) return [{ operator: ">=", version: makeVersion(major + 1, 0, 0) }]
      return [{ operator: ">=", version: makeVersion(major, minor + 1, 0) }]
    case "<":
      return [{ operator: "<", version: low }]
    case "<=":
      if (exact) return [{ operator: "<=", version: low }]
      if (minor === null) return [{ operator: "<", version: makeVersion(major + 1, 0, 0) }]
      return [{ operator: "<", version: makeVersion(major, minor + 1, 0) }]
    default: {
      if (exact) return [{ operator: "=", version: low }]
      if (minor === null)
        return [
          { operator: ">=", version: low },
          { operator: "<", version: makeVersion(major + 1, 0, 0) },
        ]
      return [
        { operator: ">=", version: low },
        { operator: "<", version: makeVersion(major, minor + 1, 0) },
      ]
    }
  }
}

function parseRangeSet(range: string): Comparator[] | null {
  const hyphen = /^\s*([^\s]+)\s+-\s+([^\s]+)\s*$/.exec(range)
  if (hyphen) {
    const lower = comparatorsFor(`>=${hyphen[1]}`)
    const upperPart = partial(hyphen[2] ?? "")
    if (!lower || !upperPart || upperPart.major === null) return null
    const upper: Comparator[] =
      upperPart.minor === null
        ? [{ operator: "<", version: makeVersion(upperPart.major + 1, 0, 0) }]
        : upperPart.patch === null
          ? [{ operator: "<", version: makeVersion(upperPart.major, upperPart.minor + 1, 0) }]
          : [
              {
                operator: "<=",
                version: {
                  major: upperPart.major,
                  minor: upperPart.minor,
                  patch: upperPart.patch,
                  prerelease: upperPart.prerelease,
                  raw: "",
                },
              },
            ]
    return [...lower, ...upper]
  }
  const tokens = range.trim().split(/\s+/).filter(Boolean)
  const comparators: Comparator[] = []
  for (const token of tokens.length ? tokens : [""]) {
    const parsed = comparatorsFor(token)
    if (!parsed) return null
    comparators.push(...parsed)
  }
  return comparators
}

function test(comparator: Comparator, version: ParsedVersion): boolean {
  const result = compareVersions(version, comparator.version)
  switch (comparator.operator) {
    case ">=":
      return result >= 0
    case ">":
      return result > 0
    case "<=":
      return result <= 0
    case "<":
      return result < 0
    default:
      return result === 0
  }
}

export function isValidRange(range: string): boolean {
  return range.split("||").every((set) => parseRangeSet(set) !== null)
}

/** `true` when `version` satisfies `range`. Pre-releases only satisfy ranges that name the same major.minor.patch pre-release. */
export function satisfies(version: string, range: string): boolean {
  const parsed = parseVersion(version)
  if (!parsed) return false
  const sets = range.split("||")
  return sets.some((set) => {
    const comparators = parseRangeSet(set)
    if (!comparators) return false
    if (parsed.prerelease.length > 0) {
      const allowed = comparators.some(
        (c) =>
          c.version.prerelease.length > 0 &&
          c.version.major === parsed.major &&
          c.version.minor === parsed.minor &&
          c.version.patch === parsed.patch
      )
      if (!allowed) return false
    }
    return comparators.every((comparator) => test(comparator, parsed))
  })
}

/** Highest version of `versions` that satisfies `range`, or `null`. */
export function maxSatisfying(versions: readonly string[], range: string): string | null {
  let best: string | null = null
  for (const candidate of versions) {
    if (!satisfies(candidate, range)) continue
    if (best === null || compareVersions(candidate, best) > 0) best = candidate
  }
  return best
}

/** Major of the lowest version a range can accept (`^18.2.0` → 18, `>=17 <20` → 17). */
export function rangeMajor(range: string): number | null {
  const first = range.split("||")[0] ?? ""
  const comparators = parseRangeSet(first)
  if (!comparators) return null
  const lower = comparators.filter(
    (c) => c.operator === ">=" || c.operator === ">" || c.operator === "="
  )
  if (lower.length === 0) return null
  return Math.min(...lower.map((c) => c.version.major))
}

/** Minimal `x.y.z` that a range accepts, used as the requested version in manifests. */
export function minVersion(range: string): string | null {
  const first = range.split("||")[0] ?? ""
  const comparators = parseRangeSet(first)
  if (!comparators) return null
  const lower = comparators.filter(
    (c) => c.operator === ">=" || c.operator === "=" || c.operator === ">"
  )
  if (lower.length === 0) return "0.0.0"
  const lowest = lower.reduce((a, b) => (compareVersions(a.version, b.version) <= 0 ? a : b))
  const { major, minor, patch } = lowest.version
  return lowest.operator === ">"
    ? `${major}.${minor}.${patch + 1}`
    : `${major}.${minor}.${patch}`
}
