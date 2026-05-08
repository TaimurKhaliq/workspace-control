import type { SnifferReport } from '../api'

export function ReportContextStrip({
  report,
  projectId,
  projectName
}: {
  report?: SnifferReport | null
  projectId?: string
  projectName?: string
}) {
  if (!report) return null
  const context = reportContext(report, projectId, projectName)
  return (
    <section className="report-context-strip" aria-label="Current report context" data-testid="report-context-strip">
      <div className="report-context-main">
        <div>
          <p className="eyebrow">Report context</p>
          <h2>{context.projectLabel}</h2>
          <p className="report-context-sentence">
            Viewing {context.runLabel} for {context.projectLabel}, generated {context.generatedLabel}. Status: {context.statusLabel}.
          </p>
        </div>
        <div className="chip-row" aria-label="Report identity and status">
          <span className="status-chip good">Selected run: {context.runLabel}</span>
          <span className={`status-chip ${context.statusTone}`}>{context.statusLabel}</span>
          {context.criticLabel && <span className="status-chip muted">{context.criticLabel}</span>}
        </div>
      </div>
      <dl className="report-context-grid">
        <ContextItem label="Generated" value={context.generatedLabel} />
        <ContextItem label="Run identity" value={context.runLabel} />
        <ContextItem label="App URL" value={context.appUrl} long />
        <ContextItem label="Repo" value={context.repoPath} long />
        <ContextItem label="Scenarios" value={context.scenarioLabel} />
        <ContextItem label="Issues" value={String(context.issueCount)} />
        <ContextItem label="Screenshots" value={String(context.screenshotCount)} />
      </dl>
    </section>
  )
}

function ContextItem({ label, value, long = false }: { label: string; value: string; long?: boolean }) {
  const displayValue = long ? middleEllipsize(value) : value
  return (
    <div className={long ? 'report-context-item long-value' : 'report-context-item'}>
      <dt>{label}</dt>
      <dd title={value} aria-label={`${label}: ${value}`}>{displayValue}</dd>
    </div>
  )
}

function reportContext(report: SnifferReport, projectId?: string, projectName?: string) {
  const scenarios = report.scenarioRuns ?? []
  const passed = scenarios.filter((scenario) => scenario.status === 'passed').length
  const failed = scenarios.filter((scenario) => scenario.status === 'failed').length
  const issueCount = report.issues?.length ?? 0
  const criticalHigh = (report.issues ?? []).filter((issue) => issue.severity === 'critical' || issue.severity === 'high').length
  const statusTone = failed || criticalHigh ? 'danger' : issueCount ? 'warn' : 'good'
  const statusLabel = failed || criticalHigh ? 'Needs attention' : issueCount ? 'Review issues' : 'Passing'
  const critic = report.productExperience
  return {
    projectLabel: projectName || (projectId === 'ad_hoc' ? 'Ad hoc report' : projectId ? projectId : 'Ad hoc report'),
    runLabel: 'Latest report',
    generatedLabel: formatDate(report.generatedAt),
    appUrl: report.runtimeDomSnapshot?.url || report.crawlGraph?.startUrl || 'unknown',
    repoPath: report.sourceGraph?.repoPath || 'unknown',
    scenarioLabel: scenarios.length ? `${passed}/${scenarios.length} passed` : `${report.generatedScenarios?.length ?? 0} planned`,
    issueCount,
    screenshotCount: screenshotCount(report),
    statusTone,
    statusLabel,
    criticLabel: critic?.status ? `Product critic: ${critic.status}${critic.realLlmScreensReviewed ? ` · ${critic.realLlmScreensReviewed} real LLM` : ''}` : undefined
  }
}

function formatDate(value?: string): string {
  if (!value) return 'unknown'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString()
}

function screenshotCount(report: SnifferReport): number {
  const paths = new Set<string>()
  for (const path of report.crawlGraph?.screenshots ?? []) paths.add(path)
  for (const state of report.crawlGraph?.states ?? []) if (state.screenshotPath) paths.add(state.screenshotPath)
  for (const run of report.scenarioRuns ?? []) {
    for (const shot of run.screenshots ?? []) paths.add(shot)
    for (const assertion of run.assertions ?? []) if (assertion.screenshotPath) paths.add(assertion.screenshotPath)
  }
  if (report.runtimeDomSnapshot?.screenshotPath) paths.add(report.runtimeDomSnapshot.screenshotPath)
  return paths.size
}

function middleEllipsize(value: string, maxLength = 56): string {
  if (value.length <= maxLength) return value
  const keep = Math.floor((maxLength - 1) / 2)
  return `${value.slice(0, keep)}…${value.slice(value.length - keep)}`
}
