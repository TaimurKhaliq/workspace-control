import { describe, expect, it } from 'vitest'
import { buildWorkflowStatus, genericWorkflowLocatorLabels, workflowIssues } from '../src/runtime/workflowVerifier.js'
import type { RuntimeControlCheck } from '../src/types.js'

describe('workflow verification helpers', () => {
  it('classifies workflow status from control checks', () => {
    expect(buildWorkflowStatus([
      found('Add repo'),
      found('Target id')
    ])).toBe('verified')

    expect(buildWorkflowStatus([
      found('Add repo'),
      missing('Path or URL input')
    ])).toBe('partial')

    expect(buildWorkflowStatus([
      missing('Generate Plan button')
    ])).toBe('missing')
  })

  it('turns missing controls into runtime issues', () => {
    const issues = workflowIssues('Add repo', [
      found('Add repo'),
      missing('Path or URL input')
    ])

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      type: 'missing_form_control',
      title: 'Missing runtime control for Add repo'
    })
  })

  it('derives target labels from generic dashboard workflow actions', () => {
    expect(genericWorkflowLocatorLabels('Open Raw JSON')).toContain('Raw JSON')
    expect(genericWorkflowLocatorLabels('Open Fix Packets')).toContain('Fix Packets')
    expect(genericWorkflowLocatorLabels('Inspect timeline, scenarios, crawl path, issues, and evidence')).toEqual(expect.arrayContaining([
      'timeline',
      'scenarios',
      'crawl path',
      'issues'
    ]))
    expect(genericWorkflowLocatorLabels('Inspect raw report payload')).toContain('Raw JSON')
    expect(genericWorkflowLocatorLabels('Copy repair/fix prompts')).toEqual(expect.arrayContaining(['Fix Packets', 'Copy prompt']))
    expect(genericWorkflowLocatorLabels('Run Sniffer audit')).toContain('Run Audit')
  })
})

function found(label: string): RuntimeControlCheck {
  return { label, status: 'found', matchedEvidence: [label] }
}

function missing(label: string): RuntimeControlCheck {
  return { label, status: 'missing', matchedEvidence: [], missingReason: 'missing in fixture' }
}
