import { describe, expect, it } from 'vitest'
import { artifactUrl, parseArtifactPath, projectIdFromReportArtifacts } from '../src/artifacts'

describe('artifactUrl', () => {
  it('normalizes project-scoped absolute report screenshots', () => {
    expect(artifactUrl('/tmp/sniffer/reports/sniffer/sample-app/latest/screenshots/state-1.png', 'workspace-control'))
      .toBe('/api/reports/latest/artifacts/screenshots%2Fstate-1.png?project=sample-app')
  })

  it('normalizes global latest absolute report screenshots', () => {
    expect(artifactUrl('/tmp/sniffer/reports/sniffer/latest/screenshots/state-1.png'))
      .toBe('/api/reports/latest/artifacts/screenshots%2Fstate-1.png')
  })

  it('preserves nested screenshot artifact paths', () => {
    expect(artifactUrl('screenshots/generated-scenarios/navigation-smoke-nav-1.png', 'ad_hoc'))
      .toBe('/api/reports/latest/artifacts/screenshots%2Fgenerated-scenarios%2Fnavigation-smoke-nav-1.png?project=ad_hoc')
  })

  it('infers ad hoc report context from absolute report screenshot paths', () => {
    expect(projectIdFromReportArtifacts([
      '/Users/me/sniffer/reports/sniffer/ad_hoc/latest/screenshots/state-8.png'
    ], 'workspace-control')).toBe('ad_hoc')
  })

  it('parses relative and absolute report paths without exposing local paths', () => {
    expect(parseArtifactPath('/Users/me/reports/sniffer/ad_hoc/latest/screenshots/state-8.png')).toMatchObject({
      projectId: 'ad_hoc',
      relativePath: 'screenshots/state-8.png',
      isProjectScoped: true
    })
  })
})
