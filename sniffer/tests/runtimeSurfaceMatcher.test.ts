import { describe, expect, it } from 'vitest'
import { matchRuntimeSurfaces } from '../src/heuristics/runtimeSurfaceMatcher.js'
import type { CrawlGraph, SourceGraph } from '../src/types.js'

describe('matchRuntimeSurfaces', () => {
  it('matches source surfaces to runtime DOM evidence and reports partial matches', () => {
    const matches = matchRuntimeSurfaces(sourceGraph(), crawlGraph())

    expect(matches[0]).toMatchObject({
      surface_type: 'workspace_selector',
      seenInRuntime: 'yes',
      matchingDomEvidence: expect.arrayContaining(['Workspace', 'New workspace'])
    })
    expect(matches[1]).toMatchObject({
      surface_type: 'add_repo_form',
      seenInRuntime: 'partial',
      missingControls: expect.arrayContaining(['Path or URL'])
    })
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
    uiSurfaces: [
      {
        file: 'src/App.tsx',
        surface_type: 'workspace_selector',
        display_name: 'Workspace selector/creation',
        evidence: ['Workspace'],
        relatedButtons: ['New workspace'],
        relatedInputs: ['Workspace name'],
        confidence: 0.9
      },
      {
        file: 'src/App.tsx',
        surface_type: 'add_repo_form',
        display_name: 'Add repo form',
        evidence: ['Add repo'],
        relatedButtons: ['Add repo'],
        relatedInputs: ['Target id', 'Path or URL'],
        confidence: 0.9
      }
    ],
    sourceWorkflows: [],
    apiCalls: [],
    stateActions: [],
    packageScripts: {},
    generatedAt: ''
  }
}

function crawlGraph(): CrawlGraph {
  return {
    startUrl: 'http://localhost:3000',
    title: 'Demo',
    finalUrl: 'http://localhost:3000',
    states: [{
      url: 'http://localhost:3000',
      title: 'Demo',
      hash: 'abc',
      visible: [
        { kind: 'input', text: 'Workspace', name: 'Workspace name' },
        { kind: 'button', text: 'New workspace' },
        { kind: 'button', text: 'Add repo' },
        { kind: 'input', name: 'Target id' }
      ]
    }],
    actions: [],
    consoleErrors: [],
    networkFailures: [],
    screenshots: [],
    generatedAt: ''
  }
}
