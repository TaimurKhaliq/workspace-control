import { describe, expect, it } from 'vitest'
import type { SnifferReport } from '../src/api'
import { buildCrawlCoverage, buildCrawlPath, buildRunPhases, buildScenarioViews, buildWorkflowEvidence } from '../src/report/journey'

describe('journey report builders', () => {
  it('summarizes audit phases for the run timeline', () => {
    const phases = buildRunPhases(fixtureReport(), [{ issueId: 'issue-1', name: 'issue-1.md', relativePath: 'fix_packets/issue-1.md', kind: 'md' }])
    expect(phases.map((phase) => phase.title)).toContain('Runtime crawl')
    expect(phases.find((phase) => phase.id === 'scenarios')?.status).toBe('failed')
    expect(phases.find((phase) => phase.id === 'fixes')?.summary).toContain('1 fix packet')
  })

  it('builds a crawl path with visible controls and repeated action warnings', () => {
    const states = buildCrawlPath(fixtureReport())
    expect(states).toHaveLength(1)
    expect(states[0].screenName).toBe('Workspaces')
    expect(states[0].hashRoute).toBe('#workspaces')
    expect(states[0].controlsByKind.button.map((control) => control.label)).toContain('Workspaces')
    expect(states[0].repeatedActionLabels).toContain('Workspaces (2 times)')
  })

  it('builds a route and workflow coverage summary', () => {
    const coverage = buildCrawlCoverage(fixtureReport())
    expect(coverage.visitedRoutes).toContain('#workspaces')
    expect(coverage.missedRoutes).toContain('#repositories')
    expect(coverage.safeActionsSkipped[0].label).toBe('Repositories')
  })

  it('turns scenarios into step-by-step execution evidence', () => {
    const scenarios = buildScenarioViews(fixtureReport())
    expect(scenarios[0].steps.map((step) => step.label)).toContain('click Generate Plan Bundle')
    expect(scenarios[0].failedAssertions[0].label).toBe('Raw JSON tab is visible')
    expect(scenarios[0].steps.some((step) => step.screenshot?.includes('scenario.png'))).toBe(true)
  })

  it('connects source workflows to runtime verification, API calls, scenarios, and issues', () => {
    const workflows = buildWorkflowEvidence(fixtureReport())
    const workflow = workflows.find((item) => item.workflow.name === 'Generate plan bundle')!
    expect(workflow.status).toBe('failed')
    expect(workflow.verification?.status).toBe('partial')
    expect(workflow.apiCalls[0].endpoint).toBe('/api/plan-bundles')
    expect(workflow.scenarios[0].name).toBe('Generate plan bundle')
    expect(workflow.issues[0].title).toBe('Generate plan bundle is not reviewable')
  })
})

function fixtureReport(): SnifferReport {
  return {
    generatedAt: '2026-04-28T12:00:00.000Z',
    sourceGraph: {
      repoPath: '/tmp/web',
      framework: 'react',
      buildTool: 'vite',
      uiSurfaces: [{
        file: 'src/App.tsx',
        surface_type: 'prompt_composer',
        display_name: 'Prompt composer',
        evidence: ['Generate Plan Bundle', 'Feature request'],
        relatedButtons: ['Generate Plan Bundle'],
        relatedInputs: ['Feature request'],
        confidence: 0.9
      }],
      sourceWorkflows: [{
        name: 'Generate plan bundle',
        sourceFiles: ['src/App.tsx'],
        evidence: ['Generate Plan Bundle', 'Feature request', 'Raw JSON'],
        likelyUserActions: ['type feature request', 'click Generate Plan Bundle', 'open Raw JSON'],
        confidence: 0.9
      }],
      apiCalls: [{
        method: 'POST',
        endpoint: '/api/plan-bundles',
        sourceFile: 'src/api.ts',
        functionName: 'generatePlanBundle',
        likelyWorkflow: 'Generate plan bundle'
      }],
      stateActions: []
    },
    crawlGraph: {
      startUrl: 'http://127.0.0.1:5173',
      finalUrl: 'http://127.0.0.1:5173/#workspaces',
      states: [{
        id: 'state-1',
        sequenceNumber: 1,
        url: 'http://127.0.0.1:5173/#workspaces',
        hashRoute: '#workspaces',
        title: 'Workspace Control',
        hash: 'state-a',
        inferredScreenName: 'Workspaces',
        inferredPageType: 'workspace_management',
        duplicateCount: 2,
        visible: [
          { kind: 'button', text: 'Workspaces', selectorHint: 'role=button[name="Workspaces"]' },
          { kind: 'button', text: 'Generate Plan Bundle' },
          { kind: 'textarea', name: 'Feature request' }
        ]
      }],
      actions: [
        { id: 'action-1', type: 'click', actionType: 'click', label: 'Workspaces', target: 'button', urlBefore: 'http://127.0.0.1:5173/#workspaces', urlAfter: 'http://127.0.0.1:5173/#workspaces', stateHashBefore: 'state-a', stateHashAfter: 'state-a', changedState: false, safe: true, reason: 'nav button' },
        { id: 'action-2', type: 'click', actionType: 'click', label: 'Workspaces', target: 'button', urlBefore: 'http://127.0.0.1:5173/#workspaces', urlAfter: 'http://127.0.0.1:5173/#workspaces', stateHashBefore: 'state-a', stateHashAfter: 'state-a', changedState: false, safe: true, reason: 'nav button' }
      ],
      coverage: {
        sourceRoutes: ['#workspaces', '#repositories'],
        visitedRoutes: ['#workspaces'],
        missedRoutes: ['#repositories'],
        workflowsDiscovered: 1,
        workflowsExercised: 1,
        scenariosPassed: 0,
        scenariosFailed: 1,
        scenariosSkipped: 0,
        safeActionsSkipped: [{ label: 'Repositories', reason: 'time budget reached', route: '#workspaces', stateId: 'state-1' }]
      },
      consoleErrors: [],
      networkFailures: [],
      screenshots: ['/tmp/reports/sniffer/latest/screenshots/state-1.png']
    },
    runtimeWorkflowVerifications: [{
      name: 'Generate plan bundle',
      sourceFiles: ['src/App.tsx'],
      status: 'partial',
      evidence: ['Generate button found', 'Raw JSON not found'],
      controls: [
        { label: 'Generate Plan Bundle', status: 'found', matchedEvidence: ['button text'] },
        { label: 'Raw JSON', status: 'missing', missingReason: 'No tab found' }
      ],
      attemptedInteractions: ['click Generate Plan Bundle'],
      issues: []
    }],
    scenarioRuns: [{
      slug: 'generate-plan-bundle',
      name: 'Generate plan bundle',
      status: 'failed',
      prerequisites: ['workspace selected', 'repo selected'],
      stepsAttempted: ['select first workspace', 'click Generate Plan Bundle'],
      assertions: [
        { label: 'Generate button visible', status: 'passed', evidence: ['button found'], screenshotPath: '/tmp/reports/sniffer/latest/screenshots/scenario.png' },
        { label: 'Raw JSON tab is visible', status: 'failed', evidence: ['No Raw JSON tab found'], screenshotPath: '/tmp/reports/sniffer/latest/screenshots/scenario.png' }
      ],
      screenshots: ['/tmp/reports/sniffer/latest/screenshots/scenario.png']
    }],
    criticDecisions: [],
    issues: [{
      issue_id: 'issue-1',
      severity: 'medium',
      type: 'workflow_confusion',
      title: 'Generate plan bundle is not reviewable',
      description: 'Raw JSON tab was missing after generation.',
      evidence: ['Raw JSON tab missing', 'Generate Plan Bundle'],
      suspected_files: ['src/App.tsx'],
      suggestedFixPrompt: 'Make plan bundle tabs discoverable.'
    }],
    rawFindings: [],
    deferredFindings: [],
    blockedChecks: [],
    needsMoreCrawling: []
  }
}
