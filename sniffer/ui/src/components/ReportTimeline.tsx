import { useState } from 'react'
import type { FixPacketItem, RunRecord, SnifferReport } from '../api'
import { buildRunPhases } from '../report/journey'
import { ReportContextStrip } from './ReportContextStrip'

export function ReportTimeline({ report, fixPackets, run, projectId, projectName }: { report?: SnifferReport | null; fixPackets: FixPacketItem[]; run?: RunRecord | null; projectId?: string; projectName?: string }) {
  const phases = buildRunPhases(report, fixPackets)
  const [open, setOpen] = useState<string>(phases[0]?.id ?? '')
  return (
    <section className="page-stack" data-testid="run-timeline-view">
      <ReportContextStrip report={report} projectId={projectId} projectName={projectName} />
      {run && (
        <section className="card-panel live-run-card" data-testid="live-run-view">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Live crawl view</p>
              <h2>{run.phase || 'Waiting for Sniffer'}</h2>
              <p className="muted">Current run: {run.runId}</p>
            </div>
            <span className={`status-chip ${run.status === 'failed' ? 'danger' : run.status === 'succeeded' ? 'good' : 'warn'}`}>{run.status}</span>
          </div>
          {run.errorSummary && <div className="alert danger" role="alert">{run.errorSummary}</div>}
          {run.command?.length && (
            <details className="command-preview">
              <summary>Command</summary>
              <pre>{run.command.join(' ')}</pre>
            </details>
          )}
          {run.events?.length ? (
            <div className="timeline compact" aria-label="Live Sniffer phases">
              {run.events.filter((event) => event.type !== 'log').slice(-12).map((event, index) => (
                <div key={`${event.timestamp}-${index}`} className={`timeline-step ${event.type === 'error' ? 'failed' : event.type === 'phase_completed' ? 'done' : event.phase === run.phase ? 'active' : ''}`}>
                  <span />
                  <strong>{event.phase}</strong>
                  <small>{event.message}</small>
                </div>
              ))}
            </div>
          ) : null}
          <div className="run-log-list">
            {(run.logs.length ? run.logs : ['No logs yet.']).slice(-8).map((line, index) => <pre key={`${index}-${line}`}>{line}</pre>)}
          </div>
        </section>
      )}
      <section className="card-panel">
        <p className="eyebrow">Run Timeline</p>
        <h2>What Sniffer did</h2>
        <p className="muted">A QA-style replay of source discovery, crawl execution, critics, grouping, and repair packet generation.</p>
      </section>
      <div className="phase-timeline">
        {phases.map((phase, index) => (
          <article key={phase.id} className={`phase-card ${phase.status}`}>
            <button type="button" className="phase-head" onClick={() => setOpen(open === phase.id ? '' : phase.id)}>
              <span className="phase-index">{index + 1}</span>
              <div>
                <h3>{phase.title}</h3>
                <p>{phase.summary}</p>
              </div>
              <span className={`status-chip ${phase.status === 'failed' ? 'danger' : phase.status === 'warning' ? 'warn' : phase.status === 'passed' ? 'good' : 'muted'}`}>{phase.status}</span>
              <span className="status-chip muted">{phase.count}</span>
            </button>
            {open === phase.id && (
              <ul className="phase-details">
                {phase.details.slice(0, 12).map((detail) => <li key={detail}>{detail}</li>)}
              </ul>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
