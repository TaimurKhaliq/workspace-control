import { describe, expect, it } from 'vitest'
import { classifyRuntimeIssues } from '../src/heuristics/issueClassifier.js'
import type { CrawlGraph, SourceGraph } from '../src/types.js'

describe('classifyRuntimeIssues', () => {
  it('turns console and network failures into issues', () => {
    const issues = classifyRuntimeIssues(sourceGraph(), {
      startUrl: 'http://localhost:3000',
      title: 'Demo',
      finalUrl: 'http://localhost:3000',
      states: [{ url: 'http://localhost:3000', title: 'Demo', hash: 'x', visible: [] }],
      actions: [],
      consoleErrors: [{ text: 'boom' }],
      networkFailures: [{ url: '/api/demo', method: 'GET', failureText: '500' }],
      screenshots: [],
      generatedAt: new Date().toISOString()
    })

    expect(issues.map((issue) => issue.type)).toEqual(expect.arrayContaining(['console_error', 'api_error']))
  })

  it('groups repeated learning-status endpoint failures', () => {
    const issues = classifyRuntimeIssues(sourceGraph(), {
      startUrl: 'http://localhost:3000',
      title: 'Demo',
      finalUrl: 'http://localhost:3000',
      states: [{ url: 'http://localhost:3000', title: 'Demo', hash: 'x', visible: [] }],
      actions: [],
      consoleErrors: [
        { text: 'Failed to load resource: 500', location: 'http://localhost/api/repos/petclinic-react/learning-status' },
        { text: 'Failed to load resource: 500', location: 'http://localhost/api/repos/spring-petclinic-react/learning-status' }
      ],
      networkFailures: [],
      screenshots: ['/tmp/screen.png'],
      generatedAt: new Date().toISOString()
    })

    expect(issues.filter((issue) => issue.title.includes('Learning status endpoint'))).toHaveLength(1)
    expect(issues[0].evidence).toEqual(expect.arrayContaining(['count: 2']))
  })

  it('captures API status code and response body evidence', () => {
    const issues = classifyRuntimeIssues(sourceGraph(), {
      startUrl: 'http://localhost:3000',
      title: 'Demo',
      finalUrl: 'http://localhost:3000',
      states: [{ url: 'http://localhost:3000', title: 'Demo', hash: 'x', visible: [] }],
      actions: [],
      consoleErrors: [],
      networkFailures: [{
        url: 'http://localhost/api/workspaces',
        method: 'GET',
        failureText: 'HTTP 500 Internal Server Error',
        statusCode: 500,
        responseBody: '{"detail":"database locked"}'
      }],
      screenshots: ['/tmp/screen.png'],
      generatedAt: new Date().toISOString()
    })

    expect(issues[0].evidence).toEqual(expect.arrayContaining([
      'endpoint_pattern: GET /api/workspaces',
      'method: GET',
      'status_code: 500',
      'response_body: {"detail":"database locked"}'
    ]))
  })
})

function sourceGraph(): SourceGraph {
  return {
    repoPath: '/tmp/demo',
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
    generatedAt: new Date().toISOString()
  }
}
