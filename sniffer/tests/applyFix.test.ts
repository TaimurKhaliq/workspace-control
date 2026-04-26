import { describe, expect, it } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { applyFix } from '../src/repair/applyFix.js'
import type { FixPacket } from '../src/types.js'

describe('applyFix', () => {
  it('writes a repair attempt record', async () => {
    const root = path.join(os.tmpdir(), `sniffer-apply-${randomUUID()}`)
    await mkdir(path.join(root, 'reports', 'sniffer', 'latest', 'fix_packets'), { recursive: true })
    spawnSync('git', ['init'], { cwd: root })
    const reportPath = path.join(root, 'reports', 'sniffer', 'latest', 'latest_report.json')
    await writeFile(reportPath, '{}')
    await writeFile(path.join(root, 'reports', 'sniffer', 'latest', 'fix_packets', 'issue-1.json'), JSON.stringify(packet(root), null, 2))

    const result = await applyFix({ issueId: 'issue-1', reportPath, agentName: 'mock' })

    expect(result.agentResult.status).toBe('applied')
    const attempt = JSON.parse(await readFile(path.join(result.attemptDir, 'repair_attempt.json'), 'utf8'))
    expect(attempt.issue_id).toBe('issue-1')
  })
})

function packet(root: string): FixPacket {
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
