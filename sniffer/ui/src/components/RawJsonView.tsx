import type { SnifferReport } from '../api'

export function RawJsonView({ report }: { report?: SnifferReport | null }) {
  const json = report ? JSON.stringify(report, null, 2) : 'No report loaded.'
  return (
    <section className="page-stack" data-testid="raw-json-view">
      <section className="card-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Raw JSON</p>
            <h2>Latest report payload</h2>
            <p className="muted">Use this only when you need the underlying report object.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => void navigator.clipboard?.writeText(json)}>Copy JSON</button>
        </div>
        <pre className="raw-json-panel">{json}</pre>
      </section>
    </section>
  )
}
