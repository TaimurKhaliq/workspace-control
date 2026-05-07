import { describe, expect, it } from 'vitest'
import { inferSuspectedFiles } from '../src/repair/issueMetadata.js'
import type { Issue, SourceGraph } from '../src/types.js'

describe('inferSuspectedFiles', () => {
  it('maps grouped learning-status issue to api client and learning backend files', () => {
    const files = inferSuspectedFiles(issue(), sourceGraph())

    expect(files).toEqual(expect.arrayContaining([
      'src/api.ts',
      'src/App.tsx',
      '../server/routes/learning.py',
      '../server/routes/repos.py'
    ]))
  })

  it('does not suspect semantic route for learning-status without semantic evidence', () => {
    expect(inferSuspectedFiles(issue(), sourceGraph())).not.toContain('../server/routes/semantic.py')
  })

  it('limits UI repair groups to ranked relevant files', () => {
    const graph = sourceGraph()
    graph.uiSurfaces = [
      { file: 'src/components/AddRepoDialog.tsx', surface_type: 'add_repo_form', display_name: 'Add repository', evidence: ['Target id', 'Path or URL'], relatedButtons: ['Add repo'], relatedInputs: ['Target id'], confidence: 0.9 },
      { file: 'src/components/RawJsonView.tsx', surface_type: 'raw_json_panel', display_name: 'Raw JSON', evidence: ['Copy JSON'], relatedButtons: ['Copy JSON'], relatedInputs: [], confidence: 0.8 },
      { file: 'src/components/SettingsPanel.tsx', surface_type: 'unknown_ui_section', display_name: 'Settings', evidence: ['Settings'], relatedButtons: [], relatedInputs: [], confidence: 0.5 }
    ]
    graph.sourceWorkflows = [{
      name: 'Add repo',
      sourceFiles: ['src/components/AddRepoDialog.tsx', 'src/api.ts'],
      evidence: ['Add repository', 'Target id'],
      likelyUserActions: ['Open add repository form'],
      confidence: 0.8
    }]
    const files = inferSuspectedFiles({
      severity: 'medium',
      type: 'workflow_confusion',
      title: 'Add repo target workflow is not reliably discoverable',
      description: 'The Add repo scenario failed to expose expected controls consistently.',
      evidence: ['Missing expected scenario control/result: Target id input'],
      suggestedFixPrompt: 'Fix add repo labels.'
    }, graph)

    expect(files).toContain('src/components/AddRepoDialog.tsx')
    expect(files).not.toContain('src/components/SettingsPanel.tsx')
    expect(files.length).toBeLessThanOrEqual(8)
  })
})

function issue(): Issue {
  return {
    severity: 'high',
    type: 'api_error',
    title: 'Learning status endpoint returns 500 for multiple repo targets',
    description: 'GET /api/repos/{targetId}/learning-status failed.',
    evidence: [
      'endpoint_pattern: GET /api/repos/{targetId}/learning-status',
      'url: http://localhost/api/repos/petclinic-react/learning-status',
      'url: http://localhost/api/repos/spring-petclinic-react/learning-status'
    ],
    suggestedFixPrompt: 'Fix it'
  }
}

function sourceGraph(): SourceGraph {
  return {
    repoPath: '/tmp/web',
    framework: 'react',
    buildTool: 'vite',
    routes: [],
    pages: [],
    components: [],
    forms: [],
    uiSurfaces: [],
    sourceWorkflows: [{
      name: 'Refresh learning',
      sourceFiles: ['src/App.tsx', 'src/api.ts'],
      evidence: ['learningStatus'],
      likelyUserActions: ['Refresh learning'],
      confidence: 0.9
    }],
    apiCalls: [{
      endpoint: '/api/repos/${targetId}/learning-status',
      sourceFile: 'src/api.ts',
      functionName: 'learningStatus',
      likelyWorkflow: 'Refresh learning'
    }],
    stateActions: [],
    packageScripts: {},
    generatedAt: ''
  }
}
