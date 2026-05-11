import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AppIntent, AppProfile, AppSubtype, CandidateFinding, CrawlCoverage, CrawlGraph, CrawlState, DiscoveryMode, EvidenceProvenanceSummary, GeneratedScenario, GraphRefinementSuggestion, Issue, LocatorRepairResult, ProductExperienceContext, ProductExperienceContextScope, ProductExperienceResult, ProductIntentFinding, ProductIntentModel, PromptConsistencyResult, RuntimeAppModel, RuntimeDomSnapshot, RuntimeLlmIntent, RuntimeWorkflowVerification, ScenarioPackSelection, ScenarioRun, ScreenshotEvidenceSource, SnifferReport, SourceGraph, UxCriticFinding, WorkflowCriticDecision } from '../types.js'
import { writeJson } from './json.js'
import { matchRuntimeSurfaces } from '../heuristics/runtimeSurfaceMatcher.js'
import { enrichIssues } from '../repair/issueMetadata.js'
import { triageIssues } from '../heuristics/issueTriage.js'
import { buildUIIntentGraph } from '../evidence/contextModel.js'
import { buildRuntimeEventIntegrity } from './runtimeEvents.js'

export async function writeAuditReports(reportDir: string, input: {
  sourceGraph: SourceGraph
  crawlGraph: CrawlGraph
  appIntent: AppIntent
  appProfile?: AppProfile
  appSubtype?: AppSubtype
  scenarioSelection?: ScenarioPackSelection
  discoveryMode?: DiscoveryMode
  runtimeDomSnapshot?: RuntimeDomSnapshot
  runtimeAppModel?: RuntimeAppModel
  llmRuntimeIntent?: RuntimeLlmIntent
  locatorFailures?: LocatorRepairResult[]
  generatedScenarios?: GeneratedScenario[]
  productIntent?: ProductIntentModel
  productIntentFindings?: ProductIntentFinding[]
  productExperience?: ProductExperienceResult
  runtimeWorkflowVerifications: RuntimeWorkflowVerification[]
  scenarioRuns?: ScenarioRun[]
  promptConsistency?: PromptConsistencyResult
  criticDecisions?: WorkflowCriticDecision[]
  uxCriticFindings?: UxCriticFinding[]
  deferredFindings?: CandidateFinding[]
  blockedChecks?: CandidateFinding[]
  needsMoreCrawling?: CandidateFinding[]
  rawFindings?: Issue[]
  issues: Issue[]
}): Promise<SnifferReport> {
  await mkdir(reportDir, { recursive: true })
  const generatedAt = new Date().toISOString()
  const sourceGraph: SourceGraph = {
    ...input.sourceGraph,
    uiIntentGraph: input.sourceGraph.uiIntentGraph ?? buildUIIntentGraph(input.sourceGraph),
    workflowDiscoverySummary: {
      ...(input.sourceGraph.workflowDiscoverySummary ?? { source_workflows_count: input.sourceGraph.sourceWorkflows.length }),
      source_workflows_count: input.sourceGraph.sourceWorkflows.length,
      runtime_workflows_count: input.runtimeAppModel?.workflows.length ?? 0,
      llm_workflows_count: input.llmRuntimeIntent?.workflows.length ?? input.runtimeAppModel?.llmInferredWorkflows?.length ?? 0,
      generated_scenarios_count: input.generatedScenarios?.length ?? 0,
      executed_scenarios_count: input.scenarioRuns?.length ?? 0
    }
  }
  const runtimeIntegritySeed = buildRuntimeEventIntegrity(input.crawlGraph, input.rawFindings ?? input.issues)
  const rawFindings = enrichIssues([...(input.rawFindings ?? input.issues), ...runtimeIntegritySeed.unexplainedIssues], sourceGraph, input.crawlGraph)
  const runtimeIntegrity = buildRuntimeEventIntegrity(input.crawlGraph, rawFindings)
  const triagedIssues = input.rawFindings
    ? enrichIssues([...input.issues, ...runtimeIntegritySeed.unexplainedIssues], sourceGraph, input.crawlGraph)
    : enrichIssues(triageIssues({
      rawFindings,
      sourceGraph,
      workflowVerifications: input.runtimeWorkflowVerifications
    }), sourceGraph, input.crawlGraph)
  const crawlGraph = enrichCrawlGraphForReport(input.crawlGraph, sourceGraph, triagedIssues, input.runtimeWorkflowVerifications, input.scenarioRuns ?? [])
  const productExperience = input.productExperience
    ? attachProductExperienceProvenance(input.productExperience, generatedAt)
    : undefined
  const report: SnifferReport = {
    ...input,
    sourceGraph,
    sourceInventory: sourceGraph.sourceInventory,
    uiIntentGraph: sourceGraph.uiIntentGraph,
    crawlGraph,
    rawFindings,
    issues: triagedIssues,
    appProfile: input.appProfile,
    appSubtype: input.appSubtype,
    scenarioSelection: input.scenarioSelection,
    discoveryMode: input.discoveryMode,
    runtimeDomSnapshot: input.runtimeDomSnapshot,
    runtimeAppModel: input.runtimeAppModel,
    llmRuntimeIntent: input.llmRuntimeIntent,
    locatorFailures: input.locatorFailures ?? [],
    generatedScenarios: input.generatedScenarios ?? [],
    productExperience,
    graphRefinement: sourceGraph.graphRefinement,
    evidenceRetrievalSummaries: productExperience?.evidenceRetrievalSummaries ?? [],
    evidenceProvenance: productExperience?.evidenceProvenance,
    suppressedRuntimeEvents: runtimeIntegrity.suppressedRuntimeEvents,
    scenarioRuns: input.scenarioRuns ?? [],
    criticDecisions: input.criticDecisions ?? [],
    uxCriticFindings: input.uxCriticFindings ?? [],
    deferredFindings: input.deferredFindings ?? [],
    blockedChecks: input.blockedChecks ?? [],
    needsMoreCrawling: input.needsMoreCrawling ?? [],
    runtimeSurfaceMatches: matchRuntimeSurfaces(sourceGraph, crawlGraph),
    generatedAt
  }
  await writeJson(path.join(reportDir, 'source_graph.json'), sourceGraph)
  if (sourceGraph.sourceInventory) await writeJson(path.join(reportDir, 'source_inventory.json'), sourceGraph.sourceInventory)
  if (sourceGraph.uiIntentGraph) await writeJson(path.join(reportDir, 'ui_intent_graph.json'), sourceGraph.uiIntentGraph)
  if (sourceGraph.graphRefinement) {
    await writeJson(path.join(reportDir, 'graph_refinement.json'), sourceGraph.graphRefinement)
    await writeJson(path.join(reportDir, 'graph_refinement_result.json'), sourceGraph.graphRefinement)
    if (sourceGraph.graphRefinement.targetIndex) await writeJson(path.join(reportDir, 'graph_refinement_target_index.json'), sourceGraph.graphRefinement.targetIndex)
  }
  await writeJson(path.join(reportDir, 'app_intent.json'), input.appIntent)
  if (input.appProfile) await writeJson(path.join(reportDir, 'app_profile.json'), input.appProfile)
  if (input.runtimeDomSnapshot) await writeJson(path.join(reportDir, 'runtime_dom_snapshot.json'), input.runtimeDomSnapshot)
  if (input.runtimeAppModel) await writeJson(path.join(reportDir, 'runtime_app_model.json'), input.runtimeAppModel)
  if (input.productIntent) await writeJson(path.join(reportDir, 'product_intent.json'), input.productIntent)
  if (productExperience) await writeJson(path.join(reportDir, 'product_experience_critic.json'), productExperience)
  await writeJson(path.join(reportDir, 'suppressed_runtime_events.json'), runtimeIntegrity.suppressedRuntimeEvents)
  await writeJson(path.join(reportDir, 'crawl_graph.json'), crawlGraph)
  await writeJson(path.join(reportDir, 'latest_report.json'), report)
  await writeFile(path.join(reportDir, 'latest_report.md'), renderMarkdown(report), 'utf8')
  await writeFile(path.join(reportDir, 'fix_prompts.md'), renderFixPrompts(triagedIssues), 'utf8')
  return report
}

function attachProductExperienceProvenance(result: ProductExperienceResult, outerReportGeneratedAt: string): ProductExperienceResult {
  const contexts = result.contexts.map((context) => ({
    ...context,
    outerReportGeneratedAt,
    context_warnings: unique([
      ...context.context_warnings,
      provenanceMismatchWarning(context, outerReportGeneratedAt)
    ].filter(Boolean) as string[])
  }))
  const contextByScreen = new Map(contexts.map((context) => [context.current_screen_name, context]))
  const decisions = result.decisions.map((decision) => {
    const context = contextByScreen.get(decision.screen_name)
    return {
      ...decision,
      outerReportGeneratedAt,
      displayedReportId: decision.displayedReportId ?? context?.displayedReportId,
      displayedReportGeneratedAt: decision.displayedReportGeneratedAt ?? context?.displayedReportGeneratedAt,
      displayedReportPath: decision.displayedReportPath ?? context?.displayedReportPath,
      screenshotSource: decision.screenshotSource ?? context?.screenshotSource,
      contextScope: decision.contextScope ?? context?.contextScope,
      context_warnings: unique([
        ...decision.context_warnings,
        provenanceMismatchWarning(context, outerReportGeneratedAt)
      ].filter(Boolean) as string[])
    }
  })
  return {
    ...result,
    contexts,
    decisions,
    evidenceProvenance: buildEvidenceProvenanceSummary(contexts, outerReportGeneratedAt)
  }
}

function provenanceMismatchWarning(context: ProductExperienceContext | undefined, outerReportGeneratedAt: string): string | undefined {
  if (!context || context.contextScope !== 'displayed_report' || !context.displayedReportGeneratedAt) return undefined
  if (sameTimestampish(context.displayedReportGeneratedAt, outerReportGeneratedAt)) return undefined
  return `dashboard-visible report timestamp (${context.displayedReportGeneratedAt}) differs from outer audit report timestamp (${outerReportGeneratedAt}); judge visible counts as displayed-report evidence only`
}

function buildEvidenceProvenanceSummary(contexts: ProductExperienceContext[], outerAuditReportGeneratedAt: string): EvidenceProvenanceSummary {
  const contextScopeCounts = emptyScopeCounts()
  const screenshotSourceCounts = emptyScreenshotSourceCounts()
  const displayedReportContexts = contexts.map((context) => {
    const scopeKey = context.contextScope ?? 'unset'
    const sourceKey = context.screenshotSource ?? 'unset'
    contextScopeCounts[scopeKey] += 1
    screenshotSourceCounts[sourceKey] += 1
    return {
      screen: context.current_screen_name,
      navLabel: context.nav_label_clicked,
      scenarioName: context.scenario_name,
      screenshotPath: context.screenshot_path,
      screenshotSource: context.screenshotSource,
      contextScope: context.contextScope,
      displayedReportId: context.displayedReportId,
      displayedReportGeneratedAt: context.displayedReportGeneratedAt,
      displayedReportPath: context.displayedReportPath,
      warnings: context.context_warnings.filter((warning) => /displayed|provenance|outer audit|dashboard-visible/i.test(warning))
    }
  })
  return {
    outerAuditReportGeneratedAt,
    contextScopeCounts,
    screenshotSourceCounts,
    displayedReportContexts,
    warnings: unique(displayedReportContexts.flatMap((context) => context.warnings))
  }
}

function emptyScopeCounts(): Record<ProductExperienceContextScope | 'unset', number> {
  return {
    current_audit: 0,
    displayed_report: 0,
    mixed: 0,
    unknown: 0,
    unset: 0
  }
}

function emptyScreenshotSourceCounts(): Record<ScreenshotEvidenceSource | 'unset', number> {
  return {
    current_audit_screen: 0,
    dashboard_displayed_report: 0,
    previous_report: 0,
    unknown: 0,
    unset: 0
  }
}

function sameTimestampish(left: string, right: string): boolean {
  const leftTime = Date.parse(left)
  const rightTime = Date.parse(right)
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return Math.abs(leftTime - rightTime) < 2000
  }
  return left === right
}

export function renderMarkdown(report: SnifferReport): string {
  const rawFindings = report.rawFindings ?? report.issues
  const rawAppendix = rawFindings.length === 0
    ? 'No raw findings recorded.'
    : rawFindings.map((issue, index) => [
      `## ${index + 1}. ${issue.title}`,
      '',
      `- Severity: ${issue.severity}`,
      `- Type: ${issue.type}`,
      `- Issue ID: ${issue.issue_id ?? 'unknown'}`,
      `- Status: ${issue.status ?? 'open'}`,
      `- Description: ${issue.description}`,
      `- Evidence: ${issue.evidence.join('; ')}`,
      `- Suspected files: ${issue.suspected_files?.join(', ') || 'unknown'}`,
      issue.screenshotPath ? `- Screenshot: ${issue.screenshotPath}` : undefined,
      issue.tracePath ? `- Trace: ${issue.tracePath}` : undefined,
      '',
      'Suggested fix prompt:',
      '',
      issue.suggestedFixPrompt
    ].filter(Boolean).join('\n')).join('\n\n')

  return [
    '# Sniffer UI QA Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## App Intent',
    '',
    report.appIntent.summary,
    '',
    '## Product Intent Model',
    '',
    renderProductIntentModel(report.productIntent),
    '',
    '## App Profile',
    '',
    renderAppProfile(report),
    '',
    '## Scenario Selection',
    '',
    renderScenarioSelection(report),
    '',
    '## Discovery Adapters',
    '',
    renderDiscoveryAdapters(report),
    '',
    '## Source Scope Summary',
    '',
    renderSourceScopeSummary(report),
    '',
    '## Source Inventory Summary',
    '',
    renderSourceInventorySummary(report),
    '',
    '## UI Intent Graph Summary',
    '',
    renderUIIntentGraphSummary(report),
    '',
    '## Graph Structure Critic',
    '',
    renderGraphStructureCritic(report),
    '',
    '## Workflow Discovery Sources',
    '',
    renderWorkflowDiscoverySources(report),
    '',
    '## Workflow Inference Integrity',
    '',
    renderWorkflowInferenceIntegrity(report),
    '',
    '## Runtime Summary',
    '',
    `- Start URL: ${report.crawlGraph.startUrl}`,
    `- Final URL: ${report.crawlGraph.finalUrl}`,
    `- States captured: ${report.crawlGraph.states.length}`,
    `- Actions attempted: ${report.crawlGraph.actions.length}`,
    `- Console errors: ${report.crawlGraph.consoleErrors.length}`,
    `- Network failures: ${report.crawlGraph.networkFailures.length}`,
    `- Discovery mode: ${report.discoveryMode ?? 'source'}`,
    `- Raw findings: ${rawFindings.length}`,
    `- Triaged issues / repair groups: ${report.issues.length}`,
    '',
    '## Suppressed Runtime Events',
    '',
    renderSuppressedRuntimeEvents(report),
    '',
    '## Source UI Surfaces',
    '',
    renderSurfaceSummary(report),
    '',
    '## Runtime DOM Discovery',
    '',
    renderRuntimeDomDiscovery(report),
    '',
    '## Inferred Runtime App Model',
    '',
    renderRuntimeAppModel(report),
    '',
    '## Locator Inventory',
    '',
    renderLocatorInventory(report),
    '',
    '## LLM Inferred Workflows',
    '',
    renderLlmRuntimeIntent(report),
    '',
    '## Safe/Unsafe Action Plan',
    '',
    renderRuntimeActionPlan(report),
    '',
    '## Locator Failures / Repairs',
    '',
    renderLocatorFailures(report),
    '',
    '## Source Workflows',
    '',
    renderWorkflowSummary(report),
    '',
    '## Runtime Workflows',
    '',
    renderRuntimeWorkflowSummary(report),
    '',
    '## Scenario Execution Coverage',
    '',
    renderScenarioExecutionCoverage(report),
    '',
    '## Scenario Runs',
    '',
    renderScenarioSummary(report),
    '',
    '## Generated Generic Scenarios',
    '',
    renderGeneratedScenarioSummary(report),
    '',
    '## Prompt/Output Consistency',
    '',
    renderPromptConsistency(report),
    '',
    '## Functional/API Issues',
    '',
    renderIssueGroup(report, ['functional_bug', 'api_error', 'console_error', 'network_error', 'broken_navigation', 'broken_interaction', 'broken_form', 'missing_form_control']),
    '',
    '## Workflow Scenario Issues',
    '',
    renderIssueGroup(report, ['workflow_confusion']),
    '',
    '## Semantic Consistency Issues',
    '',
    renderIssueGroup(report, ['semantic_mismatch', 'stale_output']),
    '',
    '## Product Intent Gaps',
    '',
    renderProductIntentGaps(report),
    '',
    '## Product Experience Critic',
    '',
    renderProductExperienceCritic(report),
    '',
    '## Evidence Provenance',
    '',
    renderEvidenceProvenance(report),
    '',
    '## Evidence Retrieval Summaries',
    '',
    renderEvidenceRetrievalSummaries(report),
    '',
    '## UX/Layout Issues',
    '',
    renderIssueGroup(report, ['usability_issue', 'layout_issue', 'visual_clutter']),
    '',
    '## Accessibility Issues',
    '',
    renderIssueGroup(report, ['accessibility_issue']),
    '',
    '## UX Critic Findings',
    '',
    renderUxCriticSummary(report),
    '',
    '## Actionable Fix Packets',
    '',
    renderFixPacketSummary(report),
    '',
    '## Workflow Critic',
    '',
    renderCriticSummary(report),
    '',
    '## Triaged Repair Groups',
    '',
    renderTriagedIssues(report),
    '',
    '## Raw Findings Appendix',
    '',
    rawAppendix,
    ''
  ].join('\n')
}

function enrichCrawlGraphForReport(
  crawlGraph: CrawlGraph,
  sourceGraph: SourceGraph,
  issues: Issue[],
  workflowVerifications: RuntimeWorkflowVerification[],
  scenarios: ScenarioRun[]
): CrawlGraph {
  const states = crawlGraph.states.map((state, index) => enrichStateForReport(state, index, crawlGraph, sourceGraph, issues))
  const coverage = buildCoverage(crawlGraph, states, sourceGraph, workflowVerifications, scenarios)
  return {
    ...crawlGraph,
    states,
    coverage,
    unvisitedSafeActions: coverage.safeActionsSkipped
  }
}

function enrichStateForReport(state: CrawlState, index: number, crawlGraph: CrawlGraph, sourceGraph: SourceGraph, issues: Issue[]): CrawlState {
  const text = stateText(state)
  const screenshotPath = state.screenshotPath ?? crawlGraph.screenshots[index]
  const matchedSourceWorkflows = sourceGraph.sourceWorkflows
    .filter((workflow) => textIncludesAny(text, [workflow.name, ...workflow.evidence, ...workflow.likelyUserActions]))
    .map((workflow) => workflow.name)
    .slice(0, 8)
  const matchedUiSurfaces = sourceGraph.uiSurfaces
    .filter((surface) => textIncludesAny(text, [surface.display_name, surface.surface_type, ...surface.evidence, ...surface.relatedButtons, ...surface.relatedInputs]))
    .map((surface) => surface.display_name)
    .slice(0, 8)
  const issuesOnState = issues
    .filter((issue) =>
      (screenshotPath && issue.screenshotPath === screenshotPath) ||
      textIncludesAny(text, [issue.title, ...issue.evidence])
    )
    .map((issue) => issue.issue_id ?? issue.title)
  return {
    ...state,
    id: state.id ?? `state-${index + 1}`,
    sequenceNumber: state.sequenceNumber ?? index + 1,
    stateHash: state.stateHash ?? state.hash,
    screenshotPath,
    matchedSourceWorkflows,
    matchedUiSurfaces,
    issuesOnState,
    consoleErrorsOnState: crawlGraph.consoleErrors.filter((error) => !error.location || sameRuntimeLocation(error.location, state.url)),
    networkErrorsOnState: crawlGraph.networkFailures.filter((failure) => sameRuntimeLocation(failure.url, state.url))
  }
}

function buildCoverage(
  crawlGraph: CrawlGraph,
  states: CrawlState[],
  sourceGraph: SourceGraph,
  workflowVerifications: RuntimeWorkflowVerification[],
  scenarios: ScenarioRun[]
): CrawlCoverage {
  const sourceRoutes = unique([
    ...sourceGraph.routes.map((route) => route.path),
    ...inferExpectedHashRoutes(sourceGraph)
  ])
  const visitedRoutes = unique(states.map(stateRoute))
  return {
    sourceRoutes,
    visitedRoutes,
    missedRoutes: sourceRoutes.filter((route) => !visitedRoutes.includes(route)),
    workflowsDiscovered: sourceGraph.sourceWorkflows.length,
    workflowsExercised: workflowVerifications.filter((workflow) => workflow.status === 'verified' || workflow.status === 'partial').length,
    scenariosPassed: scenarios.filter((scenario) => scenario.status === 'passed').length,
    scenariosFailed: scenarios.filter((scenario) => scenario.status === 'failed').length,
    scenariosSkipped: scenarios.filter((scenario) => scenario.status === 'blocked').length,
    safeActionsSkipped: uniqueSkipped([
      ...(crawlGraph.unvisitedSafeActions ?? []),
      ...crawlGraph.actions.filter((action) => action.skipped || action.type === 'skip').map((action) => ({
        label: action.label,
        reason: action.skippedReason ?? action.reason ?? 'skipped',
        stateId: states.find((state) => state.hash === action.stateHashBefore)?.id,
        route: states.find((state) => state.hash === action.stateHashBefore)?.hashRoute
      }))
    ])
  }
}

function inferExpectedHashRoutes(sourceGraph: SourceGraph): string[] {
  const text = [
    ...sourceGraph.uiSurfaces.flatMap((surface) => [surface.surface_type, surface.display_name, ...surface.evidence]),
    ...sourceGraph.sourceWorkflows.flatMap((workflow) => [workflow.name, ...workflow.evidence, ...workflow.likelyUserActions])
  ].join(' ').toLowerCase()
  const routes: string[] = []
  if (/workspace/.test(text)) routes.push('#workspaces')
  if (/repo|repository|target/.test(text)) routes.push('#repositories')
  if (/prompt|plan run|plan bundle|handoff/.test(text)) routes.push('#prompt')
  if (/learning|recipe/.test(text)) routes.push('#learning')
  if (/setting|semantic/.test(text)) routes.push('#settings')
  return routes
}

function stateText(state: CrawlState): string {
  return [
    state.url,
    state.title,
    state.inferredScreenName,
    ...(state.primaryVisibleText ?? []),
    ...state.visible.flatMap((control) => [control.text, control.name, control.href].filter(Boolean) as string[])
  ].join(' ').toLowerCase()
}

function textIncludesAny(text: string, values: string[]): boolean {
  return values.some((value) => value && value.length > 2 && text.includes(value.toLowerCase()))
}

function sameRuntimeLocation(left: string, right: string): boolean {
  try {
    const a = new URL(left)
    const b = new URL(right)
    return a.origin === b.origin && (a.pathname === b.pathname || a.hash === b.hash)
  } catch {
    return left === right
  }
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
  return [...new Set(values.filter(Boolean))]
}

function uniqueSkipped(items: Array<{ label: string; reason: string; stateId?: string; route?: string }>) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.stateId ?? ''}:${item.route ?? ''}:${item.label}:${item.reason}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function renderTriagedIssues(report: SnifferReport): string {
  if (report.issues.length === 0) return 'No triaged repair groups found.'
  return report.issues.map((issue, index) => [
    `### ${index + 1}. ${issue.title}`,
    '',
    `- Severity: ${issue.severity}`,
    `- Type: ${issue.type}`,
    `- Issue ID: ${issue.issue_id ?? 'unknown'}`,
    `- Description: ${issue.description}`,
    `- Evidence: ${issue.evidence.join('; ')}`,
    `- Suspected files: ${issue.suspected_files?.join(', ') || 'unknown'}`,
    issue.screenshotPath ? `- Screenshot: ${issue.screenshotPath}` : undefined
  ].filter(Boolean).join('\n')).join('\n\n')
}

function renderScenarioSummary(report: SnifferReport): string {
  const runs = report.scenarioRuns ?? []
  if (runs.length === 0) return 'No scenario packs were run.'
  return runs.map((run) => [
    `### ${run.name}`,
    '',
    `- Status: ${run.status}`,
    `- Prerequisites: ${run.prerequisites.join(', ') || 'none'}`,
    `- Steps attempted: ${run.stepsAttempted.join(', ') || 'none'}`,
    `- Screenshots: ${run.screenshots.join(', ') || 'none'}`,
    `- Failed assertions: ${run.assertions.filter((assertion) => assertion.status === 'failed').map((assertion) => assertion.label).join(', ') || 'none'}`
  ].join('\n')).join('\n\n')
}

function renderAppProfile(report: SnifferReport): string {
  const profile = report.appProfile
  if (!profile) return 'No app profile was generated.'
  return [
    `- Profile type: ${profile.profile_type}`,
    `- App subtype: ${report.appSubtype ?? report.scenarioSelection?.appSubtype ?? 'unknown'}`,
    `- Confidence: ${profile.confidence}`,
    `- Core entities: ${profile.core_entities.join(', ') || 'unknown'}`,
    `- Primary user jobs: ${profile.primary_user_jobs.join('; ') || 'unknown'}`,
    `- Expected navigation: ${profile.expected_navigation_patterns.join('; ') || 'unknown'}`,
    `- Expected workflows: ${profile.expected_workflows.join('; ') || 'unknown'}`,
    `- Expected output surfaces: ${profile.expected_output_surfaces.join('; ') || 'unknown'}`,
    `- Evidence: ${compactEvidenceList(profile.evidence).join('; ') || 'none'}`
  ].join('\n')
}

function renderScenarioSelection(report: SnifferReport): string {
  const selection = report.scenarioSelection
  if (!selection) return 'No scenario selection metadata recorded.'
  const skippedWorkspace = selection.skippedScenarios.filter((scenario) => /workspace|repo|learning|plan|semantic|json|handoff/i.test(`${scenario.scenarioId} ${scenario.scenarioName}`))
  return [
    `- Scenario pack: ${selection.scenarioPack}`,
    `- App subtype: ${selection.appSubtype}`,
    `- Confidence: ${selection.confidence}`,
    `- Reason: ${selection.reason}`,
    skippedWorkspace.length && selection.scenarioPack !== 'workspace_control'
      ? '- Skipped workspace-control scenario pack: insufficient evidence for workspace/repo target management in this app subtype.'
      : undefined,
    `- Applicability decisions: ${selection.applicability.map((item) => `${item.scenarioId}=${item.shouldRun ? 'run' : 'skip'} (${item.confidence})`).join('; ') || 'none'}`,
    selection.skippedScenarios.length
      ? `- Skipped scenarios: ${selection.skippedScenarios.slice(0, 12).map((item) => `${item.scenarioName}: ${item.reason}`).join('; ')}`
      : '- Skipped scenarios: none'
  ].filter(Boolean).join('\n')
}

function renderGeneratedScenarioSummary(report: SnifferReport): string {
  const scenarios = report.generatedScenarios ?? []
  if (scenarios.length === 0) return 'No generic scenarios were generated.'
  return scenarios.map((scenario) => [
    `### ${scenario.name}`,
    '',
    `- ID: ${scenario.id}`,
    scenario.scenarioPack ? `- Scenario pack: ${scenario.scenarioPack}` : undefined,
    scenario.appSubtype ? `- App subtype: ${scenario.appSubtype}` : undefined,
    `- Applies to: ${scenario.profileApplicability.join(', ')}`,
    `- Confidence: ${scenario.confidence}`,
    `- Expected controls: ${scenario.expectedControls.join(', ') || 'none'}`,
    `- Expected outcomes: ${scenario.expectedOutcomes.join('; ') || 'none'}`,
    `- Evidence: ${compactEvidenceList(scenario.evidence).join('; ') || 'none'}`
  ].filter(Boolean).join('\n')).join('\n\n')
}

function renderDiscoveryAdapters(report: SnifferReport): string {
  const adapters = report.sourceGraph.discoveryAdapters ?? []
  if (adapters.length === 0) return 'No framework discovery adapters recorded.'
  return adapters.map((adapter) => [
    `### ${adapter.adapterId}`,
    '',
    `- Framework: ${adapter.framework}`,
    `- Confidence: ${adapter.confidence}`,
    `- Evidence: ${adapter.evidence.join('; ') || 'none'}`,
    adapter.warnings?.length ? `- Warnings: ${adapter.warnings.join('; ')}` : undefined
  ].filter(Boolean).join('\n')).join('\n\n')
}

function renderSourceScopeSummary(report: SnifferReport): string {
  const summary = report.sourceGraph.sourceScopeSummary
  if (!summary) return 'No source scope summary was recorded.'
  const counts = Object.entries(summary.scannedFileCountsByScope)
    .map(([scope, count]) => `- ${scope}: ${count}`)
    .join('\n')
  return [
    `- Root framework/build: ${summary.rootFramework ?? 'unknown'} / ${summary.rootBuildTool ?? 'unknown'}`,
    `- Primary UI framework/build: ${summary.uiFramework ?? 'unknown'} / ${summary.uiBuildTool ?? 'unknown'}`,
    `- Primary UI roots: ${summary.primaryUiRoots.map((root) => `${root.path} (${root.framework ?? 'unknown'}, ${root.reason})`).join('; ') || 'none'}`,
    `- Support roots: ${summary.supportRoots.map((root) => `${root.path} (${root.scope}, ${root.reason})`).join('; ') || 'none'}`,
    `- Fixture roots: ${summary.fixtureRoots.map((root) => `${root.path} (${root.reason})`).join('; ') || 'none'}`,
    `- Excluded paths: ${summary.excludedPaths.join(', ') || 'none'}`,
    '',
    'Scanned files by scope:',
    counts
  ].join('\n')
}

function renderSourceInventorySummary(report: SnifferReport): string {
  const inventory = report.sourceInventory ?? report.sourceGraph.sourceInventory
  if (!inventory) return 'No Source Inventory was recorded.'
  return [
    `- Files: ${inventory.files.length}`,
    `- Modules: ${inventory.modules.length}`,
    `- Framework signals: ${inventory.frameworkSignals.length}`,
    `- Package/build signals: ${inventory.packageBuildSignals.length}`,
    `- Raw symbols: ${inventory.rawExtractedSymbols.length}`,
    `- Raw routes: ${inventory.rawRoutes.length}`,
    `- Raw templates/controls: ${inventory.rawTemplates.length}`,
    `- Raw handlers: ${inventory.rawHandlers.length}`,
    `- Raw API calls: ${inventory.rawApiCalls.length}`,
    `- Total facts: ${inventory.facts.length}`,
    '',
    'Top facts:',
    ...inventory.facts.filter((fact) => !rawJsxFragment(fact.value)).slice(0, 10).map((fact) => `- ${fact.kind}: ${fact.label ?? fact.value}${fact.filePath ? ` (${fact.filePath})` : ''} [${fact.extractionMethod}, ${fact.sourceScope ?? 'unknown'}, ${fact.confidence}]`)
  ].join('\n')
}

function renderUIIntentGraphSummary(report: SnifferReport): string {
  const graph = report.uiIntentGraph ?? report.sourceGraph.uiIntentGraph
  if (!graph) return 'No UI Intent Graph was recorded.'
  return [
    `- Surfaces: ${graph.surfaces.length}`,
    `- Workflows: ${graph.workflows.length}`,
    `- Actions: ${graph.actions.length}`,
    `- Controls: ${graph.controls.length}`,
    `- Forms: ${graph.forms.length}`,
    `- State nodes: ${graph.state.length}`,
    `- API/data dependencies: ${graph.apiDataDependencies.length}`,
    `- Domain entities: ${graph.domainEntities.length}`,
    `- Edges: ${graph.edges.length}`,
    `- Inferences: ${graph.inferences.length}`,
    `- Confidence: ${graph.confidence}`,
    `- Evidence coverage: ${intentEvidenceCoverage(graph)}`,
    '',
    'Top workflows:',
    ...(graph.workflows.slice(0, 8).map((node) => `- ${node.label}${node.filePath ? ` (${node.filePath})` : ''} [evidence: ${node.evidenceIds.length}]`) || ['- none'])
  ].join('\n')
}

function rawJsxFragment(value: string): boolean {
  return /event\.target|=>|autoFocus|aria-describedby=|rows=\{|on[A-Z]\w+\(/.test(value)
}

function compactEvidenceList(values: string[], limit = 10): string[] {
  return values.map(compactEvidence).filter(Boolean).slice(0, limit)
}

function compactEvidence(value: string): string {
  const text = value
    .replace(/\s+/g, ' ')
    .replace(/\s+in\s+"[^"]*(?:event\.target|=>|autoFocus|aria-describedby=|rows=\{|busy\s*===)[^"]*"/gi, '')
    .replace(/\s+in\s+"[^"]{180,}"/g, '')
    .trim()
  return text.length > 180 ? `${text.slice(0, 177)}...` : text
}

function intentEvidenceCoverage(graph: NonNullable<SnifferReport['uiIntentGraph']>): string {
  const nodes = [
    ...graph.surfaces,
    ...graph.workflows,
    ...graph.actions,
    ...graph.controls,
    ...graph.apiDataDependencies
  ]
  const withEvidence = nodes.filter((node) => node.evidenceIds.length > 0).length
  return `${withEvidence}/${nodes.length} nodes with source evidence ids`
}

function renderGraphStructureCritic(report: SnifferReport): string {
  const refinement = report.graphRefinement ?? report.sourceGraph.graphRefinement
  if (!refinement) return 'Graph Structure Critic was not run.'
  const applied = refinement.appliedSuggestions.slice(0, 8).map((suggestion) => renderGraphRefinementSuggestion(suggestion, 'applied'))
  const rejected = refinement.rejectedSuggestions.slice(0, 8).map((suggestion) => renderGraphRefinementSuggestion(suggestion, 'rejected', suggestion.rejectedReason))
  const summary = refinement.targetResolutionSummary
  return [
    `- Mode: ${refinement.mode ?? 'unknown'}`,
    `- Status: ${refinement.status ?? 'completed'}`,
    `- LLM used: ${refinement.llmUsed ? 'yes' : 'no'}`,
    `- Provider: ${refinement.provider ?? 'none'}`,
    refinement.model ? `- Model: ${refinement.model}` : undefined,
    `- Model reviewed: ${refinement.modelReviewed}`,
    `- Suggestions: ${refinement.suggestions.length}`,
    summary ? `- Resolved targets: ${summary.resolvedTargets}` : undefined,
    summary ? `- Unresolved targets: ${summary.unresolvedTargets}` : undefined,
    `- Applied suggestions: ${refinement.appliedSuggestions.length}`,
    `- Rejected suggestions: ${refinement.rejectedSuggestions.length}`,
    summary ? `- Rejected due to safety: ${summary.rejectedDueToSafety}` : undefined,
    summary ? `- Rejected due to low confidence: ${summary.rejectedDueToLowConfidence}` : undefined,
    summary ? `- Rejected due to contradiction: ${summary.rejectedDueToContradiction}` : undefined,
    summary ? `- Rejected due to unresolved target: ${summary.rejectedDueToUnresolved}` : undefined,
    refinement.warnings.length ? `- Warnings: ${refinement.warnings.join('; ')}` : '- Warnings: none',
    '',
    'Top applied refinements:',
    applied.length ? applied.join('\n') : '- none',
    '',
    'Top rejected refinements:',
    rejected.length ? rejected.join('\n') : '- none'
  ].filter((item): item is string => Boolean(item)).join('\n')
}

function renderGraphRefinementSuggestion(suggestion: GraphRefinementSuggestion, status: 'applied' | 'rejected', rejectedReason?: string): string {
  const from = formatGraphRefinementValue(suggestion.fromValue ?? suggestion.targetId)
  const to = formatGraphRefinementValue(suggestion.toValue ?? (status === 'applied' ? 'applied' : 'n/a'))
  const resolution = suggestion.targetResolution
  const originalTarget = formatGraphRefinementValue(resolution?.originalTargetId ?? suggestion.targetId)
  const resolutionLine = resolution
    ? `  - Resolved target: ${resolution.targetId ?? 'unresolved'}${resolution.targetLabel ? ` (${resolution.targetLabel})` : ''} via ${resolution.resolutionMethod}${resolution.reason ? `; ${resolution.reason}` : ''}`
    : undefined
  const candidates = resolution?.candidateTargets?.length && !resolution.resolved
    ? `  - Candidate targets: ${resolution.candidateTargets.map((target) => `${target.id} ${target.kind}:${target.label}`).join('; ')}`
    : undefined
  return [
    `- ${suggestion.type}: ${from} -> ${to}`,
    `  - Target: ${originalTarget}`,
    resolutionLine,
    candidates,
    `  - Evidence ids: ${suggestion.evidenceIds?.join(', ') || 'none'}`,
    suggestion.targetEvidenceIds?.length ? `  - Target evidence ids: ${suggestion.targetEvidenceIds.join(', ')}` : undefined,
    `  - Confidence/risk: ${suggestion.confidence}/${suggestion.risk}`,
    rejectedReason ? `  - Status: rejected (${rejectedReason})` : `  - Status: ${status}`,
    `  - Reason: ${suggestion.reason}`
  ].filter((item): item is string => Boolean(item)).join('\n')
}

function formatGraphRefinementValue(value: unknown): string {
  if (value === undefined || value === null) return 'n/a'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(formatGraphRefinementValue).join(', ')
  if (typeof value !== 'object') return String(value)
  const record = value as Record<string, unknown>
  const kind = stringField(record.kind) ?? stringField(record.type) ?? stringField(record.edgeKind)
  const label = stringField(record.label) ?? stringField(record.value) ?? stringField(record.name) ?? stringField(record.id)
  const source = stringField(record.source)
  const target = stringField(record.target)
  if (source && target) return `${source}${kind ? ` -${kind}-> ` : ' -> '}${target}`
  if (kind && label) return `${kind}: ${label}`
  if (label) return label
  return JSON.stringify(value, null, 2)
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function renderWorkflowDiscoverySources(report: SnifferReport): string {
  const summary = report.sourceGraph.workflowDiscoverySummary
  return [
    `- Source workflows: ${summary?.source_workflows_count ?? report.sourceGraph.sourceWorkflows.length}`,
    `- Runtime workflows: ${summary?.runtime_workflows_count ?? report.runtimeAppModel?.workflows.length ?? 0}`,
    `- LLM workflows: ${summary?.llm_workflows_count ?? report.llmRuntimeIntent?.workflows.length ?? 0}`,
    `- Generated scenarios: ${summary?.generated_scenarios_count ?? report.generatedScenarios?.length ?? 0}`,
    `- Executed scenarios: ${summary?.executed_scenarios_count ?? report.scenarioRuns?.length ?? 0}`
  ].join('\n')
}

function renderWorkflowInferenceIntegrity(report: SnifferReport): string {
  const integrity = report.sourceGraph.workflowInferenceIntegrity
  if (!integrity) return 'No workflow inference integrity metadata recorded.'
  const emitted = integrity.emittedWorkflows.slice(0, 12).map((workflow) =>
    `- ${workflow.workflowName} (${workflow.matchedVocabularyPack}, ${workflow.workflowKind ?? 'user_workflow'}, confidence ${workflow.confidence})`
  )
  const suppressed = integrity.suppressedWorkflows.slice(0, 12).map((workflow) => [
    `- ${workflow.workflowName}`,
    `  - Reason: ${workflow.reason}`,
    `  - Matched vocabulary: ${workflow.matchedVocabularyPack}`,
    `  - Evidence: ${workflow.matchedEvidence.join('; ') || 'none'}`
  ].join('\n'))
  return [
    `- App subtype: ${integrity.appSubtype}`,
    `- Workflow vocabulary packs: ${integrity.selectedVocabularyPacks.join(', ') || 'none'}`,
    `- Emitted workflows: ${integrity.emittedWorkflows.length}`,
    `- Suppressed workflows: ${integrity.suppressedWorkflows.length}`,
    `- App-specific mismatches prevented: ${integrity.appSpecificWorkflowMismatchesPrevented}`,
    '',
    'Emitted:',
    emitted.length ? emitted.join('\n') : '- none',
    '',
    'Suppressed:',
    suppressed.length ? suppressed.join('\n') : '- none'
  ].join('\n')
}

function renderRuntimeWorkflowSummary(report: SnifferReport): string {
  const workflows = report.runtimeAppModel?.workflows ?? []
  if (workflows.length === 0) return 'No runtime workflows discovered.'
  return workflows.map((workflow) => [
    `### ${workflow.name}`,
    '',
    `- Source: ${workflow.source}`,
    `- Confidence: ${workflow.confidence}`,
    `- Evidence: ${workflow.evidence.join('; ') || 'none'}`,
    `- Steps: ${workflow.steps.map((step) => `${step.action} ${step.target_name}`).join('; ') || 'none'}`
  ].join('\n')).join('\n\n')
}

function renderScenarioExecutionCoverage(report: SnifferReport): string {
  const generated = report.generatedScenarios ?? []
  const runs = report.scenarioRuns ?? []
  const executed = new Set(runs.map((run) => run.slug))
  const skipped = generated.filter((scenario) => !executed.has(scenario.id))
  return [
    `- Generated scenarios: ${generated.length}`,
    `- Executed scenarios: ${runs.length}`,
    `- Skipped/not executed: ${skipped.length}`,
    `- Passed: ${runs.filter((run) => run.status === 'passed').length}`,
    `- Failed: ${runs.filter((run) => run.status === 'failed').length}`,
    `- Blocked: ${runs.filter((run) => run.status === 'blocked').length}`,
    skipped.length ? `- Not executed IDs: ${skipped.map((scenario) => scenario.id).join(', ')}` : undefined
  ].filter(Boolean).join('\n')
}

function renderPromptConsistency(report: SnifferReport): string {
  const consistency = report.promptConsistency
  if (!consistency?.enabled) return 'Prompt/output consistency check was not run.'
  if (consistency.runs.length === 0) return 'Prompt/output consistency check ran but captured no prompt runs.'
  return consistency.runs.map((run, index) => {
    const decision = consistency.decisions[index]
    return [
      `### ${index + 1}. ${run.prompt_id}`,
      '',
      `- Input prompt: ${run.input_prompt}`,
      `- Rendered feature request: ${run.response_feature_request ?? 'unavailable'}`,
      `- Consistency status: ${run.consistency_status}`,
      `- Critic confidence: ${decision?.confidence ?? 'unknown'}`,
      `- Stale concepts detected: ${run.stale_concepts_detected.join(', ') || 'none'}`,
      `- Semantic labels: ${run.semantic_labels.join(', ') || 'none'}`,
      `- Recommended paths: ${run.recommended_paths.slice(0, 10).join(', ') || 'none'}`,
      `- Handoff excerpt: ${run.handoff_text.replace(/\s+/g, ' ').trim().slice(0, 360) || 'unavailable'}`,
      run.screenshotPath ? `- Screenshot: ${run.screenshotPath}` : undefined,
      decision?.reasoning_summary ? `- Reason: ${decision.reasoning_summary}` : undefined
    ].filter(Boolean).join('\n')
  }).join('\n\n')
}

function renderIssueGroup(report: SnifferReport, types: Issue['type'][]): string {
  const issues = report.issues.filter((issue) => types.includes(issue.type))
  if (issues.length === 0) return 'None found.'
  return issues.map((issue) => `- ${issue.severity} ${issue.type}: ${issue.title} (${issue.issue_id ?? 'unknown'})`).join('\n')
}

function renderProductIntentModel(model?: ProductIntentModel): string {
  if (!model) return 'No product intent model generated.'
  return [
    `- App category: ${model.app_category}`,
    `- Confidence: ${model.confidence}`,
    `- Summary: ${model.product_summary}`,
    `- Core entities: ${model.core_entities.map((item) => item.name).join(', ') || 'unknown'}`,
    `- Primary user jobs: ${model.primary_user_jobs.map((item) => item.name).join(', ') || 'unknown'}`,
    `- Expected output review: ${model.expected_output_review_model.map((item) => item.name).join('; ') || 'unknown'}`,
    `- Assumptions: ${model.assumptions.join('; ') || 'none'}`,
    `- Hallucination risks: ${model.risks_of_hallucination.join('; ') || 'none'}`
  ].join('\n')
}

function renderProductIntentGaps(report: SnifferReport): string {
  const findings = report.productIntentFindings ?? []
  if (findings.length === 0) return 'No product-intent findings recorded.'
  const groups = [
    ['Navigation/context', 'navigation_context'],
    ['Plan run history', 'plan_run_history'],
    ['Output review/copy', 'output_review_copy'],
    ['Repo/workspace management', 'repo_workspace_management'],
    ['Semantic enrichment clarity', 'semantic_enrichment_clarity']
  ] as const
  return groups
    .map(([label, category]) => {
      const items = findings.filter((finding) => finding.category === category)
      if (items.length === 0) return ''
      return [
        `### ${label}`,
        '',
        ...items.map((finding) => [
          `- ${finding.should_report ? 'Issue' : 'Suggestion'} (${finding.confidence}): ${finding.title}`,
          `  - Expected: ${finding.expected_behavior}`,
          `  - Observed: ${finding.observed_behavior}`,
          `  - Support: source=${finding.source_support ? 'yes' : 'no'}, runtime=${finding.runtime_support ? 'yes' : 'no'}, user=${finding.user_support ? 'yes' : 'no'}, common_only=${finding.common_pattern_only ? 'yes' : 'no'}`,
          `  - Evidence: ${finding.evidence.join('; ') || 'none'}`
        ].join('\n'))
      ].join('\n')
    })
    .filter(Boolean)
    .join('\n\n') || 'No product-intent gaps found.'
}

function renderProductExperienceCritic(report: SnifferReport): string {
  const result = report.productExperience
  if (!result || result.mode === 'off') return 'Product Experience Critic was not run.'
  if (result.status === 'not_run') {
    return [
      `- Mode: ${result.mode}`,
      `- Status: not_run`,
      `- Reason: ${result.notRunReason ?? 'not specified'}`,
      `- Rubric version: ${result.rubricVersion ?? 'unknown'}`,
      `- Rule ids evaluated: ${(result.ruleIdsEvaluated ?? []).join(', ') || 'none'}`,
      `- Rule ids triggered: ${(result.ruleIdsTriggered ?? []).join(', ') || 'none'}`,
      `- Provider: ${result.providerName ?? 'none'}`,
      result.providerModel ? `- Model: ${result.providerModel}` : undefined,
      result.providerApiStyle ? `- API style: ${result.providerApiStyle}` : undefined,
      `- Screens with prepared context: ${result.screensReviewed}`
    ].filter(Boolean).join('\n')
  }
  const screenBlocks = result.decisions.map((decision) => {
    const findings = decision.findings.filter((finding) => finding.should_report)
    return [
      `### ${decision.screen_name}`,
      '',
      `- Nav label: ${decision.nav_label}`,
      `- Intended job: ${decision.workflow_intent}`,
      `- LLM used: ${decision.llm_used ? 'yes' : 'no'}`,
      `- Real LLM used: ${decision.real_llm_used ? 'yes' : 'no'}`,
      `- Provider: ${decision.llm_provider ?? 'none'}`,
      decision.llm_model ? `- Model: ${decision.llm_model}` : undefined,
      decision.llm_api_style ? `- API style: ${decision.llm_api_style}` : undefined,
      `- LLM request status: ${decision.llm_request_status}`,
      `- Vision used: ${decision.vision_used ? 'yes' : 'no'}`,
      `- Screenshot attached: ${decision.screenshot_attached ? 'yes' : 'no'}`,
      decision.vision_detail ? `- Vision detail: ${decision.vision_detail}` : undefined,
      decision.screenshot_mime_type ? `- Screenshot MIME type: ${decision.screenshot_mime_type}` : undefined,
      decision.screenshot_bytes !== undefined ? `- Screenshot bytes: ${decision.screenshot_bytes}` : undefined,
      decision.vision_not_used_reason ? `- Vision not used reason: ${decision.vision_not_used_reason}` : undefined,
      `- Context scope: ${decision.contextScope ?? 'unknown'}`,
      `- Screenshot source: ${decision.screenshotSource ?? 'unknown'}`,
      decision.outerReportGeneratedAt ? `- Outer report generated: ${decision.outerReportGeneratedAt}` : undefined,
      decision.displayedReportId ? `- Dashboard-visible report: ${decision.displayedReportId}` : undefined,
      decision.displayedReportGeneratedAt ? `- Dashboard-visible report generated: ${decision.displayedReportGeneratedAt}` : undefined,
      `- Scenario screenshot used: ${decision.scenario_screenshot_used ? 'yes' : 'no'}`,
      `- Context sufficiency: ${decision.context_sufficiency} (${decision.context_sufficiency_score})`,
      decision.context_warnings.length ? `- Context warnings: ${decision.context_warnings.join('; ')}` : '- Context warnings: none',
      decision.evidence_retrieval_summary ? `- Retrieved evidence: ${decision.evidence_retrieval_summary.retrievedDocumentCount} docs, ${decision.evidence_retrieval_summary.sourceFactCount} source facts, ${decision.evidence_retrieval_summary.runtimeFactCount} runtime facts, ${decision.evidence_retrieval_summary.contradictionCount} contradictions` : undefined,
      decision.critic_not_run_reason ? `- Critic not-run reason: ${decision.critic_not_run_reason}` : undefined,
      `- Classification: ${decision.overall.classification}`,
      `- Confidence: ${decision.overall.confidence}`,
      `- Summary: ${decision.overall.summary}`,
      findings.length
        ? [
          '- Findings:',
          ...findings.map((finding) => [
            `  - ${finding.severity} ${finding.type}: ${finding.title}`,
            `    - Rubric: ${finding.rubric_ids.join(', ') || 'none'}`,
            `    - Expected: ${finding.expected}`,
            `    - Observed: ${finding.observed}`,
            finding.reviewed_screen ? `    - Reviewed screen: ${finding.reviewed_screen}` : undefined,
            finding.page_intent ? `    - Page intent: ${finding.page_intent}` : undefined,
            finding.workflow_intent ? `    - Workflow intent: ${finding.workflow_intent}` : undefined,
            finding.scenario_step ? `    - Scenario step: ${finding.scenario_step}` : undefined,
            finding.evidence_scope ? `    - Evidence scope: ${finding.evidence_scope}` : undefined,
            finding.contradiction_check_result ? `    - Contradiction check: ${finding.contradiction_check_result}` : undefined,
            finding.dom_excerpt ? `    - DOM excerpt: ${finding.dom_excerpt}` : undefined,
            finding.positive_evidence_checked?.length ? `    - Positive evidence checked: ${finding.positive_evidence_checked.join('; ')}` : undefined,
            finding.negative_evidence_checked?.length ? `    - Negative evidence checked: ${finding.negative_evidence_checked.join('; ')}` : undefined,
            finding.suppression_reason ? `    - Suppression reason: ${finding.suppression_reason}` : undefined,
            `    - Evidence: ${finding.evidence.join('; ') || 'none'}`,
            finding.screenshotPath ? `    - Screenshot: ${finding.screenshotPath}` : undefined
          ].filter(Boolean).join('\n'))
        ].join('\n')
        : '- Findings: none'
    ].filter(Boolean).join('\n')
  }).join('\n\n')
  return [
    `- Mode: ${result.mode}`,
    `- Status: ${result.status}`,
    `- Rubric version: ${result.rubricVersion ?? 'unknown'}`,
    `- Rule ids evaluated: ${(result.ruleIdsEvaluated ?? []).join(', ') || 'none'}`,
    `- Rule ids triggered: ${(result.ruleIdsTriggered ?? []).join(', ') || 'none'}`,
    `- Rule ids passed: ${(result.ruleIdsPassed ?? []).join(', ') || 'none'}`,
    `- Provider: ${result.providerName ?? 'none'}`,
    result.providerModel ? `- Model: ${result.providerModel}` : undefined,
    result.providerApiStyle ? `- API style: ${result.providerApiStyle}` : undefined,
    `- Screens reviewed: ${result.screensReviewed}`,
    `- LLM-reviewed screens: ${result.llmScreensReviewed}`,
    `- Real-LLM-reviewed screens: ${result.realLlmScreensReviewed}`,
    `- Vision-reviewed screens: ${result.visionScreensReviewed}`,
    `- Vision-skipped screens: ${result.visionSkippedScreens ?? result.decisions.filter((decision) => !decision.vision_used).length}`,
    `- Vision skip reasons: ${renderVisionSkipReasons(result.visionSkipReasons)}`,
    `- Aligned: ${result.aligned}`,
    `- Minor gaps: ${result.minorGaps}`,
    `- Major gaps: ${result.majorGaps}`,
    `- Inconclusive: ${result.inconclusive}`,
    '',
    screenBlocks || 'No screen decisions recorded.'
  ].filter(Boolean).join('\n')
}

function renderVisionSkipReasons(reasons?: Record<string, number>): string {
  if (!reasons || Object.keys(reasons).length === 0) return 'none'
  return Object.entries(reasons).map(([reason, count]) => `${reason}=${count}`).join(', ')
}

function renderEvidenceProvenance(report: SnifferReport): string {
  const provenance = report.evidenceProvenance ?? report.productExperience?.evidenceProvenance
  if (!provenance) return 'No evidence provenance summary recorded.'
  const contexts = provenance.displayedReportContexts.slice(0, 16).map((context) => [
    `- ${context.screen}`,
    `  - Scope: ${context.contextScope ?? 'unset'}`,
    `  - Screenshot source: ${context.screenshotSource ?? 'unset'}`,
    context.navLabel ? `  - Nav label: ${context.navLabel}` : undefined,
    context.scenarioName ? `  - Scenario: ${context.scenarioName}` : undefined,
    context.screenshotPath ? `  - Screenshot: ${context.screenshotPath}` : undefined,
    context.displayedReportId ? `  - Displayed report: ${context.displayedReportId}` : undefined,
    context.displayedReportGeneratedAt ? `  - Displayed report generated: ${context.displayedReportGeneratedAt}` : undefined,
    context.displayedReportPath ? `  - Displayed report path: ${context.displayedReportPath}` : undefined,
    context.warnings.length ? `  - Warnings: ${context.warnings.join('; ')}` : undefined
  ].filter(Boolean).join('\n'))
  return [
    `- Outer audit report generated: ${provenance.outerAuditReportGeneratedAt ?? report.generatedAt}`,
    `- Context scopes: ${Object.entries(provenance.contextScopeCounts).map(([key, value]) => `${key}=${value}`).join(', ')}`,
    `- Screenshot sources: ${Object.entries(provenance.screenshotSourceCounts).map(([key, value]) => `${key}=${value}`).join(', ')}`,
    provenance.warnings.length ? `- Provenance warnings: ${provenance.warnings.join('; ')}` : '- Provenance warnings: none',
    '',
    'Reviewed screen provenance:',
    contexts.length ? contexts.join('\n') : '- none'
  ].join('\n')
}

function renderSuppressedRuntimeEvents(report: SnifferReport): string {
  const suppressed = report.suppressedRuntimeEvents ?? []
  if (suppressed.length === 0) {
    const hasRuntimeEvents = report.crawlGraph.consoleErrors.length + report.crawlGraph.networkFailures.length > 0
    return hasRuntimeEvents
      ? 'No suppressed runtime events recorded; observed runtime events are represented as findings or repair groups.'
      : 'No console or network runtime events were observed.'
  }
  return suppressed.map((event) => [
    `- ${event.type}: ${event.text}`,
    event.location ? `  - Location: ${event.location}` : undefined,
    event.url ? `  - URL: ${event.url}` : undefined,
    event.method ? `  - Method: ${event.method}` : undefined,
    event.failureText ? `  - Failure: ${event.failureText}` : undefined,
    `  - Provenance: ${event.provenance}`,
    `  - Reason suppressed: ${event.reason}`
  ].filter(Boolean).join('\n')).join('\n')
}

function renderEvidenceRetrievalSummaries(report: SnifferReport): string {
  const summaries = report.evidenceRetrievalSummaries ?? report.productExperience?.evidenceRetrievalSummaries ?? []
  if (summaries.length === 0) return 'No evidence retrieval summaries recorded.'
  return summaries.map((summary, index) => [
    `### Packet ${index + 1}: ${summary.context.screenName ?? summary.context.workflowName ?? summary.context.issueId ?? summary.context.query}`,
    '',
    `- Query: ${summary.context.query}`,
    summary.context.screenName ? `- Screen: ${summary.context.screenName}` : undefined,
    summary.context.workflowName ? `- Workflow: ${summary.context.workflowName}` : undefined,
    summary.context.issueId ? `- Issue: ${summary.context.issueId}` : undefined,
    `- Retrieved documents: ${summary.retrievedDocumentCount}`,
    `- Source facts: ${summary.sourceFactCount}`,
    `- Runtime facts: ${summary.runtimeFactCount}`,
    `- Contradictions: ${summary.contradictionCount}`,
    summary.averageScore !== undefined ? `- Average score: ${summary.averageScore}` : undefined,
    summary.sourceRuntimeRepairSplit ? `- Source/runtime/prior split: source ${summary.sourceRuntimeRepairSplit.source}, runtime ${summary.sourceRuntimeRepairSplit.runtime}, scenario ${summary.sourceRuntimeRepairSplit.scenario}, prior findings ${summary.sourceRuntimeRepairSplit.priorFindings}, fix packets ${summary.sourceRuntimeRepairSplit.priorFixPackets}, repairs ${summary.sourceRuntimeRepairSplit.priorRepairAttempts}` : undefined,
    '- Top evidence:',
    ...(summary.topDocuments.length
      ? summary.topDocuments.map((doc) => `  - ${doc.kind} ${doc.id}${doc.score !== undefined ? ` score=${doc.score}` : ''}: ${doc.text}${doc.whyRetrieved?.length ? ` (${doc.whyRetrieved.join('; ')})` : ''}`)
      : ['  - none'])
  ].filter(Boolean).join('\n')).join('\n\n')
}

function renderUxCriticSummary(report: SnifferReport): string {
  const findings = report.uxCriticFindings ?? []
  if (findings.length === 0) return 'No LLM UX critic findings recorded.'
  return findings.map((finding) => [
    `- ${finding.severity} ${finding.type}: ${finding.title}`,
    `  - Reported: ${finding.should_report ? 'yes' : 'no'}`,
    `  - Evidence: ${finding.evidence.join('; ')}`
  ].join('\n')).join('\n')
}

function renderCriticSummary(report: SnifferReport): string {
  if (report.criticDecisions.length === 0) return 'No critic decisions recorded.'
  return [
    `- Real issues: ${report.criticDecisions.filter((decision) => decision.should_report).length}`,
    `- Deferred findings: ${report.deferredFindings.length}`,
    `- Blocked checks: ${report.blockedChecks.length}`,
    `- Needs more crawling: ${report.needsMoreCrawling.length}`,
    '',
    ...report.criticDecisions.map((decision) => [
      `### ${decision.finding_id}`,
      '',
      `- Classification: ${decision.classification}`,
      `- Confidence: ${decision.confidence}`,
      `- Report: ${decision.should_report ? 'yes' : 'no'}`,
      `- Fix packet: ${decision.should_generate_fix_packet ? 'yes' : 'no'}`,
      decision.required_precondition ? `- Required precondition: ${decision.required_precondition}` : undefined,
      decision.next_safe_action ? `- Next safe action: ${decision.next_safe_action}` : undefined,
      `- Reason: ${decision.reasoning_summary}`
    ].filter(Boolean).join('\n'))
  ].join('\n')
}

function renderFixPacketSummary(report: SnifferReport): string {
  const actionable = report.issues.filter((issue) => issue.status !== 'fixed' && !['test_bug', 'inconclusive'].includes(issue.type))
  if (actionable.length === 0) return 'No actionable fix packets suggested.'
  return actionable.map((issue) => [
    `- ${issue.issue_id}: ${issue.title}`,
    `  - Prompt: ${issue.fix_prompt?.split('\n')[0] ?? issue.suggestedFixPrompt}`,
    `  - Verification: ${issue.verification_steps?.join(' ') ?? 'Run audit again.'}`,
    `  - Repair status: ${issue.status ?? 'open'}`
  ].join('\n')).join('\n')
}

function renderSurfaceSummary(report: SnifferReport): string {
  if (report.sourceGraph.uiSurfaces.length === 0) return 'No source UI surfaces discovered.'
  return report.runtimeSurfaceMatches.map((match) => {
    const evidence = match.matchingDomEvidence.length > 0 ? `; DOM evidence: ${match.matchingDomEvidence.join(', ')}` : ''
    return `- ${match.display_name} (${match.surface_type}) from ${match.file}: runtime ${match.seenInRuntime}${evidence}`
  }).join('\n')
}

function renderRuntimeDomDiscovery(report: SnifferReport): string {
  const snapshot = report.runtimeDomSnapshot
  if (!snapshot) return 'Runtime DOM discovery was not captured.'
  return [
    `- URL: ${snapshot.url}`,
    `- Title: ${snapshot.title || 'untitled'}`,
    `- Screenshot: ${snapshot.screenshotPath ?? 'none'}`,
    `- Headings: ${snapshot.headings.map(controlLabel).filter(Boolean).join(', ') || 'none'}`,
    `- Landmarks/regions: ${snapshot.landmarks.map(controlLabel).filter(Boolean).slice(0, 12).join(', ') || 'none'}`,
    `- Links: ${snapshot.links.length}`,
    `- Buttons: ${snapshot.buttons.length}`,
    `- Inputs/selects/textareas: ${snapshot.inputs.length + snapshot.selects.length + snapshot.textareas.length}`,
    `- Forms: ${snapshot.forms.length}`,
    `- Tables: ${snapshot.tables.length}`,
    `- Tabs/tablists: ${snapshot.tabs.length}/${snapshot.tablists.length}`,
    `- Dialogs/modals: ${snapshot.dialogs.length}`,
    `- Visible text blocks: ${snapshot.visibleTextBlocks.slice(0, 8).join(' | ') || 'none'}`
  ].join('\n')
}

function renderRuntimeAppModel(report: SnifferReport): string {
  const model = report.runtimeAppModel
  if (!model) return 'No runtime app model generated.'
  return [
    `- App name: ${model.app_name}`,
    `- Inferred app type: ${model.inferred_app_type}`,
    `- Confidence: ${model.confidence}`,
    `- Screens: ${model.screens.map((screen) => screen.name).join(', ') || 'unknown'}`,
    `- Entities: ${model.entities.join(', ') || 'unknown'}`,
    `- Runtime workflows: ${model.workflows.map((workflow) => `${workflow.name} (${workflow.confidence})`).join('; ') || 'none'}`,
    `- Route candidates: ${model.route_candidates.join(', ') || 'none'}`,
    `- Evidence: ${model.evidence.join('; ')}`
  ].join('\n')
}

function renderLocatorInventory(report: SnifferReport): string {
  const controls = report.runtimeAppModel?.locator_inventory ?? report.runtimeDomSnapshot?.controls ?? []
  if (controls.length === 0) return 'No runtime locator inventory captured.'
  return controls.slice(0, 40).map((control) => {
    const locator = control.locatorCandidates[0]
    return `- ${control.kind}: ${controlLabel(control)} -> ${locator?.playwright ?? 'no reliable locator'} (${locator?.reason ?? 'no locator'})`
  }).join('\n')
}

function renderLlmRuntimeIntent(report: SnifferReport): string {
  const intent = report.llmRuntimeIntent
  if (!intent) return 'No LLM runtime workflow inference was run.'
  return [
    `- App type: ${intent.app_type}`,
    `- Primary user jobs: ${intent.primary_user_jobs.join(', ') || 'none'}`,
    `- Notes: ${intent.notes.join('; ') || 'none'}`,
    '',
    ...intent.workflows.map((workflow) => [
      `### ${workflow.name}`,
      '',
      `- Confidence: ${workflow.confidence}`,
      `- Evidence: ${workflow.evidence.join('; ') || 'none'}`,
      `- Steps: ${workflow.steps.map((step) => `${step.action} ${step.target_name} via ${step.locator_strategy}:${step.locator_value}`).join('; ') || 'none'}`
    ].join('\n'))
  ].join('\n')
}

function renderRuntimeActionPlan(report: SnifferReport): string {
  const model = report.runtimeAppModel
  if (!model) return 'No runtime action plan generated.'
  const safe = model.actions.filter((action) => action.safe).slice(0, 20)
  const unsafe = model.actions.filter((action) => !action.safe).slice(0, 20)
  return [
    '### Safe next actions',
    '',
    safe.length ? safe.map((action) => `- ${action.action} ${action.target}: ${action.reason}; locator=${action.locator?.playwright ?? 'none'}`).join('\n') : 'None.',
    '',
    '### Unsafe/skipped actions',
    '',
    unsafe.length ? unsafe.map((action) => `- ${action.target}: ${action.reason}`).join('\n') : 'None.'
  ].join('\n')
}

function renderLocatorFailures(report: SnifferReport): string {
  const failures = report.locatorFailures ?? []
  if (failures.length === 0) return 'No locator failures or repairs recorded.'
  return failures.map((failure) => [
    `- Status: ${failure.status}`,
    `  - Reason: ${failure.reason}`,
    `  - Resolved locator: ${failure.locator?.playwright ?? 'none'}`,
    `  - Attempted: ${failure.attempted.map((candidate) => candidate.playwright).join('; ') || 'none'}`
  ].join('\n')).join('\n')
}

function controlLabel(control: { accessibleName?: string; visibleText?: string; labelText?: string; placeholder?: string; dataTestId?: string; href?: string; id?: string }): string {
  return (control.accessibleName ?? control.visibleText ?? control.labelText ?? control.placeholder ?? control.dataTestId ?? control.href ?? control.id ?? '').replace(/\s+/g, ' ').trim()
}

function renderWorkflowSummary(report: SnifferReport): string {
  if (report.sourceGraph.sourceWorkflows.length === 0) return 'No source workflows discovered.'
  return report.runtimeWorkflowVerifications.map((workflow) => [
    `### ${workflow.name}`,
    '',
    `- Runtime status: ${workflow.status}`,
    `- Source files: ${workflow.sourceFiles.join(', ') || 'unknown'}`,
    `- Attempted interactions: ${workflow.attemptedInteractions.join(', ') || 'none'}`,
    `- Found controls: ${workflow.controls.filter((control) => control.status === 'found').map((control) => control.label).join(', ') || 'none'}`,
    `- Missing controls: ${workflow.controls.filter((control) => control.status === 'missing').map((control) => control.label).join(', ') || 'none'}`
  ].join('\n')).join('\n\n')
}

function renderFixPrompts(issues: Issue[]): string {
  if (issues.length === 0) return '# Fix Prompts\n\nNo fix prompts generated.\n'
  return ['# Fix Prompts', '', ...issues.map((issue, index) => `## ${index + 1}. ${issue.title}\n\n${issue.suggestedFixPrompt}\n`)].join('\n')
}
