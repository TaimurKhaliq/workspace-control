import { describe, expect, it } from 'vitest'
import { findMatchingIssue } from '../src/repair/verify.js'
import type { Issue, SnifferReport } from '../src/types.js'

describe('verification comparison', () => {
  it('marks issue fixed when matching evidence disappears', () => {
    const before = issue('/api/repos/demo/learning-status')
    const after = report([])

    expect(findMatchingIssue(before, after)).toBeUndefined()
  })

  it('finds still-failing issues with matching evidence', () => {
    const before = issue('/api/repos/demo/learning-status')
    const after = report([issue('/api/repos/demo/learning-status')])

    expect(findMatchingIssue(before, after)?.title).toBe('Learning status fails')
  })
})

function issue(evidence: string): Issue {
  return {
    issue_id: 'issue-1',
    severity: 'medium',
    type: 'console_error',
    title: 'Learning status fails',
    description: 'console error',
    evidence: [evidence],
    suspected_files: ['src/api.ts'],
    fix_prompt: 'Fix it',
    verification_steps: ['Run audit'],
    pass_conditions: ['No error'],
    status: 'open',
    attempts: 0,
    suggestedFixPrompt: 'Fix it'
  }
}

function report(issues: Issue[]): SnifferReport {
  return {
    sourceGraph: {
      repoPath: '/tmp/repo',
      framework: 'react',
      buildTool: 'vite',
      routes: [],
      pages: [],
      components: [],
      forms: [],
      uiSurfaces: [],
      sourceWorkflows: [],
      apiCalls: [],
      stateActions: [],
      packageScripts: {},
      generatedAt: ''
    },
    crawlGraph: {
      startUrl: 'http://localhost',
      title: '',
      finalUrl: '',
      states: [],
      actions: [],
      consoleErrors: [],
      networkFailures: [],
      screenshots: [],
      generatedAt: ''
    },
    appIntent: { summary: '', likelyWorkflows: [], sourceSignals: [], llmUsed: false },
    runtimeSurfaceMatches: [],
    runtimeWorkflowVerifications: [],
    issues,
    generatedAt: ''
  }
}
