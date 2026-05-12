import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { latestReportDir, projectLatestReportDir } from '../reporting/paths.js'
import { writeJson } from '../reporting/json.js'
import { getProject } from '../projects/registry.js'
import type { AgentDecision, RepairAgentName, SnifferAgentState } from './snifferAgentState.js'
import { createInitialAgentState, pushTrace } from './snifferAgentState.js'
import { applyRepairNode } from './nodes/applyRepairNode.js'
import { decideNextStepNode } from './nodes/decideNextStepNode.js'
import { generateFixPacketNode } from './nodes/generateFixPacketNode.js'
import { humanApprovalNode } from './nodes/humanApprovalNode.js'
import { loadReportNode } from './nodes/loadReportNode.js'
import { retrieveEvidenceNode } from './nodes/retrieveEvidenceNode.js'
import { selectIssueNode } from './nodes/selectIssueNode.js'
import { verifyIssueNode } from './nodes/verifyIssueNode.js'

export interface RunRepairAgentOptions {
  snifferRoot?: string
  projectId?: string
  reportPath?: string
  issueId?: string
  agent?: RepairAgentName
  maxRetries?: number
  autoApprove?: boolean
  dryRun?: boolean
  allowDestructive?: boolean
  appUrl?: string
}

export interface RunRepairAgentResult {
  state: SnifferAgentState
  finalDecision?: AgentDecision
  traceJsonPath: string
  traceMarkdownPath: string
}

export async function runRepairAgent(options: RunRepairAgentOptions): Promise<RunRepairAgentResult> {
  const snifferRoot = options.snifferRoot ?? process.cwd()
  const reportDir = options.projectId ? projectLatestReportDir(options.projectId, snifferRoot) : latestReportDir(snifferRoot)
  const reportPath = path.resolve(options.reportPath ?? path.join(reportDir, 'latest_report.json'))
  const project = options.projectId ? await getProject(options.projectId, snifferRoot).catch(() => undefined) : undefined
  const state = createInitialAgentState({
    agentRunId: `agent-${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`,
    reportPath,
    projectId: options.projectId,
    issueId: options.issueId,
    agent: options.agent,
    maxRetries: options.maxRetries,
    autoApprove: options.autoApprove,
    dryRun: options.dryRun,
    allowDestructive: options.allowDestructive,
    appUrl: options.appUrl ?? project?.appUrl
  })
  state.status = 'running'
  state.agentRunDir = path.join(state.reportDir, 'agent_runs', state.agentRunId)
  await mkdir(state.agentRunDir, { recursive: true })

  try {
    await loadReportNode(state)
    await selectIssueNode(state)
    await retrieveEvidenceNode(state)
    await generateFixPacketNode(state)
    const approval = await humanApprovalNode(state)
    if (approval.decision !== 'human_review') {
      await applyRepairNode(state)
      await verifyIssueNode(state)
    }
    await decideNextStepNode(state)
  } catch (error) {
    state.status = 'failed'
    state.finalDecision = 'failed'
    state.completedAt = new Date().toISOString()
    pushTrace(state, 'AgentError', 'failed', error instanceof Error ? error.message : String(error), { decision: 'failed' })
  }

  const traceJsonPath = path.join(state.agentRunDir, 'agent_trace.json')
  const traceMarkdownPath = path.join(state.agentRunDir, 'agent_trace.md')
  await writeJson(traceJsonPath, publicAgentState(state))
  await writeFile(traceMarkdownPath, renderAgentTraceMarkdown(state), 'utf8')
  return { state, finalDecision: state.finalDecision, traceJsonPath, traceMarkdownPath }
}

function publicAgentState(state: SnifferAgentState): Record<string, unknown> {
  return {
    agentRunId: state.agentRunId,
    status: state.status,
    finalDecision: state.finalDecision,
    reportPath: state.reportPath,
    projectId: state.projectId,
    issueId: state.issueId,
    selectedIssue: state.selectedIssue ? {
      issue_id: state.selectedIssue.issue_id,
      title: state.selectedIssue.title,
      severity: state.selectedIssue.severity,
      type: state.selectedIssue.type
    } : undefined,
    evidence: state.evidenceRef,
    fixPacketPath: state.fixPacketPath,
    approval: state.approval,
    repairAttempt: state.repairAttemptRef,
    verification: state.verificationRef,
    retryCount: state.retryCount,
    maxRetries: state.maxRetries,
    agent: state.agent,
    autoApprove: state.autoApprove,
    dryRun: state.dryRun,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    traceEvents: state.traceEvents
  }
}

function renderAgentTraceMarkdown(state: SnifferAgentState): string {
  return [
    `# Sniffer Repair Agent Trace`,
    '',
    `- Agent run: ${state.agentRunId}`,
    `- Status: ${state.status}`,
    `- Final decision: ${state.finalDecision ?? 'pending'}`,
    `- Report: ${state.reportPath}`,
    `- Issue: ${state.issueId ?? 'not selected'}`,
    `- Agent: ${state.agent}`,
    `- Dry run: ${state.dryRun ? 'yes' : 'no'}`,
    `- Auto approve: ${state.autoApprove ? 'yes' : 'no'}`,
    '',
    '## Selected Issue',
    '',
    state.selectedIssue
      ? `- ${state.selectedIssue.severity} ${state.selectedIssue.type}: ${state.selectedIssue.title}`
      : '- none',
    '',
    '## Evidence Retrieved',
    '',
    state.evidenceRef
      ? [
        `- Query: ${state.evidenceRef.query}`,
        `- Documents: ${state.evidenceRef.retrievedDocumentCount}`,
        `- Source facts: ${state.evidenceRef.sourceFactCount}`,
        `- Runtime facts: ${state.evidenceRef.runtimeFactCount}`,
        `- Screenshots: ${state.evidenceRef.screenshotCount}`,
        `- Contradictions: ${state.evidenceRef.contradictionCount}`
      ].join('\n')
      : '- none',
    '',
    '## Fix Packet',
    '',
    state.fixPacketPath ? `- ${state.fixPacketPath}` : '- none',
    '',
    '## Approval',
    '',
    `- Status: ${state.approval.status}`,
    `- Required: ${state.approval.required ? 'yes' : 'no'}`,
    `- Approved: ${state.approval.approved ? 'yes' : 'no'}`,
    state.approval.reason ? `- Reason: ${state.approval.reason}` : '',
    '',
    '## Repair Attempt',
    '',
    state.repairAttemptRef
      ? [
        `- Status: ${state.repairAttemptRef.status}`,
        `- Agent: ${state.repairAttemptRef.agent}`,
        `- Attempt dir: ${state.repairAttemptRef.attemptDir ?? 'unknown'}`,
        `- Changed files: ${state.repairAttemptRef.changedFiles.length ? state.repairAttemptRef.changedFiles.join(', ') : 'none'}`
      ].join('\n')
      : '- none',
    '',
    '## Verification',
    '',
    state.verificationRef
      ? [
        `- Status: ${state.verificationRef.status}`,
        state.verificationRef.command ? `- Command: \`${state.verificationRef.command}\`` : '',
        state.verificationRef.reportPath ? `- Result: ${state.verificationRef.reportPath}` : ''
      ].filter(Boolean).join('\n')
      : '- not run',
    '',
    '## Trace Events',
    '',
    ...state.traceEvents.map((event) => `- ${event.timestamp} · ${event.node} · ${event.status}: ${event.message}${event.decision ? ` (${event.decision})` : ''}`),
    ''
  ].filter((line) => line !== undefined).join('\n')
}
