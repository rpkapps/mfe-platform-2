import type { DevtoolsPanelRenderProps } from "../registry"
import { DataTable, Section } from "../ui"

export function HelpPanel({ snapshot }: DevtoolsPanelRenderProps) {
  return (
    <>
      <Section title={`Help entries (${snapshot.help.length})`}>
        <DataTable columns={["Entry", "Owner", "Target", "Content"]} empty="No help entries registered." rows={snapshot.help.map((entry) => [<span key="e"><strong>{entry.title}</strong><br /><code>{entry.qualifiedId}</code>{entry.description ? <small> — {entry.description}</small> : null}</span>, entry.owner.mfeId, entry.href ? <a key="h" href={entry.href} target="_blank" rel="noreferrer">{entry.href}</a> : entry.route ? <code key="r">{entry.route}</code> : "—", entry.hasContent ? "mountable" : "—"])} />
      </Section>
      <Section title={`Release notes (${snapshot.releaseNotes.length})`}>
        <DataTable columns={["Version", "Title", "Owner", "Date", "Summary"]} empty="No release notes registered." rows={snapshot.releaseNotes.map((note) => [<code key="v">{note.version}</code>, note.title, note.owner.mfeId, note.date ?? "—", note.summary ?? "—"])} />
      </Section>
    </>
  )
}
