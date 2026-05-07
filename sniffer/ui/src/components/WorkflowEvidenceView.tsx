import { useMemo, useState } from 'react'
import type { SnifferReport } from '../api'
import { buildWorkflowEvidence, type WorkflowEvidence } from '../report/journey'

export function WorkflowEvidenceView({ report }: { report?: SnifferReport | null }) {
  const workflows = useMemo(() => buildWorkflowEvidence(report), [report])
  const [selectedName, setSelectedName] = useState('')
  const selected = workflows.find((workflow) => workflow.workflow.name === selectedName) ?? workflows[0]
  return (
    <section className="report-grid" data-testid="workflow-evidence-view">
      <div className="summary-column">
        <section className="card-panel">
          <p className="eyebrow">Workflow Evidence</p>
          <h2>Source intent vs runtime behavior</h2>
          <p className="muted">Source workflows, runtime DOM workflows, generated scenarios, and executed scenario evidence are shown together.</p>
          <div className="chip-row">
            <span className="status-chip muted">Source: {report?.sourceGraph?.sourceWorkflows?.length ?? 0}</span>
            <span className="status-chip muted">Runtime: {report?.runtimeAppModel?.workflows?.length ?? 0}</span>
            <span className="status-chip muted">Generated: {report?.generatedScenarios?.length ?? 0}</span>
            <span className="status-chip muted">Executed: {report?.scenarioRuns?.length ?? 0}</span>
          </div>
        </section>
        <div className="scenario-card-list">
          {workflows.map((view) => (
            <button key={view.workflow.name} type="button" className={`scenario-card ${selected?.workflow.name === view.workflow.name ? 'active' : ''}`} onClick={() => setSelectedName(view.workflow.name)}>
              <span className={`status-chip ${view.status === 'failed' ? 'danger' : view.status === 'warning' ? 'warn' : view.status === 'passed' ? 'good' : 'muted'}`}>{view.status}</span>
              <strong>{view.workflow.name}</strong>
              <small>{view.discoverySource} · {view.generatedScenarios.length} planned · {view.scenarios.length} executed · {view.issues.length} issues</small>
            </button>
          ))}
        </div>
      </div>
      <aside className="detail-column">
        {selected ? <WorkflowDetail view={selected} /> : <section className="card-panel sticky-detail"><h2>No workflows found</h2><p className="muted">No source, runtime, or generated workflow evidence was available for this report.</p></section>}
      </aside>
    </section>
  )
}

function WorkflowDetail({ view }: { view: WorkflowEvidence }) {
  return (
    <section className="card-panel sticky-detail">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Workflow</p>
          <h2>{view.workflow.name}</h2>
        </div>
        <span className={`status-chip ${view.status === 'failed' ? 'danger' : view.status === 'warning' ? 'warn' : view.status === 'passed' ? 'good' : 'muted'}`}>{view.status}</span>
      </div>
      <div className="chip-row">
        <span className="status-chip muted">{view.discoverySource === 'source' ? 'Source-discovered' : view.discoverySource === 'runtime' ? 'Runtime-discovered' : 'Generated'}</span>
        {view.workflow.discoveredBy?.map((source) => <span key={source} className="status-chip muted">{source}</span>)}
      </div>
      <h3>Source says</h3>
      {view.workflow.sourceFiles.length > 0 ? <div className="file-list">{view.workflow.sourceFiles.map((file) => <code key={file}>{file}</code>)}</div> : <p className="muted">No source files are attached to this runtime/generated workflow.</p>}
      <ul className="evidence-list">
        {view.workflow.evidence.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <h3>Expected actions</h3>
      <ul className="evidence-list">{view.workflow.likelyUserActions.map((item) => <li key={item}>{item}</li>)}</ul>
      <h3>Runtime saw</h3>
      {view.verification ? (
        <>
          <span className={`status-chip ${view.verification.status === 'verified' ? 'good' : view.verification.status === 'partial' ? 'warn' : 'danger'}`}>{view.verification.status}</span>
          <ul className="evidence-list">
            {view.verification.controls.map((control) => (
              <li key={control.label}>{control.label}: {control.status} {control.matchedEvidence?.join(', ')}</li>
            ))}
          </ul>
        </>
      ) : <p className="muted">No runtime verification record found for this workflow.</p>}
      <h3>Related API calls</h3>
      <div className="file-list">{view.apiCalls.map((api) => <code key={`${api.method}-${api.endpoint}`}>{api.method ?? 'GET'} {api.endpoint}</code>)}</div>
      <h3>Scenarios</h3>
      {view.generatedScenarios.length > 0 && (
        <>
          <p className="muted">Generated scenario plans</p>
          <div className="chip-row">{view.generatedScenarios.map((scenario) => <span key={scenario.id} className="status-chip muted">{scenario.name}: planned</span>)}</div>
        </>
      )}
      <div className="chip-row">{view.scenarios.map((scenario) => <span key={scenario.name} className={`status-chip ${scenario.status === 'passed' ? 'good' : scenario.status === 'failed' ? 'danger' : 'muted'}`}>{scenario.name}</span>)}</div>
      {view.generatedScenarios.length > 0 && view.scenarios.length === 0 && <p className="muted">Generated but not executed yet.</p>}
      {view.issues.length > 0 && (
        <>
          <h3>Issues</h3>
          <ul className="evidence-list">{view.issues.map((issue) => <li key={issue.issue_id ?? issue.title}>{issue.severity}: {issue.title}</li>)}</ul>
        </>
      )}
      {view.criticDecisions.length > 0 && (
        <>
          <h3>Critic decisions</h3>
          <div className="chip-row">{view.criticDecisions.map((decision) => <span key={decision} className="status-chip muted">{decision}</span>)}</div>
        </>
      )}
    </section>
  )
}
