import type { ServerStatus } from '../api'

export function SettingsPanel({ status }: { status?: ServerStatus }) {
  return (
    <section className="page-stack">
      <section className="card-panel">
        <p className="eyebrow">Settings</p>
        <h2>Local Sniffer configuration</h2>
        <p className="muted">The dashboard only shows configured/unconfigured status. API keys are never sent to the browser.</p>
      </section>
      <section className="settings-grid">
        <ConfigCard title="LLM provider" rows={[
          ['Configured', status?.provider.configured ? 'yes' : 'no'],
          ['Base URL', status?.provider.baseUrlConfigured ? 'configured' : 'not set'],
          ['Model', status?.provider.model ?? 'not set'],
          ['API style', status?.provider.apiStyle ?? 'auto']
        ]} />
        <ConfigCard title="Agent handoff" rows={[
          ['Default agent', status?.agent.name ?? 'manual'],
          ['Codex command', status?.agent.configured ? 'configured' : 'not configured']
        ]} />
        <ConfigCard title="Reports" rows={[
          ['Report directory', status?.reportDir ?? 'unknown'],
          ['Latest report', status?.latestReport?.path ?? 'not found'],
          ['Latest repo', String(status?.latestReport?.repoPath ?? 'not found')],
          ['Latest app URL', String(status?.latestReport?.appUrl ?? 'not found')]
        ]} />
      </section>
    </section>
  )
}

function ConfigCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <article className="card-panel config-card">
      <h2>{title}</h2>
      {rows.map(([label, value]) => (
        <div key={label} className="config-row">
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </article>
  )
}
