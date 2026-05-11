import { describe, expect, it } from 'vitest'
import { runProductExperienceCalibration } from '../src/verification/productExperienceCalibration.js'

describe('product experience calibration', () => {
  it('detects missing Run Timeline report context', async () => {
    const result = await runCalibration(['missing-run-context'])
    const target = result.targets[0]

    expect(result.status).toBe('passed')
    expect(target.detectedFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'context_gap',
        title: 'Run Timeline lacks clear run/report context'
      })
    ]))
  })

  it('detects Raw JSON screens without a copy action', async () => {
    const result = await runCalibration(['missing-copy-action'])
    const target = result.targets[0]

    expect(result.status).toBe('passed')
    expect(target.detectedFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'actionability_gap',
        title: 'Raw JSON lacks copy action'
      })
    ]))
  })

  it('detects ambiguous repeated plan-run Reopen actions', async () => {
    const result = await runCalibration(['ambiguous-reopen'])
    const target = result.targets[0]

    expect(result.status).toBe('passed')
    expect(target.detectedFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'runtime_dom_quality',
        type: 'locator_quality_issue',
        title: 'Repeated Reopen buttons have ambiguous accessible names'
      })
    ]))
  })

  it('keeps the good dashboard baseline passing without reportable findings', async () => {
    const result = await runProductExperienceCalibration({
      snifferRoot: process.cwd(),
      mode: 'deterministic',
      fixtureIds: ['good-sniffer-dashboard'],
      includeGood: true
    })
    const target = result.targets[0]

    expect(result.status).toBe('passed')
    expect(target.detectedFindings).toHaveLength(0)
  })
})

function runCalibration(fixtureIds: string[]) {
  return runProductExperienceCalibration({
    snifferRoot: process.cwd(),
    mode: 'deterministic',
    fixtureIds
  })
}
