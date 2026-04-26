import { describe, expect, it } from 'vitest'
import { CodexCliAgentAdapter, ManualAgentAdapter, MockAgentAdapter } from '../src/repair/agentAdapters.js'
import { mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { FixPacket } from '../src/types.js'

describe('agent adapters', () => {
  it('manual adapter prints instructions without applying changes', async () => {
    const result = await new ManualAgentAdapter().applyFix(packet())

    expect(result.status).toBe('not_run')
    expect(result.success).toBe(false)
    expect(result.stdout).toContain('Manual fix required')
    expect(result.commandsRun).toEqual([])
  })

  it('mock adapter reports applied without external commands', async () => {
    const result = await new MockAgentAdapter().applyFix(packet())

    expect(result.status).toBe('applied')
    expect(result.success).toBe(true)
    expect(result.stdout).toContain('Mock applied')
  })

  it('codex CLI adapter builds a safe command without real Codex', async () => {
    const oldCommand = process.env.SNIFFER_CODEX_COMMAND
    const oldArgs = process.env.SNIFFER_CODEX_ARGS
    const attemptDir = path.join(os.tmpdir(), `sniffer-codex-test-${randomUUID()}`)
    await mkdir(attemptDir, { recursive: true })
    process.env.SNIFFER_CODEX_COMMAND = 'true'
    process.env.SNIFFER_CODEX_ARGS = ''
    try {
      const result = await new CodexCliAgentAdapter().applyFix(packet(attemptDir), { attemptDir })
      expect(result.status).toBe('applied')
      expect(result.commandsRun[0]).toContain('true')
      expect(result.notes[0]).toContain('codex_prompt.md')
    } finally {
      if (oldCommand === undefined) delete process.env.SNIFFER_CODEX_COMMAND
      else process.env.SNIFFER_CODEX_COMMAND = oldCommand
      if (oldArgs === undefined) delete process.env.SNIFFER_CODEX_ARGS
      else process.env.SNIFFER_CODEX_ARGS = oldArgs
    }
  })
})

function packet(root = '/tmp/repo'): FixPacket {
  return {
    issue_id: 'issue-1',
    title: 'Fix thing',
    repo_path: root,
    repair_root: root,
    allowed_paths: ['src/'],
    working_directory: root,
    evidence_paths: [],
    suspected_files: ['src/App.tsx'],
    prompt: 'Fix the thing.',
    constraints: ['Do not run destructive actions.'],
    verification_command: 'npm test',
    pass_conditions: ['Issue disappears']
  }
}
