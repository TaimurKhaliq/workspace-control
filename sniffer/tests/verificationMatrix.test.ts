import { describe, expect, it } from 'vitest'
import { evaluateMatrixTarget, type MatrixTarget } from '../src/verification/matrix.js'
import type { SnifferReport } from '../src/types.js'

describe('verification matrix criteria', () => {
  it('passes when runtime workflows make an app useful even without source workflows', () => {
    const result = evaluateMatrixTarget({
      target: target(),
      report: report({ sourceWorkflows: 0, runtimeWorkflows: 2, generatedScenarios: 5, scenarioRuns: 5 }),
      reportPath: '/tmp/latest_report.json',
      markdown: '## Runtime Workflows\nNavigation smoke test',
      screenshotsDirExists: true
    })

    expect(result.status).toBe('passed')
    expect(result.triagedRepairGroups).toBe(1)
    expect(result.realIssues).toBe(1)
    expect(result.criteria.find((item) => item.name.includes('source + runtime'))?.passed).toBe(true)
  })

  it('fails when report text says no workflows despite runtime workflows', () => {
    const result = evaluateMatrixTarget({
      target: target(),
      report: report({ sourceWorkflows: 0, runtimeWorkflows: 2, generatedScenarios: 5, scenarioRuns: 5 }),
      reportPath: '/tmp/latest_report.json',
      markdown: 'No workflows discovered.',
      screenshotsDirExists: true,
      fixPackets: 2,
      screenshotsCaptured: 4
    })

    expect(result.status).toBe('failed')
    expect(result.fixPackets).toBe(2)
    expect(result.screenshotsCaptured).toBe(4)
    expect(result.criteria.find((item) => item.name.includes('misleading'))?.passed).toBe(false)
  })
})

function target(): MatrixTarget {
  return {
    id: 'fixture',
    name: 'Fixture',
    repoPath: '/tmp/fixture',
    appUrl: 'http://127.0.0.1:3000',
    expectedFramework: 'unknown',
    expectedProfiles: ['crud_app'],
    expectedMinRuntimeWorkflows: 2,
    expectedMinGeneratedScenarios: 4,
    expectedMinExecutedScenarioRuns: 4,
    kind: 'fixture'
  }
}

function report(input: {
  sourceWorkflows: number
  runtimeWorkflows: number
  generatedScenarios: number
  scenarioRuns: number
}): SnifferReport {
  return {
    sourceGraph: {
      repoPath: '/tmp/fixture',
      framework: 'unknown',
      buildTool: 'unknown',
      routes: [],
      pages: [],
      components: [],
      forms: [],
      uiSurfaces: [],
      sourceWorkflows: Array.from({ length: input.sourceWorkflows }, (_, index) => ({
        name: `Source workflow ${index + 1}`,
        sourceFiles: ['index.html'],
        evidence: ['fixture'],
        likelyUserActions: ['inspect'],
        confidence: 0.5
      })),
      apiCalls: [],
      stateActions: [],
      packageScripts: {},
      generatedAt: new Date().toISOString()
    },
    crawlGraph: {
      startUrl: 'http://127.0.0.1:3000',
      title: 'Fixture',
      finalUrl: 'http://127.0.0.1:3000',
      states: [],
      actions: [],
      consoleErrors: [],
      networkFailures: [],
      screenshots: [],
      generatedAt: new Date().toISOString()
    },
    appIntent: { summary: 'Fixture', workflows: [], data: {} },
    appProfile: {
      profile_type: 'crud_app',
      confidence: 'medium',
      evidence: ['fixture'],
      core_entities: [],
      primary_user_jobs: [],
      expected_navigation_patterns: [],
      expected_workflows: [],
      expected_output_surfaces: []
    },
    runtimeAppModel: {
      app_name: 'Fixture',
      inferred_app_type: 'crud_app',
      screens: [],
      nav_items: [],
      forms: [],
      workflows: Array.from({ length: input.runtimeWorkflows }, (_, index) => ({
        name: `Runtime workflow ${index + 1}`,
        confidence: 'medium',
        source: 'runtime_dom',
        evidence: ['fixture'],
        relatedControls: [],
        steps: []
      })),
      entities: [],
      actions: [],
      route_candidates: [],
      locator_inventory: [],
      confidence: 'medium',
      evidence: []
    },
    generatedScenarios: Array.from({ length: input.generatedScenarios }, (_, index) => ({
      id: `scenario-${index + 1}`,
      name: `Scenario ${index + 1}`,
      profileApplicability: ['unknown'],
      prerequisites: [],
      steps: [],
      expectedControls: [],
      expectedOutcomes: [],
      destructiveRisk: 'none',
      confidence: 'medium',
      evidence: []
    })),
    runtimeSurfaceMatches: [],
    runtimeWorkflowVerifications: [],
    scenarioRuns: Array.from({ length: input.scenarioRuns }, (_, index) => ({
      slug: `scenario-${index + 1}`,
      name: `Scenario ${index + 1}`,
      status: 'passed',
      prerequisites: [],
      stepsAttempted: [],
      screenshots: [],
      assertions: [],
      issues: []
    })),
    criticDecisions: [],
    deferredFindings: [],
    blockedChecks: [],
    needsMoreCrawling: [],
    issues: [{
      severity: 'medium',
      type: 'usability_issue',
      title: 'Fixture issue',
      description: 'Fixture issue',
      evidence: ['fixture'],
      suggestedFixPrompt: 'Fix fixture issue.'
    }],
    generatedAt: new Date().toISOString()
  } as unknown as SnifferReport
}
