import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AppIntent, CandidateFinding, CrawlGraph, Issue, RuntimeWorkflowVerification, ScenarioRun, SnifferReport, SourceGraph, UxCriticFinding, WorkflowCriticDecision } from '../types.js'
import { writeJson } from './json.js'
import { matchRuntimeSurfaces } from '../heuristics/runtimeSurfaceMatcher.js'
import { enrichIssues } from '../repair/issueMetadata.js'
import { triageIssues } from '../heuristics/issueTriage.js'

export async function writeAuditReports(reportDir: string, input: {
  sourceGraph: SourceGraph
  crawlGraph: CrawlGraph
  appIntent: AppIntent
  runtimeWorkflowVerifications: RuntimeWorkflowVerification[]
  scenarioRuns?: ScenarioRun[]
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
  const report: SnifferReport = {
    ...input,
    rawFindings,
    issues: triagedIssues,
    scenarioRuns: input.scenarioRuns ?? [],
    criticDecisions: input.criticDecisions ?? [],
    uxCriticFindings: input.uxCriticFindings ?? [],
    deferredFindings: input.deferredFindings ?? [],
    blockedChecks: input.blockedChecks ?? [],
    needsMoreCrawling: input.needsMoreCrawling ?? [],
    runtimeSurfaceMatches: matchRuntimeSurfaces(input.sourceGraph, input.crawlGraph),
    generatedAt: new Date().toISOString()
  }
  await writeJson(path.join(reportDir, 'source_graph.json'), input.sourceGraph)
  await writeJson(path.join(reportDir, 'app_intent.json'), input.appIntent)
  await writeJson(path.join(reportDir, 'crawl_graph.json'), input.crawlGraph)
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
    '## Functional/API Issues',
    '',
    renderIssueGroup(report, ['functional_bug', 'api_error', 'console_error', 'network_error', 'broken_navigation', 'broken_interaction', 'broken_form', 'missing_form_control']),
    '',
    '## Workflow Scenario Issues',
    '',
    renderIssueGroup(report, ['workflow_confusion']),
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

function renderIssueGroup(report: SnifferReport, types: Issue['type'][]): string {
  const issues = report.issues.filter((issue) => types.includes(issue.type))
  if (issues.length === 0) return 'None found.'
  return issues.map((issue) => `- ${issue.severity} ${issue.type}: ${issue.title} (${issue.issue_id ?? 'unknown'})`).join('\n')
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
