import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AppIntent, CandidateFinding, CrawlCoverage, CrawlGraph, CrawlState, Issue, ProductIntentFinding, ProductIntentModel, PromptConsistencyResult, RuntimeWorkflowVerification, ScenarioRun, SnifferReport, SourceGraph, UxCriticFinding, WorkflowCriticDecision } from '../types.js'
import { writeJson } from './json.js'
import { matchRuntimeSurfaces } from '../heuristics/runtimeSurfaceMatcher.js'
import { enrichIssues } from '../repair/issueMetadata.js'
import { triageIssues } from '../heuristics/issueTriage.js'

export async function writeAuditReports(reportDir: string, input: {
  sourceGraph: SourceGraph
  crawlGraph: CrawlGraph
  appIntent: AppIntent
  productIntent?: ProductIntentModel
  productIntentFindings?: ProductIntentFinding[]
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
  const rawFindings = enrichIssues(input.rawFindings ?? input.issues, input.sourceGraph, input.crawlGraph)
  const triagedIssues = input.rawFindings
    ? enrichIssues(input.issues, input.sourceGraph, input.crawlGraph)
    : enrichIssues(triageIssues({
      rawFindings,
      sourceGraph: input.sourceGraph,
      workflowVerifications: input.runtimeWorkflowVerifications
    }), input.sourceGraph, input.crawlGraph)
  const crawlGraph = enrichCrawlGraphForReport(input.crawlGraph, input.sourceGraph, triagedIssues, input.runtimeWorkflowVerifications, input.scenarioRuns ?? [])
  const report: SnifferReport = {
    ...input,
    crawlGraph,
    rawFindings,
    issues: triagedIssues,
    scenarioRuns: input.scenarioRuns ?? [],
    criticDecisions: input.criticDecisions ?? [],
    uxCriticFindings: input.uxCriticFindings ?? [],
    deferredFindings: input.deferredFindings ?? [],
    blockedChecks: input.blockedChecks ?? [],
    needsMoreCrawling: input.needsMoreCrawling ?? [],
    runtimeSurfaceMatches: matchRuntimeSurfaces(input.sourceGraph, crawlGraph),
    generatedAt: new Date().toISOString()
  }
  await writeJson(path.join(reportDir, 'source_graph.json'), input.sourceGraph)
  await writeJson(path.join(reportDir, 'app_intent.json'), input.appIntent)
  if (input.productIntent) await writeJson(path.join(reportDir, 'product_intent.json'), input.productIntent)
  await writeJson(path.join(reportDir, 'crawl_graph.json'), crawlGraph)
  await writeJson(path.join(reportDir, 'latest_report.json'), report)
  await writeFile(path.join(reportDir, 'latest_report.md'), renderMarkdown(report), 'utf8')
  await writeFile(path.join(reportDir, 'fix_prompts.md'), renderFixPrompts(triagedIssues), 'utf8')
  return report
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
    '## Runtime Summary',
    '',
    `- Start URL: ${report.crawlGraph.startUrl}`,
    `- Final URL: ${report.crawlGraph.finalUrl}`,
    `- States captured: ${report.crawlGraph.states.length}`,
    `- Actions attempted: ${report.crawlGraph.actions.length}`,
    `- Console errors: ${report.crawlGraph.consoleErrors.length}`,
    `- Network failures: ${report.crawlGraph.networkFailures.length}`,
    `- Raw findings: ${rawFindings.length}`,
    `- Triaged issues / repair groups: ${report.issues.length}`,
    '',
    '## Source UI Surfaces',
    '',
    renderSurfaceSummary(report),
    '',
    '## Source Workflows',
    '',
    renderWorkflowSummary(report),
    '',
    '## Scenario Runs',
    '',
    renderScenarioSummary(report),
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
