import type { AuditForm, ServerStatus } from '../api'
import { SnifferMascot, type MascotState } from './SnifferMascot'

export function AuditLauncher({
  form,
  status,
  mascotState,
  error,
  onChange,
  onRunAudit,
  onRunConsistency,
  onGenerateFixes,
  onOpenReport
}: {
  form: AuditForm
  status?: ServerStatus
  mascotState: MascotState
  error?: string
  onChange: (patch: Partial<AuditForm>) => void
  onRunAudit: () => void
  onRunConsistency: () => void
  onGenerateFixes: () => void
  onOpenReport: () => void
}) {
  return (
    <section className="dashboard-grid">
      <form
        className="launcher-card"
        onSubmit={(event) => {
          event.preventDefault()
          onRunAudit()
        }}
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Run launcher</p>
            <h2>Audit a running UI</h2>
          </div>
          <button type="submit" className="primary-button">Run Audit</button>
        </div>

        {error && <div className="alert danger" role="alert">{error}</div>}

        <div className="form-grid">
          <label>
            Repo path
            <input
              value={form.repoPath}
              onChange={(event) => onChange({ repoPath: event.target.value })}
              placeholder="/path/to/ui/repo"
              aria-label="Repo path"
            />
          </label>
          <label>
            App URL
            <input
              value={form.url}
              onChange={(event) => onChange({ url: event.target.value })}
              placeholder="http://127.0.0.1:5173"
              aria-label="App URL"
            />
          </label>
          <label className="span-2">
            Product goal
            <textarea
              value={form.productGoal}
              onChange={(event) => onChange({ productGoal: event.target.value })}
              placeholder="What should this app help users accomplish?"
              aria-label="Product goal"
            />
          </label>
        </div>

        <div className="controls-grid">
          <Select label="Scenario mode" value={form.scenario} values={['off', 'all', 'selected']} onChange={(scenario) => onChange({ scenario })} />
          <Select label="Critic mode" value={form.criticMode} values={['deterministic', 'llm', 'auto']} onChange={(criticMode) => onChange({ criticMode })} />
          <Select label="UX critic" value={form.uxCritic} values={['off', 'deterministic', 'llm']} onChange={(uxCritic) => onChange({ uxCritic })} />
          <Select label="Intent mode" value={form.intentMode} values={['deterministic', 'llm', 'auto']} onChange={(intentMode) => onChange({ intentMode })} />
          <Select label="Provider" value={form.provider} values={['auto', 'mock', 'openai-compatible']} onChange={(provider) => onChange({ provider })} />
          <label>
            Max iterations
            <input
              type="number"
              min={0}
              max={50}
              value={form.maxIterations}
              onChange={(event) => onChange({ maxIterations: Number(event.target.value) })}
            />
          </label>
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={form.consistencyCheck}
              onChange={(event) => onChange({ consistencyCheck: event.target.checked })}
            />
            Prompt/output consistency check
          </label>
        </div>

        <div className="action-row">
          <button type="button" className="secondary-button" onClick={onRunConsistency}>Run Consistency Check</button>
          <button type="button" className="secondary-button" onClick={onGenerateFixes}>Generate Fix Packets</button>
          <button type="button" className="ghost-button" onClick={onOpenReport}>Open Latest Report</button>
        </div>
      </form>

      <aside className="mascot-column">
        <SnifferMascot state={mascotState} />
        <div className="settings-card compact">
          <h3>Local configuration</h3>
          <StatusRow label="LLM provider" value={status?.provider.configured ? 'configured' : 'unconfigured'} tone={status?.provider.configured ? 'good' : 'muted'} />
          <StatusRow label="Model" value={status?.provider.model ?? 'not set'} tone="muted" />
          <StatusRow label="Codex agent" value={status?.agent.configured ? 'configured' : status?.agent.name ?? 'manual'} tone={status?.agent.configured ? 'good' : 'muted'} />
        </div>
      </aside>
    </section>
  )
}

function Select({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        {values.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  )
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: 'good' | 'muted' }) {
  return (
    <div className="status-row">
      <span>{label}</span>
      <strong className={`status-chip ${tone}`}>{value}</strong>
    </div>
  )
}
