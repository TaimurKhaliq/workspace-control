import { useMemo, useState } from 'react'
import type { SnifferReport } from '../api'
import { buildCrawlCoverage, buildCrawlPath } from '../report/journey'
import { ScreenshotModal, type ScreenshotContext, artifactUrl } from './ScreenshotModal'

export function CrawlPathView({ report }: { report?: SnifferReport | null }) {
  const states = useMemo(() => buildCrawlPath(report), [report])
  const coverage = useMemo(() => buildCrawlCoverage(report), [report])
  const [screenshot, setScreenshot] = useState<ScreenshotContext | null>(null)
  const errors = [...(report?.crawlGraph?.consoleErrors ?? []), ...(report?.crawlGraph?.networkFailures ?? [])]
  return (
    <section className="page-stack" data-testid="crawl-path-view">
      <section className="card-panel">
        <p className="eyebrow">Crawl Path</p>
        <h2>Runtime states and safe actions</h2>
        <p className="muted">Replay the path Sniffer crawled, including state hashes, visible controls, screenshots, and repeated actions.</p>
      </section>
      <section className="coverage-panel" data-testid="crawl-coverage-panel">
        <Metric label="Routes visited" value={coverage.visitedRoutes.length} tone={coverage.missedRoutes.length ? 'warn' : 'good'} />
        <Metric label="Routes missed" value={coverage.missedRoutes.length} tone={coverage.missedRoutes.length ? 'warn' : 'good'} />
        <Metric label="Workflows exercised" value={`${coverage.workflowsExercised}/${coverage.workflowsDiscovered}`} />
        <Metric label="Scenarios" value={`${coverage.scenariosPassed} passed / ${coverage.scenariosFailed} failed`} tone={coverage.scenariosFailed ? 'danger' : 'good'} />
        <Metric label="Skipped safe actions" value={coverage.safeActionsSkipped.length} tone={coverage.safeActionsSkipped.length ? 'warn' : 'good'} />
      </section>
      <section className="card-panel">
        <div className="coverage-grid">
          <RouteList title="Source routes" routes={coverage.sourceRoutes} empty="No source routes inferred." />
          <RouteList title="Visited routes" routes={coverage.visitedRoutes} empty="No routes visited." />
          <RouteList title="Missed routes" routes={coverage.missedRoutes} empty="No missed routes." />
        </div>
        {coverage.safeActionsSkipped.length > 0 && (
          <details>
            <summary>Safe actions not explored ({coverage.safeActionsSkipped.length})</summary>
            <ul className="evidence-list">
              {coverage.safeActionsSkipped.slice(0, 18).map((action, index) => (
                <li key={`${action.label}-${index}`}>{action.label}: {action.reason}{action.route ? ` (${action.route})` : ''}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
      <div className="crawl-path">
        {states.map((state, index) => (
          <article key={`${state.hash}-${index}`} className="crawl-state-card">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">{state.pageType} · {state.hashRoute}</p>
                <h2>{state.sequenceNumber} · {state.screenName}</h2>
                <p className="muted">{state.url} · hash {state.hash}</p>
                <div className="chip-row">
                  {Object.entries(state.controlsByKind).map(([kind, controls]) => controls.length > 0 ? <span key={kind} className="status-chip muted">{kind}s: {controls.length}</span> : null)}
                  {state.issuesOnState.length > 0 && <span className="status-chip danger">issues: {state.issuesOnState.length}</span>}
                  {state.screenshot && <span className="status-chip good">screenshot</span>}
                  {state.duplicateCount > 1 && <span className="status-chip muted">{state.duplicateCount} observations</span>}
                </div>
              </div>
              {state.screenshot && (
                <button type="button" className="secondary-button" onClick={() => setScreenshot({
                  src: state.screenshot!,
                  title: `State ${state.sequenceNumber} · ${state.screenName}`,
                  subtitle: `${state.hashRoute} · ${state.url}`,
                  details: [
                    `Hash: ${state.hash}`,
                    `Visible controls: ${Object.values(state.controlsByKind).flat().length}`,
                    state.issuesOnState.length ? `Issues: ${state.issuesOnState.join(', ')}` : 'Issues: none',
                    state.relatedWorkflows.length ? `Workflows: ${state.relatedWorkflows.join(', ')}` : 'Workflows: none'
                  ]
                })}>Screenshot</button>
              )}
            </div>
            {state.screenshot && <img className="crawl-thumbnail" src={artifactUrl(state.screenshot)} alt={`State ${state.sequenceNumber} ${state.screenName}`} />}
            {state.repeatedActionLabels.length > 0 && (
              <div className="notice warning">
                Repeated action without obvious route change: {state.repeatedActionLabels.join(', ')}
              </div>
            )}
            <div className="control-kind-grid">
              {Object.entries(state.controlsByKind).map(([kind, controls]) => (
                <details key={kind} open={kind === 'button' || kind === 'input'}>
                  <summary>{kind}s ({controls.length})</summary>
                  <ul className="evidence-list">
                    {controls.slice(0, 12).map((control, controlIndex) => (
                      <li key={`${control.label}-${controlIndex}`}>
                        {control.label}{control.selector ? ` · ${control.selector}` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
            <div className="crawl-actions">
              {state.outgoingActions.map((action, actionIndex) => (
                <div key={`${action.label}-${actionIndex}`} className="crawl-action-row">
                  <span className={`status-chip ${action.skipped ? 'muted' : action.changedState === false ? 'warn' : 'good'}`}>{action.actionType ?? action.type}</span>
                  <strong>{action.actionType ?? action.type} {action.label}</strong>
                  <span>{action.skipped ? 'skipped' : action.changedState === false ? 'state unchanged' : 'changed URL/state'}</span>
                  <small>{action.skippedReason ?? action.safeReason ?? action.reason}</small>
                </div>
              ))}
            </div>
            {state.relatedWorkflows.length > 0 && (
              <div className="chip-row">
                {state.relatedWorkflows.map((workflow) => <span key={workflow} className="status-chip muted">{workflow}</span>)}
              </div>
            )}
          </article>
        ))}
      </div>
      {errors.length > 0 && (
        <section className="card-panel">
          <h2>Runtime errors</h2>
          <pre>{JSON.stringify(errors, null, 2)}</pre>
        </section>
      )}
      <ScreenshotModal screenshot={screenshot} onClose={() => setScreenshot(null)} />
    </section>
  )
}

function Metric({ label, value, tone = 'muted' }: { label: string; value: string | number; tone?: 'good' | 'warn' | 'danger' | 'muted' }) {
  return (
    <article className="graph-metric">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </article>
  )
}

function RouteList({ title, routes, empty }: { title: string; routes: string[]; empty: string }) {
  return (
    <div>
      <h3>{title}</h3>
      {routes.length === 0 ? <p className="muted">{empty}</p> : (
        <div className="chip-row">{routes.map((route) => <span key={route} className="status-chip muted">{route}</span>)}</div>
      )}
    </div>
  )
}
