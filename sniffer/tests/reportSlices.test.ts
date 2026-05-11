import { describe, expect, it } from 'vitest'
import { reportSlicePayload } from '../server/reportSlices.js'
import type { SnifferReport } from '../src/types.js'

describe('report model slices', () => {
  it('returns scoped source inventory and UI intent graph data', () => {
    const report = fixtureReport()

    expect(reportSlicePayload(report, 'source-inventory')).toMatchObject({
      facts: expect.arrayContaining([expect.objectContaining({ id: 'fact-feature-request', kind: 'form_control' })])
    })
    expect(reportSlicePayload(report, 'ui-intent-graph')).toMatchObject({
      surfaces: expect.arrayContaining([expect.objectContaining({ id: 'surface-plan-runs', label: 'Plan Runs history' })])
    })
  })

  it('returns graph refinements and handles missing data', () => {
    const report = fixtureReport()
    const refinements = reportSlicePayload(report, 'graph-refinements') as Record<string, unknown>

    expect(refinements.llmUsed).toBe(true)
    expect(reportSlicePayload({ ...report, graphRefinement: undefined, sourceGraph: { ...report.sourceGraph, graphRefinement: undefined } }, 'graph-refinements')).toBeUndefined()
  })

  it('builds evidence packet and suppression payloads', () => {
    const report = fixtureReport()
    const packets = reportSlicePayload(report, 'evidence-packets') as { productExperiencePackets: unknown[]; fixPacketIssues: unknown[] }
    const suppressions = reportSlicePayload(report, 'suppressions') as { suppressedFacts: unknown[]; rejectedRefinements: unknown[]; nonIssues: unknown[] }

    expect(packets.productExperiencePackets).toHaveLength(1)
    expect(packets.fixPacketIssues).toHaveLength(1)
    expect(suppressions.suppressedFacts).toHaveLength(1)
    expect(suppressions.rejectedRefinements).toHaveLength(1)
    expect(suppressions.nonIssues).toHaveLength(1)
  })
})

function fixtureReport(): SnifferReport {
  return {
    generatedAt: '2026-05-11T00:00:00.000Z',
    sourceGraph: {
      repoPath: '/tmp/web',
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
      generatedAt: '2026-05-11T00:00:00.000Z',
      sourceInventory: {
        files: [],
        modules: [],
        frameworkSignals: [],
        packageBuildSignals: [],
        rawExtractedSymbols: [],
        rawRoutes: [],
        rawTemplates: [],
        rawHandlers: [],
        rawApiCalls: [],
        provenance: [],
        generatedAt: '2026-05-11T00:00:00.000Z',
        facts: [{
          id: 'fact-feature-request',
          kind: 'form_control',
          value: 'Feature request',
          source: 'source_inventory',
          filePath: 'src/App.tsx',
          confidence: 0.9,
          extractionMethod: 'deterministic'
        }, {
          id: 'fact-noise',
          kind: 'action_control',
          value: 'Unlabelled button',
          source: 'source_inventory',
          filePath: 'src/App.tsx',
          confidence: 0.3,
          extractionMethod: 'deterministic',
          suppressedFromSemanticGraph: true
        }]
      },
      uiIntentGraph: {
        surfaces: [{ id: 'surface-plan-runs', kind: 'surface', label: 'Plan Runs history', confidence: 0.86, evidenceIds: ['fact-feature-request'], extractionMethod: 'heuristic' }],
        workflows: [],
        actions: [],
        controls: [],
        forms: [],
        state: [],
        validation: [],
        apiDataDependencies: [],
        domainEntities: [],
        edges: [],
        confidence: 0.8,
        evidenceReferences: ['fact-feature-request'],
        inferences: [],
        generatedAt: '2026-05-11T00:00:00.000Z'
      },
      graphRefinement: {
        mode: 'llm',
        status: 'completed',
        modelReviewed: 'test',
        llmUsed: true,
        provider: 'mock',
        suggestions: [],
        appliedSuggestions: [],
        rejectedSuggestions: [{
          id: 'reject-1',
          type: 'mark_as_noise',
          targetId: 'fact-feature-request',
          reason: 'weak',
          evidenceIds: ['fact-feature-request'],
          confidence: 'low',
          risk: 'low',
          rejectedReason: 'Only high-confidence graph refinements are applied.'
        }],
        warnings: []
      }
    },
    crawlGraph: {
      startUrl: 'http://localhost:3000',
      finalUrl: 'http://localhost:3000',
      title: 'Demo',
      states: [],
      actions: [],
      consoleErrors: [],
      networkFailures: [],
      screenshots: [],
      generatedAt: '2026-05-11T00:00:00.000Z'
    },
    appIntent: { workflows: [] },
    issues: [{
      issue_id: 'issue-1',
      severity: 'medium',
      type: 'usability_issue',
      title: 'Issue',
      description: 'Issue description',
      evidence: ['Evidence'],
      suspected_files: ['src/App.tsx']
    }],
    rawFindings: [],
    runtimeSurfaceMatches: [],
    runtimeWorkflowVerifications: [],
    criticDecisions: [],
    deferredFindings: [],
    blockedChecks: [],
    needsMoreCrawling: [],
    productExperience: {
      mode: 'llm',
      status: 'completed',
      providerName: 'mock',
      screensReviewed: 1,
      llmScreensReviewed: 1,
      realLlmScreensReviewed: 0,
      visionScreensReviewed: 0,
      aligned: 1,
      minorGaps: 0,
      majorGaps: 0,
      inconclusive: 0,
      rubric: [],
      contexts: [{ current_screen_name: 'Run Timeline', screenshot_path: 'screenshots/state-1.png' } as never],
      decisions: [{ screen_name: 'Run Timeline', non_issues: [{ observation: 'Copy JSON exists', reason_not_reported: 'candidate suppressed due to contradictory runtime evidence' }] } as never],
      evidenceRetrievalSummaries: [],
      issues: []
    }
  } as unknown as SnifferReport
}
