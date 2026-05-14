import { describe, expect, it } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { runRepairAgent } from '../src/agent/runRepairAgent.js'
import { createInitialAgentState } from '../src/agent/snifferAgentState.js'
import { decideNextStepNode } from '../src/agent/nodes/decideNextStepNode.js'
import { verifyIssueNode } from '../src/agent/nodes/verifyIssueNode.js'
import { createSnifferRepairGraph } from '../src/agent/langgraph/snifferRepairGraph.js'
import type { RepairAttempt, SnifferReport } from '../src/types.js'

describe('repair agent graph', () => {
  it('compiles a real LangGraph repair graph', () => {
    const graph = createSnifferRepairGraph()

    expect(typeof graph.invoke).toBe('function')
  })

  it('loads report, selects requested issue, retrieves evidence, creates fix packet, and waits for approval', async () => {
    const { reportPath } = await writeReportFixture()

    const result = await runRepairAgent({
      reportPath,
      issueId: 'issue-1',
      agent: 'manual',
      maxRetries: 1
    })

    expect(result.state.report?.issues).toHaveLength(1)
    expect(result.state.selectedIssue?.issue_id).toBe('issue-1')
    expect(result.state.evidencePacket?.retrievedDocuments.length).toBeGreaterThan(0)
    expect(result.state.fixPacketPath).toContain('fix_packets/issue-1.md')
    expect(result.state.approval.status).toBe('required')
    expect(result.finalDecision).toBe('human_review')
    await expect(readFile(result.traceJsonPath, 'utf8')).resolves.toContain('AuditReportLoaded')
    await expect(readFile(result.traceMarkdownPath, 'utf8')).resolves.toContain('LangGraph JS')
    await expect(readFile(result.traceMarkdownPath, 'utf8')).resolves.toContain('Human approval')
  })

  it('returns fixed/noop when no issue needs repair', async () => {
    const { reportPath } = await writeReportFixture([])

    const result = await runRepairAgent({
      reportPath,
      agent: 'manual'
    })

    expect(result.finalDecision).toBe('fixed')
    expect(result.state.status).toBe('succeeded')
    expect(result.state.evidencePacket).toBeUndefined()
  })

  it('manual dry-run records a repair attempt without editing files', async () => {
    const { reportPath } = await writeReportFixture()

    const result = await runRepairAgent({
      reportPath,
      issueId: 'issue-1',
      agent: 'manual',
      dryRun: true
    })

    expect(result.state.approval.approved).toBe(true)
    expect(result.state.repairAttemptRef?.agent).toBe('manual')
    expect(result.state.repairAttemptRef?.changedFiles).toEqual([])
    expect(result.state.verificationRef?.status).toBe('inconclusive')
    await expect(readFile(path.join(result.state.repairAttemptRef?.attemptDir ?? '', 'repair_result.json'), 'utf8')).resolves.toContain('"agent_invoked": false')
  })

  it('decides fixed when verification passes', async () => {
    const state = createInitialAgentState({ agentRunId: 'agent-test', reportPath: '/tmp/report.json' })
    state.approval = { required: true, approved: true, status: 'approved' }
    state.repairAttempt = {
      issue_id: 'issue-1',
      iteration: 1,
      agentResult: {
        agent: 'manual',
        status: 'not_run',
        success: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        commandsRun: [],
        modifiedFiles: [],
        changedFiles: [],
        diffSummary: '',
        notes: []
      },
      gitStatusBefore: '',
      gitStatusAfter: '',
      gitDiffAfter: '',
      gitDiffSummary: '',
      commandsRun: [],
      createdAt: new Date().toISOString(),
      attemptDir: '/tmp/attempt'
    }
    state.verification = {
      issue_id: 'issue-1',
      status: 'fixed',
      beforeEvidence: [],
      afterEvidence: [],
      verificationCommand: 'npm run sniffer -- verify',
      reportPath: '/tmp/verification.json'
    }

    const decision = await decideNextStepNode(state)

    expect(decision.decision).toBe('fixed')
    expect(state.status).toBe('succeeded')
  })

  it('verifyIssueNode records inconclusive when no verification URL is available', async () => {
    const state = createInitialAgentState({ agentRunId: 'agent-test', reportPath: '/tmp/report.json' })
    state.issueId = 'issue-1'
    state.repairAttempt = repairAttempt()

    const result = await verifyIssueNode(state)

    expect(result.status).toBe('skipped')
    expect(state.verificationRef).toMatchObject({ issueId: 'issue-1', status: 'inconclusive' })
  })

  it('decides retry when verification fails and retries remain', async () => {
    const state = createInitialAgentState({ agentRunId: 'agent-test', reportPath: '/tmp/report.json', maxRetries: 2 })
    state.approval = { required: true, approved: true, status: 'approved' }
    state.retryCount = 0
    state.repairAttempt = repairAttempt()
    state.verification = {
      issue_id: 'issue-1',
      status: 'still_failing',
      beforeEvidence: [],
      afterEvidence: ['still failing'],
      verificationCommand: 'npm run sniffer -- verify',
      reportPath: '/tmp/verification.json'
    }

    const decision = await decideNextStepNode(state)

    expect(decision.decision).toBe('retry')
  })
})

function repairAttempt(): RepairAttempt {
  return {
    issue_id: 'issue-1',
    iteration: 1,
    agentResult: {
      agent: 'manual',
      status: 'not_run',
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      commandsRun: [],
      modifiedFiles: [],
      changedFiles: [],
      diffSummary: '',
      notes: []
    },
    gitStatusBefore: '',
    gitStatusAfter: '',
    gitDiffAfter: '',
    gitDiffSummary: '',
    commandsRun: [],
    createdAt: new Date().toISOString(),
    attemptDir: '/tmp/attempt'
  }
}

async function writeReportFixture(issues?: SnifferReport['issues']): Promise<{ root: string; reportPath: string }> {
  const root = path.join(os.tmpdir(), `sniffer-agent-${randomUUID()}`)
  await mkdir(path.join(root, 'src'), { recursive: true })
  await writeFile(path.join(root, 'src', 'api.ts'), 'export function load() { return fetch("/api/status") }\n')
  spawnSync('git', ['init'], { cwd: root })
  spawnSync('git', ['add', '.'], { cwd: root })
  spawnSync('git', ['-c', 'user.email=sniffer@example.test', '-c', 'user.name=Sniffer Test', 'commit', '-m', 'init'], { cwd: root })
  const reportDir = path.join(root, 'reports', 'sniffer', 'latest')
  await mkdir(reportDir, { recursive: true })
  const reportPath = path.join(reportDir, 'latest_report.json')
  await writeFile(reportPath, JSON.stringify(report(root, issues), null, 2))
  return { root, reportPath }
}

function report(root: string, issues: SnifferReport['issues'] = [{
  issue_id: 'issue-1',
  severity: 'high',
  type: 'api_error',
  title: 'Status API returns 500',
  description: 'The status endpoint fails during the runtime flow.',
  evidence: ['GET /api/status 500'],
  suspected_files: ['src/api.ts'],
  suggestedFixPrompt: 'Handle status API errors with a controlled error state.',
  status: 'open'
}]): SnifferReport {
  return {
    sourceGraph: {
      repoPath: root,
      framework: 'react',
      buildTool: 'vite',
      routes: [],
      pages: [],
      components: [{ file: 'src/api.ts', name: 'api' }],
      forms: [],
      uiSurfaces: [],
      sourceWorkflows: [],
      apiCalls: [{ endpoint: '/api/status', method: 'GET', sourceFile: 'src/api.ts' }],
      stateActions: [],
      packageScripts: {},
      generatedAt: ''
    },
    crawlGraph: {
      startUrl: '',
      title: 'Fixture',
      finalUrl: '',
      states: [],
      actions: [],
      consoleErrors: [],
      networkFailures: [],
      screenshots: [],
      generatedAt: ''
    },
    appIntent: { summary: '', likelyWorkflows: [], sourceSignals: [], llmUsed: false },
    runtimeSurfaceMatches: [],
    runtimeWorkflowVerifications: [],
    criticDecisions: [],
    deferredFindings: [],
    blockedChecks: [],
    needsMoreCrawling: [],
    issues,
    generatedAt: ''
  }
}
