import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveReportArtifact } from '../server/artifacts.js'

describe('report artifact resolution', () => {
  it('resolves existing nested screenshot paths inside the report directory', async () => {
    const reportDir = await fixtureReportDir()
    const nested = path.join(reportDir, 'screenshots', 'generated-scenarios')
    await mkdir(nested, { recursive: true })
    await writeFile(path.join(nested, 'navigation-smoke-nav-1.png'), 'png')

    const resolved = resolveReportArtifact(reportDir, 'screenshots%2Fgenerated-scenarios%2Fnavigation-smoke-nav-1.png')

    expect(resolved.file).toBe(path.join(nested, 'navigation-smoke-nav-1.png'))
  })

  it('blocks path traversal attempts', async () => {
    const reportDir = await fixtureReportDir()

    expect(resolveReportArtifact(reportDir, '..%2Fsecret.txt')).toEqual({ error: 'invalid_path' })
    expect(resolveReportArtifact(reportDir, '%2Ftmp%2Fsecret.txt')).toEqual({ error: 'invalid_path' })
  })
})

async function fixtureReportDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), `sniffer-artifacts-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await mkdir(dir, { recursive: true })
  return dir
}
