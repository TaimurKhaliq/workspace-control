import type {
  ApiCall,
  CrawlAction,
  CrawlState,
  FixPacketItem,
  Issue,
  RuntimeWorkflowVerification,
  ScenarioRun,
  ScreenshotItem,
  SnifferReport,
  SourceWorkflow,
  UiSurface
} from '../api'

export type JourneyStatus = 'passed' | 'warning' | 'failed' | 'skipped'

export interface RunPhase {
  id: string
  title: string
  status: JourneyStatus
  summary: string
  count: number
  details: string[]
}

export interface CrawlPathState {
  index: number
  id: string
  sequenceNumber: number
  url: string
  hashRoute: string
  title: string
  hash: string
  screenName: string
  pageType: string
  screenshot?: string
  controlsByKind: Record<string, Array<{ label: string; selector?: string; type?: string }>>
  incomingActions: CrawlAction[]
  outgoingActions: CrawlAction[]
  repeatedActionLabels: string[]
  relatedWorkflows: string[]
  relatedSurfaces: string[]
  issuesOnState: string[]
  consoleErrorsOnState: unknown[]
  networkErrorsOnState: unknown[]
  duplicateCount: number
  isDuplicateOfStateId?: string
}

export interface ScenarioStepView {
  index: number
  label: string
  status: JourneyStatus
  actionType: string
  evidence: string[]
  screenshot?: string
  urlBefore?: string
  urlAfter?: string
}

export interface ScenarioView {
  scenario: ScenarioRun
  steps: ScenarioStepView[]
  failedAssertions: Array<{ label: string; evidence: string[]; screenshotPath?: string }>
}

export interface WorkflowEvidence {
  workflow: SourceWorkflow
  verification?: RuntimeWorkflowVerification
  surfaces: UiSurface[]
  apiCalls: ApiCall[]
  scenarios: ScenarioRun[]
  issues: Issue[]
  criticDecisions: string[]
  status: JourneyStatus
}

export interface ReportSummary {
  overallStatus: JourneyStatus
  scenariosPassed: number
  scenariosFailed: number
  realIssues: number
  productGaps: number
  uxIssues: number
  fixPackets: number
  screenshots: number
  topIssues: Issue[]
}

export function buildReportSummary(report: SnifferReport | null | undefined, fixPackets: FixPacketItem[], screenshots: ScreenshotItem[]): ReportSummary {
  const issues = report?.issues ?? []
  const scenarios = report?.scenarioRuns ?? []
  const failed = scenarios.filter((scenario) => scenario.status === 'failed').length
  const highIssues = issues.filter((issue) => issue.severity === 'critical' || issue.severity === 'high').length
  const productGaps = (report?.productIntentFindings ?? []).filter((finding) => finding.should_report).length
  const uxIssues = issues.filter((issue) => /ux|layout|usability|accessibility|visual/.test(issue.type)).length
  return {
    overallStatus: highIssues || failed ? 'failed' : issues.length || productGaps ? 'warning' : 'passed',
    scenariosPassed: scenarios.filter((scenario) => scenario.status === 'passed').length,
    scenariosFailed: failed,
    realIssues: issues.length,
    productGaps,
    uxIssues,
    fixPackets: unique(fixPackets.map((packet) => packet.issueId)).length,
    screenshots: screenshots.length || report?.crawlGraph?.screenshots?.length || 0,
    topIssues: issues.slice(0, 5)
  }
}

export function buildRunPhases(report: SnifferReport | null | undefined, fixPackets: FixPacketItem[]): RunPhase[] {
  if (!report) return []
  const scenarioFailures = (report.scenarioRuns ?? []).filter((scenario) => scenario.status === 'failed')
  const criticReal = (report.criticDecisions ?? []).filter((decision) => decision.classification === 'real_bug')
  const uxReported = (report.uxCriticFindings ?? []).filter((finding) => finding.should_report)
  const productGaps = (report.productIntentFindings ?? []).filter((finding) => finding.should_report)
  return [
    {
      id: 'source',
      title: 'Source discovery',
      status: 'passed',
      summary: `${report.sourceGraph?.framework ?? 'unknown'} / ${report.sourceGraph?.buildTool ?? 'unknown'} with ${report.sourceGraph?.uiSurfaces?.length ?? 0} UI surfaces and ${report.sourceGraph?.sourceWorkflows?.length ?? 0} workflows.`,
      count: (report.sourceGraph?.uiSurfaces?.length ?? 0) + (report.sourceGraph?.sourceWorkflows?.length ?? 0),
      details: [
        `Repo: ${report.sourceGraph?.repoPath ?? 'unknown'}`,
        `API calls: ${report.sourceGraph?.apiCalls?.length ?? 0}`,
        `State/action hint files: ${report.sourceGraph?.stateActions?.length ?? 0}`
      ]
    },
    {
      id: 'crawl',
      title: 'Runtime crawl',
      status: (report.crawlGraph?.consoleErrors?.length || report.crawlGraph?.networkFailures?.length) ? 'warning' : 'passed',
      summary: `Visited ${report.crawlGraph?.states?.length ?? 0} states and attempted ${report.crawlGraph?.actions?.length ?? 0} safe actions.`,
      count: (report.crawlGraph?.states?.length ?? 0),
      details: [
        `Start: ${report.crawlGraph?.startUrl ?? 'unknown'}`,
        `Final: ${report.crawlGraph?.finalUrl ?? 'unknown'}`,
        `Screenshots: ${report.crawlGraph?.screenshots?.length ?? 0}`
      ]
    },
    {
      id: 'scenarios',
      title: 'Scenario execution',
      status: scenarioFailures.length ? 'failed' : (report.scenarioRuns?.length ? 'passed' : 'skipped'),
      summary: `${report.scenarioRuns?.length ?? 0} scenarios executed; ${scenarioFailures.length} failed.`,
      count: report.scenarioRuns?.length ?? 0,
      details: (report.scenarioRuns ?? []).map((scenario) => `${scenario.status}: ${scenario.name}`)
    },
    {
      id: 'workflow-critic',
      title: 'Workflow critic',
      status: criticReal.length ? 'warning' : 'passed',
      summary: `${report.criticDecisions?.length ?? 0} candidate findings classified; ${criticReal.length} real bug decisions.`,
      count: report.criticDecisions?.length ?? 0,
      details: (report.criticDecisions ?? []).slice(0, 8).map((decision) => `${decision.classification}: ${decision.reasoning_summary}`)
    },
    {
      id: 'ux-critic',
      title: 'UX critic',
      status: uxReported.length ? 'warning' : 'passed',
      summary: `${report.uxCriticFindings?.length ?? 0} UX findings reviewed; ${uxReported.length} reported.`,
      count: report.uxCriticFindings?.length ?? 0,
      details: (report.uxCriticFindings ?? []).map((finding) => `${finding.should_report ? 'reported' : 'deferred'}: ${finding.title}`)
    },
    {
      id: 'product-intent',
      title: 'Product intent analysis',
      status: productGaps.length ? 'warning' : 'passed',
      summary: `${report.productIntent?.app_category ?? 'unknown app'}; ${productGaps.length} reportable product gaps.`,
      count: report.productIntentFindings?.length ?? 0,
      details: [
        report.productIntent?.product_summary ?? 'No product intent model found.',
        ...(report.productIntentFindings ?? []).map((finding) => `${finding.should_report ? 'gap' : 'suggestion'}: ${finding.title}`)
      ]
    },
    {
      id: 'grouping',
      title: 'Issue grouping',
      status: report.issues.length ? 'warning' : 'passed',
      summary: `${report.rawFindings?.length ?? 0} raw findings grouped into ${report.issues.length} repair groups.`,
      count: report.issues.length,
      details: report.issues.map((issue) => `${issue.severity}: ${issue.title}`)
    },
    {
      id: 'fixes',
      title: 'Fix packet generation',
      status: fixPackets.length ? 'passed' : 'skipped',
      summary: fixPackets.length ? `${unique(fixPackets.map((packet) => packet.issueId)).length} fix packet(s) available.` : 'No fix packets generated for the latest report.',
      count: fixPackets.length,
      details: fixPackets.map((packet) => packet.relativePath)
    }
  ]
}

export function buildCrawlPath(report: SnifferReport | null | undefined): CrawlPathState[] {
  const states = report?.crawlGraph?.states ?? []
  const actions = report?.crawlGraph?.actions ?? []
  const screenshots = report?.crawlGraph?.screenshots ?? []
  return states.map((state, index) => {
    const incomingActions = actions.filter((action) => action.stateHashAfter === state.hash || (action.urlAfter === state.url && action.urlBefore !== state.url))
    const outgoingActions = actions.filter((action) => action.stateHashBefore === state.hash || action.urlBefore === state.url)
    return {
      index,
      id: state.id ?? `state-${index + 1}`,
      sequenceNumber: state.sequenceNumber ?? index + 1,
      url: state.url,
      hashRoute: state.hashRoute ?? routeKey(state.url),
      title: state.title,
      hash: state.hash,
      screenName: state.inferredScreenName ?? inferScreenName(state),
      pageType: state.inferredPageType ?? 'unknown',
      screenshot: state.screenshotPath ?? screenshots[index],
      controlsByKind: groupControls(state),
      incomingActions,
      outgoingActions,
      repeatedActionLabels: repeatedLabels(outgoingActions),
      relatedWorkflows: state.matchedSourceWorkflows?.length ? state.matchedSourceWorkflows : relatedWorkflowsForState(report, state),
      relatedSurfaces: state.matchedUiSurfaces ?? [],
      issuesOnState: state.issuesOnState ?? [],
      consoleErrorsOnState: state.consoleErrorsOnState ?? [],
      networkErrorsOnState: state.networkErrorsOnState ?? [],
      duplicateCount: state.duplicateCount ?? 1,
      isDuplicateOfStateId: state.isDuplicateOfStateId
    }
  })
}

export function buildCrawlCoverage(report: SnifferReport | null | undefined) {
  const coverage = report?.crawlGraph?.coverage
  const states = report?.crawlGraph?.states ?? []
  return coverage ?? {
    sourceRoutes: [],
    visitedRoutes: unique(states.map(stateRoute)),
    missedRoutes: [],
    workflowsDiscovered: report?.sourceGraph?.sourceWorkflows?.length ?? 0,
    workflowsExercised: 0,
    scenariosPassed: report?.scenarioRuns?.filter((scenario) => scenario.status === 'passed').length ?? 0,
    scenariosFailed: report?.scenarioRuns?.filter((scenario) => scenario.status === 'failed').length ?? 0,
    scenariosSkipped: report?.scenarioRuns?.filter((scenario) => scenario.status === 'skipped').length ?? 0,
    safeActionsSkipped: report?.crawlGraph?.unvisitedSafeActions ?? []
  }
}

export function buildScenarioViews(report: SnifferReport | null | undefined): ScenarioView[] {
  return (report?.scenarioRuns ?? []).map((scenario) => {
    const assertions = scenario.assertions ?? []
    const stepsAttempted = scenario.stepsAttempted ?? []
    const screenshots = scenario.screenshots ?? []
    const steps = stepsAttempted.map((label, index) => {
      const assertion = assertions[index] ?? assertions.find((item) => textOverlaps(item.label, label))
      return {
        index,
        label,
        status: assertion?.status === 'failed' ? 'failed' : assertion?.status === 'skipped' ? 'skipped' : 'passed',
        actionType: inferActionType(label),
        evidence: assertion?.evidence ?? [],
        screenshot: assertion?.screenshotPath ?? screenshots[Math.min(index, screenshots.length - 1)]
      } satisfies ScenarioStepView
    })
    const extraAssertions = assertions
      .filter((assertion) => !steps.some((step) => textOverlaps(step.label, assertion.label)))
      .map((assertion, index) => ({
        index: steps.length + index,
        label: assertion.label,
        status: assertion.status === 'failed' ? 'failed' : assertion.status === 'skipped' ? 'skipped' : 'passed',
        actionType: 'assert',
        evidence: assertion.evidence ?? [],
        screenshot: assertion.screenshotPath
      } satisfies ScenarioStepView))
    return {
      scenario,
      steps: [...steps, ...extraAssertions],
      failedAssertions: assertions
        .filter((assertion) => assertion.status === 'failed')
        .map((assertion) => ({ label: assertion.label, evidence: assertion.evidence ?? [], screenshotPath: assertion.screenshotPath }))
    }
  })
}

export function buildWorkflowEvidence(report: SnifferReport | null | undefined): WorkflowEvidence[] {
  const workflows = report?.sourceGraph?.sourceWorkflows ?? []
  const verifications = report?.runtimeWorkflowVerifications ?? []
  const surfaces = report?.sourceGraph?.uiSurfaces ?? []
  const apiCalls = report?.sourceGraph?.apiCalls ?? []
  const scenarios = report?.scenarioRuns ?? []
  const issues = report?.issues ?? []
  return workflows.map((workflow) => {
    const verification = verifications.find((item) => textOverlaps(item.name, workflow.name))
    const relatedSurfaces = surfaces.filter((surface) => evidenceOverlaps([...workflow.evidence, workflow.name], [...surface.evidence, surface.display_name, surface.surface_type]))
    const relatedApi = apiCalls.filter((api) => textOverlaps(api.likelyWorkflow ?? '', workflow.name) || evidenceOverlaps(workflow.evidence, [api.endpoint, api.functionName ?? '']))
    const relatedScenarios = scenarios.filter((scenario) => textOverlaps(scenario.name, workflow.name))
    const relatedIssues = issues.filter((issue) => textOverlaps(issue.title, workflow.name) || issue.evidence.some((item) => evidenceOverlaps([item], [...workflow.evidence, workflow.name])))
    const criticDecisions = (report?.criticDecisions ?? [])
      .filter((decision) => relatedIssues.some((issue) => issue.issue_id === decision.finding_id) || evidenceOverlaps(decision.evidence ?? [], [...workflow.evidence, workflow.name]))
      .map((decision) => decision.classification)
    return {
      workflow,
      verification,
      surfaces: relatedSurfaces,
      apiCalls: relatedApi,
      scenarios: relatedScenarios,
      issues: relatedIssues,
      criticDecisions,
      status: relatedIssues.length ? 'failed' : relatedScenarios.some((scenario) => scenario.status === 'failed') ? 'warning' : verification?.status === 'verified' ? 'passed' : 'skipped'
    }
  })
}

function groupControls(state: CrawlState): Record<string, Array<{ label: string; selector?: string; type?: string }>> {
  return state.visible.reduce<Record<string, Array<{ label: string; selector?: string; type?: string }>>>((acc, control) => {
    acc[control.kind] ??= []
    acc[control.kind].push({
      label: control.text || control.name || control.href || control.kind,
      selector: control.selectorHint,
      type: control.type
    })
    return acc
  }, {})
}

function repeatedLabels(actions: CrawlAction[]): string[] {
  const counts = actions.reduce<Record<string, number>>((acc, action) => {
    if (action.changedState === false || action.skipped) acc[action.label] = (acc[action.label] ?? 0) + 1
    return acc
  }, {})
  return Object.entries(counts).map(([label, count]) => count > 1 ? `${label} (${count} times)` : label)
}

function relatedWorkflowsForState(report: SnifferReport | null | undefined, state: CrawlState): string[] {
  const text = state.visible.map((control) => `${control.text ?? ''} ${control.name ?? ''}`).join(' ').toLowerCase()
  return (report?.sourceGraph?.sourceWorkflows ?? [])
    .filter((workflow) => workflow.evidence.some((item) => text.includes(item.toLowerCase())) || text.includes(workflow.name.toLowerCase()))
    .map((workflow) => workflow.name)
    .slice(0, 8)
}

function inferActionType(label: string): string {
  if (/click|open|select/i.test(label)) return 'click'
  if (/enter|type|prompt/i.test(label)) return 'type'
  if (/assert|find|verify/i.test(label)) return 'assert'
  return 'step'
}

function evidenceOverlaps(left: string[], right: string[]): boolean {
  const rightText = right.join(' ').toLowerCase()
  return left.some((item) => item && item.length > 2 && rightText.includes(item.toLowerCase()))
}

function textOverlaps(left: string, right: string): boolean {
  const a = left.toLowerCase()
  const b = right.toLowerCase()
  return Boolean(a && b && (a.includes(b) || b.includes(a)))
}

function inferScreenName(state: CrawlState): string {
  const route = state.hashRoute ?? routeKey(state.url)
  const text = state.visible.map((control) => `${control.text ?? ''} ${control.name ?? ''}`).join(' ').toLowerCase()
  if (/add repository|target id|path or url/.test(text)) return 'Add repository dialog'
  if (/workspace name|create workspace/.test(text)) return 'New workspace dialog'
  if (/handoff/.test(text)) return 'Handoff tab'
  if (/raw json|schema_version/.test(text)) return 'Raw JSON tab'
  if (/overview|change set|graph evidence|validation/.test(text)) return 'Plan Bundle result'
  if (route === '#workspaces') return 'Workspaces'
  if (route === '#repositories') return 'Repositories'
  if (route === '#learning') return 'Learning'
  if (route === '#settings') return 'Settings'
  return route === '#prompt' || route === '/' ? 'Prompt composer / Plan Runs' : route.replace(/^#/, '') || 'Runtime screen'
}

function routeKey(value: string): string {
  try {
    const url = new URL(value)
    return url.hash || url.pathname || '/'
  } catch {
    return value
  }
}

function stateRoute(state: CrawlState): string {
  const route = state.hashRoute ?? routeKey(state.url)
  if (route && route !== '/') return route
  const screen = (state.inferredScreenName ?? '').toLowerCase()
  if (/workspace/.test(screen)) return '#workspaces'
  if (/repo/.test(screen)) return '#repositories'
  if (/learning/.test(screen)) return '#learning'
  if (/settings/.test(screen)) return '#settings'
  if (/plan|prompt|handoff|raw json|change set/.test(screen)) return '#prompt'
  return route || '/'
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
