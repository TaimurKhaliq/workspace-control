import type { Issue, NetworkFailure, RuntimeMessage, SourceGraph } from '../types.js'

export interface NormalizedEndpoint {
  method: string
  pattern: string
  url: string
  targetId?: string
  artifactPath?: string
}

interface EndpointFailureGroup {
  key: string
  method: string
  pattern: string
  urls: string[]
  targetIds: string[]
  artifactPaths: string[]
  messages: string[]
  statusCodes: number[]
  responseBodies: string[]
}

export function normalizeEndpoint(input: { url: string; method?: string }): NormalizedEndpoint | undefined {
  let pathname: string
  try {
    pathname = new URL(input.url, 'http://sniffer.local').pathname
  } catch {
    return undefined
  }

  const learningStatus = pathname.match(/^\/api\/repos\/([^/]+)\/learning-status$/)
  if (learningStatus) {
    return {
      method: input.method ?? 'GET',
      pattern: '/api/repos/{targetId}/learning-status',
      url: input.url,
      targetId: decodeURIComponent(learningStatus[1])
    }
  }

  const repoAction = pathname.match(/^\/api\/repos\/([^/]+)\/([^/]+)$/)
  if (repoAction) {
    return {
      method: input.method ?? 'GET',
      pattern: `/api/repos/{targetId}/${repoAction[2]}`,
      url: input.url,
      targetId: decodeURIComponent(repoAction[1])
    }
  }

  const reportArtifact = pathname.match(/^\/api\/reports\/latest\/artifacts\/(.+)$/)
  if (reportArtifact) {
    return {
      method: input.method ?? 'GET',
      pattern: '/api/reports/latest/artifacts/{artifactPath}',
      url: input.url,
      artifactPath: safeDecode(reportArtifact[1])
    }
  }

  return pathname.includes('/api/') ? { method: input.method ?? 'GET', pattern: pathname, url: input.url } : undefined
}

export function groupedEndpointIssues(input: {
  consoleErrors: RuntimeMessage[]
  networkFailures: NetworkFailure[]
  sourceGraph: SourceGraph
  screenshotPath?: string
  finalUrl: string
}): Issue[] {
  const groups = new Map<string, EndpointFailureGroup>()

  for (const error of input.consoleErrors) {
    const normalized = error.location ? normalizeEndpoint({ url: error.location, method: 'GET' }) : undefined
    if (!normalized) continue
    addToGroup(groups, normalized, error.text)
  }

  for (const failure of input.networkFailures) {
    const normalized = normalizeEndpoint({ url: failure.url, method: failure.method })
    if (!normalized) continue
    addToGroup(groups, normalized, failure.failureText, failure.statusCode, failure.responseBody)
  }

  return [...groups.values()].map((group) => {
    const isLearningStatus = group.pattern === '/api/repos/{targetId}/learning-status'
    const isReportArtifact = group.pattern === '/api/reports/latest/artifacts/{artifactPath}'
    const title = isLearningStatus && group.urls.length > 1
      ? 'Learning status endpoint returns 500 for multiple repo targets'
      : isReportArtifact
        ? 'Screenshot artifact route returns 404 for captured report screenshots'
      : `${group.method} ${group.pattern} failed during crawl`
    const expected = isLearningStatus
      ? [
        'Expected behavior:',
        '- learning-status should return controlled JSON for missing, stale, or error state, not 500.',
        '- unknown target may return controlled 404.',
        '- registered target with missing learning data should return status=missing, recipe_count=0.'
      ].join('\n')
      : isReportArtifact
        ? [
          'Expected behavior:',
          '- captured report screenshots should resolve through the artifact endpoint.',
          '- artifact paths should be resolved against the report directory that produced the loaded report.',
          '- missing screenshots should render a friendly placeholder without repeated browser errors.'
        ].join('\n')
      : 'Expected behavior: API endpoints should return controlled responses that the UI can handle.'

    return {
      severity: group.messages.some((message) => /500|internal server error/i.test(message)) || group.statusCodes.some((code) => code >= 500) ? 'high' : 'medium',
      type: 'api_error',
      title,
      description: [
        `${group.method} ${group.pattern} failed ${group.urls.length} time(s) during crawl.`,
        expected
      ].join('\n'),
      evidence: [
        `endpoint_pattern: ${group.method} ${group.pattern}`,
        `count: ${group.urls.length}`,
        `method: ${group.method}`,
        ...group.statusCodes.map((code) => `status_code: ${code}`),
        ...group.targetIds.map((id) => `target_id: ${id}`),
        ...group.artifactPaths.map((artifactPath) => `artifact_path: ${artifactPath}`),
        ...group.urls.map((url) => `url: ${url}`),
        ...[...new Set(group.messages)].map((message) => `runtime_error: ${message}`),
        ...[...new Set(group.responseBodies)].filter(Boolean).map((body) => `response_body: ${body}`)
      ],
      screenshotPath: input.screenshotPath,
      suggestedFixPrompt: [
        `Fix ${group.method} ${group.pattern}.`,
        expected,
        '',
        'Affected URLs:',
        ...group.urls.map((url) => `- ${url}`)
      ].join('\n')
    } satisfies Issue
  })
}

export function evidenceHasGroupedEndpoint(issue: Issue, pattern: string): boolean {
  return issue.evidence.some((item) => item.includes(pattern))
}

function addToGroup(groups: Map<string, EndpointFailureGroup>, endpoint: NormalizedEndpoint, message: string, statusCode?: number, responseBody?: string): void {
  const key = `${endpoint.method} ${endpoint.pattern}`
  const group = groups.get(key) ?? {
    key,
    method: endpoint.method,
    pattern: endpoint.pattern,
    urls: [],
    targetIds: [],
    artifactPaths: [],
    messages: [],
    statusCodes: [],
    responseBodies: []
  }
  if (!group.urls.includes(endpoint.url)) group.urls.push(endpoint.url)
  if (endpoint.targetId && !group.targetIds.includes(endpoint.targetId)) group.targetIds.push(endpoint.targetId)
  if (endpoint.artifactPath && !group.artifactPaths.includes(endpoint.artifactPath)) group.artifactPaths.push(endpoint.artifactPath)
  group.messages.push(message)
  if (statusCode && !group.statusCodes.includes(statusCode)) group.statusCodes.push(statusCode)
  if (responseBody && !group.responseBodies.includes(responseBody)) group.responseBodies.push(responseBody)
  groups.set(key, group)
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
