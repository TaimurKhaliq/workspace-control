import type { AuditForm, ServerStatus } from '../api'
import { SnifferMascot, type MascotState } from './SnifferMascot'

export function AuditLauncher({
  form,
  status,
  mascotState,
  error,
  isRunning,
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
  isRunning?: boolean
  onChange: (patch: Partial<AuditForm>) => void
  onRunAudit: () => void
  onRunConsistency: () => void
  onGenerateFixes: () => void
  onOpenReport: () => void
}) {
  const llmUnavailable = form.auditDepth === 'deep' && form.provider === 'openai-compatible' && !status?.provider.configured
  const commandPreview = buildAuditCommandPreview(form)
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
          <button type="submit" className="primary-button" disabled={isRunning || llmUnavailable}>{isRunning ? 'Running audit...' : 'Run Audit'}</button>
        </div>

        {error && <div className="alert danger" role="alert">{error}</div>}
        {llmUnavailable && <div className="alert warning" role="alert">LLM provider is not configured. Run provider check or use fast deterministic audit.</div>}
        <div className="status-note" role="status" aria-live="polite">
          Loading status: {isRunning ? 'running audit' : 'idle'}
        </div>

        <div className="form-grid">
          <label>
            Repo path
            <input
              className="path-input"
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
          <Select
            label="Audit depth"
            value={form.auditDepth}
            values={['fast', 'deep']}
            labels={{ fast: 'Fast deterministic', deep: 'Deep LLM product audit' }}
            onChange={(auditDepth) => onChange({
              auditDepth: auditDepth as 'fast' | 'deep',
              provider: auditDepth === 'deep' ? 'openai-compatible' : 'auto',
              productExperienceCritic: auditDepth === 'deep' ? 'llm' : 'deterministic',
              scenario: 'all',
              executeGeneratedScenarios: true
            })}
          />
          <Select label="Discovery mode" value={form.discoveryMode} values={['hybrid', 'runtime', 'source']} onChange={(discoveryMode) => onChange({ discoveryMode })} />
          <Select label="Scenario mode" value={form.scenario} values={['auto', 'off', 'all']} onChange={(scenario) => onChange({ scenario })} />
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={form.executeGeneratedScenarios}
              onChange={(event) => onChange({ executeGeneratedScenarios: event.target.checked })}
            />
            Execute generated scenarios
          </label>
          <Select label="Critic mode" value={form.criticMode} values={['deterministic', 'llm', 'auto']} onChange={(criticMode) => onChange({ criticMode })} />
          <Select label="UX critic" value={form.uxCritic} values={['off', 'deterministic', 'llm']} onChange={(uxCritic) => onChange({ uxCritic })} />
          <Select label="Intent mode" value={form.intentMode} values={['deterministic', 'llm', 'auto']} onChange={(intentMode) => onChange({ intentMode })} />
          <Select label="Product Experience Critic" value={form.productExperienceCritic} values={['off', 'deterministic', 'llm', 'auto']} onChange={(productExperienceCritic) => onChange({ productExperienceCritic })} />
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
          <button type="button" className="secondary-button" disabled={isRunning} onClick={onRunConsistency}>{isRunning ? 'Consistency queued...' : 'Run Consistency Check'}</button>
          <button type="button" className="secondary-button" disabled={isRunning} onClick={onGenerateFixes}>{isRunning ? 'Generating...' : 'Generate Fix Packets'}</button>
          <button type="button" className="ghost-button" onClick={onOpenReport}>Open Latest Report</button>
        </div>
        <details className="command-preview">
          <summary>Command</summary>
          <pre>{commandPreview}</pre>
        </details>
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

function Select({ label, value, values, labels = {}, onChange }: { label: string; value: string; values: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        {values.map((item) => <option key={item} value={item}>{labels[item] ?? item}</option>)}
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

export function buildAuditCommandPreview(form: AuditForm): string {
  const args = ['npm', 'run', 'sniffer', '--', 'audit']
  if (form.projectId) args.push('--project', form.projectId)
  else args.push('--repo', form.repoPath || '<repo>', '--url', form.url || '<url>')
  args.push(
    '--discovery-mode', form.discoveryMode || 'hybrid',
    '--scenario', form.scenario || 'all'
  )
  if (form.executeGeneratedScenarios) args.push('--execute-generated-scenarios')
  args.push(
    '--critic-mode', form.criticMode || 'deterministic',
    '--ux-critic', form.uxCritic || 'deterministic',
    '--intent-mode', form.intentMode || 'deterministic'
  )
  if (form.productExperienceCritic && form.productExperienceCritic !== 'auto') args.push('--product-experience-critic', form.productExperienceCritic)
  args.push('--provider', form.provider || 'auto')
  args.push('--max-iterations', String(form.maxIterations ?? 3))
  if (form.consistencyCheck) args.push('--consistency-check')
  if (form.productGoal.trim()) args.push('--product-goal', form.productGoal.trim())
  return args.map(shellQuote).join(' ')
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:=@-]+$/.test(value) ? value : JSON.stringify(value)
}
