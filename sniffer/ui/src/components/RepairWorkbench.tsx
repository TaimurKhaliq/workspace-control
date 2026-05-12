import { useEffect, useMemo, useState } from 'react'
import {
  generateFixPacketsForIssues,
  getFixPacketDetail,
  getLatestIssues,
  getRepairHistory,
  getRepairRun,
  rerunRepairAudit,
  startAgentRepair,
  startRepair,
  verifyRepair,
  type AuditForm,
  type FixPacketDetail,
  type LatestIssueSummary,
  type RepairAttemptSummary,
  type AgentRepairTrace,
  type RepairRunRecord,
  type ServerStatus,
  type SnifferReport
} from '../api'
import { ReportContextStrip } from './ReportContextStrip'
import { ScreenshotImage } from './ScreenshotModal'

export function RepairWorkbench({
  report,
  projectId,
  projectName,
  form,
  status,
  onAuditQueued,
  onRefreshReport
}: {
  report?: SnifferReport | null
  projectId?: string
  projectName?: string
  form: AuditForm
  status?: ServerStatus
  onAuditQueued: (runId: string) => void
  onRefreshReport: () => void
}) {
  const [issues, setIssues] = useState<LatestIssueSummary[]>([])
  const [selectedIssueId, setSelectedIssueId] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [fixPacket, setFixPacket] = useState<FixPacketDetail | null>(null)
  const [repairRun, setRepairRun] = useState<RepairRunRecord | null>(null)
  const [agentTrace, setAgentTrace] = useState<AgentRepairTrace | null>(null)
  const [history, setHistory] = useState<RepairAttemptSummary[]>([])
  const [agent, setAgent] = useState<'manual' | 'codex'>('manual')
  const [mode, setMode] = useState<'repair-proof' | 'apply-fix'>('repair-proof')
  const [filter, setFilter] = useState<'all' | 'open' | 'fixed' | 'failed'>('all')
  const [allowDestructiveConfirmed, setAllowDestructiveConfirmed] = useState(false)
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void refreshIssues()
  }, [projectId, report?.generatedAt])

  useEffect(() => {
    if (!selectedIssueId && issues[0]) setSelectedIssueId(issues[0].issueId)
  }, [issues, selectedIssueId])

  useEffect(() => {
    if (!selectedIssueId) {
      setFixPacket(null)
      setHistory([])
      return
    }
    void Promise.all([
      getFixPacketDetail(selectedIssueId, projectId).then(setFixPacket).catch(() => setFixPacket(null)),
      getRepairHistory(projectId, selectedIssueId).then(setHistory).catch(() => setHistory([]))
    ])
  }, [selectedIssueId, projectId])

  useEffect(() => {
    if (!repairRun || repairRun.status !== 'running') return
    const timer = window.setInterval(() => {
      void getRepairRun(repairRun.repairRunId)
        .then((next) => {
          setRepairRun(next)
          if (next.status !== 'running') {
            void refreshIssues()
            if (selectedIssueId) void getRepairHistory(projectId, selectedIssueId).then(setHistory).catch(() => undefined)
          }
        })
        .catch((err) => setError(errorMessage(err)))
    }, 1200)
    return () => window.clearInterval(timer)
  }, [repairRun, projectId, selectedIssueId])

  const selectedIssue = issues.find((issue) => issue.issueId === selectedIssueId)
  const filteredIssues = useMemo(() => issues.filter((issue) => {
    if (filter === 'all') return true
    if (filter === 'open') return !['fixed', 'succeeded'].includes(issue.status) && issue.repairStatus !== 'succeeded'
    if (filter === 'fixed') return issue.status === 'fixed' || issue.repairStatus === 'applied' || issue.repairStatus === 'succeeded'
    return issue.status === 'failed' || issue.repairStatus === 'failed'
  }), [issues, filter])
  const selectedIssueIds = selectedIds.size ? [...selectedIds] : selectedIssueId ? [selectedIssueId] : []
  const codexUnavailable = agent === 'codex' && !status?.agent.configured
  const destructiveHint = packetLooksDestructive(fixPacket?.prompt ?? '')

  async function refreshIssues() {
    setError('')
    const next = await getLatestIssues(projectId).catch((err) => {
      setError(errorMessage(err))
      return []
    })
    setIssues(next)
    if (next[0] && !selectedIssueId) setSelectedIssueId(next[0].issueId)
  }

  async function generateSelectedFixes() {
    setLoading('Generating fix packets')
    setError('')
    try {
      await generateFixPacketsForIssues(projectId, selectedIssueIds)
      await refreshIssues()
      if (selectedIssueId) setFixPacket(await getFixPacketDetail(selectedIssueId, projectId))
      onRefreshReport()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading('')
    }
  }

  async function runRepair() {
    if (!selectedIssueId) return
    setLoading('Starting repair')
    setError('')
    try {
      const started = await startRepair({
        project: projectId,
        issueId: selectedIssueId,
        agent,
        mode,
        allowDestructiveConfirmed
      })
      const next = await getRepairRun(started.repairRunId)
      setRepairRun(next)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading('')
    }
  }

  async function runAgentRepair() {
    if (!selectedIssueId) return
    setLoading('Running agent repair graph')
    setError('')
    try {
      const trace = await startAgentRepair({
        project: projectId,
        issueId: selectedIssueId,
        agent,
        maxRetries: 1,
        autoApprove: false,
        dryRun: mode === 'repair-proof'
      })
      setAgentTrace(trace)
      await refreshIssues()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading('')
    }
  }

  async function runVerification() {
    if (!repairRun) return
    setLoading('Running verification')
    setError('')
    try {
      await verifyRepair(repairRun.repairRunId, form.url)
      setRepairRun(await getRepairRun(repairRun.repairRunId))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading('')
    }
  }

  async function rerunAudit() {
    if (!repairRun) return
    setLoading('Rerunning audit')
    setError('')
    try {
      const result = await rerunRepairAudit(repairRun.repairRunId, form)
      onAuditQueued(result.runId)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading('')
    }
  }

  function toggleIssue(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="page-stack" data-testid="repair-workbench-view">
      <ReportContextStrip report={report} projectId={projectId} projectName={projectName} />
      <section className="card-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Repair workflow</p>
            <h2>Repair Workbench</h2>
            <p className="muted">Generate fix packets, run manual proof or configured Codex repair, inspect output, and verify issues from the latest report.</p>
          </div>
          <div className="chip-row">
            <span className="status-chip muted">{issues.length} issues</span>
            <span className={`status-chip ${status?.agent.configured ? 'good' : 'muted'}`}>Codex {status?.agent.configured ? 'configured' : 'not configured'}</span>
          </div>
        </div>
        {error && <div className="alert danger" role="alert">{error}</div>}
        {loading && <div className="status-note" role="status">{loading}...</div>}
      </section>

      <div className="repair-workbench-grid">
        <section className="card-panel repair-column" data-testid="repair-issue-list">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Latest report</p>
              <h2>Issues</h2>
            </div>
            <select aria-label="Issue filter" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="fixed">Fixed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          {filteredIssues.length === 0 ? (
            <p className="empty-state">No issues found in the selected report.</p>
          ) : (
            <div className="repair-issue-list">
              {filteredIssues.map((issue) => (
                <div key={issue.issueId} className={selectedIssueId === issue.issueId ? 'repair-issue-row active' : 'repair-issue-row'}>
                  <label className="repair-check">
                    <input
                      type="checkbox"
                      aria-label={`Select ${issue.title}`}
                      checked={selectedIds.has(issue.issueId)}
                      onChange={() => toggleIssue(issue.issueId)}
                    />
                  </label>
                  <button type="button" className="repair-issue-button" onClick={() => setSelectedIssueId(issue.issueId)}>
                    <span className={`status-chip ${issue.severity === 'critical' || issue.severity === 'high' ? 'danger' : issue.severity === 'medium' ? 'warn' : 'muted'}`}>{issue.severity}</span>
                    <strong>{issue.title}</strong>
                    <small>{issue.type.replace(/_/g, ' ')} · {issue.hasFixPacket ? 'fix packet ready' : 'no packet yet'}{issue.repairStatus ? ` · repair ${issue.repairStatus}` : ''}</small>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card-panel repair-column" data-testid="repair-fix-packet">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Selected issue</p>
              <h2>{selectedIssue?.title ?? 'Issue detail'}</h2>
            </div>
            <button type="button" className="secondary-button" onClick={() => void generateSelectedFixes()}>
              {selectedIssue?.hasFixPacket ? 'Regenerate packet' : 'Generate packet'}
            </button>
          </div>
          {selectedIssue ? (
            <IssueDetail issue={selectedIssue} />
          ) : (
            <p className="empty-state">Select an issue to inspect its evidence and repair packet.</p>
          )}
          {selectedIssue?.screenshotArtifactUrl && (
            <div className="repair-screenshot">
              <ScreenshotImage src={selectedIssue.screenshotArtifactUrl} alt={`${selectedIssue.title} screenshot`} />
            </div>
          )}
          {fixPacket ? (
            <FixPacketPanel packet={fixPacket} />
          ) : selectedIssue ? (
            <div className="empty-state">No fix packet found yet. Generate one to inspect the Codex-ready prompt.</div>
          ) : null}
        </section>

        <section className="card-panel repair-column repair-runner" data-testid="repair-runner">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Runner</p>
              <h2>Repair attempt</h2>
            </div>
          </div>
          <div className="form-grid one-col">
            <label>
              Agent
              <select value={agent} onChange={(event) => setAgent(event.target.value as 'manual' | 'codex')}>
                <option value="manual">manual</option>
                <option value="codex">codex</option>
              </select>
            </label>
            <label>
              Mode
              <select value={mode} onChange={(event) => setMode(event.target.value as 'repair-proof' | 'apply-fix')}>
                <option value="repair-proof">repair proof</option>
                <option value="apply-fix">apply fix</option>
              </select>
            </label>
          </div>
          {codexUnavailable && <div className="notice warning">Codex is not configured. Set SNIFFER_CODEX_COMMAND on the local server to enable Codex repairs.</div>}
          {destructiveHint && (
            <label className="checkbox-line">
              <input type="checkbox" checked={allowDestructiveConfirmed} onChange={(event) => setAllowDestructiveConfirmed(event.target.checked)} />
              Confirm this packet may mention destructive language and should still be run.
            </label>
          )}
          <div className="action-row">
            <button type="button" className="primary-button" disabled={!selectedIssueId || codexUnavailable || Boolean(loading)} onClick={() => void runRepair()}>
              Run {mode === 'repair-proof' ? 'repair proof' : agent === 'codex' ? 'Codex repair' : 'manual apply-fix'}
            </button>
            <button type="button" className="secondary-button" disabled={!selectedIssueId || Boolean(loading)} onClick={() => void runAgentRepair()}>
              Run Agent Repair
            </button>
            <button type="button" className="secondary-button" disabled={!repairRun || repairRun.verification.status === 'running'} onClick={() => void runVerification()}>Run verification</button>
            <button type="button" className="secondary-button" disabled={!repairRun} onClick={() => void rerunAudit()}>Rerun audit</button>
          </div>
          {agentTrace && <AgentTracePanel trace={agentTrace} />}
          {repairRun ? <RepairRunPanel run={repairRun} /> : <p className="muted">Manual repair proof is the default. It writes a repair result and should not modify files.</p>}
          {history.length > 0 && <RepairHistory attempts={history} />}
        </section>
      </div>
    </section>
  )
}

function IssueDetail({ issue }: { issue: LatestIssueSummary }) {
  return (
    <div className="repair-detail-stack">
      <div className="chip-row">
        <span className="status-chip warn">{issue.status}</span>
        <span className="status-chip muted">{issue.type.replace(/_/g, ' ')}</span>
      </div>
      {issue.evidenceSummary.length > 0 && (
        <div>
          <h3>Evidence</h3>
          <ul className="evidence-list">
            {issue.evidenceSummary.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
      {issue.suspectedFiles.length > 0 && (
        <div>
          <h3>Suspected files</h3>
          <div className="file-list">{issue.suspectedFiles.map((file) => <code key={file} title={file}>{file}</code>)}</div>
        </div>
      )}
    </div>
  )
}

function FixPacketPanel({ packet }: { packet: FixPacketDetail }) {
  return (
    <div className="repair-detail-stack">
      <div className="section-heading compact">
        <h3>Fix packet</h3>
        <button type="button" className="secondary-button small" onClick={() => void navigator.clipboard?.writeText(packet.prompt || packet.markdown)}>Copy prompt</button>
      </div>
      {packet.json && (
        <div className="repair-path-policy">
          <div><span>Repair root</span><code title={packet.json.repair_root}>{packet.json.repair_root}</code></div>
          <div><span>Allowed paths</span><code title={packet.json.allowed_paths.join(', ')}>{packet.json.allowed_paths.join(', ') || 'none'}</code></div>
        </div>
      )}
      <details open className="packet-section-card">
        <summary>Prompt</summary>
        <pre>{packet.prompt || packet.markdown || 'No prompt content found.'}</pre>
      </details>
      {packet.verificationCommand && (
        <details className="packet-section-card">
          <summary>Verification</summary>
          <pre>{packet.verificationCommand}</pre>
          {packet.passConditions.length > 0 && <ul className="evidence-list">{packet.passConditions.map((item) => <li key={item}>{item}</li>)}</ul>}
        </details>
      )}
      <details className="packet-section-card">
        <summary>Raw packet</summary>
        <pre>{packet.markdown}</pre>
      </details>
    </div>
  )
}

function RepairRunPanel({ run }: { run: RepairRunRecord }) {
  return (
    <div className="repair-detail-stack">
      <div className="repair-status-timeline">
        <span className={`status-chip ${run.status === 'succeeded' ? 'good' : run.status === 'failed' ? 'danger' : 'warn'}`}>{run.status}</span>
        <span className="status-chip muted">{run.agent}</span>
        <span className="status-chip muted">{run.mode}</span>
        <span className={`status-chip ${run.verification.status === 'passed' ? 'good' : run.verification.status === 'failed' ? 'danger' : 'muted'}`}>verification {run.verification.status}</span>
      </div>
      <div>
        <h3>Live output</h3>
        <div className="log-panel repair-log-panel" data-testid="repair-log-viewer">
          <pre>{run.stdoutTail || run.stderrTail || run.logs.join('\n') || 'Waiting for output...'}</pre>
          {run.stderrTail && <pre>{run.stderrTail}</pre>}
        </div>
      </div>
      <div data-testid="repair-diff-viewer">
        <h3>Changed files and diff</h3>
        {run.changedFiles.length === 0 ? (
          <p className="muted">No files changed{run.mode === 'repair-proof' || run.agent === 'manual' ? '; this is expected for manual proof mode.' : '.'}</p>
        ) : (
          <div className="file-list">{run.changedFiles.map((file) => <code key={file}>{file}</code>)}</div>
        )}
        {run.diffSummary && <pre className="markdown-preview">{run.diffSummary}</pre>}
        {run.rawDiff && (
          <details className="packet-section-card">
            <summary>Raw diff</summary>
            <button type="button" className="secondary-button small" onClick={() => void navigator.clipboard?.writeText(run.rawDiff ?? '')}>Copy raw diff</button>
            <pre>{run.rawDiff}</pre>
          </details>
        )}
      </div>
    </div>
  )
}

function AgentTracePanel({ trace }: { trace: AgentRepairTrace }) {
  return (
    <details className="packet-section-card" open>
      <summary>Agent trace · {trace.finalDecision ?? trace.status}</summary>
      <div className="repair-status-timeline">
        <span className={`status-chip ${trace.status === 'succeeded' ? 'good' : trace.status === 'failed' ? 'danger' : 'warn'}`}>{trace.status}</span>
        <span className="status-chip muted">{trace.currentNode ?? 'agent graph'}</span>
        <span className="status-chip muted">approval {trace.approval.status}</span>
      </div>
      <ol className="agent-event-list">
        {trace.traceEvents.map((event) => (
          <li key={event.id}>
            <strong>{event.node}</strong>
            <span>{event.status}</span>
            <p>{event.message}</p>
          </li>
        ))}
      </ol>
      <p className="muted" title={trace.traceMarkdownPath}>Trace: {trace.traceMarkdownPath}</p>
    </details>
  )
}

function RepairHistory({ attempts }: { attempts: RepairAttemptSummary[] }) {
  return (
    <details className="packet-section-card">
      <summary>Repair attempt history</summary>
      <div className="repair-history-list">
        {attempts.map((attempt) => (
          <div key={attempt.attemptDir} className="repair-history-row">
            <strong>{attempt.status}</strong>
            <span>{attempt.agent} · {new Date(attempt.updatedAt).toLocaleString()}</span>
            <small title={attempt.attemptDir}>{attempt.attemptDir}</small>
          </div>
        ))}
      </div>
    </details>
  )
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function packetLooksDestructive(prompt: string): boolean {
  const relevant = prompt
    .split(/^Safety constraints:\s*$/im)[0]
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:[-*]\s*)?(do not|never|without|unless|no destructive|only modify)\b/i.test(line))
    .join('\n')
  return /\b(delete|remove|reset|drop|truncate|overwrite|destroy|purge)\b/i.test(relevant)
}
