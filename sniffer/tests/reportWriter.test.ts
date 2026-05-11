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

  it('renders graph refinement object values without object string leaks', () => {
    const withRefinement = report()
    withRefinement.graphRefinement = {
      mode: 'llm',
      status: 'completed',
      modelReviewed: 'UIIntentGraphDraft',
      llmUsed: true,
      provider: 'openai-compatible',
      suggestions: [],
      appliedSuggestions: [{
        id: 'edge-1',
        type: 'add_edge',
        targetId: 'edge-1',
        fromValue: { source: 'workflow:raw-json', target: 'control:copy-json', kind: 'supports' },
        toValue: { kind: 'edge', source: 'workflow:raw-json', target: 'control:copy-json' },
        reason: 'Copy JSON supports raw payload inspection.',
        evidenceIds: ['fact-copy-json'],
        confidence: 'high',
        risk: 'low',
        appliedAt: '2026-05-11T00:00:00.000Z'
      }],
      rejectedSuggestions: [{
        id: 'fact-1',
        type: 'reclassify_fact',
        targetId: 'fact-1',
        fromValue: { kind: 'action_control', label: 'Copy JSON' },
        toValue: { kind: 'copy_action', label: 'Copy JSON' },
        reason: 'Object values should render readably.',
        evidenceIds: ['fact-1'],
        confidence: 'low',
        risk: 'low',
        rejectedReason: 'low confidence'
      }],
      warnings: []
    }

    const markdown = renderMarkdown(withRefinement)

    expect(markdown).not.toContain('[object Object]')
    expect(markdown).toContain('workflow:raw-json -supports-> control:copy-json')
    expect(markdown).toContain('copy_action: Copy JSON')
  })

  it('renders suppressed runtime event explanations', () => {
    const withSuppression = report()
    withSuppression.crawlGraph.consoleErrors = [{ text: 'ResizeObserver loop limit exceeded', location: 'http://localhost:3000' }]
    withSuppression.suppressedRuntimeEvents = [{
      type: 'console_error',
      text: 'ResizeObserver loop limit exceeded',
      location: 'http://localhost:3000',
      provenance: 'known_benign',
      reason: 'Known benign browser ResizeObserver notification with no reported UI failure.'
    }]

    const markdown = renderMarkdown(withSuppression)

    expect(markdown).toContain('Suppressed Runtime Events')
    expect(markdown).toContain('Reason suppressed: Known benign browser ResizeObserver notification')
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
