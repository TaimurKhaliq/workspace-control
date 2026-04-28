import { useState } from 'react'
import type { FixPacketItem, RunRecord, SnifferReport } from '../api'
import { buildRunPhases } from '../report/journey'

export function ReportTimeline({ report, fixPackets, run }: { report?: SnifferReport | null; fixPackets: FixPacketItem[]; run?: RunRecord | null }) {
  const phases = buildRunPhases(report, fixPackets)
  const [open, setOpen] = useState<string>(phases[0]?.id ?? '')
  return (
    <section className="page-stack" data-testid="run-timeline-view">
      {run && (
        <section className="card-panel live-run-card" data-testid="live-run-view">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Live crawl view</p>
              <h2>{run.phase || 'Waiting for Sniffer'}</h2>
              <p className="muted">Current run: {run.runId}</p>
            </div>
            <span className={`status-chip ${run.status === 'error' ? 'danger' : run.status === 'success' ? 'good' : 'warn'}`}>{run.status}</span>
          </div>
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
