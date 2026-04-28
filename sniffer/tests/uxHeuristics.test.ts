import { describe, expect, it } from 'vitest'
import { analyzeUxSnapshot, groupIssues, type DomUxElement } from '../src/heuristics/uxHeuristics.js'
import type { Issue, SourceGraph } from '../src/types.js'

const sourceGraph: SourceGraph = {
  repoPath: '/tmp/app',
  framework: 'react',
  buildTool: 'vite',
  routes: [],
  pages: [],
  components: [],
  forms: [],
  uiSurfaces: [],
  sourceWorkflows: [],
  apiCalls: [{ endpoint: '/api/workspaces', method: 'GET', sourceFile: 'src/api.ts' }],
  stateActions: [],
  packageScripts: {},
  generatedAt: 'now'
}

function element(partial: Partial<DomUxElement>): DomUxElement {
  return {
    tag: 'div',
    text: '',
    disabled: false,
    className: '',
    width: 100,
    height: 40,
    scrollWidth: 100,
    clientWidth: 100,
    hasLabel: true,
    ...partial
  }
}

describe('UX heuristics', () => {
  it('detects plus-only buttons without accessible labels', () => {
    const result = analyzeUxSnapshot({
      elements: [element({ tag: 'button', text: '+', hasLabel: false })],
      ids: [],
      bodyText: '+',
      sourceGraph,
      screenshotPath: '/tmp/shot.png'
    })

    expect(result.accessibilityIssues.map((issue) => issue.title)).toContain('Plus-only button needs an accessible label')
  })

  it('detects jammed text and horizontal overflow', () => {
    const result = analyzeUxSnapshot({
      elements: [
        element({ text: 'PetClinic local4/25/2026' }),
        element({ tag: 'div', text: '/Users/demo/a/very/long/path', scrollWidth: 420, clientWidth: 120 })
      ],
      ids: [],
      bodyText: 'PetClinic local4/25/2026',
      sourceGraph,
      screenshotPath: '/tmp/shot.png'
    })

    expect(result.uxIssues.map((issue) => issue.title)).toEqual(expect.arrayContaining([
      'Text appears jammed together',
      'Content overflows horizontally'
    ]))
  })

  it('detects duplicate workspace display text without disambiguation', () => {
    const result = analyzeUxSnapshot({
      elements: [],
      ids: [],
      bodyText: 'PetClinic local PetClinic local',
      sourceGraph,
      screenshotPath: '/tmp/shot.png'
    })

    expect(result.uxIssues.map((issue) => issue.title)).toContain('Workspace names appear duplicated without disambiguation')
  })

  it('does not require copy buttons for empty-state text that only mentions generated outputs', () => {
    const result = analyzeUxSnapshot({
      elements: [
        element({
          tag: 'section',
          className: 'empty-plan',
          text: 'Generate a Plan Bundle to render handoff prompts and Raw JSON.'
        })
      ],
      ids: [],
      bodyText: 'Generate a Plan Bundle to render handoff prompts and Raw JSON.',
      sourceGraph,
      screenshotPath: '/tmp/shot.png'
    })

    expect(result.accessibilityIssues.map((issue) => issue.title)).not.toContain('Generated text lacks an accessible copy action')
  })

  it('requires copy buttons when generated output panels are visible', () => {
    const result = analyzeUxSnapshot({
      elements: [
        element({
          tag: 'article',
          className: 'json-viewer',
          text: 'Raw JSON { "schema_version": "1.0", "recommended_change_set": [] }'
        })
      ],
      ids: [],
      bodyText: 'Raw JSON schema_version recommended_change_set',
      sourceGraph,
      screenshotPath: '/tmp/shot.png'
    })

    expect(result.accessibilityIssues.map((issue) => issue.title)).toContain('Generated text lacks an accessible copy action')
  })

  it('groups repeated UX findings by type and title', () => {
    const issues: Issue[] = [
      { severity: 'low', type: 'layout_issue', title: 'Content overflows horizontally', description: 'a', evidence: ['one'], suggestedFixPrompt: 'fix' },
      { severity: 'medium', type: 'layout_issue', title: 'Content overflows horizontally', description: 'b', evidence: ['two'], suggestedFixPrompt: 'fix' }
    ]

    const grouped = groupIssues(issues)
    expect(grouped).toHaveLength(1)
    expect(grouped[0].severity).toBe('medium')
    expect(grouped[0].evidence).toEqual(['one', 'two'])
  })
})
