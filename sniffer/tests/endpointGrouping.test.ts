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

  it('normalizes and groups report screenshot artifact failures', () => {
    expect(normalizeEndpoint({
      method: 'GET',
      url: 'http://127.0.0.1:4877/api/reports/latest/artifacts/screenshots%2Fstate-8.png?project=workspace-control'
    })).toEqual({
      method: 'GET',
      pattern: '/api/reports/latest/artifacts/{artifactPath}',
      url: 'http://127.0.0.1:4877/api/reports/latest/artifacts/screenshots%2Fstate-8.png?project=workspace-control',
      artifactPath: 'screenshots/state-8.png'
    })

    const issues = groupedEndpointIssues({
      consoleErrors: [],
      networkFailures: [
        {
          url: 'http://127.0.0.1:4877/api/reports/latest/artifacts/screenshots%2Fstate-8.png?project=workspace-control',
          method: 'GET',
          failureText: 'File not found',
          statusCode: 404,
          responseBody: '{ "error": "File not found" }'
        },
        {
          url: 'http://127.0.0.1:4877/api/reports/latest/artifacts/screenshots%2Fgenerated-scenarios%2Fnavigation-smoke-initial.png?project=workspace-control',
          method: 'GET',
          failureText: 'File not found',
          statusCode: 404,
          responseBody: '{ "error": "File not found" }'
        }
      ],
      sourceGraph: sourceGraph(),
      screenshotPath: '/tmp/screen.png',
      finalUrl: 'http://localhost'
    })

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      type: 'api_error',
      title: 'Screenshot artifact route returns 404 for captured report screenshots'
    })
    expect(issues[0].evidence).toEqual(expect.arrayContaining([
      'endpoint_pattern: GET /api/reports/latest/artifacts/{artifactPath}',
      'count: 2',
      'artifact_path: screenshots/state-8.png',
      'artifact_path: screenshots/generated-scenarios/navigation-smoke-initial.png',
      'status_code: 404',
      'response_body: { "error": "File not found" }'
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
