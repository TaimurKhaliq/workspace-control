import { access, readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { FixPacket, Issue, RepairAttempt, SnifferReport, VerificationResult } from '../src/types.js'

export type RepairStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export type RepairAgent = 'manual' | 'codex'
export type RepairMode = 'repair-proof' | 'apply-fix'

export interface RepairIssueSummary {
  issueId: string
  title: string
  severity: string
  type: string
  status: string
  evidenceSummary: string[]
  suspectedFiles: string[]
  screenshotPath?: string
  screenshotArtifactUrl?: string
  hasFixPacket: boolean
  repairStatus?: string
}

export interface FixPacketDetail {
  issueId: string
  markdown: string
  json?: FixPacket
  suspectedFiles: string[]
  prompt: string
  constraints: string[]
  verificationCommand: string
  passConditions: string[]
  path: {
    markdown: string
    json: string
  }
}

export interface RepairAttemptSummary {
  repairRunId?: string
  issueId: string
  agent: string
  mode?: RepairMode
  status: string
  agentInvoked: boolean
  changedFiles: string[]
  diffSummary: string
  verification: {
    status: 'not_run' | 'passed' | 'failed' | 'inconclusive'
    command?: string
    summary?: string
  }
  createdAt: string
  updatedAt: string
  attemptDir: string
  fixPacketPath?: string
}

export interface RepairCommandSpec {
  cliArgs: string[]
  phase: string
  commandSummary: string
}

export function summarizeIssues(report: SnifferReport, reportDir: string, projectId?: string): RepairIssueSummary[] {
  return (report.issues ?? []).map((issue) => {
    const issueId = issue.issue_id ?? slugIssue(issue)
    const screenshotArtifactUrl = issue.screenshotPath
      ? artifactUrlForPath(reportDir, issue.screenshotPath, projectId)
      : undefined
    return {
      issueId,
      title: issue.title,
      severity: issue.severity,
      type: issue.type,
      status: issue.status ?? 'open',
      evidenceSummary: (issue.evidence ?? []).slice(0, 4),
      suspectedFiles: issue.suspected_files ?? [],
      screenshotPath: issue.screenshotPath,
      screenshotArtifactUrl,
      hasFixPacket: fixPacketExistsSyncish(reportDir, issueId),
      repairStatus: undefined
    }
  })
}

export async function attachRepairStatuses(issues: RepairIssueSummary[], reportDir: string): Promise<RepairIssueSummary[]> {
  const histories = await listRepairHistory(reportDir)
  const latestByIssue = new Map<string, RepairAttemptSummary>()
  for (const item of histories) {
    const current = latestByIssue.get(item.issueId)
    if (!current || item.updatedAt > current.updatedAt) latestByIssue.set(item.issueId, item)
  }
  return issues.map((issue) => ({ ...issue, repairStatus: latestByIssue.get(issue.issueId)?.status }))
}

export async function readFixPacketDetail(reportDir: string, issueId: string): Promise<FixPacketDetail | undefined> {
  const paths = fixPacketPaths(reportDir, issueId)
  const [markdown, jsonText] = await Promise.all([
    readText(paths.markdown).catch(() => undefined),
    readText(paths.json).catch(() => undefined)
  ])
  if (!markdown && !jsonText) return undefined
  const parsed = jsonText ? JSON.parse(jsonText) as FixPacket : undefined
  return {
    issueId,
    markdown: markdown ?? '',
    json: parsed,
    suspectedFiles: parsed?.suspected_files ?? [],
    prompt: parsed?.prompt ?? '',
    constraints: parsed?.constraints ?? [],
    verificationCommand: parsed?.verification_command ?? '',
    passConditions: parsed?.pass_conditions ?? [],
    path: paths
  }
}

export function buildRepairCommand(input: {
  issueId: string
  reportPath: string
  agent: RepairAgent
  mode: RepairMode
}): RepairCommandSpec {
  if (input.mode === 'repair-proof') {
    return {
      cliArgs: ['repair-proof', '--issue', input.issueId, '--report', input.reportPath, '--agent', 'manual'],
      phase: 'Repair proof',
      commandSummary: `repair-proof ${input.issueId}`
    }
  }
  return {
    cliArgs: ['apply-fix', '--issue', input.issueId, '--report', input.reportPath, '--agent', input.agent],
    phase: input.agent === 'codex' ? 'Codex repair' : 'Manual apply-fix',
    commandSummary: `apply-fix ${input.issueId} --agent ${input.agent}`
  }
}

export async function listRepairHistory(reportDir: string, issueId?: string): Promise<RepairAttemptSummary[]> {
  const root = path.join(reportDir, 'repair_attempts')
  if (!await exists(root)) return []
  const issueDirs = issueId ? [issueId] : await directoryNames(root)
  const results: RepairAttemptSummary[] = []
  for (const id of issueDirs) {
    const issueRoot = path.join(root, id)
    if (!await exists(issueRoot)) continue
    for (const attemptName of await directoryNames(issueRoot)) {
      const attemptDir = path.join(issueRoot, attemptName)
      const summary = await summarizeAttempt(id, attemptDir)
      if (summary) results.push(summary)
    }
  }
  return results.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function summarizeAttempt(issueId: string, attemptDir: string): Promise<RepairAttemptSummary | undefined> {
  const [result, attempt, agent, diffSummary, verification] = await Promise.all([
    readJson<Record<string, unknown>>(path.join(attemptDir, 'repair_result.json')).catch(() => undefined),
    readJson<RepairAttempt>(path.join(attemptDir, 'repair_attempt.json')).catch(() => undefined),
    readJson<{ agent?: string; status?: string; changedFiles?: string[]; modifiedFiles?: string[] }>(path.join(attemptDir, 'agent_result.json')).catch(() => undefined),
    readText(path.join(attemptDir, 'git_diff_summary.txt')).catch(() => ''),
    findVerificationResult(attemptDir).catch(() => undefined)
  ])
  const timestamp = await stat(attemptDir).then((info) => info.mtime.toISOString()).catch(() => new Date().toISOString())
  if (!result && !attempt && !agent) return {
    issueId,
    agent: 'unknown',
    status: 'unknown',
    agentInvoked: false,
    changedFiles: [],
    diffSummary,
    verification: { status: verificationStatus(verification), command: verification?.verificationCommand },
    createdAt: timestamp,
    updatedAt: timestamp,
    attemptDir
  }
  const changedFiles = (result?.changed_files as string[] | undefined)
    ?? agent?.changedFiles
    ?? agent?.modifiedFiles
    ?? attempt?.agentResult.changedFiles
    ?? []
  const status = String(result?.status ?? agent?.status ?? attempt?.agentResult.status ?? 'unknown')
  const createdAt = attempt?.createdAt ?? timestamp
  return {
    issueId,
    agent: String(result?.agent ?? agent?.agent ?? attempt?.agentResult.agent ?? 'unknown'),
    status,
    agentInvoked: Boolean(result?.agent_invoked ?? (attempt?.agentResult.agent !== 'manual' && attempt?.agentResult.status !== 'not_run')),
    changedFiles,
    diffSummary: diffSummary || attempt?.gitDiffSummary || '',
    verification: { status: verificationStatus(verification), command: verification?.verificationCommand, summary: verification?.status },
    createdAt,
    updatedAt: timestamp,
    attemptDir,
    fixPacketPath: typeof result?.fix_packet_path === 'string' ? result.fix_packet_path : undefined
  }
}

export async function readAttemptArtifacts(attemptDir?: string): Promise<{ changedFiles: string[]; diffSummary: string; rawDiff: string }> {
  if (!attemptDir) return { changedFiles: [], diffSummary: '', rawDiff: '' }
  const [summary, rawDiff, attempt] = await Promise.all([
    readText(path.join(attemptDir, 'git_diff_summary.txt')).catch(() => ''),
    readText(path.join(attemptDir, 'git_diff_after.patch')).catch(() => ''),
    readJson<RepairAttempt>(path.join(attemptDir, 'repair_attempt.json')).catch(() => undefined)
  ])
  return {
    changedFiles: attempt?.agentResult.changedFiles ?? [],
    diffSummary: summary,
    rawDiff
  }
}

export function packetLooksDestructive(packet?: FixPacketDetail): boolean {
  const text = destructiveRelevantText(packet?.prompt ?? '')
  return /\b(delete|remove|reset|drop|truncate|overwrite|destroy|purge)\b/i.test(text)
}

export function destructiveRelevantText(prompt: string): string {
  return prompt
    .split(/^Safety constraints:\s*$/im)[0]
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:[-*]\s*)?(do not|never|without|unless|no destructive|only modify)\b/i.test(line))
    .join('\n')
}

function fixPacketPaths(reportDir: string, issueId: string): { markdown: string; json: string } {
  const safe = safeIssueId(issueId)
  if (!safe) return { markdown: '', json: '' }
  const dir = path.join(reportDir, 'fix_packets')
  return {
    markdown: path.join(dir, `${safe}.md`),
    json: path.join(dir, `${safe}.json`)
  }
}

function fixPacketExistsSyncish(reportDir: string, issueId: string): boolean {
  const safe = safeIssueId(issueId)
  if (!safe) return false
  return existsSync(path.join(reportDir, 'fix_packets', `${safe}.md`))
}

function safeIssueId(issueId: string): string | undefined {
  if (!issueId || issueId.includes('/') || issueId.includes('\\') || issueId.includes('\0')) return undefined
  return issueId
}

function artifactUrlForPath(reportDir: string, screenshotPath: string, projectId?: string): string | undefined {
  let relative = screenshotPath
  if (path.isAbsolute(screenshotPath)) {
    const rel = path.relative(reportDir, screenshotPath)
    if (rel.startsWith('..') || path.isAbsolute(rel)) return undefined
    relative = rel
  }
  const query = projectId ? `?project=${encodeURIComponent(projectId)}` : ''
  return `/api/reports/latest/artifacts/${encodeURIComponent(relative)}${query}`
}

async function findVerificationResult(attemptDir: string): Promise<VerificationResult | undefined> {
  const direct = path.join(attemptDir, 'verification', 'verification_result.json')
  const directResult = await readJson<VerificationResult>(direct).catch(() => undefined)
  if (directResult) return directResult
  const entries = await directoryNames(attemptDir).catch(() => [])
  for (const entry of entries) {
    const nested = await readJson<VerificationResult>(path.join(attemptDir, entry, 'verification', 'verification_result.json')).catch(() => undefined)
    if (nested) return nested
  }
  return undefined
}

function verificationStatus(result?: VerificationResult): 'not_run' | 'passed' | 'failed' | 'inconclusive' {
  if (!result) return 'not_run'
  if (result.status === 'fixed') return 'passed'
  if (result.status === 'still_failing') return 'failed'
  return 'inconclusive'
}

async function directoryNames(dir: string): Promise<string[]> {
  return (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

async function readText(file: string): Promise<string> {
  return readFile(file, 'utf8')
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readText(file)) as T
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(() => true).catch(() => false)
}

function slugIssue(issue: Issue): string {
  return issue.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'issue'
}
