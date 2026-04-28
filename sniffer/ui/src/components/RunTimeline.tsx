import type { RunRecord } from '../api'

const phases = [
  'Starting audit',
  'Discovering source',
  'Crawling UI',
  'Running scenarios',
  'Calling critic',
  'Generating fix packets',
  'Writing report',
  'Done'
]

export function RunTimeline({ run }: { run?: RunRecord | null }) {
  return (
    <section className="card-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Live run</p>
          <h2>{run ? run.phase : 'No active run'}</h2>
        </div>
        {run && <span className={`status-chip ${run.status === 'error' ? 'danger' : run.status === 'success' ? 'good' : 'warn'}`}>{run.status}</span>}
      </div>
      <div className="timeline" aria-label="Sniffer run phases">
        {phases.map((phase) => (
          <div key={phase} className={phaseClass(run, phase)}>
            <span />
            <strong>{phase}</strong>
          </div>
        ))}
      </div>
      <div className="log-panel" aria-label="Latest Sniffer logs">
        {(run?.logs.length ? run.logs.slice(-14) : ['Run an audit to see Sniffer activity here.']).map((line, index) => (
          <pre key={`${line}-${index}`}>{line}</pre>
        ))}
      </div>
    </section>
  )
}

function phaseClass(run: RunRecord | null | undefined, phase: string): string {
  if (!run) return 'timeline-step'
  if (run.phase === phase) return 'timeline-step active'
  if (run.status === 'success') return 'timeline-step done'
  const currentIndex = phases.indexOf(run.phase)
  const index = phases.indexOf(phase)
  return currentIndex >= 0 && index < currentIndex ? 'timeline-step done' : 'timeline-step'
}
