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
