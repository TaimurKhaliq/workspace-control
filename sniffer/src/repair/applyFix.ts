import { mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import type { RepairAttempt } from '../types.js'
import { writeJson } from '../reporting/json.js'
import { createAgentAdapter } from './agentAdapters.js'
import { loadFixPacket } from './fixPackets.js'
import { assertSafeFixPacket } from './safety.js'
import { assertChangedFilesAllowed } from './pathPolicy.js'

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
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const attemptDir = path.join(reportDir, 'repair_attempts', input.issueId, timestamp)
  await mkdir(attemptDir, { recursive: true })

  const gitStatusBefore = git(['status', '--short'], packet.repair_root)
  const adapter = createAgentAdapter(input.agentName)
  const agentResult = await adapter.applyFix(packet, { allowDestructive: input.allowDestructive, attemptDir })
  const gitStatusAfter = git(['status', '--short'], packet.repair_root)
  const gitDiffAfter = git(['diff', '--', ...packet.allowed_paths], packet.repair_root)
  const changedFiles = changedFilesChangedBetween(gitStatusBefore, gitStatusAfter)
  assertChangedFilesAllowed(changedFiles, packet)
  const gitDiffSummary = git(['diff', '--stat', '--', ...packet.allowed_paths], packet.repair_root)
  agentResult.changedFiles = changedFiles
  agentResult.modifiedFiles = changedFiles
  agentResult.diffSummary = gitDiffSummary

  const attempt: RepairAttempt = {
    issue_id: input.issueId,
    iteration: input.iteration ?? 1,
    agentResult,
    gitStatusBefore,
    gitStatusAfter,
    gitDiffAfter,
    gitDiffSummary,
    commandsRun: agentResult.commandsRun,
    createdAt: new Date().toISOString(),
    attemptDir
  }

  await writeJson(path.join(attemptDir, 'agent_result.json'), agentResult)
  await writeFile(path.join(attemptDir, 'git_status_before.txt'), gitStatusBefore, 'utf8')
  await writeFile(path.join(attemptDir, 'git_status_after.txt'), gitStatusAfter, 'utf8')
  await writeFile(path.join(attemptDir, 'git_diff_after.patch'), gitDiffAfter, 'utf8')
  await writeFile(path.join(attemptDir, 'git_diff_summary.txt'), gitDiffSummary, 'utf8')
  await writeJson(path.join(attemptDir, 'repair_attempt.json'), attempt)
  return attempt
}

function git(args: string[], cwd: string): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  return `${result.stdout ?? ''}${result.stderr ?? ''}`
}

function changedFilesFromStatus(status: string): string[] {
  return status
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^.. /, ''))
    .map((line) => line.includes(' -> ') ? line.split(' -> ').at(-1) ?? line : line)
}

function changedFilesChangedBetween(before: string, after: string): string[] {
  const beforeMap = statusMap(before)
  const afterMap = statusMap(after)
  return [...afterMap.entries()]
    .filter(([file, status]) => beforeMap.get(file) !== status)
    .map(([file]) => file)
}

function statusMap(status: string): Map<string, string> {
  const map = new Map<string, string>()
  status
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .forEach((line) => {
      const code = line.slice(0, 2)
      const file = line.slice(3)
      const normalized = file.includes(' -> ') ? file.split(' -> ').at(-1) ?? file : file
      map.set(normalized, code)
    })
  return map
}
