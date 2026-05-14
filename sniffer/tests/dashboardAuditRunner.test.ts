import { describe, expect, it } from 'vitest'
import { buildDashboardAuditCommand, parseProgressEvent } from '../server/auditRunner.js'

describe('dashboard audit runner command builder', () => {
  it('includes generated scenario execution for fast deterministic audits', () => {
    const built = buildDashboardAuditCommand({
      projectId: 'sniffer',
      auditDepth: 'fast'
    }, { providerConfigured: false })

    expect(built.cliArgs).toEqual(expect.arrayContaining([
      'audit',
      '--project', 'sniffer',
      '--discovery-mode', 'hybrid',
      '--scenario', 'all',
      '--crawl-mode', 'safe',
      '--execute-generated-scenarios',
      '--critic-mode', 'deterministic',
      '--ux-critic', 'deterministic',
      '--intent-mode', 'deterministic',
      '--provider', 'auto'
    ]))
    expect(built.cliArgs).not.toContain('--product-experience-critic')
  })

  it('builds deep LLM product audit commands', () => {
    const built = buildDashboardAuditCommand({
      projectId: 'sniffer',
      auditDepth: 'deep'
    }, { providerConfigured: true })

    expect(built.cliArgs).toEqual(expect.arrayContaining([
      '--project', 'sniffer',
      '--discovery-mode', 'hybrid',
      '--scenario', 'all',
      '--crawl-mode', 'deep',
      '--execute-generated-scenarios',
      '--product-experience-critic', 'llm',
      '--provider', 'openai-compatible',
      '--critic-mode', 'deterministic',
      '--ux-critic', 'deterministic',
      '--intent-mode', 'deterministic'
    ]))
  })

  it('defaults to deep mode when provider is configured', () => {
    const built = buildDashboardAuditCommand({ projectId: 'sniffer' }, { providerConfigured: true })

    expect(built.auditDepth).toBe('deep')
    expect(built.provider).toBe('openai-compatible')
    expect(built.productExperienceCritic).toBe('llm')
    expect(built.cliArgs).toEqual(expect.arrayContaining(['--crawl-mode', 'deep']))
  })

  it('passes live crawl options through when requested', () => {
    const built = buildDashboardAuditCommand({
      projectId: 'sniffer',
      auditDepth: 'fast',
      crawlMode: 'live',
      allowLongRunningActions: true,
      liveObserveMs: 15000,
      livePollMs: 250,
      maxDepth: 5
    }, { providerConfigured: false })

    expect(built.cliArgs).toEqual(expect.arrayContaining([
      '--crawl-mode', 'live',
      '--allow-long-running-actions',
      '--live-observe-ms', '15000',
      '--live-poll-ms', '250',
      '--max-depth', '5'
    ]))
  })

  it('does not require LLM configuration for fast audits', () => {
    expect(() => buildDashboardAuditCommand({
      repoPath: '/tmp/app',
      url: 'http://localhost:3000',
      auditDepth: 'fast'
    }, { providerConfigured: false })).not.toThrow()
  })

  it('returns a clear error when LLM mode is requested without provider configuration', () => {
    expect(() => buildDashboardAuditCommand({
      projectId: 'sniffer',
      auditDepth: 'deep'
    }, { providerConfigured: false })).toThrow(/LLM provider is not configured/)
  })

  it('parses structured CLI progress events', () => {
    const event = parseProgressEvent('[sniffer-progress] {"type":"phase_started","phase":"scenario execution","message":"Executing generated scenarios.","timestamp":"2026-05-11T12:00:00.000Z"}')

    expect(event).toEqual({
      type: 'phase_started',
      phase: 'scenario execution',
      message: 'Executing generated scenarios.',
      timestamp: '2026-05-11T12:00:00.000Z'
    })
  })
})
