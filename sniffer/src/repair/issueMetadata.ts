import crypto from 'node:crypto'
import type { CrawlGraph, Issue, SourceGraph } from '../types.js'

export function enrichIssues(issues: Issue[], sourceGraph: SourceGraph, crawlGraph: CrawlGraph): Issue[] {
  return issues.map((issue, index) => {
    const issueId = issue.issue_id || makeIssueId(issue, index)
    const suspectedFiles = issue.suspected_files?.length ? issue.suspected_files : inferSuspectedFiles(issue, sourceGraph)
    const fixPrompt = issue.fix_prompt || issue.suggestedFixPrompt || buildFixPrompt(issue, suspectedFiles)
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
    if (endpointRegex.test(evidence) || evidence.includes(apiCall.endpoint)) {
      files.add(apiCall.sourceFile)
      if (apiCall.endpoint.includes('/api/repos/') && apiCall.endpoint.includes('learning-status')) {
        files.add('../server/routes/semantic.py')
        files.add('../server/app.py')
        files.add('src/api.ts')
        files.add('src/App.tsx')
      } else if (apiCall.endpoint.includes('/api/repos/validate-target') || apiCall.endpoint.includes('/api/workspaces')) {
        files.add('src/api.ts')
        files.add('src/App.tsx')
      }
    }
  }

  if (issue.type === 'console_error' || issue.type === 'api_error' || evidence.includes('/api/')) {
    files.add('src/api.ts')
  }
  if (issue.type === 'missing_ui_surface' || issue.type === 'missing_form_control' || issue.type === 'broken_interaction') {
    files.add('src/App.tsx')
  }

  return [...files].sort()
}

function makeIssueId(issue: Issue, index: number): string {
  const slug = issue.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48) || 'issue'
  const digest = crypto.createHash('sha1').update(`${issue.type}:${issue.title}:${issue.description}:${issue.evidence.join('|')}:${index}`).digest('hex').slice(0, 8)
  return `${slug}-${digest}`
}

function buildFixPrompt(issue: Issue, suspectedFiles: string[]): string {
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

function buildVerificationSteps(issue: Issue, crawlGraph: CrawlGraph): string[] {
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
