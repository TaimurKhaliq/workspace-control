import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AppIntent, CrawlGraph, Issue, RuntimeWorkflowVerification, SnifferReport, SourceGraph } from '../types.js'
import { writeJson } from './json.js'
import { matchRuntimeSurfaces } from '../heuristics/runtimeSurfaceMatcher.js'
import { enrichIssues } from '../repair/issueMetadata.js'

export async function writeAuditReports(reportDir: string, input: {
  sourceGraph: SourceGraph
  crawlGraph: CrawlGraph
  appIntent: AppIntent
  runtimeWorkflowVerifications: RuntimeWorkflowVerification[]
  issues: Issue[]
}): Promise<SnifferReport> {
  await mkdir(reportDir, { recursive: true })
  const enrichedIssues = enrichIssues(input.issues, input.sourceGraph, input.crawlGraph)
  const report: SnifferReport = {
    ...input,
    issues: enrichedIssues,
    runtimeSurfaceMatches: matchRuntimeSurfaces(input.sourceGraph, input.crawlGraph),
    generatedAt: new Date().toISOString()
  }
  await writeJson(path.join(reportDir, 'source_graph.json'), input.sourceGraph)
  await writeJson(path.join(reportDir, 'app_intent.json'), input.appIntent)
  await writeJson(path.join(reportDir, 'crawl_graph.json'), input.crawlGraph)
  await writeJson(path.join(reportDir, 'latest_report.json'), report)
  await writeFile(path.join(reportDir, 'latest_report.md'), renderMarkdown(report), 'utf8')
  await writeFile(path.join(reportDir, 'fix_prompts.md'), renderFixPrompts(enrichedIssues), 'utf8')
  return report
}

export function renderMarkdown(report: SnifferReport): string {
  const issues = report.issues.length === 0
    ? 'No likely real UI bugs found by deterministic checks.'
    : report.issues.map((issue, index) => [
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
    '',
    '## Source UI Surfaces',
    '',
    renderSurfaceSummary(report),
    '',
    '## Source Workflows',
    '',
    renderWorkflowSummary(report),
    '',
    '## Actionable Fix Packets',
    '',
    renderFixPacketSummary(report),
    '',
    '## Issues',
    '',
    issues,
    ''
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
