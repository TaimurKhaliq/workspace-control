import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../src/reporting/reportWriter.js'
import type { SnifferReport } from '../src/types.js'

describe('renderMarkdown', () => {
  it('renders issue evidence and fix prompts', () => {
    const markdown = renderMarkdown(report())
    expect(markdown).toContain('Sniffer UI QA Report')
    expect(markdown).toContain('Console error')
    expect(markdown).toContain('Fix it')
  })
})

function report(): SnifferReport {
  return {
    sourceGraph: {
      repoPath: '/tmp/demo',
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
      startUrl: 'http://localhost:3000',
      title: 'Demo',
      finalUrl: 'http://localhost:3000',
      states: [],
      actions: [],
      consoleErrors: [],
      networkFailures: [],
      screenshots: [],
      generatedAt: ''
    },
    appIntent: { summary: 'Demo app', likelyWorkflows: [], sourceSignals: [], llmUsed: false },
    runtimeSurfaceMatches: [],
    runtimeWorkflowVerifications: [],
    issues: [{
      severity: 'medium',
      type: 'console_error',
      title: 'Console error',
      description: 'boom',
      evidence: ['console'],
      suggestedFixPrompt: 'Fix it'
    }],
    generatedAt: ''
  }
}
