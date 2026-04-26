import { describe, expect, it } from 'vitest'
import { ManualAgentAdapter, MockAgentAdapter } from '../src/repair/agentAdapters.js'
import type { FixPacket } from '../src/types.js'

describe('agent adapters', () => {
  it('manual adapter prints instructions without applying changes', async () => {
    const result = await new ManualAgentAdapter().applyFix(packet())

    expect(result.status).toBe('not_run')
    expect(result.stdout).toContain('Manual fix required')
    expect(result.commandsRun).toEqual([])
  })

  it('mock adapter reports applied without external commands', async () => {
    const result = await new MockAgentAdapter().applyFix(packet())

    expect(result.status).toBe('applied')
    expect(result.stdout).toContain('Mock applied')
  })
})

function packet(): FixPacket {
  return {
    issue_id: 'issue-1',
    title: 'Fix thing',
    repo_path: '/tmp/repo',
    working_directory: '/tmp/repo',
    evidence_paths: [],
    suspected_files: ['src/App.tsx'],
    prompt: 'Fix the thing.',
    constraints: ['Do not run destructive actions.'],
    verification_command: 'npm test',
    pass_conditions: ['Issue disappears']
  }
}
