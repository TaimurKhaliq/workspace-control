import { useMemo, useState } from 'react'
import type { SnifferReport } from '../api'
import { buildScenarioViews, type ScenarioView } from '../report/journey'
import { ScreenshotModal, type ScreenshotContext, artifactUrl } from './ScreenshotModal'

export function ScenariosView({ report }: { report?: SnifferReport | null }) {
  const scenarios = useMemo(() => buildScenarioViews(report), [report])
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
        </section>
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
        {selected ? <ScenarioDetail view={selected} onScreenshot={setScreenshot} /> : <EmptyScenario />}
      </aside>
      <ScreenshotModal screenshot={screenshot} onClose={() => setScreenshot(null)} />
    </section>
  )
}

function ScenarioDetail({ view, onScreenshot }: { view: ScenarioView; onScreenshot: (screenshot: ScreenshotContext) => void }) {
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
                <img src={artifactUrl(step.screenshot)} alt={`${view.scenario.name} step ${step.index + 1}`} />
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
      <h2>No scenarios</h2>
      <p className="muted">Run an audit with `--scenario all` to populate scenario execution.</p>
    </section>
  )
}
