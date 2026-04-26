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
