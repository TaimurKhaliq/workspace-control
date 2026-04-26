import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { FixPacket, Issue, SnifferReport } from '../types.js'
import { writeJson } from '../reporting/json.js'
import { assertSafeFixPacket, isActionableIssue } from './safety.js'

export async function loadReport(reportPath: string): Promise<SnifferReport> {
  return JSON.parse(await readFile(reportPath, 'utf8')) as SnifferReport
}

export function createFixPacket(issue: Issue, report: SnifferReport, reportPath: string): FixPacket {
  if (!issue.issue_id) throw new Error(`Issue is missing issue_id: ${issue.title}`)
  const reportDir = path.dirname(path.resolve(reportPath))
  const evidencePaths = [issue.screenshotPath, issue.tracePath].filter(Boolean) as string[]
  return {
    issue_id: issue.issue_id,
    title: issue.title,
    repo_path: report.sourceGraph.repoPath,
    working_directory: report.sourceGraph.repoPath,
    evidence_paths: evidencePaths,
    suspected_files: issue.suspected_files ?? [],
    prompt: renderCodexPrompt(issue, report),
    constraints: [
      'Do not run destructive app or repo actions.',
      'Never delete workspaces, repos, baselines, reports, or user data.',
      'Do not modify files outside repo_path unless explicitly instructed.',
      'Keep changes minimal and evidence-driven.',
      `Use report context from ${reportDir}.`
    ],
    verification_command: `npm run sniffer -- verify --issue ${issue.issue_id} --url ${report.crawlGraph.startUrl} --report ${path.resolve(reportPath)}`,
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

  for (const issue of report.issues.filter(isActionableIssue).filter((issue) => issue.critic_decision?.should_generate_fix_packet !== false)) {
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
    `Working directory: ${packet.working_directory}`,
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

function renderCodexPrompt(issue: Issue, report: SnifferReport): string {
  return [
    issue.fix_prompt,
    '',
    'Sniffer runtime context:',
    `- App URL: ${report.crawlGraph.startUrl}`,
    `- Final URL: ${report.crawlGraph.finalUrl}`,
    `- Runtime states captured: ${report.crawlGraph.states.length}`,
    `- Console errors: ${report.crawlGraph.consoleErrors.length}`,
    `- Network failures: ${report.crawlGraph.networkFailures.length}`,
    '',
    'Verification steps:',
    (issue.verification_steps ?? []).map((step) => `- ${step}`).join('\n')
  ].join('\n')
}
