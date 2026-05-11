import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../src/reporting/reportWriter.js'
import type { SnifferReport } from '../src/types.js'

describe('renderMarkdown', () => {
  it('renders issue evidence and fix prompts', () => {
    const markdown = renderMarkdown(report())
    expect(markdown).toContain('Sniffer UI QA Report')
    expect(markdown).toContain('Console error')
    expect(markdown).toContain('Fix it')
    expect(markdown).toContain('Product Experience Critic')
    expect(markdown).toContain('Rubric version: product-experience.v1')
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
    criticDecisions: [],
    deferredFindings: [],
    blockedChecks: [],
    needsMoreCrawling: [],
    productExperience: {
      mode: 'deterministic',
      status: 'completed',
      screensReviewed: 1,
      llmScreensReviewed: 0,
      realLlmScreensReviewed: 0,
      visionScreensReviewed: 0,
      aligned: 0,
      minorGaps: 1,
      majorGaps: 0,
      inconclusive: 0,
      rubricVersion: 'product-experience.v1',
      ruleIdsEvaluated: ['run_report_context_clarity'],
      ruleIdsTriggered: ['run_report_context_clarity'],
      ruleIdsPassed: [],
      rubric: [],
      contexts: [],
      decisions: [{
        screen_name: 'Run Timeline',
        nav_label: 'Run Timeline',
        workflow_intent: 'Replay an audit run.',
        llm_used: false,
        real_llm_used: false,
        llm_request_status: 'not_requested',
        vision_used: false,
        scenario_screenshot_used: false,
        context_sufficiency: 'high',
        context_sufficiency_score: 0.9,
        context_warnings: [],
        overall: { classification: 'minor_gap', confidence: 'high', summary: 'Run context is missing.' },
        findings: [{
          title: 'Run Timeline lacks clear run/report context',
          type: 'context_gap',
          severity: 'medium',
          rubric_ids: ['run_report_context_clarity'],
          expected: 'Run identity',
          observed: 'No timestamp',
          evidence: ['screen: Run Timeline'],
          why_it_matters: 'Trust',
          suggested_fix: 'Add context',
          should_report: true
        }],
        non_issues: []
      }],
      issues: []
    },
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
