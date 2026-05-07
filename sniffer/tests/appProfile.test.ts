import { describe, expect, it } from 'vitest'
import { augmentAppProfileWithProductIntent, inferAppProfile } from '../src/profile/appProfile.js'
import { generateGenericScenarios } from '../src/runtime/genericScenarios.js'
import type { SourceGraph } from '../src/types.js'

describe('app profile inference and generic scenarios', () => {
  it('infers planning/control-panel intent from source graph signals', () => {
    const sourceGraph = planningSourceGraph()

    const profile = inferAppProfile({ sourceGraph })

    expect(profile.profile_type).toBe('planning_control_panel')
    expect(profile.core_entities).toEqual(expect.arrayContaining(['workspace', 'repo target', 'plan run', 'plan bundle', 'handoff prompt']))
    expect(profile.primary_user_jobs).toContain('browse previous plan runs')
    expect(profile.expected_output_surfaces).toEqual(expect.arrayContaining(['handoff prompt', 'raw JSON', 'copy/export actions']))
  })

  it('generates generic and profile-specific scenarios', () => {
    const sourceGraph = planningSourceGraph()
    const profile = inferAppProfile({ sourceGraph })

    const scenarios = generateGenericScenarios({
      appProfile: profile,
      sourceGraph,
      scenarioSelection: {
        appSubtype: 'workspace_control',
        scenarioPack: 'workspace_control',
        confidence: 'high',
        reason: 'fixture',
        applicability: [],
        skippedScenarios: []
      }
    })

    expect(scenarios.map((scenario) => scenario.id)).toEqual(expect.arrayContaining([
      'navigation-smoke',
      'forms-discoverability',
      'planning-generation-flow',
      'planning-output-review',
      'planning-history-reopen'
    ]))
    expect(scenarios.every((scenario) => scenario.destructiveRisk === 'none')).toBe(true)
  })

  it('can augment a deterministic profile from LLM product intent evidence', () => {
    const profile = inferAppProfile({ sourceGraph: planningSourceGraph() })

    const augmented = augmentAppProfileWithProductIntent(profile, {
      app_category: 'dashboard',
      product_summary: 'An operations dashboard.',
      primary_user_jobs: [{ name: 'monitor service health', support: ['source_supported'], evidence: ['Health metric'], confidence: 'medium' }],
      core_entities: [{ name: 'service', support: ['source_supported'], evidence: ['Service row'], confidence: 'medium' }],
      expected_workflows: [{ name: 'filter service list', support: ['source_supported'], evidence: ['Filter input'], confidence: 'medium' }],
      expected_navigation_model: [{ name: 'dashboard tabs', support: ['runtime_supported'], evidence: ['Tabs'], confidence: 'medium' }],
      expected_persistence_model: [],
      expected_output_review_model: [{ name: 'metric drilldown', support: ['inferred_from_common_pattern'], evidence: ['Dashboard pattern'], confidence: 'low' }],
      confidence: 'medium',
      evidence: ['LLM saw dashboard runtime labels'],
      assumptions: [],
      risks_of_hallucination: [],
      llmUsed: true
    })

    expect(augmented.profile_type).toBe('dashboard_app')
    expect(augmented.core_entities).toContain('service')
    expect(augmented.primary_user_jobs).toContain('monitor service health')
    expect(augmented.evidence.some((item) => item.includes('LLM product intent'))).toBe(true)
  })
})

function planningSourceGraph(): SourceGraph {
  return {
    repoPath: '/tmp/workspace-control/web',
    packageName: 'workspace-control-web',
    framework: 'react',
    buildTool: 'vite',
    routes: [{ path: '#plan-runs', file: 'src/App.tsx', source: 'link' }],
    pages: [],
    components: [{ file: 'src/App.tsx', name: 'App' }],
    forms: [{ file: 'src/App.tsx', name: 'Prompt composer', inputs: ['Feature request', 'Target repository'] }],
    uiSurfaces: [
      { file: 'src/App.tsx', surface_type: 'workspace_selector', display_name: 'Workspace selector', evidence: ['Workspace selector'], relatedButtons: ['New workspace'], relatedInputs: ['Workspace'], confidence: 0.9 },
      { file: 'src/App.tsx', surface_type: 'repo_list', display_name: 'Repository targets', evidence: ['Add repository'], relatedButtons: ['Add repository'], relatedInputs: [], confidence: 0.8 },
      { file: 'src/App.tsx', surface_type: 'prompt_composer', display_name: 'Prompt composer', evidence: ['Feature request'], relatedButtons: ['Generate Plan Bundle'], relatedInputs: ['Feature request'], confidence: 0.9 },
      { file: 'src/App.tsx', surface_type: 'handoff_prompt_panel', display_name: 'Handoff prompt', evidence: ['Copy handoff prompt'], relatedButtons: ['Copy prompt'], relatedInputs: [], confidence: 0.8 },
      { file: 'src/App.tsx', surface_type: 'raw_json_panel', display_name: 'Raw JSON', evidence: ['Raw JSON'], relatedButtons: ['Copy JSON'], relatedInputs: [], confidence: 0.8 }
    ],
    sourceWorkflows: [
      { name: 'Create/select workspace', sourceFiles: ['src/App.tsx'], evidence: ['Workspace selector'], likelyUserActions: ['Select workspace'], confidence: 0.9 },
      { name: 'Generate plan bundle', sourceFiles: ['src/App.tsx'], evidence: ['Feature request', 'Plan bundle'], likelyUserActions: ['Generate Plan Bundle'], confidence: 0.9 },
      { name: 'Browse plan runs', sourceFiles: ['src/App.tsx'], evidence: ['Plan Runs', 'runId'], likelyUserActions: ['Open prior plan run'], confidence: 0.8 },
      { name: 'Copy handoff prompt', sourceFiles: ['src/App.tsx'], evidence: ['Handoff'], likelyUserActions: ['Copy prompt'], confidence: 0.8 }
    ],
    apiCalls: [
      { method: 'POST', endpoint: '/api/workspaces/{workspaceId}/plan-bundles', sourceFile: 'src/api.ts', functionName: 'generatePlanBundle', likelyWorkflow: 'Generate plan bundle' },
      { method: 'GET', endpoint: '/api/workspaces/{workspaceId}/plan-runs', sourceFile: 'src/api.ts', functionName: 'listPlanRuns', likelyWorkflow: 'Browse plan runs' }
    ],
    stateActions: [
      { file: 'src/App.tsx', stateVariables: ['workspaceId', 'targetId', 'planBundle', 'planRuns'], handlerNames: ['generatePlan', 'openPlanRun'], submitHandlers: ['generatePlan'], loadingStateVariables: ['planLoading'], errorStateVariables: ['planError'] }
    ],
    packageScripts: { dev: 'vite', build: 'vite build' },
    generatedAt: '2026-05-07T00:00:00.000Z'
  }
}
