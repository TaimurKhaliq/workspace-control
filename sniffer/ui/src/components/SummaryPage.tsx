import type { FixPacketItem, Issue, ScreenshotItem, ServerStatus, SnifferReport } from '../api'
import { buildReportSummary } from '../report/journey'
import { AuditLauncher } from './AuditLauncher'
import type { AuditForm } from '../api'
import type { MascotState } from './SnifferMascot'

export function SummaryPage({
  report,
  fixPackets,
  screenshots,
  status,
  form,
  mascotState,
  error,
  onFormChange,
  onRunAudit,
  onRunConsistency,
  onGenerateFixes,
  onOpenReport,
  onSelectIssue
}: {
  report?: SnifferReport | null
  fixPackets: FixPacketItem[]
  screenshots: ScreenshotItem[]
  status?: ServerStatus
  form: AuditForm
  mascotState: MascotState
  error?: string
  onFormChange: (patch: Partial<AuditForm>) => void
  onRunAudit: () => void
  onRunConsistency: () => void
  onGenerateFixes: () => void
  onOpenReport: () => void
  onSelectIssue: (issue: Issue) => void
}) {
  const summary = buildReportSummary(report, fixPackets, screenshots)
  return (
    <div className="page-stack">
      <section className="summary-hero">
        <div>
          <p className="eyebrow">Summary</p>
          <h2>Latest Sniffer run</h2>
          <p>{report ? `Generated ${new Date(report.generatedAt).toLocaleString()}` : 'No report loaded yet.'}</p>
        </div>
        <span className={`status-chip ${summary.overallStatus === 'failed' ? 'danger' : summary.overallStatus === 'warning' ? 'warn' : 'good'}`}>
          {summary.overallStatus}
        </span>
      </section>
      <div className="summary-cards">
        <Metric label="Scenarios" value={`${summary.scenariosPassed} passed / ${summary.scenariosFailed} failed`} tone={summary.scenariosFailed ? 'danger' : 'good'} />
        <Metric label="Real issues" value={summary.realIssues} tone={summary.realIssues ? 'warn' : 'good'} />
        <Metric label="Product gaps" value={summary.productGaps} tone={summary.productGaps ? 'warn' : 'good'} />
        <Metric label="UX/accessibility" value={summary.uxIssues} tone={summary.uxIssues ? 'warn' : 'good'} />
        <Metric label="Fix packets" value={summary.fixPackets} />
        <Metric label="Screenshots" value={summary.screenshots} />
      </div>
      {summary.topIssues.length > 0 && (
        <section className="card-panel">
          <div className="section-heading compact">
            <h2>Top repair groups</h2>
            <span className="status-chip muted">{summary.topIssues.length}</span>
          </div>
          <div className="compact-issue-list">
            {summary.topIssues.map((issue) => (
              <button key={issue.issue_id ?? issue.title} type="button" className="compact-issue-card" onClick={() => onSelectIssue(issue)}>
                <span className={`status-chip ${issue.severity === 'high' || issue.severity === 'critical' ? 'danger' : issue.severity === 'medium' ? 'warn' : 'muted'}`}>{issue.severity}</span>
                <strong>{issue.title}</strong>
                <small>{issue.type.replace(/_/g, ' ')}</small>
              </button>
            ))}
          </div>
        </section>
      )}
      <AuditLauncher
        form={form}
        status={status}
        mascotState={mascotState}
        error={error}
        onChange={onFormChange}
        onRunAudit={onRunAudit}
        onRunConsistency={onRunConsistency}
        onGenerateFixes={onGenerateFixes}
        onOpenReport={onOpenReport}
      />
    </div>
  )
}

function Metric({ label, value, tone = 'muted' }: { label: string; value: string | number; tone?: 'good' | 'warn' | 'danger' | 'muted' }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </article>
  )
}
