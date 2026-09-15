import type { DevtoolsPanelRenderProps } from "../registry"
import { DataTable, JsonBlock, KeyValue, Section } from "../ui"

export function RuntimePanel({ snapshot }: DevtoolsPanelRenderProps) {
  const config = snapshot.runtimeConfig
  return (
    <>
      <Section title="Runtime configuration (redacted)">
        <KeyValue entries={[["Source", config.source ?? "static"], ["Environment", config.environment], ["Generated", config.generatedAt ?? "—"], ["Release", [config.release.version, config.release.buildId].filter(Boolean).join(" · ") || "—"], ["Allowed origins", config.allowedOrigins.join(", ") || "same-origin only"], ["Devtools policy", `${config.devtools.policy} (${config.devtools.environments.join(", ")})`], ["Manifest cache / retry", `${config.cache.manifestMaxAgeSeconds}s · bust on retry ${config.cache.bustOnRetry ? "yes" : "no"} · ${config.retry.attempts} retries, ${config.retry.backoffMs}ms backoff`]]} />
        <JsonBlock value={config.shared} />
      </Section>
      <Section title="Per-MFE runtime env (allow-listed keys only)">
        <DataTable
          columns={["MFE", "Enabled", "Manifest URL", "Preload", "Env"]}
          empty="No per-MFE configuration."
          rows={Object.keys({ ...config.mfes, ...snapshot.runtimeEnv }).map((mfeId) => {
            const mfe = config.mfes[mfeId]
            return [mfeId, mfe?.enabled === false ? "no" : "yes", mfe?.manifestUrl ? <code key="u">{mfe.manifestUrl}</code> : "—", mfe?.preload ?? "—", <JsonBlock key="e" value={snapshot.runtimeEnv[mfeId] ?? mfe?.env ?? {}} />]
          })}
        />
      </Section>
    </>
  )
}
