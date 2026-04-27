import { describe, expect, it } from 'vitest'
import { markInconclusiveScenarioFindings, triageIssues } from '../src/heuristics/issueTriage.js'
import type { Issue, RuntimeWorkflowVerification, SourceGraph } from '../src/types.js'

describe('issue triage', () => {
  it('groups Add repo missing controls into one workflow repair group', () => {
    const groups = triageIssues({
      rawFindings: [
        scenarioIssue('Add repo target', 'Target id input'),
        scenarioIssue('Add repo target', 'Path or URL input')
      ],
      sourceGraph: graph(),
      workflowVerifications: []
    })

    expect(groups).toHaveLength(1)
    expect(groups[0].title).toBe('Add repo target workflow is not reliably discoverable')
    expect(groups[0].description).toContain('Target id input')
    expect(groups[0].description).toContain('Path or URL input')
  })

  it('groups plan output tabs, raw JSON, and copy prompt failures', () => {
    const groups = triageIssues({
      rawFindings: [
        scenarioIssue('Review plan bundle tabs', 'Overview'),
        scenarioIssue('Review plan bundle tabs', 'Raw JSON'),
        scenarioIssue('Copy handoff prompt', 'Copy prompt button')
      ],
      sourceGraph: graph(),
      workflowVerifications: []
    })

    expect(groups).toHaveLength(1)
    expect(groups[0].title).toBe('Plan output review/copy workflow is incomplete or not discoverable')
    expect(groups[0].description).toContain('Overview')
    expect(groups[0].description).toContain('Copy prompt button')
  })

  it('groups layout readability issues', () => {
    const groups = triageIssues({
      rawFindings: [
        raw('layout_issue', 'Text appears jammed together'),
        raw('layout_issue', 'Content overflows horizontally'),
        raw('layout_issue', 'Long paths are hard to scan')
      ],
      sourceGraph: graph(),
      workflowVerifications: []
    })

    expect(groups).toHaveLength(1)
    expect(groups[0].title).toBe('Repository/workspace lists are hard to scan due to cramped text and overflow')
    expect(groups[0].evidence).toEqual(expect.arrayContaining(['raw_findings: 3']))
  })

  it('marks scenario findings inconclusive when workflow verification found the control earlier', () => {
    const findings = markInconclusiveScenarioFindings([
      scenarioIssue('Add repo target', 'Target id input')
    ], [verification('Add repo', 'Target id input')])

    expect(findings[0].type).toBe('inconclusive')
    expect(findings[0].evidence.join('\n')).toContain('scenario locator may be too strict')
  })
})

function scenarioIssue(scenario: string, control: string): Issue {
  return {
    issue_id: `${scenario}-${control}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    severity: 'medium',
    type: 'workflow_confusion',
    title: `Scenario failed: ${scenario}`,
    description: 'Scenario failed.',
    evidence: [`Missing expected scenario control/result: ${control}`],
    suggestedFixPrompt: 'Fix scenario'
  }
}

function raw(type: Issue['type'], title: string): Issue {
  return { issue_id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), severity: 'medium', type, title, description: title, evidence: [title], suggestedFixPrompt: title }
}

function verification(name: string, control: string): RuntimeWorkflowVerification {
  return {
    name,
    sourceFiles: ['src/App.tsx'],
    status: 'verified',
    evidence: [control],
    attemptedInteractions: [],
    controls: [{ label: control, status: 'found', matchedEvidence: [control] }],
    issues: []
  }
}

function graph(): SourceGraph {
  return {
    repoPath: '/tmp/app',
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
    generatedAt: 'now'
  }
}
