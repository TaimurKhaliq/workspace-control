import type { ScreenshotItem, SnifferReport } from '../api'
import { buildScreenshotEvidenceItems, type ScreenshotEvidenceItem } from '../report/screenshots'
import { ReportContextStrip } from './ReportContextStrip'
import { ScreenshotImage, ScreenshotModal, type ScreenshotContext } from './ScreenshotModal'
import { useMemo, useState } from 'react'

export function ScreenshotGallery({ report, screenshots, projectId, projectName }: { report?: SnifferReport | null; screenshots: ScreenshotItem[]; projectId?: string; projectName?: string }) {
  const [selected, setSelected] = useState<ScreenshotContext | null>(null)
  const evidenceItems = useMemo(() => buildScreenshotEvidenceItems(report, screenshots), [report, screenshots])
  const groups = evidenceItems.reduce<Record<string, ScreenshotEvidenceItem[]>>((acc, item) => {
    acc[item.group] ??= []
    acc[item.group].push(item)
    return acc
  }, {})

  return (
    <section className="page-stack">
      <ReportContextStrip report={report} projectId={projectId} projectName={projectName} />
      <section className="card-panel">
        <p className="eyebrow">Evidence gallery</p>
        <h2>Screenshots</h2>
        <p className="muted">Screenshots are grouped by crawl state, scenario, and evidence source so each image can be traced back to the action or screen that produced it.</p>
      </section>
      {evidenceItems.length === 0 && (
        <section className="card-panel empty-state">
          <h2>No screenshots found</h2>
          <p>Run an audit with crawl/scenario checks to populate evidence.</p>
        </section>
      )}
      {Object.entries(groups).map(([group, rows]) => (
        <section key={group} className="card-panel">
          <div className="section-heading compact">
            <h2>{group || 'states'}</h2>
            <span className="status-chip muted">{rows.length}</span>
          </div>
          <div className="screenshot-grid">
            {rows.map((item) => (
              <button key={item.relativePath} type="button" className="screenshot-card" onClick={() => setSelected(contextForModal(item))}>
                <ScreenshotImage src={item.url} alt={`Sniffer screenshot ${item.name}`} />
                <span className="status-chip muted">{item.typeLabel}</span>
                <strong>{item.name}</strong>
                <span>{item.contextSummary}</span>
                <dl className="screenshot-card-meta">
                  <Meta label="Scenario" value={item.scenarioName} />
                  <Meta label="Step" value={item.stepLabel} />
                  <Meta label="Action" value={item.actionLabel} />
                  <Meta label="Screen" value={item.screenName} />
                  <Meta label="URL" value={item.pageUrl} />
                  <Meta label="Sequence" value={item.sequenceLabel} />
                  {item.relatedIssues[0] && <Meta label="Issue" value={item.relatedIssues[0].title} />}
                  {!item.contextAvailable && <Meta label="Context" value="Context unavailable" />}
                </dl>
              </button>
            ))}
          </div>
        </section>
      ))}
      <ScreenshotModal screenshot={selected} projectId={projectId} onClose={() => setSelected(null)} />
    </section>
  )
}

function Meta({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

function contextForModal(item: ScreenshotEvidenceItem): ScreenshotContext {
  return {
    src: item.relativePath,
    title: item.name,
    subtitle: item.contextSummary,
    details: item.details,
    artifactUrl: item.pageUrl,
    sourcePath: item.relativePath
  }
}
