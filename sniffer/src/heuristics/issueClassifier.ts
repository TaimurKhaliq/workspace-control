import type { CrawlGraph, Issue, RuntimeWorkflowVerification, SourceGraph, TestRunResult } from '../types.js'
import { matchRuntimeSurfaces } from './runtimeSurfaceMatcher.js'

export function classifyRuntimeIssues(sourceGraph: SourceGraph, crawlGraph: CrawlGraph, workflowVerifications: RuntimeWorkflowVerification[] = []): Issue[] {
  const issues: Issue[] = []

  for (const error of dedupeBy(crawlGraph.consoleErrors, (item) => `${item.text}:${item.location ?? ''}`)) {
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
    .filter((match) => !['raw_json_panel', 'handoff_prompt_panel', 'plan_bundle_view', 'change_set_table', 'recipe_panel', 'graph_evidence_panel', 'validation_panel'].includes(match.surface_type))
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

function dedupeBy<T>(items: T[], keyFor: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = keyFor(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
