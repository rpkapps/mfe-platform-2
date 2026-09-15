/**
 * Minimal glob → RegExp conversion used by the CLI and the lint rules
 * (`**`, `*`, `?`, `{a,b}`), matching against `/`-normalised paths.
 * No dependency: the rules must stay cheap to load inside ESLint.
 */
export function globToRegExp(glob: string): RegExp {
  let source = "^"
  const normalised = glob.replace(/\\/g, "/")
  for (let index = 0; index < normalised.length; index += 1) {
    const char = normalised[index]!
    if (char === "*") {
      if (normalised[index + 1] === "*") {
        const followedBySlash = normalised[index + 2] === "/"
        source += followedBySlash ? "(?:.*/)?" : ".*"
        index += followedBySlash ? 2 : 1
      } else {
        source += "[^/]*"
      }
    } else if (char === "?") {
      source += "[^/]"
    } else if (char === "{") {
      const end = normalised.indexOf("}", index)
      if (end === -1) {
        source += "\\{"
      } else {
        const alternatives = normalised
          .slice(index + 1, end)
          .split(",")
          .map((alternative) => alternative.replace(/[.+^$()|[\]\\]/g, "\\$&"))
        source += `(?:${alternatives.join("|")})`
        index = end
      }
    } else if (/[.+^$()|[\]\\]/.test(char)) {
      source += `\\${char}`
    } else {
      source += char
    }
  }
  return new RegExp(`${source}$`)
}

export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/")
}

/** True when `filePath` matches any glob; relative globs match the end of the path. */
export function matchesAny(filePath: string, globs: readonly string[]): boolean {
  const normalised = normalizePath(filePath)
  return globs.some((glob) => {
    const pattern = glob.startsWith("/") || /^[A-Za-z]:\//.test(glob) || glob.startsWith("**") ? glob : `**/${glob}`
    return globToRegExp(pattern).test(normalised)
  })
}
