import { describe, expect, it } from 'vitest'
import { artifactUrl } from '../src/components/ScreenshotModal'

describe('artifactUrl', () => {
  it('normalizes project-scoped absolute report screenshots', () => {
    expect(artifactUrl('/tmp/sniffer/reports/sniffer/sample-app/latest/screenshots/state-1.png', 'sample-app'))
      .toBe('/api/reports/latest/artifacts/screenshots%2Fstate-1.png?project=sample-app')
  })

  it('normalizes global latest absolute report screenshots', () => {
    expect(artifactUrl('/tmp/sniffer/reports/sniffer/latest/screenshots/state-1.png'))
      .toBe('/api/reports/latest/artifacts/screenshots%2Fstate-1.png')
  })
})
