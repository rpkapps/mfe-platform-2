import type { DevtoolsPanelRenderProps } from "../registry"
import { KeyValue, Section } from "../ui"

export function SessionPanel({ snapshot }: DevtoolsPanelRenderProps) {
  const { session } = snapshot
  return (
    <Section title="Session and user (redacted)">
      <KeyValue
        entries={[
          ["User", session.user ? `${session.user.displayName} (${session.user.id})` : "anonymous"],
          ["Permission groups", `${session.groupsCount} group${session.groupsCount === 1 ? "" : "s"} (names not shown)`],
          ["Tenant", session.tenant ?? "—"],
          ["Project", session.project ?? "—"],
          ["Job", session.job ?? "—"],
          ["Locale / timezone", `${session.locale} · ${session.timezone}`],
          ["Theme", session.theme],
          ["Environment", session.environment],
          ["Shell release", [session.release.version, session.release.buildId, session.release.commit].filter(Boolean).join(" · ") || "—"],
          ["Context revision", String(session.revision)],
        ]}
      />
    </Section>
  )
}
