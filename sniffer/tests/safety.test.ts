import { describe, expect, it } from 'vitest'
import { assertSafeFixPacket } from '../src/repair/safety.js'
import type { FixPacket } from '../src/types.js'

describe('repair safety policy', () => {
  it('blocks destructive protected-data packets by default', () => {
    expect(() => assertSafeFixPacket({
      ...packet(),
      prompt: 'Delete all workspaces and reset repos.'
    })).toThrow(/Unsafe fix packet/)
  })

  it('allows non-destructive packets', () => {
    expect(() => assertSafeFixPacket(packet())).not.toThrow()
  })
})

function packet(): FixPacket {
  return {
    issue_id: 'safe',
    title: 'Fix UI label',
    repo_path: '/tmp/repo',
    working_directory: '/tmp/repo',
    evidence_paths: [],
    suspected_files: ['src/App.tsx'],
    prompt: 'Fix a missing UI label.',
    constraints: ['Do not run destructive actions.'],
    verification_command: 'npm test',
    pass_conditions: ['Label appears']
  }
}
