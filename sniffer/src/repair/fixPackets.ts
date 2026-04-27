import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { FixPacket, Issue, SnifferReport } from '../types.js'
import { writeJson } from '../reporting/json.js'
import { assertSafeFixPacket, isActionableIssue } from './safety.js'
import { resolveRepairPathPolicy } from './pathPolicy.js'
import { enrichIssues } from './issueMetadata.js'
import { triageIssues } from '../heuristics/issueTriage.js'

export async function loadReport(reportPath: string): Promise<SnifferReport> {
  return JSON.parse(await readFile(reportPath, 'utf8')) as SnifferReport
}

export function createFixPacket(issue: Issue, report: SnifferReport, reportPath: string): FixPacket {
  if (!issue.issue_id) throw new Error(`Issue is missing issue_id: ${issue.title}`)
  const reportDir = path.dirname(path.resolve(reportPath))
  const evidencePaths = [issue.screenshotPath, issue.tracePath].filter(Boolean) as string[]
  const policy = resolveRepairPathPolicy({
    repoPath: report.sourceGraph.repoPath,
    suspectedFiles: issue.suspected_files ?? [],
    reportDir
  })
  const verificationCommand = `npm run sniffer -- verify --issue ${issue.issue_id} --url ${report.crawlGraph.startUrl} --report ${path.resolve(reportPath)}`
  return {
    issue_id: issue.issue_id,
    title: issue.title,
    repo_path: report.sourceGraph.repoPath,
    repair_root: policy.repairRoot,
    allowed_paths: policy.allowedPaths,
    working_directory: policy.repairRoot,
    evidence_paths: evidencePaths,
    suspected_files: policy.normalizedSuspectedFiles,
    prompt: renderCodexPrompt(issue, report, policy.repairRoot, policy.allowedPaths, policy.normalizedSuspectedFiles, verificationCommand),
    constraints: [
      'Do not run destructive app or repo actions.',
      'Never delete workspaces, repos, baselines, reports, or user data.',
      'Do not modify files outside repair_root unless explicitly instructed.',
      `Only modify allowed paths: ${policy.allowedPaths.join(', ') || 'none'}.`,
      'Keep changes minimal and evidence-driven.',
      `Use report context from ${reportDir}.`
    ],
    verification_command: verificationCommand,
    pass_conditions: issue.pass_conditions ?? []
  }
}

export async function generateFixPackets(reportPath: string, allowDestructive = false): Promise<FixPacket[]> {
  const report = await loadReport(reportPath)
  const reportDir = path.dirname(path.resolve(reportPath))
  const packetDir = path.join(reportDir, 'fix_packets')
  await mkdir(packetDir, { recursive: true })
  await clearPacketDir(packetDir)
  const packets: FixPacket[] = []

  const packetIssues = report.rawFindings
    ? enrichIssues(report.issues, report.sourceGraph, report.crawlGraph)
    : enrichIssues(triageIssues({
      rawFindings: enrichIssues(report.issues, report.sourceGraph, report.crawlGraph),
      sourceGraph: report.sourceGraph,
      workflowVerifications: report.runtimeWorkflowVerifications
    }), report.sourceGraph, report.crawlGraph)
  for (const issue of packetIssues.filter(isActionableIssue).filter((issue) => issue.critic_decision?.should_generate_fix_packet !== false)) {
    const packet = createFixPacket(issue, report, reportPath)
    assertSafeFixPacket(packet, allowDestructive)
    await writeJson(path.join(packetDir, `${issue.issue_id}.json`), packet)
    await writeFile(path.join(packetDir, `${issue.issue_id}.md`), renderFixPacketMarkdown(packet), 'utf8')
    packets.push(packet)
  }
  return packets
}

async function clearPacketDir(packetDir: string): Promise<void> {
  for (const entry of await readdir(packetDir)) {
    if (entry.endsWith('.json') || entry.endsWith('.md')) {
      await unlink(path.join(packetDir, entry))
    }
  }
}

export async function loadFixPacket(reportPath: string, issueId: string): Promise<FixPacket> {
  const packetPath = path.join(path.dirname(path.resolve(reportPath)), 'fix_packets', `${issueId}.json`)
  return JSON.parse(await readFile(packetPath, 'utf8')) as FixPacket
}

export function renderFixPacketMarkdown(packet: FixPacket): string {
  return [
    `# Fix Packet: ${packet.title}`,
    '',
    `Issue ID: ${packet.issue_id}`,
    `Repo path: ${packet.repo_path}`,
    `Repair root: ${packet.repair_root}`,
    `Working directory: ${packet.working_directory}`,
    '',
    '## Allowed Paths',
    '',
    packet.allowed_paths.map((file) => `- ${file}`).join('\n') || '- none',
    '',
    '## Suspected Files',
    '',
    packet.suspected_files.map((file) => `- ${file}`).join('\n') || '- unknown',
    '',
    '## Evidence Paths',
    '',
    packet.evidence_paths.map((file) => `- ${file}`).join('\n') || '- none',
    '',
    '## Prompt',
    '',
    packet.prompt,
    '',
    '## Constraints',
    '',
    packet.constraints.map((item) => `- ${item}`).join('\n'),
    '',
    '## Verification',
    '',
    `Command: \`${packet.verification_command}\``,
    '',
    'Pass conditions:',
    '',
    packet.pass_conditions.map((item) => `- ${item}`).join('\n'),
    ''
  ].join('\n')
}

function renderCodexPrompt(
  issue: Issue,
  report: SnifferReport,
  repairRoot: string,
  allowedPaths: string[],
  suspectedFiles: string[],
  verificationCommand: string
): string {
  return [
    `You are fixing a Sniffer-reported issue in:`,
    `PROJECT_ROOT=${repairRoot}`,
    '',
    'You may modify:',
    allowedPaths.map((item) => `- ${item}`).join('\n') || '- none',
    '',
    'Issue:',
    issue.fix_prompt,
    '',
    'Suspected files:',
    suspectedFiles.map((file) => `- ${file}`).join('\n') || '- unknown',
    '',
    'Sniffer runtime context:',
    `- App URL: ${report.crawlGraph.startUrl}`,
    `- Final URL: ${report.crawlGraph.finalUrl}`,
    `- Runtime states captured: ${report.crawlGraph.states.length}`,
    `- Console errors: ${report.crawlGraph.consoleErrors.length}`,
    `- Network failures: ${report.crawlGraph.networkFailures.length}`,
    '',
    'Verification steps:',
    (issue.verification_steps ?? []).map((step) => `- ${step}`).join('\n'),
    '',
    'Verification command:',
    verificationCommand,
    '',
    'After fix:',
    '- run backend/frontend tests if practical',
    '- run the Sniffer verify command',
    '- report files changed and root cause',
    '',
    'Safety constraints:',
    '- Do not run destructive app or repo actions.',
    '- Never delete workspaces, repos, baselines, reports, or user data.',
    '- Do not modify files outside PROJECT_ROOT.',
    '- Do not modify files outside the allowed paths unless the fix is impossible otherwise and you clearly explain why.'
  ].join('\n')
}
