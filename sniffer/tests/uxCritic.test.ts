import { describe, expect, it } from 'vitest'
import { buildUxCriticContext, critiqueUx } from '../src/critic/uxCritic.js'
import { MockLlmProvider } from '../src/llm/mockProvider.js'
import type { CrawlGraph, Issue, SourceGraph } from '../src/types.js'

const sourceGraph: SourceGraph = {
  repoPath: '/tmp/app',
  packageName: 'workspace-control-web',
  framework: 'react',
  buildTool: 'vite',
  routes: [],
  pages: [],
  components: [],
  forms: [],
  uiSurfaces: [],
  sourceWorkflows: [{ name: 'Generate plan bundle', sourceFiles: ['src/App.tsx'], evidence: ['Generate Plan'], likelyUserActions: ['Generate Plan'], confidence: 0.9 }],
  apiCalls: [],
  stateActions: [],
  packageScripts: {},
  generatedAt: 'now'
}

const crawlGraph: CrawlGraph = {
  startUrl: 'http://localhost:5173',
  title: 'App',
  finalUrl: 'http://localhost:5173',
  states: [{ url: 'http://localhost:5173', title: 'App', hash: 'abc', visible: [{ kind: 'button', text: 'Generate Plan' }] }],
  actions: [],
  consoleErrors: [],
  networkFailures: [],
  screenshots: ['/tmp/shot.png'],
  generatedAt: 'now'
}

const issue: Issue = {
  severity: 'medium',
  type: 'layout_issue',
  title: 'Text appears jammed together',
  description: 'Jammed date text',
  evidence: ['PetClinic local4/25/2026'],
  suggestedFixPrompt: 'Separate workspace name and date.'
}

describe('UX critic', () => {
  it('builds compact context with workflow, controls, screenshots, and candidate issues', () => {
    const context = buildUxCriticContext({ sourceGraph, crawlGraph, candidateIssues: [issue] })

    expect(context.app_purpose).toContain('workspace-control-web')
    expect(context.workflow?.name).toBe('Generate plan bundle')
    expect(context.runtime_visible_controls[0].text).toBe('Generate Plan')
    expect(context.screenshot_paths).toEqual(['/tmp/shot.png'])
    expect(context.candidate_heuristic_issues).toHaveLength(1)
  })

  it('uses the mock LLM UX critic without requiring real provider calls', async () => {
    const result = await critiqueUx({
      mode: 'llm',
      provider: new MockLlmProvider(),
      sourceGraph,
      crawlGraph,
      candidateIssues: [issue]
    })

    expect(result.uxCriticFindings[0].title).toContain('Mock UX critic')
    expect(result.issues[0].type).toBe('layout_issue')
  })
})
