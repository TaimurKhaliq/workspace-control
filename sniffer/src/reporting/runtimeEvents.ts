import type { CrawlGraph, Issue, NetworkFailure, RuntimeMessage, SuppressedRuntimeEvent } from '../types.js'

export interface RuntimeEventIntegrity {
  suppressedRuntimeEvents: SuppressedRuntimeEvent[]
  unexplainedIssues: Issue[]
}

export function buildRuntimeEventIntegrity(crawlGraph: CrawlGraph, reportedIssues: Issue[] = []): RuntimeEventIntegrity {
  const suppressedRuntimeEvents: SuppressedRuntimeEvent[] = []
  const unexplainedIssues: Issue[] = []

  for (const error of dedupeConsoleErrors(crawlGraph.consoleErrors)) {
    if (runtimeErrorReported(error, reportedIssues)) continue
    const suppression = benignConsoleSuppression(error)
    if (suppression) {
      suppressedRuntimeEvents.push({
        type: 'console_error',
        text: error.text,
        location: error.location,
        reason: suppression.reason,
        provenance: suppression.provenance
      })
      continue
    }
    unexplainedIssues.push(runtimeConsoleIssue(error))
  }

  for (const failure of dedupeNetworkFailures(crawlGraph.networkFailures)) {
    if (networkFailureReported(failure, reportedIssues)) continue
    const suppression = benignNetworkSuppression(failure)
    if (suppression) {
      suppressedRuntimeEvents.push({
        type: 'network_error',
        text: `${failure.method} ${failure.url}: ${failure.failureText}`,
        url: failure.url,
        method: failure.method,
        failureText: failure.failureText,
        reason: suppression.reason,
        provenance: suppression.provenance
      })
      continue
    }
    unexplainedIssues.push(runtimeNetworkIssue(failure))
  }

  return { suppressedRuntimeEvents, unexplainedIssues }
}

function dedupeConsoleErrors(errors: RuntimeMessage[]): RuntimeMessage[] {
  return dedupeBy(errors, (error) => `${error.text}:${error.location ?? ''}`)
}

function dedupeNetworkFailures(failures: NetworkFailure[]): NetworkFailure[] {
  return dedupeBy(failures, (failure) => `${failure.method}:${failure.url}:${failure.failureText}:${failure.statusCode ?? ''}`)
}

function runtimeErrorReported(error: RuntimeMessage, issues: Issue[]): boolean {
  const needle = normalize(error.text)
  const location = normalize(error.location ?? '')
  return issues.some((issue) => {
    if (issue.type !== 'console_error' && issue.type !== 'api_error' && issue.type !== 'network_error') return false
    const text = normalize(`${issue.title} ${issue.description} ${issue.evidence.join(' ')}`)
    return text.includes(needle.slice(0, 120)) || (location.length > 0 && text.includes(location))
  })
}

function networkFailureReported(failure: NetworkFailure, issues: Issue[]): boolean {
  const url = normalize(failure.url)
  const status = failure.statusCode ? String(failure.statusCode) : ''
  return issues.some((issue) => {
    if (issue.type !== 'api_error' && issue.type !== 'network_error' && issue.type !== 'console_error') return false
    const text = normalize(`${issue.title} ${issue.description} ${issue.evidence.join(' ')}`)
    return text.includes(url) || (status.length > 0 && text.includes(status))
  })
}

function benignConsoleSuppression(error: RuntimeMessage): Pick<SuppressedRuntimeEvent, 'reason' | 'provenance'> | undefined {
  const text = `${error.text} ${error.location ?? ''}`
  if (/chrome-extension:|moz-extension:|safari-web-extension:/i.test(text)) {
    return { reason: 'Browser extension/runtime noise outside the audited app.', provenance: 'browser_extension_noise' }
  }
  if (/ResizeObserver loop (limit exceeded|completed with undelivered notifications)/i.test(text)) {
    return { reason: 'Known benign browser ResizeObserver notification with no reported UI failure.', provenance: 'known_benign' }
  }
  if (/favicon\.ico|apple-touch-icon/i.test(text)) {
    return { reason: 'Missing browser icon asset is not part of the tested workflow.', provenance: 'known_benign' }
  }
  if (/^Crawler state capture failed: state capture timed out/i.test(error.text)) {
    return {
      reason: 'Sniffer crawler instrumentation timed out while capturing one state; this did not originate from the audited app console.',
      provenance: 'current_audit_runtime'
    }
  }
  if (/^Crawler action failed after page crash:/i.test(error.text)) {
    return {
      reason: 'Sniffer exploratory crawler recorded a Playwright page-crash action failure; generated scenario execution provides the product-facing pass/fail evidence.',
      provenance: 'current_audit_runtime'
    }
  }
  return undefined
}

function benignNetworkSuppression(failure: NetworkFailure): Pick<SuppressedRuntimeEvent, 'reason' | 'provenance'> | undefined {
  if (/chrome-extension:|moz-extension:|safari-web-extension:/i.test(failure.url)) {
    return { reason: 'Browser extension/runtime request outside the audited app.', provenance: 'browser_extension_noise' }
  }
  if (/favicon\.ico|apple-touch-icon|manifest\.json/i.test(failure.url) && !failure.url.includes('/api/')) {
    return { reason: 'Missing browser metadata/icon asset is not part of the tested workflow.', provenance: 'known_benign' }
  }
  return undefined
}

function runtimeConsoleIssue(error: RuntimeMessage): Issue {
  return {
    severity: 'medium',
    type: 'console_error',
    title: 'Unexplained console error observed during runtime audit',
    description: 'A browser console error was observed and was neither reported as a finding nor suppressed with a known benign reason.',
    evidence: [
      `Console error: ${error.text}`,
      error.location ? `Location: ${error.location}` : 'Location: unknown',
      'Provenance: current_audit_runtime'
    ],
    suggestedFixPrompt: 'Investigate the browser console error, confirm whether it affects the current workflow, and either fix the source problem or add a precise suppression reason if it is benign.'
  }
}

function runtimeNetworkIssue(failure: NetworkFailure): Issue {
  return {
    severity: failure.url.includes('/api/') ? 'medium' : 'low',
    type: failure.url.includes('/api/') ? 'api_error' : 'network_error',
    title: 'Unexplained network failure observed during runtime audit',
    description: 'A network failure was observed and was neither reported as a finding nor suppressed with a known benign reason.',
    evidence: [
      `Request: ${failure.method} ${failure.url}`,
      `Failure: ${failure.failureText}`,
      failure.statusCode ? `Status: ${failure.statusCode}` : undefined,
      failure.responseBody ? `Response body: ${failure.responseBody.slice(0, 240)}` : undefined,
      'Provenance: current_audit_runtime'
    ].filter(Boolean) as string[],
    suggestedFixPrompt: 'Investigate the network failure, confirm whether it affects the current workflow, and either fix the endpoint/artifact path or add a precise suppression reason if it is benign.'
  }
}

function dedupeBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    const key = keyOf(item)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}
