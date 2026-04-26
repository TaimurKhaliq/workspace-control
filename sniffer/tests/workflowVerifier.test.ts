import { describe, expect, it } from 'vitest'
import { buildWorkflowStatus, workflowIssues } from '../src/runtime/workflowVerifier.js'
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
})

function found(label: string): RuntimeControlCheck {
  return { label, status: 'found', matchedEvidence: [label] }
}

function missing(label: string): RuntimeControlCheck {
  return { label, status: 'missing', matchedEvidence: [], missingReason: 'missing in fixture' }
}
