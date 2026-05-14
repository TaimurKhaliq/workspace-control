import type { CrawlGraph, Issue, RuntimeWorkflowIssue, RuntimeWorkflowVerification, ScenarioRun, SourceGraph, TestRunResult } from '../types.js'
import { matchRuntimeSurfaces } from './runtimeSurfaceMatcher.js'
import { groupedEndpointIssues } from './endpointGrouping.js'
import { genericWorkflowLocatorLabels } from '../runtime/workflowVerifier.js'

export function classifyRuntimeIssues(sourceGraph: SourceGraph, crawlGraph: CrawlGraph, workflowVerifications: RuntimeWorkflowVerification[] = [], scenarioRuns: ScenarioRun[] = []): Issue[] {
  const issues: Issue[] = []

  const groupedApiIssues = groupedEndpointIssues({
    consoleErrors: dedupeBy(crawlGraph.consoleErrors, (item) => `${item.text}:${item.location ?? ''}`),
    networkFailures: dedupeBy(crawlGraph.networkFailures, (item) => `${item.method}:${item.url}:${item.failureText}`),
    sourceGraph,
    screenshotPath: crawlGraph.screenshots.at(-1),
    finalUrl: crawlGraph.finalUrl
  })
  issues.push(...groupedApiIssues)
  const groupedEvidenceUrls = new Set(groupedApiIssues.flatMap((issue) =>
    issue.evidence.filter((item) => item.startsWith('url: ')).map((item) => item.slice('url: '.length))
  ))

  for (const error of dedupeBy(crawlGraph.consoleErrors, (item) => `${item.text}:${item.location ?? ''}`)) {
    if (error.location && groupedEvidenceUrls.has(error.location)) continue
    if (isCrawlerInstrumentationEvent(error.text)) continue
    issues.push({
      severity: 'medium',
      type: 'console_error',
      title: 'Console error during crawl',
      description: error.text,
      evidence: [error.location ?? crawlGraph.finalUrl],
      screenshotPath: crawlGraph.screenshots.at(-1),
      suggestedFixPrompt: `Investigate and fix this browser console error: ${error.text}`
    })
  }

  for (const failure of dedupeBy(crawlGraph.networkFailures, (item) => `${item.method}:${item.url}:${item.failureText}`)) {
    if (groupedEvidenceUrls.has(failure.url)) continue
    issues.push({
      severity: failure.failureText.includes('5') || failure.url.includes('/api/') ? 'high' : 'medium',
      type: failure.url.includes('/api/') ? 'api_error' : 'network_error',
      title: 'Network request failed during crawl',
      description: `${failure.method} ${failure.url} failed: ${failure.failureText}`,
      evidence: [failure.url, failure.failureText],
      screenshotPath: crawlGraph.screenshots.at(-1),
      suggestedFixPrompt: `Find why ${failure.method} ${failure.url} fails during UI load and fix the user-facing behavior.`
    })
  }

  for (const observation of dedupeBy(crawlGraph.runtimeObservations ?? [], (item) => `${item.kind}:${item.actionId ?? ''}:${item.text}`)) {
    if (observation.kind === 'mismatch_detected') {
      issues.push({
        severity: 'medium',
        type: 'semantic_mismatch',
        title: 'Runtime status text contradicts live output',
        description: 'During live observation, Sniffer saw success/status text that conflicted with error or failure output.',
        evidence: [observation.text, observation.actionId ? `action: ${observation.actionId}` : `state: ${observation.stateId}`],
        screenshotPath: observation.screenshotPath ?? crawlGraph.screenshots.at(-1),
        suggestedFixPrompt: 'Make runtime status, logs, and visible result messaging agree after the action completes.'
      })
    }
    if (observation.kind === 'spinner_started' && !hasMatchingSpinnerStop(crawlGraph.runtimeObservations ?? [], observation.actionId)) {
      issues.push({
        severity: 'medium',
        type: 'loading_state_stuck',
        title: 'Loading indicator remained visible during live observation',
        description: 'A loading/progress indicator appeared during a live action and did not visibly resolve before the observation window ended.',
        evidence: [observation.text, observation.actionId ? `action: ${observation.actionId}` : `state: ${observation.stateId}`],
        screenshotPath: observation.screenshotPath ?? crawlGraph.screenshots.at(-1),
        suggestedFixPrompt: 'Ensure long-running actions transition from loading to success, error, or empty state with clear user guidance.'
      })
    }
  }

  const visitedUrls = new Set(crawlGraph.states.map((state) => new URL(state.url).pathname))
  const missingRoutes = sourceGraph.routes.filter((route) => route.path !== '/' && route.source === 'filesystem' && !visitedUrls.has(route.path))
  if (sourceGraph.routes.length > 0 && crawlGraph.states.length > 0 && missingRoutes.length > 0) {
    issues.push({
      severity: 'low',
      type: 'missing_ui_surface',
      title: 'Some discovered routes were not reached by safe crawl',
      description: `The crawl did not reach ${missingRoutes.length} source-discovered route(s). This can mean missing navigation or simply an unreachable authenticated/deep route.`,
      evidence: missingRoutes.slice(0, 10).map((route) => `${route.path} from ${route.file}`),
      screenshotPath: crawlGraph.screenshots.at(-1),
      suggestedFixPrompt: 'Review whether these source-discovered routes should be reachable through visible navigation, and add/fix links where appropriate.'
    })
  }

  if (crawlGraph.states.length === 0) {
    issues.push({
      severity: 'high',
      type: 'functional_bug',
      title: 'No runtime states were captured',
      description: 'Playwright reached the app URL but did not capture any usable UI state.',
      evidence: [crawlGraph.startUrl],
      suggestedFixPrompt: 'Debug initial page load so Playwright can render and inspect the UI.'
    })
  }

  const missingSurfaces = matchRuntimeSurfaces(sourceGraph, crawlGraph)
    .filter((match) => match.seenInRuntime === 'no' || match.seenInRuntime === 'partial')
    .filter((match) => match.seenInRuntime === 'no' || (match.missingControls?.length ?? 0) > 0)
    .filter((match) => !['copy_action', 'raw_json_panel', 'handoff_prompt_panel', 'plan_bundle_view', 'change_set_table', 'recipe_panel', 'graph_evidence_panel', 'validation_panel'].includes(match.surface_type))
  if (missingSurfaces.length > 0) {
    issues.push({
      severity: 'low',
      type: 'missing_ui_surface',
      title: 'Source-discovered UI surfaces were not observed at runtime',
      description: `${missingSurfaces.length} expected source surface(s) did not match visible runtime DOM evidence in the safe crawl.`,
      evidence: missingSurfaces.slice(0, 10).map((surface) => `${surface.display_name} (${surface.surface_type}) from ${surface.file}`),
      screenshotPath: crawlGraph.screenshots.at(-1),
      suggestedFixPrompt: 'Compare source-discovered surfaces against the loaded UI and fix missing navigation, conditional rendering, or crawl setup if these surfaces should be visible.'
    })
  }

  for (const verification of workflowVerifications) {
    for (const workflowIssue of verification.issues) {
      if (isWorkflowIssueContradictedByRuntimeEvidence(verification, workflowIssue, crawlGraph, scenarioRuns)) continue
      issues.push({
        severity: workflowIssue.type === 'missing_form_control' ? 'medium' : 'low',
        type: workflowIssue.type,
        title: workflowIssue.title,
        description: workflowIssue.description,
        evidence: workflowIssue.evidence,
        screenshotPath: crawlGraph.screenshots.at(-1),
        suggestedFixPrompt: `Update the UI so the "${verification.name}" workflow exposes the expected control, or adjust source intent if this workflow is intentionally unavailable.`
      })
    }
    if (verification.status === 'missing') {
      if (workflowSupportedByRuntimeEvidence(verification, crawlGraph, scenarioRuns)) continue
      issues.push({
        severity: 'medium',
        type: 'broken_interaction',
        title: `Runtime workflow missing: ${verification.name}`,
        description: `None of the expected runtime controls for source-discovered workflow "${verification.name}" were found.`,
        evidence: verification.controls.map((control) => control.label),
        screenshotPath: crawlGraph.screenshots.at(-1),
        suggestedFixPrompt: `Make the "${verification.name}" workflow reachable in the running app, or gate it behind a clearly visible prerequisite state.`
      })
    }
  }

  return issues
}

function hasMatchingSpinnerStop(observations: NonNullable<CrawlGraph['runtimeObservations']>, actionId?: string): boolean {
  return observations.some((item) => item.kind === 'spinner_stopped' && item.actionId === actionId)
}

function isWorkflowIssueContradictedByRuntimeEvidence(
  verification: RuntimeWorkflowVerification,
  issue: RuntimeWorkflowIssue,
  crawlGraph: CrawlGraph,
  scenarioRuns: ScenarioRun[]
): boolean {
  const labels = evidenceLabelsForWorkflow(verification, issue.evidence)
  return hasRuntimeEvidence(labels, crawlGraph, scenarioRuns)
}

function workflowSupportedByRuntimeEvidence(
  verification: RuntimeWorkflowVerification,
  crawlGraph: CrawlGraph,
  scenarioRuns: ScenarioRun[]
): boolean {
  const labels = evidenceLabelsForWorkflow(verification)
  return hasRuntimeEvidence(labels, crawlGraph, scenarioRuns)
}

function evidenceLabelsForWorkflow(verification: RuntimeWorkflowVerification, extraEvidence: string[] = []): string[] {
  const workflow = verification.name
  const controls = verification.controls.flatMap((control) => [
    control.label,
    ...control.matchedEvidence,
    control.missingReason
  ].filter(Boolean) as string[])
  const attempted = verification.attemptedInteractions
  return unique([
    workflow,
    ...workflowAliases(workflow),
    ...genericWorkflowLocatorLabels(workflow),
    ...controls.flatMap((label) => genericWorkflowLocatorLabels(label)),
    ...attempted.flatMap((label) => genericWorkflowLocatorLabels(label)),
    ...extraEvidence.flatMap((label) => genericWorkflowLocatorLabels(label))
  ]).filter((label) => meaningfulLabel(label))
}

function workflowAliases(workflowName: string): string[] {
  const text = workflowName.toLowerCase()
  return [
    /run sniffer audit|sniffer audit/.test(text) ? 'Run Audit' : undefined,
    /run sniffer audit|sniffer audit/.test(text) ? 'Audit a running UI' : undefined,
    /run sniffer audit|sniffer audit/.test(text) ? 'Repo path' : undefined,
    /run sniffer audit|sniffer audit/.test(text) ? 'App URL' : undefined,
    /inspect fix packets|fix packets/.test(text) ? 'Fix Packets' : undefined,
    /inspect fix packets|fix packets/.test(text) ? 'Generate Fix Packets' : undefined,
    /use repair workbench|repair workbench/.test(text) ? 'Repair Workbench' : undefined,
    /review agent model|agent model|evidence model/.test(text) ? 'Agent Model' : undefined,
    /inspect raw report payload|raw report payload|raw json/.test(text) ? 'Raw JSON' : undefined,
    /inspect raw report payload|raw report payload|raw json/.test(text) ? 'Copy JSON' : undefined,
    /inspect report sections|report sections/.test(text) ? 'Run Timeline' : undefined,
    /inspect report sections|report sections/.test(text) ? 'Scenarios' : undefined,
    /inspect report sections|report sections/.test(text) ? 'Crawl Path' : undefined,
    /inspect report sections|report sections/.test(text) ? 'Workflow Evidence' : undefined,
    /inspect report sections|report sections/.test(text) ? 'Issues' : undefined
  ].filter(Boolean) as string[]
}

function hasRuntimeEvidence(labels: string[], crawlGraph: CrawlGraph, scenarioRuns: ScenarioRun[]): boolean {
  const normalizedLabels = unique(labels.map(normalizeEvidenceText).filter((label) => label.length >= 3))
  if (normalizedLabels.length === 0) return false
  const runtimeTexts = runtimeEvidenceTexts(crawlGraph, scenarioRuns)
  return normalizedLabels.some((label) => runtimeTexts.some((text) => evidenceTextMatches(text, label)))
}

function runtimeEvidenceTexts(crawlGraph: CrawlGraph, scenarioRuns: ScenarioRun[]): string[] {
  const stateTexts = crawlGraph.states.flatMap((state) => [
    state.inferredScreenName,
    state.inferredPageType,
    state.hashRoute,
    ...(state.primaryVisibleText ?? []),
    ...state.visible.flatMap((control) => [control.text, control.name, control.href, control.selectorHint])
  ].filter(Boolean) as string[])
  const actionTexts = crawlGraph.actions.flatMap((action) => [
    action.label,
    action.locatorUsed,
    action.target,
    action.reason,
    action.safeReason
  ].filter(Boolean) as string[])
  const observationTexts = (crawlGraph.runtimeObservations ?? crawlGraph.runtimeGraph?.observations ?? [])
    .flatMap((observation) => [observation.text, observation.selector, observation.context].filter(Boolean) as string[])
  const scenarioTexts = scenarioRuns.flatMap((run) => [
    run.name,
    run.slug,
    run.status === 'passed' ? `${run.name} passed` : undefined,
    ...run.stepsAttempted,
    ...run.assertions.flatMap((assertion) => [
      assertion.label,
      assertion.status === 'passed' ? `${assertion.label} passed` : undefined,
      ...assertion.evidence
    ]),
    ...(run.stepTraces ?? []).flatMap((trace) => [
      trace.scenarioName,
      trace.scenarioSlug,
      trace.stepName,
      trace.actionLabel,
      trace.screenName,
      trace.navLabel,
      trace.activeNavState,
      ...trace.visibleControls,
      ...trace.domSummary,
      ...trace.headings
    ])
  ].filter(Boolean) as string[])
  return unique([...stateTexts, ...actionTexts, ...observationTexts, ...scenarioTexts].map(normalizeEvidenceText).filter(Boolean))
}

function evidenceTextMatches(text: string, label: string): boolean {
  if (!text || !label) return false
  if (text === label) return true
  if (text.includes(label) || label.includes(text)) return Math.min(text.length, label.length) >= 5
  const labelTokens = tokenSet(label)
  if (labelTokens.size === 0) return false
  const textTokens = tokenSet(text)
  const matched = [...labelTokens].filter((token) => textTokens.has(token)).length
  return matched / labelTokens.size >= 0.75
}

function tokenSet(value: string): Set<string> {
  return new Set(value.split(/\s+/g).filter((token) => token.length >= 3 && !/^(the|and|for|with|from|open|view|use|inspect|review|screen|control|button|page)$/.test(token)))
}

function meaningfulLabel(value: string): boolean {
  const normalized = normalizeEvidenceText(value)
  return normalized.length >= 3 && !/^(no matching accessible locator or visible text found|missing in fixture|source discovered workflow)$/.test(normalized)
}

function normalizeEvidenceText(value: string): string {
  return value.toLowerCase().replace(/[_/]+/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function isCrawlerInstrumentationEvent(text: string): boolean {
  return /^Crawler state capture failed:|^Crawler action failed after page crash:/i.test(text)
}

function dedupeBy<T>(items: T[], keyFor: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = keyFor(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

export function classifyTestFailures(result: TestRunResult): Issue[] {
  return result.failures.map((failure) => ({
    severity: failure.classification === 'app_bug' ? 'high' : 'low',
    type: failure.classification === 'test_bug' ? 'test_bug' : failure.classification === 'app_bug' ? 'functional_bug' : 'inconclusive',
    title: `Generated test failure: ${failure.testTitle}`,
    description: failure.reason,
    evidence: [failure.classification],
    screenshotPath: failure.screenshotPath,
    tracePath: failure.tracePath,
    suggestedFixPrompt: failure.classification === 'test_bug'
      ? 'Repair the generated Playwright test selector or step ordering while preserving the intended user workflow.'
      : 'Use the trace and screenshot to fix the app behavior that prevents this workflow from passing.'
  }))
}
