import { describe, expect, it } from 'vitest'
import { buildCriticContext } from '../src/critic/contextBuilder.js'
import type { CandidateFinding, CrawlGraph, SourceGraph } from '../src/types.js'

describe('buildCriticContext', () => {
  it('includes focused source, runtime, and execution context', () => {
    const context = buildCriticContext({
      sourceGraph: sourceGraph(),
      crawlGraph: crawlGraph(),
      workflowVerifications: [],
      candidate: finding('Missing runtime control for View plan bundle tabs'),
      appUrl: 'http://localhost:5173'
    })

    expect(context.app_identity).toMatchObject({ framework: 'react', build_tool: 'vite' })
    expect(context.source_intent.relevant_source_workflows[0].name).toBe('View plan bundle tabs')
    expect(context.runtime_observation.visible_controls.map((control) => control.text)).toContain('Generate plan')
    expect(context.execution_trace.actions_attempted[0].label).toBe('Workspaces')
    expect(context.known_state.plan_bundle_generated).toBe(false)
    expect(context.omitted_counts).toHaveProperty('visible_controls')
  })
})

function finding(title: string): CandidateFinding {
  return {
    finding_id: 'finding-1',
    severity: 'low',
    type: 'missing_ui_surface',
    title,
    description: 'Raw JSON tab/button was not found',
    evidence: ['Raw JSON tab/button'],
    suggestedFixPrompt: 'Fix it'
  }
}

function sourceGraph(): SourceGraph {
  return {
    repoPath: '/tmp/web',
    packageName: 'demo',
    framework: 'react',
    buildTool: 'vite',
    routes: [],
    pages: [],
    components: [],
    forms: [],
    uiSurfaces: [{
      file: 'src/App.tsx',
      surface_type: 'plan_bundle_view',
      display_name: 'Plan bundle renderer',
      evidence: ['Raw JSON'],
      relatedButtons: ['Raw JSON'],
      relatedInputs: [],
      confidence: 0.9
    }],
    sourceWorkflows: [{
      name: 'View plan bundle tabs',
      sourceFiles: ['src/App.tsx'],
      evidence: ['Raw JSON'],
      likelyUserActions: ['Open JSON tab'],
      confidence: 0.9
    }],
    apiCalls: [{ endpoint: '/api/workspaces/${workspaceId}/plan-bundles', sourceFile: 'src/api.ts', method: 'POST', likelyWorkflow: 'Generate plan bundle' }],
    stateActions: [{ file: 'src/App.tsx', stateVariables: ['planBundle'], handlerNames: ['onGeneratePlan'], submitHandlers: ['onGeneratePlan'], loadingStateVariables: [], errorStateVariables: [] }],
    packageScripts: {},
    generatedAt: ''
  }
}

function crawlGraph(): CrawlGraph {
  return {
    startUrl: 'http://localhost:5173',
    title: 'Demo',
    finalUrl: 'http://localhost:5173',
    states: [{
      url: 'http://localhost:5173',
      title: 'Demo',
      hash: 'a',
      visible: [
        { kind: 'link', text: 'Workspaces' },
        { kind: 'button', text: 'Generate plan' }
      ]
    }],
    actions: [{ type: 'click', label: 'Workspaces', target: 'Workspaces', urlBefore: 'http://localhost:5173', safe: true }],
    consoleErrors: [],
    networkFailures: [],
    screenshots: ['/tmp/screen.png'],
    generatedAt: ''
  }
}
