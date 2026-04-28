import crypto from 'node:crypto'
import type { CrawlGraph, Issue, SourceGraph } from '../types.js'
import { evidenceHasGroupedEndpoint, normalizeEndpoint } from '../heuristics/endpointGrouping.js'

export function enrichIssues(issues: Issue[], sourceGraph: SourceGraph, crawlGraph: CrawlGraph): Issue[] {
  return issues.map((issue, index) => {
    const issueId = issue.issue_id || makeIssueId(issue, index)
    const suspectedFiles = issue.suspected_files?.length ? issue.suspected_files : inferSuspectedFiles(issue, sourceGraph)
    const fixPrompt = issue.fix_prompt || (['semantic_mismatch', 'stale_output'].includes(issue.type)
      ? buildFixPrompt(issue, suspectedFiles)
      : issue.suggestedFixPrompt || buildFixPrompt(issue, suspectedFiles))
    return {
      ...issue,
      issue_id: issueId,
      suspected_files: suspectedFiles,
      fix_prompt: fixPrompt,
      verification_steps: issue.verification_steps?.length ? issue.verification_steps : buildVerificationSteps(issue, crawlGraph),
      pass_conditions: issue.pass_conditions?.length ? issue.pass_conditions : buildPassConditions(issue),
      status: issue.status ?? 'open',
      attempts: issue.attempts ?? 0,
      suggestedFixPrompt: issue.suggestedFixPrompt || fixPrompt
    }
  })
}

export function inferSuspectedFiles(issue: Issue, sourceGraph: SourceGraph): string[] {
  const evidence = issue.evidence.join('\n')
  const files = new Set<string>()
  const normalizedPatterns = normalizedEvidencePatterns(issue)

  for (const surface of sourceGraph.uiSurfaces) {
    if (issue.description.includes(surface.display_name) || issue.evidence.some((item) => item.includes(surface.surface_type) || item.includes(surface.display_name))) {
      files.add(surface.file)
    }
  }

  for (const workflow of sourceGraph.sourceWorkflows) {
    if (issue.title.includes(workflow.name) || issue.description.includes(workflow.name)) {
      workflow.sourceFiles.forEach((file) => files.add(file))
    }
  }

  for (const apiCall of sourceGraph.apiCalls) {
    const endpointRegex = endpointToRegex(apiCall.endpoint)
    const normalizedApiPattern = normalizeSourceEndpointPattern(apiCall.endpoint)
    if (endpointRegex.test(evidence) || evidence.includes(apiCall.endpoint) || normalizedPatterns.includes(normalizedApiPattern)) {
      files.add(apiCall.sourceFile)
      if (apiCall.endpoint.includes('/api/repos/') && apiCall.endpoint.includes('learning-status')) {
        addLearningStatusSuspects(files, sourceGraph, issue)
      } else if (apiCall.endpoint.includes('/api/workspaces')) {
        files.add(apiCall.sourceFile)
        files.add('src/api.ts')
        files.add('src/App.tsx')
        files.add('../server/routes/workspaces.py')
      } else if (apiCall.endpoint.includes('/api/repos/validate-target')) {
        files.add(apiCall.sourceFile)
        files.add('src/api.ts')
        files.add('src/App.tsx')
        files.add('../server/routes/repos.py')
      }
    }
  }

  if (issue.type === 'console_error' || issue.type === 'api_error' || evidence.includes('/api/')) {
    files.add('src/api.ts')
  }
  if ([
    'missing_ui_surface',
    'missing_form_control',
    'broken_interaction',
    'workflow_confusion',
    'product_intent_gap',
    'usability_issue',
    'layout_issue',
    'accessibility_issue',
    'visual_clutter'
  ].includes(issue.type)) {
    files.add('src/App.tsx')
    sourceGraph.uiSurfaces.forEach((surface) => files.add(surface.file))
  }
  if (['semantic_mismatch', 'stale_output'].includes(issue.type)) {
    files.add('src/App.tsx')
    files.add('src/api.ts')
    files.add('../server/routes/plan_bundles.py')
    files.add('../server/planner.py')
    files.add('../app/services/semantic_enrichment.py')
  }

  return [...files].sort()
}

function addLearningStatusSuspects(files: Set<string>, sourceGraph: SourceGraph, issue: Issue): void {
  files.add('src/api.ts')
  const learningWorkflow = sourceGraph.sourceWorkflows.find((workflow) => workflow.name === 'Refresh learning')
  if (learningWorkflow) learningWorkflow.sourceFiles.forEach((file) => files.add(file))
  files.add('../server/routes/learning.py')
  files.add('../server/routes/repos.py')
  files.add('../server/app.py')
  if (issue.evidence.some((item) => /semantic/i.test(item))) {
    files.add('../server/routes/semantic.py')
  }
}

function makeIssueId(issue: Issue, index: number): string {
  const slug = issue.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48) || 'issue'
  const digest = crypto.createHash('sha1').update(`${issue.type}:${issue.title}:${issue.description}:${issue.evidence.join('|')}:${index}`).digest('hex').slice(0, 8)
  return `${slug}-${digest}`
}

function buildFixPrompt(issue: Issue, suspectedFiles: string[]): string {
  if (evidenceHasGroupedEndpoint(issue, '/api/repos/{targetId}/learning-status')) {
    return [
      'Fix grouped Sniffer issue: Learning status endpoint returns 500 for multiple repo targets.',
      '',
      `Title: ${issue.title}`,
      `Type: ${issue.type}`,
      `Severity: ${issue.severity}`,
      '',
      issue.description,
      '',
      `Evidence:\n${issue.evidence.map((item) => `- ${item}`).join('\n')}`,
      '',
      'Expected behavior:',
      '- learning-status should return controlled JSON for missing, stale, or error state, not 500.',
      '- unknown target may return controlled 404.',
      '- registered target with missing learning data should return status=missing, recipe_count=0.',
      '',
      `Suspected files:\n${suspectedFiles.map((file) => `- ${file}`).join('\n') || '- unknown'}`,
      '',
      'Constraints:',
      '- Do not delete workspaces, repos, baselines, reports, or user data.',
      '- Keep changes scoped to learning-status handling unless investigation proves another file is required.',
      '- Add or update focused tests for the endpoint behavior.'
    ].join('\n')
  }
  if (['semantic_mismatch', 'stale_output'].includes(issue.type)) {
    return [
      `Fix Sniffer prompt/output consistency issue: ${issue.title}.`,
      '',
      `Type: ${issue.type}`,
      `Severity: ${issue.severity}`,
      '',
      issue.description,
      '',
      `Evidence:\n${issue.evidence.map((item) => `- ${item}`).join('\n')}`,
      '',
      'Expected behavior:',
      '- Generated plan bundle content, handoff prompt, semantic labels, recommended changes, and raw JSON must match the current input prompt.',
      '- Prior prompt output must not leak into the active plan bundle view.',
      '- plan_bundle.feature_request must match the submitted prompt.',
      '',
      'Likely fix areas:',
      '- Ensure UI sends current feature_request, selected target id, and semantic flag for every request.',
      '- Prevent stale async responses from overwriting newer plan responses.',
      '- Key prompt-specific semantic/cache content by feature_request + target_id where applicable.',
      '- Ensure Handoff and Raw JSON tabs render the current active plan bundle only.',
      '- Ensure plan run switching updates all plan output tabs together.',
      '',
      `Suspected files:\n${suspectedFiles.map((file) => `- ${file}`).join('\n') || '- unknown'}`,
      '',
      'Constraints:',
      '- Do not change planner/proposal behavior unless the UI/API wiring bug requires it.',
      '- Do not delete workspaces, repos, baselines, reports, or user data.',
      '- Add or update focused tests for prompt/output consistency.'
    ].join('\n')
  }
  return [
    `Fix Sniffer issue ${issue.issue_id || issue.title}.`,
    '',
    `Title: ${issue.title}`,
    `Type: ${issue.type}`,
    `Severity: ${issue.severity}`,
    '',
    issue.description,
    '',
    `Evidence:\n${issue.evidence.map((item) => `- ${item}`).join('\n')}`,
    '',
    `Suspected files:\n${suspectedFiles.map((file) => `- ${file}`).join('\n') || '- unknown'}`,
    '',
    'Constraints:',
    '- Do not delete workspaces, repos, baselines, reports, or user data.',
    '- Keep changes scoped to the suspected files unless investigation proves another file is required.',
    '- Preserve existing public behavior unless fixing the reported issue requires changing it.',
    '- Add or update focused tests when the fix changes logic.'
  ].join('\n')
}

function normalizedEvidencePatterns(issue: Issue): string[] {
  const explicit = issue.evidence
    .filter((item) => item.startsWith('endpoint_pattern: '))
    .map((item) => item.replace(/^endpoint_pattern:\s+[A-Z]+\s+/, ''))
  const fromUrls = issue.evidence
    .filter((item) => item.startsWith('url: '))
    .map((item) => normalizeEndpoint({ url: item.slice('url: '.length) })?.pattern)
    .filter(Boolean) as string[]
  return [...new Set([...explicit, ...fromUrls])]
}

function normalizeSourceEndpointPattern(endpoint: string): string {
  return endpoint.replace(/\$\{[^}]+\}/g, '{targetId}')
}

function buildVerificationSteps(issue: Issue, crawlGraph: CrawlGraph): string[] {
  if (['semantic_mismatch', 'stale_output'].includes(issue.type)) {
    return [
      `Run sniffer audit against ${crawlGraph.startUrl} with --consistency-check.`,
      `Confirm issue ${issue.title} no longer appears with matching prompt/output evidence.`,
      'Confirm Prompt/Output Consistency shows both built-in prompts as consistent.',
      'Review latest_report.md and screenshots for regressions.'
    ]
  }
  return [
    `Run sniffer audit against ${crawlGraph.startUrl}.`,
    `Confirm issue ${issue.title} no longer appears with matching evidence.`,
    'Review latest_report.md and screenshots for regressions.'
  ]
}

function buildPassConditions(issue: Issue): string[] {
  return [
    `No open issue with type ${issue.type} and matching title/evidence remains.`,
    'Sniffer audit completes successfully.',
    'No new critical or high severity issues are introduced.'
  ]
}

function endpointToRegex(endpoint: string): RegExp {
  const escaped = endpoint
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\$\\\{[^}]+\\\}/g, '[^/]+')
  return new RegExp(escaped)
}
