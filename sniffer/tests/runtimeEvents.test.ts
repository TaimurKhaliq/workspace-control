import { describe, expect, it } from 'vitest'
import { buildRuntimeEventIntegrity } from '../src/reporting/runtimeEvents.js'
import type { CrawlGraph, Issue } from '../src/types.js'

describe('runtime event integrity', () => {
  it('suppresses known benign browser noise with an explicit reason', () => {
    const result = buildRuntimeEventIntegrity({
      ...crawlGraph(),
      consoleErrors: [{ text: 'ResizeObserver loop limit exceeded', location: 'http://localhost:4877' }]
    }, [])

    expect(result.unexplainedIssues).toHaveLength(0)
    expect(result.suppressedRuntimeEvents).toEqual([expect.objectContaining({
      type: 'console_error',
      provenance: 'known_benign',
      reason: expect.stringContaining('ResizeObserver')
    })])
  })

  it('turns unknown unreported console errors into findings', () => {
    const result = buildRuntimeEventIntegrity({
      ...crawlGraph(),
      consoleErrors: [{ text: 'Uncaught TypeError: Cannot read properties of undefined', location: 'http://localhost:4877/#scenarios' }]
    }, [])

    expect(result.suppressedRuntimeEvents).toHaveLength(0)
    expect(result.unexplainedIssues).toEqual([expect.objectContaining({
      type: 'console_error',
      title: 'Unexplained console error observed during runtime audit'
    })])
  })

  it('explains crawler state capture timeouts as instrumentation suppressions', () => {
    const result = buildRuntimeEventIntegrity({
      ...crawlGraph(),
      consoleErrors: [{ text: 'Crawler state capture failed: state capture timed out', location: 'http://localhost:4877/' }]
    }, [])

    expect(result.unexplainedIssues).toHaveLength(0)
    expect(result.suppressedRuntimeEvents).toEqual([expect.objectContaining({
      type: 'console_error',
      provenance: 'current_audit_runtime',
      reason: expect.stringContaining('crawler instrumentation')
    })])
  })

  it('explains crawler page-crash action failures as instrumentation events', () => {
    const result = buildRuntimeEventIntegrity({
      ...crawlGraph(),
      consoleErrors: [{ text: 'Crawler action failed after page crash: locator.click: Target crashed', location: 'http://localhost:4877/' }]
    }, [])

    expect(result.unexplainedIssues).toHaveLength(0)
    expect(result.suppressedRuntimeEvents).toEqual([expect.objectContaining({
      type: 'console_error',
      provenance: 'current_audit_runtime',
      reason: expect.stringContaining('generated scenario execution')
    })])
  })

  it('does not duplicate console events that are already reported', () => {
    const issue: Issue = {
      severity: 'medium',
      type: 'console_error',
      title: 'Console error',
      description: 'Uncaught TypeError: Cannot read properties of undefined',
      evidence: ['Uncaught TypeError: Cannot read properties of undefined', 'http://localhost:4877/#scenarios'],
      suggestedFixPrompt: 'Fix it'
    }
    const result = buildRuntimeEventIntegrity({
      ...crawlGraph(),
      consoleErrors: [{ text: 'Uncaught TypeError: Cannot read properties of undefined', location: 'http://localhost:4877/#scenarios' }]
    }, [issue])

    expect(result.suppressedRuntimeEvents).toHaveLength(0)
    expect(result.unexplainedIssues).toHaveLength(0)
  })
})

function crawlGraph(): CrawlGraph {
  return {
    startUrl: 'http://localhost:4877',
    title: 'Sniffer Dashboard',
    finalUrl: 'http://localhost:4877',
    states: [],
    actions: [],
    consoleErrors: [],
    networkFailures: [],
    screenshots: [],
    generatedAt: ''
  }
}
