import type { Issue } from '../api'

export function IssueGroupCard({ issue, onSelect }: { issue: Issue; onSelect: (issue: Issue) => void }) {
  return (
    <article className="issue-card">
      <div className="issue-card-head">
        <div className="chip-row">
          <span className={`status-chip ${severityTone(issue.severity)}`}>{issue.severity}</span>
          <span className="status-chip muted">{issue.type.replace(/_/g, ' ')}</span>
        </div>
        <button type="button" className="ghost-button" onClick={() => onSelect(issue)}>Details</button>
      </div>
      <h3>{issue.title}</h3>
      <p>{issue.description}</p>
      {issue.evidence.length > 0 && (
        <ul className="evidence-list">
          {issue.evidence.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
      {issue.suspected_files && issue.suspected_files.length > 0 && (
        <div className="file-list">
          {issue.suspected_files.slice(0, 4).map((file) => <code key={file}>{file}</code>)}
        </div>
      )}
    </article>
  )
}

export function severityTone(severity: string): 'danger' | 'warn' | 'good' | 'muted' {
  if (severity === 'critical' || severity === 'high') return 'danger'
  if (severity === 'medium') return 'warn'
  if (severity === 'low') return 'muted'
  return 'good'
}
