import { describe, expect, it } from 'vitest'
import { MockLlmProvider } from '../src/llm/mockProvider.js'
import { runProductExperienceCalibration, runProductExperienceModelComparison } from '../src/verification/productExperienceCalibration.js'

describe('product experience calibration', () => {
  it('detects missing Run Timeline report context', async () => {
    const result = await runCalibration(['missing-run-context'])
    const target = result.targets[0]

    expect(result.status).toBe('passed')
    expect(target.detectedFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'context_gap',
        title: 'Run Timeline lacks clear run/report context',
        ruleIds: expect.arrayContaining(['run_report_context_clarity'])
      })
    ]))
    expect(result.rubricVersion).toBe('product-experience.v1')
  })

  it('detects Raw JSON screens without a copy action', async () => {
    const result = await runCalibration(['missing-copy-action'])
    const target = result.targets[0]

    expect(result.status).toBe('passed')
    expect(target.detectedFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'actionability_gap',
        title: 'Raw JSON lacks copy action',
        ruleIds: expect.arrayContaining(['raw_json_copy_export_action'])
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
        title: 'Repeated Reopen buttons have ambiguous accessible names',
        ruleIds: expect.arrayContaining(['repeated_row_action_accessibility'])
      })
    ]))
  })

  it('detects screenshot galleries without scenario or action context', async () => {
    const result = await runCalibration(['screenshot-gallery-no-context'])
    const target = result.targets[0]

    expect(result.status).toBe('passed')
    expect(target.detectedFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'evidence_gap',
        title: 'Screenshots view does not explain screenshot context',
        ruleIds: expect.arrayContaining(['screenshot_gallery_context'])
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

  it('writes model comparison results from mocked providers', async () => {
    const result = await runProductExperienceModelComparison({
      snifferRoot: process.cwd(),
      models: ['mock-a', 'mock-b'],
      providerName: 'mock',
      mode: 'llm',
      includeGood: true,
      fixtureIds: ['missing-copy-action', 'good-sniffer-dashboard'],
      providerFactory: () => new MockLlmProvider()
    })

    expect(result.status).toBe('passed')
    expect(result.rubricVersion).toBe('product-experience.v1')
    expect(result.models).toHaveLength(2)
    expect(result.models[0]).toEqual(expect.objectContaining({
      model: 'mock-a',
      passRate: 1
    }))
    expect(result.reportMarkdownPath).toContain('model_comparison.md')
  })
})

function runCalibration(fixtureIds: string[]) {
  return runProductExperienceCalibration({
    snifferRoot: process.cwd(),
    mode: 'deterministic',
    fixtureIds
  })
}
