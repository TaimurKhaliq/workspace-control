import type { SnifferReport } from '../api'
import { SummaryCards } from './IssueSummary'

export function ReportViewer({
  report,
  markdown,
  onRefresh
}: {
  report?: SnifferReport | null
  markdown?: string
  onRefresh: () => void
}) {
  return (
    <section className="page-stack">
      <section className="card-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Latest report</p>
            <h2>{report ? new Date(report.generatedAt).toLocaleString() : 'No report loaded'}</h2>
          </div>
          <button type="button" className="secondary-button" onClick={onRefresh}>Refresh report</button>
        </div>
        {report && <SummaryCards report={report} />}
      </section>

      {report?.productIntent && (
        <section className="card-panel">
          <p className="eyebrow">Product Intent Model</p>
          <h2>{report.productIntent.app_category?.replace(/_/g, ' ') ?? 'unknown'}</h2>
          <p>{report.productIntent.product_summary}</p>
          <div className="chip-row">
            {report.productIntent.core_entities?.slice(0, 12).map((entity) => (
              <span key={entity.name} className="status-chip muted">{entity.name}</span>
            ))}
          </div>
        </section>
      )}

      {report?.promptConsistency?.enabled && (
        <section className="card-panel">
          <p className="eyebrow">Prompt/Output Consistency</p>
          <h2>Consistency runs</h2>
          <div className="consistency-list">
            {report.promptConsistency.runs.map((run) => (
              <article key={run.input_prompt} className="mini-card">
                <span className={`status-chip ${run.consistency_status === 'consistent' ? 'good' : 'danger'}`}>{run.consistency_status}</span>
                <strong>{run.input_prompt}</strong>
                {run.response_feature_request && <p>Response: {run.response_feature_request}</p>}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="card-panel markdown-card">
        <div className="section-heading compact">
          <h2>Markdown report</h2>
          <span className="status-chip muted">read-only</span>
        </div>
        <pre>{markdown || 'No markdown report found yet.'}</pre>
      </section>
    </section>
  )
}
