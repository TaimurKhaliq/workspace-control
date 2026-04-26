import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AppIntent, CrawlGraph, Issue, SnifferReport, SourceGraph } from '../types.js'
import { writeJson } from './json.js'
import { matchRuntimeSurfaces } from '../heuristics/runtimeSurfaceMatcher.js'

export async function writeAuditReports(reportDir: string, input: {
  sourceGraph: SourceGraph
  crawlGraph: CrawlGraph
  appIntent: AppIntent
  issues: Issue[]
}): Promise<SnifferReport> {
  await mkdir(reportDir, { recursive: true })
  const report: SnifferReport = {
    ...input,
    runtimeSurfaceMatches: matchRuntimeSurfaces(input.sourceGraph, input.crawlGraph),
    generatedAt: new Date().toISOString()
  }
  await writeJson(path.join(reportDir, 'source_graph.json'), input.sourceGraph)
  await writeJson(path.join(reportDir, 'app_intent.json'), input.appIntent)
  await writeJson(path.join(reportDir, 'crawl_graph.json'), input.crawlGraph)
  await writeJson(path.join(reportDir, 'latest_report.json'), report)
  await writeFile(path.join(reportDir, 'latest_report.md'), renderMarkdown(report), 'utf8')
  await writeFile(path.join(reportDir, 'fix_prompts.md'), renderFixPrompts(input.issues), 'utf8')
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
      `- Description: ${issue.description}`,
      `- Evidence: ${issue.evidence.join('; ')}`,
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
    '## Issues',
    '',
    issues,
    ''
  ].join('\n')
}

function renderSurfaceSummary(report: SnifferReport): string {
  if (report.sourceGraph.uiSurfaces.length === 0) return 'No source UI surfaces discovered.'
  return report.runtimeSurfaceMatches.map((match) => {
    const evidence = match.matchingDomEvidence.length > 0 ? `; DOM evidence: ${match.matchingDomEvidence.join(', ')}` : ''
    return `- ${match.display_name} (${match.surface_type}) from ${match.file}: runtime ${match.seenInRuntime}${evidence}`
  }).join('\n')
}

function renderFixPrompts(issues: Issue[]): string {
  if (issues.length === 0) return '# Fix Prompts\n\nNo fix prompts generated.\n'
  return ['# Fix Prompts', '', ...issues.map((issue, index) => `## ${index + 1}. ${issue.title}\n\n${issue.suggestedFixPrompt}\n`)].join('\n')
}
