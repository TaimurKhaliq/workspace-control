import { mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import type { RepairAttempt } from '../types.js'
import { writeJson } from '../reporting/json.js'
import { createAgentAdapter } from './agentAdapters.js'
import { loadFixPacket } from './fixPackets.js'
import { assertSafeFixPacket } from './safety.js'

export async function applyFix(input: {
  issueId: string
  reportPath: string
  agentName?: string
  allowDestructive?: boolean
  iteration?: number
}): Promise<RepairAttempt> {
  const packet = await loadFixPacket(input.reportPath, input.issueId)
  assertSafeFixPacket(packet, input.allowDestructive)
  const reportDir = path.dirname(path.resolve(input.reportPath))
  const attemptDir = path.join(reportDir, 'repair_attempts', input.issueId, `attempt-${input.iteration ?? 1}`)
  await mkdir(attemptDir, { recursive: true })

  const gitStatusBefore = git(['status', '--short'], packet.working_directory)
  const adapter = createAgentAdapter(input.agentName)
  const agentResult = await adapter.applyFix(packet, { allowDestructive: input.allowDestructive, attemptDir })
  const gitDiffAfter = git(['diff', '--', packet.repo_path], packet.working_directory)

  const attempt: RepairAttempt = {
    issue_id: input.issueId,
    iteration: input.iteration ?? 1,
    agentResult,
    gitStatusBefore,
    gitDiffAfter,
    createdAt: new Date().toISOString()
  }

  await writeJson(path.join(attemptDir, 'agent_result.json'), agentResult)
  await writeFile(path.join(attemptDir, 'git_status_before.txt'), gitStatusBefore, 'utf8')
  await writeFile(path.join(attemptDir, 'git_diff_after.patch'), gitDiffAfter, 'utf8')
  await writeJson(path.join(attemptDir, 'repair_attempt.json'), attempt)
  return attempt
}

function git(args: string[], cwd: string): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  return `${result.stdout ?? ''}${result.stderr ?? ''}`
}
