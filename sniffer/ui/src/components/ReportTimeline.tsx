import { useState } from 'react'
import type { FixPacketItem, RunRecord, SnifferReport } from '../api'
import { buildRunPhases } from '../report/journey'
import type { Screen } from './AppShell'
import { ReportContextStrip } from './ReportContextStrip'
import { SnifferMascot, type MascotState } from './SnifferMascot'

interface AgentTraceStep {
  id: string
  phaseName: string
  status: string
  count: number
  intent: string
  tool: string
  observation: string
  decision: string
  evidence: string
  nextAction: string
  details: string[]
  links: Array<{ label: string; screen: Screen }>
}

export function ReportTimeline({
  report,
  fixPackets,
  run,
  projectId,
  projectName,
  onNavigate
}: {
  report?: SnifferReport | null
  fixPackets: FixPacketItem[]
  run?: RunRecord | null
  projectId?: string
  projectName?: string
  onNavigate?: (screen: Screen) => void
}) {
  const phases = buildRunPhases(report, fixPackets)
  const traceSteps = phases.map((phase) => enrichPhase(phase, report, fixPackets))
  const [open, setOpen] = useState<string>(phases[0]?.id ?? '')
  const status = agentStatus(report, run)
  const liveEvents = agentEvents(run)
  return (
    <section className="page-stack" data-testid="run-timeline-view">
      <ReportContextStrip report={report} projectId={projectId} projectName={projectName} />
      <section className={`agent-status-panel ${status.tone}`} aria-label="Agent run status">
        <div className="agent-status-main">
          <div>
            <p className="eyebrow">Run Timeline</p>
            <h2>Sniffer Agent Trace</h2>
            <p className="muted">How Sniffer observed the app, selected tools, judged evidence, and produced repair-ready findings.</p>
          </div>
          <div className="agent-status-mascot">
            <SnifferMascot state={status.mascotState} />
          </div>
        </div>
        <dl className="agent-status-grid">
          <TraceMetric label="Agent state" value={status.agentState} tone={status.tone} />
          <TraceMetric label="Current phase" value={status.currentPhase} />
          <TraceMetric label="Current tool" value={status.currentTool} />
          <TraceMetric label="Run ID" value={status.runId} />
          <TraceMetric label="Started" value={status.startedAt} />
          <TraceMetric label="Ended" value={status.endedAt} />
          <TraceMetric label="Duration" value={status.duration} />
          <TraceMetric label="Human action" value={status.humanActionNeeded} tone={status.humanActionNeeded === 'yes' ? 'warn' : 'good'} />
        </dl>
        <p className="agent-context-note">{status.contextLabel}</p>
        <p className="agent-outcome">{status.outcomeSummary}</p>
      </section>
      {run && (
        <section className="card-panel live-run-card agent-live-trace" data-testid="live-run-view">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Live Agent Trace</p>
              <h2>{run.phase || 'Waiting for Sniffer'}</h2>
              <p className="muted">Current tool: {toolForPhase(run.phase)} · Current run: {run.runId}</p>
            </div>
            <span className={`status-chip ${run.status === 'failed' ? 'danger' : run.status === 'succeeded' ? 'good' : 'warn'}`}>{run.status}</span>
          </div>
          {run.errorSummary && <div className="alert danger" role="alert">{run.errorSummary}</div>}
          <div className="agent-live-grid">
            <TraceMetric label="Latest observation" value={liveEvents[0]?.summary ?? run.logs.at(-1) ?? 'Waiting for the next agent event'} />
            <TraceMetric label="Latest decision" value={latestDecision(run)} />
            <TraceMetric label="Latest tool output" value={latestToolOutput(run)} />
          </div>
          {liveEvents.length ? (
            <div className="agent-event-list" aria-label="Last 5 agent events">
              {liveEvents.slice(0, 5).map((event) => (
                <article key={event.id} className={`agent-event ${event.type}`}>
                  <span className="agent-event-dot" />
                  <div>
                    <strong>{event.title}</strong>
                    <p>{event.summary}</p>
                  </div>
                  <span className="status-chip muted">{event.phase}</span>
                </article>
              ))}
            </div>
          ) : null}
          {run.command?.length && (
            <details className="command-preview">
              <summary>Raw command</summary>
              <pre>{run.command.join(' ')}</pre>
            </details>
          )}
          <details className="command-preview">
            <summary>Raw stdout/stderr</summary>
            <div className="run-log-list">
              {(run.stdoutTail || run.stderrTail || run.logs.join('\n') || 'No logs yet.').split('\n').slice(-14).map((line, index) => <pre key={`${index}-${line}`}>{line}</pre>)}
            </div>
          </details>
        </section>
      )}
      {!report && !run ? (
        <section className="card-panel empty-agent-trace">
          <p className="eyebrow">No run selected</p>
          <h2>No agent trace yet</h2>
          <p className="muted">Run an audit from Summary to see Sniffer observe the app, choose tools, collect evidence, and prepare findings.</p>
        </section>
      ) : null}
      <div className="agent-trace-timeline">
        {traceSteps.map((phase, index) => (
          <article key={phase.id} className={`agent-trace-card ${phase.status}`}>
            <button type="button" className="phase-head" onClick={() => setOpen(open === phase.id ? '' : phase.id)}>
              <span className="phase-index">{index + 1}</span>
              <div>
                <h3>{phase.phaseName}</h3>
                <p>{phase.observation}</p>
              </div>
              <span className={`status-chip ${phase.status === 'failed' ? 'danger' : phase.status === 'warning' ? 'warn' : phase.status === 'passed' ? 'good' : 'muted'}`}>{phase.status}</span>
              <span className="status-chip muted">{phase.count}</span>
            </button>
            {open === phase.id && (
              <div className="agent-trace-body">
                <div className="agent-trace-grid">
                  <TraceField label="Intent" value={phase.intent} />
                  <TraceField label="Tool used" value={phase.tool} />
                  <TraceField label="Observation" value={phase.observation} />
                  <TraceField label="Decision/result" value={phase.decision} />
                  <TraceField label="Evidence produced" value={phase.evidence} />
                  <TraceField label="Next action" value={phase.nextAction} />
                </div>
                <div className="agent-evidence-links" aria-label={`${phase.phaseName} evidence links`}>
                  {phase.links.map((link) => (
                    <button key={`${phase.id}-${link.screen}-${link.label}`} type="button" className="secondary-button small" onClick={() => onNavigate?.(link.screen)}>
                      {link.label}
                    </button>
                  ))}
                </div>
                <ul className="phase-details">
                  {phase.details.slice(0, 12).map((detail) => <li key={detail}>{detail}</li>)}
                </ul>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

function TraceMetric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="trace-metric">
      <dt>{label}</dt>
      <dd className={tone ? `status-chip ${tone}` : undefined}>{value}</dd>
    </div>
  )
}

function TraceField({ label, value }: { label: string; value: string }) {
  return (
    <div className="trace-field">
      <strong>{label}</strong>
      <p>{value}</p>
    </div>
  )
}

function enrichPhase(phase: ReturnType<typeof buildRunPhases>[number], report: SnifferReport | null | undefined, fixPackets: FixPacketItem[]): AgentTraceStep {
  const states = report?.crawlGraph?.states?.length ?? 0
  const actions = report?.crawlGraph?.actions?.length ?? 0
  const scenarios = report?.scenarioRuns ?? []
  const productExperience = report?.productExperience
  const common = { ...phase, phaseName: phase.title }
  if (phase.id === 'source') {
    return {
      ...common,
      intent: 'Understand the app structure before touching the running UI.',
      tool: 'Source adapter runner and UI Intent Graph builder',
      observation: phase.summary,
      decision: `Selected ${report?.appProfile?.profile_type ?? report?.runtimeAppModel?.inferred_app_type ?? 'an inferred app'} model from source and runtime evidence.`,
      evidence: 'Source Inventory, UI Intent Graph, source scopes, framework signals.',
      nextAction: 'Open the runtime URL and compare source intent to rendered UI.',
      links: [{ label: 'Agent Model', screen: 'agent' }, { label: 'UI Intent Graph', screen: 'agent' }],
      details: phase.details
    }
  }
  if (phase.id === 'crawl') {
    return {
      ...common,
      intent: 'Observe reachable screens and safe interactions in the live app.',
      tool: 'Playwright crawler and runtime DOM snapshot collector',
      observation: `Observed ${states} runtime states and ${actions} attempted actions.`,
      decision: actions ? 'Runtime evidence was collected for scenario execution and critic review.' : 'Runtime crawl was shallow or skipped; downstream judgments should stay conservative.',
      evidence: 'DOM snapshots, screenshots, locator inventory, crawl states, safe/unsafe actions.',
      nextAction: 'Execute scenario paths that line up with the app subtype and visible controls.',
      links: [{ label: 'Crawl Path', screen: 'crawl' }, { label: 'Screenshots', screen: 'screenshots' }, { label: 'Graph Explorer', screen: 'graph' }],
      details: phase.details
    }
  }
  if (phase.id === 'scenarios') {
    const passed = scenarios.filter((scenario) => scenario.status === 'passed').length
    return {
      ...common,
      intent: 'Replay the user jobs Sniffer believes this app should support.',
      tool: 'Generated scenario executor',
      observation: `${report?.generatedScenarios?.length ?? 0} scenarios planned; ${scenarios.length} executed.`,
      decision: scenarios.length ? `${passed}/${scenarios.length} scenarios passed; failed or blocked paths become evidence.` : 'No scenario pack ran for this report.',
      evidence: 'Scenario traces, assertions, screenshots, failed steps, blocked prerequisites.',
      nextAction: 'Feed scenario evidence into workflow and product critics.',
      links: [{ label: 'Scenarios', screen: 'scenarios' }, { label: 'Screenshots', screen: 'screenshots' }],
      details: phase.details
    }
  }
  if (phase.id === 'workflow-critic') {
    return {
      ...common,
      intent: 'Decide whether discovered workflows are actually supported at runtime.',
      tool: 'Workflow critic and evidence classifier',
      observation: phase.summary,
      decision: `${report?.criticDecisions?.filter((decision) => decision.classification === 'real_bug').length ?? 0} workflow decisions were classified as real bugs.`,
      evidence: 'Critic decisions, runtime workflow verification, source/runtime matches.',
      nextAction: 'Pass evidence-backed candidates to issue grouping.',
      links: [{ label: 'Workflow Evidence', screen: 'workflows' }, { label: 'Issues', screen: 'issues' }],
      details: phase.details
    }
  }
  if (phase.id === 'ux-critic') {
    const reported = (report?.uxCriticFindings ?? []).filter((finding) => finding.should_report).length
    return {
      ...common,
      intent: 'Check layout, accessibility, scanability, and runtime DOM quality.',
      tool: 'Deterministic UX and accessibility critic',
      observation: phase.summary,
      decision: `${reported} UX findings were reportable after evidence checks.`,
      evidence: 'DOM measurements, accessible names, screenshots, layout warnings.',
      nextAction: 'Merge validated UX findings with product and workflow findings.',
      links: [{ label: 'Issues', screen: 'issues' }, { label: 'Screenshots', screen: 'screenshots' }],
      details: phase.details
    }
  }
  if (phase.id === 'product-intent') {
    return {
      ...common,
      intent: 'Judge whether screens make sense for the user job being tested.',
      tool: productExperience?.providerName ? `Product Experience Critic (${productExperience.providerName})` : 'Product intent modeler',
      observation: productExperience?.screensReviewed ? `${productExperience.screensReviewed} screens reviewed with ${productExperience.visionScreensReviewed ?? 0} vision-backed contexts.` : phase.summary,
      decision: `${productExperience?.issues?.length ?? 0} product experience issue(s) reported.`,
      evidence: 'Page intent, rubric ids, Product Experience contexts, screenshots, evidence packets.',
      nextAction: 'Group any product gaps into repair-ready themes.',
      links: [{ label: 'Agent Model', screen: 'agent' }, { label: 'Issues', screen: 'issues' }, { label: 'Screenshots', screen: 'screenshots' }],
      details: phase.details
    }
  }
  if (phase.id === 'grouping') {
    return {
      ...common,
      intent: 'Turn raw observations into repair-sized issue groups.',
      tool: 'Issue grouper and triage classifier',
      observation: phase.summary,
      decision: report?.issues?.length ? 'Repair groups are ready for inspection.' : 'No repair groups were needed for this report.',
      evidence: 'Raw findings, grouped issues, severities, suspected files, suppression notes.',
      nextAction: report?.issues?.length ? 'Generate fix packets for selected issues.' : 'Keep the report available for audit history and evidence review.',
      links: [{ label: 'Issues', screen: 'issues' }, { label: 'Agent Model', screen: 'agent' }],
      details: phase.details
    }
  }
  return {
    ...common,
    intent: 'Prepare handoff material for repair agents or manual review.',
    tool: 'Fix packet generator',
    observation: phase.summary,
    decision: fixPackets.length ? 'Fix packets are available for the repair workbench.' : 'No fix packets were generated because no repair groups were present.',
    evidence: 'Fix packet markdown/JSON, suspected files, verification commands, pass conditions.',
    nextAction: fixPackets.length ? 'Open Repair Workbench or rerun audit after repair.' : 'No human repair action is needed unless new issues appear.',
    links: [{ label: 'Fix Packets', screen: 'fixes' }, { label: 'Repair Workbench', screen: 'repair' }],
    details: phase.details
  }
}

function agentStatus(report: SnifferReport | null | undefined, run: RunRecord | null | undefined) {
  const running = run?.status === 'running'
  const failed = run?.status === 'failed'
  const issues = report?.issues?.length ?? 0
  const failedScenarios = report?.scenarioRuns?.filter((scenario) => scenario.status === 'failed').length ?? 0
  const agentState = running ? 'running' : failed ? 'failed' : run?.status === 'succeeded' || report ? (issues || failedScenarios ? 'needs human review' : 'succeeded') : 'idle'
  const tone = failed ? 'danger' : running || agentState === 'needs human review' ? 'warn' : report || run?.status === 'succeeded' ? 'good' : 'muted'
  const generated = report?.generatedAt ? formatDate(report.generatedAt) : 'unknown'
  return {
    agentState,
    tone,
    mascotState: mascotStateFor(agentState, running, failed),
    currentPhase: run?.phase ?? (report ? 'Report loaded' : 'No active run'),
    currentTool: toolForPhase(run?.phase ?? ''),
    runId: run?.runId ?? 'Latest report',
    startedAt: formatDate(run?.startedAt),
    endedAt: formatDate(run?.endedAt ?? report?.generatedAt),
    duration: durationLabel(run?.startedAt, run?.endedAt),
    humanActionNeeded: issues || failedScenarios || failed ? 'yes' : 'no',
    outcomeSummary: report ? `${report.scenarioRuns?.length ?? 0} scenario run(s), ${issues} issue group(s), ${report.productExperience?.issues?.length ?? 0} product experience issue(s).` : 'No report evidence has been loaded yet.',
    contextLabel: running ? `Live audit running: ${run.runId}.` : run ? `Last audit ${run.status}: ${run.runId}.` : report ? `Showing timeline for displayed report: Latest report generated ${generated}.` : 'No current or displayed report is selected.'
  }
}

function mascotStateFor(agentState: string, running: boolean, failed: boolean): MascotState {
  if (running) return 'sniffing'
  if (failed) return 'error'
  if (agentState === 'succeeded') return 'success'
  return 'idle'
}

function agentEvents(run: RunRecord | null | undefined) {
  return (run?.events ?? []).filter((event) => event.type !== 'log').slice(-8).reverse().map((event, index) => ({
    id: `${event.timestamp}-${index}`,
    phase: event.phase,
    type: event.type === 'error' ? 'error' : event.type === 'phase_completed' ? 'decision' : 'tool_call',
    title: event.type === 'phase_completed' ? 'Decision/result' : event.type === 'error' ? 'Agent error' : 'Tool call',
    summary: event.message,
    toolName: toolForPhase(event.phase),
    status: event.type === 'error' ? 'failed' : event.type === 'phase_completed' ? 'succeeded' : 'running'
  }))
}

function latestDecision(run: RunRecord | null | undefined): string {
  const completed = (run?.events ?? []).filter((event) => event.type === 'phase_completed').at(-1)
  return completed?.message ?? (run?.status === 'failed' ? run.errorSummary ?? 'Run failed.' : 'Waiting for a completed phase.')
}

function latestToolOutput(run: RunRecord | null | undefined): string {
  return run?.stdoutTail?.split('\n').filter(Boolean).at(-1) ?? run?.stderrTail?.split('\n').filter(Boolean).at(-1) ?? run?.logs.at(-1) ?? 'No tool output yet.'
}

function toolForPhase(phase: string): string {
  const normalized = phase.toLowerCase()
  if (normalized.includes('source')) return 'source_discovery'
  if (normalized.includes('runtime dom')) return 'runtime_dom_snapshot'
  if (normalized.includes('crawl')) return 'playwright_crawl'
  if (normalized.includes('scenario')) return 'scenario_executor'
  if (normalized.includes('graph')) return 'graph_refiner'
  if (normalized.includes('product experience')) return 'product_experience_critic'
  if (normalized.includes('workflow')) return 'workflow_critic'
  if (normalized.includes('ux')) return 'ux_critic'
  if (normalized.includes('group')) return 'issue_grouper'
  if (normalized.includes('fix')) return 'fix_packet_generator'
  if (normalized.includes('report')) return 'report_writer'
  return 'agent_orchestrator'
}

function durationLabel(startedAt?: string, endedAt?: string): string {
  if (!startedAt || !endedAt) return 'in progress / unknown'
  const start = new Date(startedAt).valueOf()
  const end = new Date(endedAt).valueOf()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 'unknown'
  const seconds = Math.round((end - start) / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function formatDate(value?: string): string {
  if (!value) return 'unknown'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString()
}
