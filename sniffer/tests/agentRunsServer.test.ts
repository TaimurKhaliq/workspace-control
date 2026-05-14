import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { listAgentRuns, readAgentRun, writeRejectedAgentRun } from '../server/agentRuns.js'

describe('agent run server helpers', () => {
  it('lists and normalizes persisted LangGraph repair runs', async () => {
    const { reportDir, runId } = await writeAgentTrace()

    const runs = await listAgentRuns(reportDir, 'demo')

    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      runId,
      graphEngine: 'langgraph',
      issueId: 'issue-1',
      status: 'waiting_for_human',
      currentNode: 'HumanApproval'
    })
    expect(runs[0].nodeStatuses.map((node) => node.id)).toContain('RetrieveEvidence')
    expect(runs[0].evidencePacketSummary?.retrievedDocumentCount).toBe(8)
  })

  it('writes approval rejection back to trace files', async () => {
    const { reportDir, runId } = await writeAgentTrace()
    const run = await readAgentRun(reportDir, runId)

    const rejected = await writeRejectedAgentRun(run!, 'No thanks.')

    expect(rejected.approval.status).toBe('rejected')
    expect(rejected.finalDecision).toBe('human_review')
    await expect(readFile(rejected.traceMarkdownPath, 'utf8')).resolves.toContain('No thanks.')
    await expect(readFile(rejected.traceJsonPath, 'utf8')).resolves.toContain('approval_rejected')
  })
})

async function writeAgentTrace(): Promise<{ reportDir: string; runId: string }> {
  const reportDir = await mkdtemp(path.join(os.tmpdir(), 'sniffer-agent-runs-'))
  const runId = 'agent-test'
  const runDir = path.join(reportDir, 'agent_runs', runId)
  await mkdir(runDir, { recursive: true })
  await writeFile(path.join(runDir, 'agent_trace.json'), JSON.stringify({
    graphEngine: 'langgraph',
    agentRunId: runId,
    status: 'awaiting_approval',
    finalDecision: 'human_review',
    reportPath: path.join(reportDir, 'latest_report.json'),
    projectId: 'demo',
    issueId: 'issue-1',
    agent: 'manual',
    selectedIssue: { issue_id: 'issue-1', title: 'Broken UI', severity: 'high', type: 'broken_interaction' },
    evidence: { query: 'issue-1 Broken UI', retrievedDocumentCount: 8, sourceFactCount: 3, runtimeFactCount: 2, screenshotCount: 1, contradictionCount: 0 },
    fixPacketPath: path.join(reportDir, 'fix_packets', 'issue-1.md'),
    approval: { required: true, approved: false, status: 'required', reason: 'Human approval required.' },
    traceEvents: [
      { id: '1', timestamp: '2026-05-13T00:00:00.000Z', node: 'AuditReportLoaded', type: 'node_completed', status: 'completed', message: 'Loaded report' },
      { id: '2', timestamp: '2026-05-13T00:00:01.000Z', node: 'RetrieveEvidence', type: 'evidence_retrieved', status: 'completed', message: 'Retrieved evidence' },
      { id: '3', timestamp: '2026-05-13T00:00:02.000Z', node: 'HumanApproval', type: 'approval_required', status: 'completed', message: 'Approval required' }
    ],
    errors: [],
    startedAt: '2026-05-13T00:00:00.000Z'
  }, null, 2))
  await writeFile(path.join(runDir, 'agent_trace.md'), '# Sniffer Repair Agent Trace\n')
  return { reportDir, runId }
}
