import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildRepairCommand,
  destructiveRelevantText,
  listRepairHistory,
  packetLooksDestructive,
  readFixPacketDetail,
  summarizeIssues
} from '../server/repairWorkbench.js'
import type { SnifferReport } from '../src/types.js'

describe('repair workbench server helpers', () => {
  it('summarizes latest report issues with fix packet availability', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sniffer-repair-workbench-'))
    await mkdir(path.join(dir, 'fix_packets'), { recursive: true })
    await writeFile(path.join(dir, 'fix_packets', 'issue-1.md'), '# Fix Packet')
    const report = minimalReport(dir)
    const issues = summarizeIssues(report, dir, 'demo')
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      issueId: 'issue-1',
      title: 'Broken action',
      severity: 'high',
      hasFixPacket: true
    })
    expect(issues[0].screenshotArtifactUrl).toContain('/api/reports/latest/artifacts/')
    expect(issues[0].screenshotArtifactUrl).toContain('project=demo')
  })

  it('reads markdown and json fix packet detail', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sniffer-fix-packet-'))
    await mkdir(path.join(dir, 'fix_packets'), { recursive: true })
    const packet = {
      issue_id: 'issue-1',
      title: 'Broken action',
      repo_path: '/tmp/app',
      repair_root: '/tmp/app',
      allowed_paths: ['src/'],
      working_directory: '/tmp/app',
      evidence_paths: [],
      suspected_files: ['src/App.tsx'],
      prompt: 'Fix the action.',
      constraints: ['No destructive actions.'],
      verification_command: 'npm run sniffer -- verify',
      pass_conditions: ['Issue no longer appears.']
    }
    await writeFile(path.join(dir, 'fix_packets', 'issue-1.md'), '# Fix Packet\n\n## Prompt\nFix the action.')
    await writeFile(path.join(dir, 'fix_packets', 'issue-1.json'), JSON.stringify(packet))
    const detail = await readFixPacketDetail(dir, 'issue-1')
    expect(detail?.prompt).toBe('Fix the action.')
    expect(detail?.suspectedFiles).toEqual(['src/App.tsx'])
    expect(detail?.verificationCommand).toBe('npm run sniffer -- verify')
  })

  it('builds safe repair commands for proof and apply-fix', () => {
    expect(buildRepairCommand({ issueId: 'issue-1', reportPath: '/tmp/report.json', agent: 'manual', mode: 'repair-proof' }).cliArgs)
      .toEqual(['repair-proof', '--issue', 'issue-1', '--report', '/tmp/report.json', '--agent', 'manual'])
    expect(buildRepairCommand({ issueId: 'issue-1', reportPath: '/tmp/report.json', agent: 'codex', mode: 'apply-fix' }).cliArgs)
      .toEqual(['apply-fix', '--issue', 'issue-1', '--report', '/tmp/report.json', '--agent', 'codex'])
  })

  it('does not treat safety constraints as destructive intent', () => {
    const prompt = [
      'Issue:',
      'Improve the copy prompt affordance.',
      '',
      'Safety constraints:',
      '- Do not run destructive app or repo actions.',
      '- Never delete workspaces, repos, baselines, reports, or user data.'
    ].join('\n')
    expect(destructiveRelevantText(prompt)).not.toContain('Do not run destructive')
    expect(packetLooksDestructive({
      issueId: 'issue-1',
      markdown: '',
      prompt,
      suspectedFiles: [],
      constraints: ['Do not run destructive app or repo actions.'],
      verificationCommand: '',
      passConditions: [],
      path: { markdown: '', json: '' }
    })).toBe(false)
  })

  it('still flags actual destructive repair intent', () => {
    expect(packetLooksDestructive({
      issueId: 'issue-1',
      markdown: '',
      prompt: 'Issue:\nDelete stale generated records from the app state.',
      suspectedFiles: [],
      constraints: [],
      verificationCommand: '',
      passConditions: [],
      path: { markdown: '', json: '' }
    })).toBe(true)
  })

  it('parses repair attempt history', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sniffer-repair-history-'))
    const attemptDir = path.join(dir, 'repair_attempts', 'issue-1', '2026-05-09T00-00-00-000Z')
    await mkdir(attemptDir, { recursive: true })
    await writeFile(path.join(attemptDir, 'repair_result.json'), JSON.stringify({
      issue_id: 'issue-1',
      agent: 'manual',
      agent_invoked: false,
      changed_files: [],
      verification: 'not_run',
      status: 'not_run'
    }))
    await writeFile(path.join(attemptDir, 'git_diff_summary.txt'), '')
    const history = await listRepairHistory(dir, 'issue-1')
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ issueId: 'issue-1', agent: 'manual', agentInvoked: false })
  })
})

function minimalReport(repoPath: string): SnifferReport {
  return {
    generatedAt: '2026-05-09T00:00:00.000Z',
    issues: [{
      issue_id: 'issue-1',
      severity: 'high',
      type: 'broken_interaction',
      title: 'Broken action',
      description: 'Action fails.',
      evidence: ['Button fails'],
      screenshotPath: 'screenshots/state-1.png',
      suspected_files: ['src/App.tsx'],
      suggestedFixPrompt: 'Fix the broken action.'
    }],
    rawFindings: [],
    sourceGraph: {
      repoPath,
      framework: 'react',
      buildTool: 'vite',
      routes: [],
      pages: [],
      components: [],
      forms: [],
      uiSurfaces: [],
      sourceWorkflows: [],
      apiCalls: [],
      stateActions: [],
      packageScripts: {},
      generatedAt: '2026-05-09T00:00:00.000Z'
    },
    crawlGraph: {
      startUrl: 'http://localhost:3000',
      finalUrl: 'http://localhost:3000',
      title: 'Demo',
      states: [],
      actions: [],
      consoleErrors: [],
      networkFailures: [],
      screenshots: [],
      generatedAt: '2026-05-09T00:00:00.000Z'
    },
    appIntent: { workflows: [] },
    runtimeSurfaceMatches: [],
    runtimeWorkflowVerifications: [],
    criticDecisions: [],
    deferredFindings: [],
    blockedChecks: [],
    needsMoreCrawling: []
  } as unknown as SnifferReport
}
