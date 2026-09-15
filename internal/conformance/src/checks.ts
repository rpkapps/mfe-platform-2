import {
  isProtocolCompatible,
  validateManifest,
  type MfeManifest,
} from "@platform-internal/core"

/**
 * Conformance checks a built remote must pass. They run in the platform's
 * integration tests against `dist/platform-manifest.json` and the built
 * assets; consuming MFEs get them through `platform validate`.
 */
export interface ConformanceFinding {
  level: "error" | "warning"
  check: string
  message: string
}

export interface ConformanceInput {
  manifest: unknown
  /** Names of emitted files in the remote's output directory. */
  files: string[]
  /** Contents of emitted CSS assets (for scoping checks). */
  css?: Record<string, string>
  hostProtocolVersion: string
}

export function checkRemoteConformance(input: ConformanceInput): {
  ok: boolean
  manifest: MfeManifest | null
  findings: ConformanceFinding[]
} {
  const findings: ConformanceFinding[] = []
  const validation = validateManifest(input.manifest)
  if (!validation.ok) {
    for (const issue of validation.issues)
      findings.push({
        level: "error",
        check: "manifest.valid",
        message: `${issue.path}: ${issue.message}`,
      })
    return { ok: false, manifest: null, findings }
  }
  const manifest = validation.manifest
  if (!isProtocolCompatible(input.hostProtocolVersion, manifest.protocolVersion)) {
    findings.push({
      level: "error",
      check: "protocol.compatible",
      message: `remote protocol ${manifest.protocolVersion} is not compatible with host ${input.hostProtocolVersion}`,
    })
  }
  if (!input.files.includes(manifest.entry.file)) {
    findings.push({
      level: "error",
      check: "entry.present",
      message: `entry file ${manifest.entry.file} is not in the build output`,
    })
  }
  if (manifest.entry.loaderManifest && !input.files.includes(manifest.entry.loaderManifest)) {
    findings.push({
      level: "warning",
      check: "loader-manifest.present",
      message: `${manifest.entry.loaderManifest} is not in the build output`,
    })
  }
  if (manifest.dev)
    findings.push({
      level: "error",
      check: "dev.absent",
      message:
        "production manifests must not carry a `dev` block (HMR-capable remotes are development servers only)",
    })
  if (manifest.kind === "mfe" && manifest.routes.length === 0)
    findings.push({
      level: "warning",
      check: "routes.present",
      message: "an MFE without routes should be a widget library (`kind: widget-library`)",
    })
  const react = manifest.shared.find((request) => request.name === "react")
  const reactDom = manifest.shared.find((request) => request.name === "react-dom")
  if (react && reactDom && react.scope !== reactDom.scope)
    findings.push({
      level: "error",
      check: "react.pair",
      message: "react and react-dom must share the same scope",
    })
  if (react && react.scope !== `react${manifest.runtime.react.major}`)
    findings.push({
      level: "error",
      check: "react.scope",
      message: `react must share in scope react${manifest.runtime.react.major}, found ${react.scope}`,
    })
  if (manifest.css.scoped && input.css) {
    for (const [file, css] of Object.entries(input.css)) {
      const owner = `[${manifest.css.ownerAttribute}="${manifest.mfeId}"]`
      // Minifiers drop the attribute quotes; both spellings are the same selector.
      const unquoted = `[${manifest.css.ownerAttribute}=${manifest.mfeId}]`
      if (css.length > 0 && !css.includes(owner) && !css.includes(unquoted))
        findings.push({
          level: "error",
          check: "css.scoped",
          message: `${file} contains no selector scoped under ${owner}`,
        })
      if (/(^|[}\s,])(:root|html|body)\s*[{,]/.test(css))
        findings.push({
          level: "error",
          check: "css.no-global",
          message: `${file} still contains :root/html/body selectors`,
        })
    }
  }
  for (const key of Object.keys(manifest.env.keys)) {
    if (/SECRET|PASSWORD|TOKEN|PRIVATE/i.test(key))
      findings.push({
        level: "error",
        check: "env.public",
        message: `runtime env key ${key} looks sensitive; runtime environment values are public`,
      })
  }
  return { ok: !findings.some((finding) => finding.level === "error"), manifest, findings }
}
