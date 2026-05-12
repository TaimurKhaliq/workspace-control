import { mkdtemp, readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateRuntimeFixtures } from '../src/calibration/runtimeFixtureGenerator.js'
import { runRuntimeBrokenUiCalibration } from '../src/verification/runtimeBrokenUiCalibration.js'

const snifferRoot = process.cwd()

describe('runtime broken UI calibration', () => {
  it('generates deterministic runtime fixture specs and oracle files', async () => {
    const root = await tempReportRoot()
    const first = await generateRuntimeFixtures({ snifferRoot: root, count: 8, seed: 1234 })
    const second = await generateRuntimeFixtures({ snifferRoot: root, count: 8, seed: 1234 })
    expect(first.fixtures.map((fixture) => fixture.id)).toEqual(second.fixtures.map((fixture) => fixture.id))
    expect(first.fixtures).toHaveLength(13)
    expect(first.fixtures.filter((fixture) => fixture.goodBaseline)).toHaveLength(5)
    expect(first.fixtures.find((fixture) => fixture.goodBaseline)?.expectedFindings).toEqual([])
    const fixture = first.fixtures[0]
    await expect(stat(path.join(root, 'fixtures', 'runtime-broken-ui', 'generated', fixture.id, 'sniffer.expected.json'))).resolves.toBeTruthy()
    await expect(readFile(path.join(root, 'fixtures', 'runtime-broken-ui', 'generated', 'manifest.json'), 'utf8')).resolves.toContain('"seed": 1234')
  })

  it('compares oracle expectations and writes reports', async () => {
    const root = await tempReportRoot()
    const result = await runRuntimeBrokenUiCalibration({
      snifferRoot,
      fixtureIds: ['broken-navigation-tab', 'api-500', 'infinite-loading', 'ambiguous-repeated-row-action', 'good-baseline']
    })

    expect(result.status).toBe('passed')
    expect(result.targets).toHaveLength(5)
    expect(result.targets.find((target) => target.fixture === 'broken-navigation-tab')?.detectedScenarioFailures[0]?.assertion).toContain('Details tab')
    expect(result.targets.find((target) => target.fixture === 'api-500')?.detectedFindings.some((finding) => finding.type === 'api_error')).toBe(true)
    expect(result.targets.find((target) => target.fixture === 'infinite-loading')?.detectedFindings.some((finding) => finding.type === 'loading_state_stuck')).toBe(true)
    expect(result.targets.find((target) => target.fixture === 'ambiguous-repeated-row-action')?.detectedFindings.some((finding) => finding.type === 'locator_quality_issue')).toBe(true)
    expect(result.targets.find((target) => target.fixture === 'good-baseline')?.detectedFindings).toEqual([])
    await expect(readFile(result.reportJsonPath, 'utf8')).resolves.toContain('latest_runtime_calibration')
    await expect(readFile(result.reportMarkdownPath, 'utf8')).resolves.toContain('Runtime Broken UI Calibration')
    expect(root).toBeTruthy()
  }, 60_000)

  it('detects a runtime exception after click', async () => {
    const result = await runRuntimeBrokenUiCalibration({
      snifferRoot,
      fixtureIds: ['runtime-exception-after-click']
    })
    const target = result.targets[0]
    expect(target.status).toBe('passed')
    expect(target.consoleErrors).toBeGreaterThan(0)
    expect(target.detectedFindings.some((finding) => finding.type === 'console_error')).toBe(true)
  }, 30_000)

  it('serves and audits a generated runtime exception fixture', async () => {
    const root = await tempReportRoot()
    const result = await runRuntimeBrokenUiCalibration({
      snifferRoot: root,
      fixtureIds: ['runtime-click-throws'],
      count: 40,
      seed: 1234
    })
    const target = result.targets[0]
    expect(target.status).toBe('passed')
    expect(target.template).toBe('runtime-exception')
    expect(target.consoleErrors).toBeGreaterThan(0)
    expect(target.detectedFindings.some((finding) => finding.type === 'console_error')).toBe(true)
  }, 30_000)
})

async function tempReportRoot(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), 'sniffer-runtime-calibration-'))
}
