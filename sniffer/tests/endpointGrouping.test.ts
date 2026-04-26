import { describe, expect, it } from 'vitest'
import { groupedEndpointIssues, normalizeEndpoint } from '../src/heuristics/endpointGrouping.js'
import type { SourceGraph } from '../src/types.js'

describe('endpoint grouping', () => {
  it('normalizes repo target learning-status endpoints', () => {
    expect(normalizeEndpoint({
      method: 'GET',
      url: 'http://127.0.0.1:5173/api/repos/petclinic-react/learning-status'
    })).toEqual({
      method: 'GET',
      pattern: '/api/repos/{targetId}/learning-status',
      url: 'http://127.0.0.1:5173/api/repos/petclinic-react/learning-status',
      targetId: 'petclinic-react'
    })
  })

  it('groups duplicate endpoint-pattern console errors into one issue', () => {
    const issues = groupedEndpointIssues({
      consoleErrors: [
        { text: 'Failed 500', location: 'http://localhost/api/repos/petclinic-react/learning-status' },
        { text: 'Failed 500', location: 'http://localhost/api/repos/spring-petclinic-react/learning-status' }
      ],
      networkFailures: [],
      sourceGraph: sourceGraph(),
      screenshotPath: '/tmp/screen.png',
      finalUrl: 'http://localhost'
    })

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      type: 'api_error',
      title: 'Learning status endpoint returns 500 for multiple repo targets'
    })
    expect(issues[0].evidence).toEqual(expect.arrayContaining([
      'endpoint_pattern: GET /api/repos/{targetId}/learning-status',
      'count: 2',
      'target_id: petclinic-react',
      'target_id: spring-petclinic-react'
    ]))
  })
})

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
    sourceWorkflows: [],
    apiCalls: [],
    stateActions: [],
    packageScripts: {},
    generatedAt: ''
  }
}
