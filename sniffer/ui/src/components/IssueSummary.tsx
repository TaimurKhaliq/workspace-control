import type { Issue, SnifferReport } from '../api'
import { IssueGroupCard, severityTone } from './IssueGroupCard'

export function IssueSummary({
  report,
  selectedIssue,
  onSelectIssue,
  onCopyFixPrompt,
  onVerifyIssue
}: {
  report?: SnifferReport | null
  selectedIssue?: Issue | null
  onSelectIssue: (issue: Issue) => void
  onCopyFixPrompt: (issue: Issue) => void
  onVerifyIssue: (issue: Issue) => void
}) {
  if (!report) {
    return <Empty title="No report loaded" text="Run an audit or open the latest report." />
  }
  const issues = report.issues ?? []
  const sections = groupIssues(issues)
  return (
    <section className="report-grid">
      <div className="summary-column">
        <SummaryCards report={report} />
        {issues.length === 0 ? (
          <Empty title="No triaged issues" text="The latest report has no raw findings or repair groups." />
        ) : (
          Object.entries(sections).map(([section, rows]) => (
            <section key={section} className="card-panel issue-section">
              <div className="section-heading compact">
                <h2>{section}</h2>
                <span className="status-chip muted">{rows.length}</span>
              </div>
              <div className="issue-list">
                {rows.map((issue) => <IssueGroupCard key={issue.issue_id ?? issue.title} issue={issue} onSelect={onSelectIssue} />)}
              </div>
            </section>
          ))
        )}
      </div>
      <aside className="detail-column">
        <IssueDetail issue={selectedIssue ?? issues[0]} onCopyFixPrompt={onCopyFixPrompt} onVerifyIssue={onVerifyIssue} />
      </aside>
    </section>
  )
}

export function SummaryCards({ report }: { report: SnifferReport }) {
  const issues = report.issues ?? []
  const raw = report.rawFindings ?? []
  const high = issues.filter((issue) => issue.severity === 'critical' || issue.severity === 'high').length
  const scenarios = report.scenarioRuns ?? []
  const passedScenarios = scenarios.filter((scenario) => scenario.status === 'passed').length
  const consoleErrors = report.crawlGraph?.consoleErrors.length ?? 0
  const networkErrors = report.crawlGraph?.networkFailures.length ?? 0
  return (
    <div className="summary-cards">
      <Metric label="Raw findings" value={raw.length} />
      <Metric label="Triaged issues" value={issues.length} />
      <Metric label="Critical/high" value={high} tone={high ? 'danger' : 'good'} />
      <Metric label="Scenario pass rate" value={scenarios.length ? `${passedScenarios}/${scenarios.length}` : 'n/a'} />
      <Metric label="Console/network" value={`${consoleErrors}/${networkErrors}`} tone={consoleErrors || networkErrors ? 'danger' : 'good'} />
      <Metric label="Deferred/blocked" value={`${report.deferredFindings?.length ?? 0}/${report.blockedChecks?.length ?? 0}`} />
    </div>
  )
}

function IssueDetail({
  issue,
  onCopyFixPrompt,
  onVerifyIssue
}: {
  issue?: Issue | null
  onCopyFixPrompt: (issue: Issue) => void
  onVerifyIssue: (issue: Issue) => void
}) {
  if (!issue) return <Empty title="Issue detail" text="Select an issue to inspect evidence and repair context." />
  return (
    <section className="card-panel sticky-detail">
      <div className="section-heading compact">
        <div className="chip-row">
          <span className={`status-chip ${severityTone(issue.severity)}`}>{issue.severity}</span>
          <span className="status-chip muted">{issue.type.replace(/_/g, ' ')}</span>
        </div>
      </div>
      <h2>{issue.title}</h2>
      <p>{issue.description}</p>
      <h3>Evidence</h3>
      <ul className="evidence-list">
        {issue.evidence.map((item) => <li key={item}>{item}</li>)}
      </ul>
      {issue.suspected_files && issue.suspected_files.length > 0 && (
        <>
          <h3>Suspected files</h3>
          <div className="file-list">
            {issue.suspected_files.map((file) => <code key={file}>{file}</code>)}
          </div>
        </>
      )}
      {issue.critic_decision && (
        <details>
          <summary>Critic decision</summary>
          <pre>{JSON.stringify(issue.critic_decision, null, 2)}</pre>
        </details>
      )}
      <div className="action-row">
        <button type="button" className="secondary-button" onClick={() => onCopyFixPrompt(issue)}>Copy fix prompt</button>
        <button type="button" className="secondary-button" onClick={() => onVerifyIssue(issue)}>Run verification</button>
      </div>
    </section>
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

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <section className="card-panel empty-state">
      <h2>{title}</h2>
      <p>{text}</p>
    </section>
  )
}

function groupIssues(issues: Issue[]): Record<string, Issue[]> {
  const groups: Record<string, Issue[]> = {
    'Functional/API Issues': [],
    'Workflow Scenario Issues': [],
    'Product Intent Gaps': [],
    'UX/Layout Issues': [],
    'Accessibility Issues': [],
    'Prompt/Output Consistency Issues': [],
    'Other Issues': []
  }
  for (const issue of issues) {
    if (/api|network|console|functional/.test(issue.type)) groups['Functional/API Issues'].push(issue)
    else if (/workflow|broken|missing_form|missing_ui/.test(issue.type)) groups['Workflow Scenario Issues'].push(issue)
    else if (issue.type === 'product_intent_gap') groups['Product Intent Gaps'].push(issue)
    else if (/layout|usability|visual/.test(issue.type)) groups['UX/Layout Issues'].push(issue)
    else if (/accessibility/.test(issue.type)) groups['Accessibility Issues'].push(issue)
    else if (/semantic_mismatch|stale_output/.test(issue.type)) groups['Prompt/Output Consistency Issues'].push(issue)
    else groups['Other Issues'].push(issue)
  }
  return Object.fromEntries(Object.entries(groups).filter(([, rows]) => rows.length > 0))
}
