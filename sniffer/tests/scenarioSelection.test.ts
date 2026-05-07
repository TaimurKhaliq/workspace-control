import { describe, expect, it } from 'vitest'
import { selectScenarioPack, shouldRunBuiltInScenarioPack, shouldRunPromptConsistency } from '../src/runtime/scenarioSelection.js'
import type { AppProfile, RuntimeDomSnapshot, SourceGraph } from '../src/types.js'

describe('evidence-aware scenario selection', () => {
  it('selects the Sniffer dashboard pack and skips workspace-control scenarios', () => {
    const selection = selectScenarioPack({
      scenarioSlug: 'all',
      appProfile: profile('planning_control_panel', 'high'),
      sourceGraph: sourceGraph({ packageName: 'sniffer-ui' }),
      runtimeDomSnapshot: snapshot([
        'Sniffer Dashboard',
        'Summary',
        'Projects',
        'Run Timeline',
        'Scenarios',
        'Crawl Path',
        'Workflow Evidence',
        'Issues',
        'Fix Packets',
        'Screenshots',
        'Graph Explorer',
        'Raw JSON',
        'Settings',
        'Run Audit',
        'Repo path',
        'App URL',
        'Product goal'
      ])
    })

    expect(selection.appSubtype).toBe('sniffer_dashboard')
    expect(selection.scenarioPack).toBe('sniffer_dashboard')
    expect(selection.skippedScenarios.map((item) => item.scenarioId)).toContain('add-repo-target')
    expect(shouldRunBuiltInScenarioPack({
      scenarioSlug: 'all',
      appProfile: profile('planning_control_panel', 'high'),
      scenarioSelection: selection
    })).toBe(false)
  })

  it('selects workspace-control scenarios only with workspace/repo/plan evidence', () => {
    const selection = selectScenarioPack({
      scenarioSlug: 'all',
      appProfile: profile('planning_control_panel', 'high'),
      sourceGraph: sourceGraph({
        packageName: 'workspace-control-web',
        workflows: ['Generate plan bundle', 'Add repo', 'Refresh learning'],
        apiCalls: ['/api/workspaces/{workspaceId}/plan-bundles', '/api/repos/{targetId}/learning-status']
      }),
      runtimeDomSnapshot: snapshot(['Workspaces', 'Repositories', 'Plan Runs', 'Add repository', 'Generate Plan Bundle', 'Refresh learning'])
    })

    expect(selection.scenarioPack).toBe('workspace_control')
    expect(shouldRunBuiltInScenarioPack({
      scenarioSlug: 'all',
      appProfile: profile('planning_control_panel', 'high'),
      scenarioSelection: selection
    })).toBe(true)
  })

  it('does not keep explicit workspace scenarios available in the wrong context', () => {
    const selection = selectScenarioPack({
      scenarioSlug: 'generate-plan-bundle',
      appProfile: profile('planning_control_panel', 'high'),
      sourceGraph: sourceGraph({ packageName: 'sniffer-ui' }),
      runtimeDomSnapshot: snapshot(['Sniffer Dashboard', 'Run Audit', 'Fix Packets', 'Graph Explorer'])
    })

    expect(shouldRunBuiltInScenarioPack({
      scenarioSlug: 'generate-plan-bundle',
      appProfile: profile('planning_control_panel', 'high'),
      scenarioSelection: selection
    })).toBe(false)
  })

  it('skips built-in consistency prompts outside workspace-control context', () => {
    const selection = selectScenarioPack({
      scenarioSlug: 'all',
      appProfile: profile('planning_control_panel', 'high'),
      sourceGraph: sourceGraph({ packageName: 'sniffer-ui' }),
      runtimeDomSnapshot: snapshot(['Sniffer Dashboard', 'Run Audit', 'Fix Packets', 'Graph Explorer'])
    })

    expect(shouldRunPromptConsistency({
      consistencyCheckEnabled: true,
      scenarioSlug: 'all',
      promptsSource: 'built-in',
      appProfile: profile('planning_control_panel', 'high'),
      scenarioSelection: selection
    })).toBe(false)
  })

  it('allows custom consistency prompt files for non-workspace apps', () => {
    expect(shouldRunPromptConsistency({
      consistencyCheckEnabled: true,
      scenarioSlug: 'all',
      promptsSource: '/tmp/prompts.json',
      appProfile: profile('crud_app')
    })).toBe(true)
  })
})

function profile(profile_type: AppProfile['profile_type'], confidence: AppProfile['confidence'] = 'medium'): AppProfile {
  return {
    profile_type,
    confidence,
    evidence: [],
    core_entities: [],
    primary_user_jobs: [],
    expected_navigation_patterns: [],
    expected_workflows: [],
    expected_output_surfaces: []
  }
}

function sourceGraph(input: { packageName?: string; workflows?: string[]; apiCalls?: string[] } = {}): SourceGraph {
  return {
    repoPath: '/tmp/app',
    packageName: input.packageName,
    framework: 'react',
    buildTool: 'vite',
    routes: [],
    pages: [],
    components: [],
    forms: [],
    uiSurfaces: [],
    sourceWorkflows: (input.workflows ?? []).map((name) => ({
      name,
      sourceFiles: ['src/App.tsx'],
      evidence: [name],
      likelyUserActions: [name],
      confidence: 0.8
    })),
    apiCalls: (input.apiCalls ?? []).map((endpoint) => ({ endpoint, sourceFile: 'src/api.ts' })),
    stateActions: [],
    packageScripts: {},
    generatedAt: new Date().toISOString()
  }
}

function snapshot(labels: string[]): RuntimeDomSnapshot {
  const controls = labels.map((label, index) => ({
    id: `control-${index}`,
    kind: 'button' as const,
    tagName: 'button',
    visibleText: label,
    accessibleName: label,
    disabled: false,
    visible: true,
    locatorCandidates: [],
    confidence: 0.9,
    safeAction: { safe: true, reason: 'fixture' }
  }))
  return {
    url: 'http://127.0.0.1:1234',
    title: labels.includes('Sniffer Dashboard') ? 'Sniffer Dashboard' : 'Fixture',
    htmlExcerpt: '',
    domText: labels.join(' '),
    headings: controls.slice(0, 1),
    landmarks: [],
    links: [],
    buttons: controls,
    inputs: [],
    selects: [],
    textareas: [],
    forms: [],
    tables: [],
    tabs: [],
    tablists: [],
    dialogs: [],
    visibleTextBlocks: labels,
    controls,
    capturedAt: new Date().toISOString()
  }
}
