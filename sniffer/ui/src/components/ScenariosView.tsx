import { useMemo, useState } from 'react'
import type { SnifferReport } from '../api'
import { buildScenarioViews, type ScenarioView } from '../report/journey'
import { ScreenshotImage, ScreenshotModal, type ScreenshotContext, artifactUrl } from './ScreenshotModal'

export function ScenariosView({ report, projectId }: { report?: SnifferReport | null; projectId?: string }) {
  const scenarios = useMemo(() => buildScenarioViews(report), [report])
  const generated = report?.generatedScenarios ?? []
  const [selectedSlug, setSelectedSlug] = useState('')
  const [screenshot, setScreenshot] = useState<ScreenshotContext | null>(null)
  const selected = scenarios.find((scenario) => (scenario.scenario.slug ?? scenario.scenario.name) === selectedSlug) ?? scenarios[0]
  return (
    <section className="report-grid" data-testid="scenarios-view">
      <div className="summary-column">
        <section className="card-panel">
          <p className="eyebrow">Scenarios</p>
          <h2>Workflow execution</h2>
          <p className="muted">Each scenario is a safe workflow Sniffer attempted, with assertions and screenshots.</p>
          <div className="chip-row">
            <span className="status-chip muted">Generated: {generated.length}</span>
            <span className="status-chip muted">Executed: {scenarios.length}</span>
          </div>
        </section>
        {generated.length > 0 && (
          <section className="card-panel">
            <h3>Generated Scenarios</h3>
            <div className="scenario-card-list">
              {generated.map((scenario) => {
                const run = report?.scenarioRuns?.find((item) => item.slug === scenario.id || item.name === scenario.name)
                return (
                  <article key={scenario.id} className="scenario-card">
                    <span className={`status-chip ${run?.status === 'failed' ? 'danger' : run?.status === 'passed' ? 'good' : 'muted'}`}>{run ? run.status : 'not executed'}</span>
                    <strong>{scenario.name}</strong>
                    <small>{scenario.confidence} · {scenario.destructiveRisk ?? 'none'} risk · {scenario.steps?.length ?? 0} steps</small>
                  </article>
                )
              })}
            </div>
            {scenarios.length === 0 && <p className="muted">Scenarios were generated but not executed. Run with `--execute-generated-scenarios` or use `--scenario auto/all`.</p>}
          </section>
        )}
        <div className="scenario-card-list">
          {scenarios.map((view) => (
            <button
              key={view.scenario.slug ?? view.scenario.name}
              type="button"
              className={`scenario-card ${(selected?.scenario.slug ?? selected?.scenario.name) === (view.scenario.slug ?? view.scenario.name) ? 'active' : ''}`}
              onClick={() => setSelectedSlug(view.scenario.slug ?? view.scenario.name)}
            >
              <span className={`status-chip ${view.scenario.status === 'failed' ? 'danger' : view.scenario.status === 'passed' ? 'good' : 'muted'}`}>{view.scenario.status}</span>
              <strong>{view.scenario.name}</strong>
              <small>{view.steps.length} steps/assertions · {view.scenario.screenshots?.length ?? 0} screenshots</small>
            </button>
          ))}
        </div>
      </div>
      <aside className="detail-column">
        {selected ? <ScenarioDetail view={selected} projectId={projectId} onScreenshot={setScreenshot} /> : <EmptyScenario />}
      </aside>
      <ScreenshotModal screenshot={screenshot} projectId={projectId} onClose={() => setScreenshot(null)} />
    </section>
  )
}

function ScenarioDetail({ view, projectId, onScreenshot }: { view: ScenarioView; projectId?: string; onScreenshot: (screenshot: ScreenshotContext) => void }) {
  return (
    <section className="card-panel sticky-detail">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Scenario detail</p>
          <h2>{view.scenario.name}</h2>
        </div>
        <span className={`status-chip ${view.scenario.status === 'failed' ? 'danger' : view.scenario.status === 'passed' ? 'good' : 'muted'}`}>{view.scenario.status}</span>
      </div>
      {view.scenario.prerequisites && view.scenario.prerequisites.length > 0 && (
        <>
          <h3>Prerequisites</h3>
          <ul className="evidence-list">{view.scenario.prerequisites.map((item) => <li key={item}>{item}</li>)}</ul>
        </>
      )}
      <div className="scenario-step-list">
        {view.steps.map((step) => (
          <article key={`${step.index}-${step.label}`} className={`scenario-step ${step.status}`}>
            <div className="step-head">
              <span className="phase-index">{step.index + 1}</span>
              <div>
                <strong>{step.label}</strong>
                <small>{step.actionType}</small>
              </div>
              <span className={`status-chip ${step.status === 'failed' ? 'danger' : step.status === 'passed' ? 'good' : 'muted'}`}>{step.status}</span>
            </div>
            {step.evidence.length > 0 && <p className="muted">{step.evidence.join(' · ')}</p>}
            {step.screenshot && (
              <button
                type="button"
                className="inline-screenshot"
                onClick={() => onScreenshot({
                  src: step.screenshot!,
                  title: `${view.scenario.name}: ${step.label}`,
                  subtitle: step.status,
                  details: step.evidence
                })}
              >
                <ScreenshotImage src={artifactUrl(step.screenshot, projectId)} alt={`${view.scenario.name} step ${step.index + 1}`} />
                <span>Open screenshot</span>
              </button>
            )}
          </article>
        ))}
      </div>
      {view.failedAssertions.length > 0 && (
        <>
          <h3>Failed assertions</h3>
          <ul className="evidence-list">
            {view.failedAssertions.map((assertion) => <li key={assertion.label}>{assertion.label}: {assertion.evidence.join(', ')}</li>)}
          </ul>
        </>
      )}
    </section>
  )
}

function EmptyScenario() {
  return (
    <section className="card-panel sticky-detail">
      <h2>No executed scenarios</h2>
      <p className="muted">Generated scenario plans appear in the left column. Enable generic scenario execution to produce step-by-step runs.</p>
    </section>
  )
}
