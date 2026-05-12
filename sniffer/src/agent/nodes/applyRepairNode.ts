import { applyFix } from '../../repair/applyFix.js'
import type { AgentNodeResult, SnifferAgentState } from '../snifferAgentState.js'
import { pushTrace } from '../snifferAgentState.js'

export async function applyRepairNode(state: SnifferAgentState): Promise<AgentNodeResult> {
  const node = 'ApplyRepair'
  if (!state.issueId) throw new Error('Issue id is required before applying repair.')
  if (!state.approval.approved) {
    pushTrace(state, node, 'skipped', 'Repair skipped because human approval is required.')
    return { node, status: 'skipped', message: 'Repair skipped without approval', decision: 'human_review' }
  }
  const agentName = state.dryRun ? 'manual' : state.agent
  pushTrace(state, node, 'started', `Running ${agentName} repair for ${state.issueId}`)
  const attempt = await applyFix({
    issueId: state.issueId,
    reportPath: state.reportPath,
    agentName,
    allowDestructive: state.allowDestructive,
    iteration: state.retryCount + 1
  })
  state.repairAttempt = attempt
  state.repairAttemptRef = {
    issueId: state.issueId,
    attemptDir: attempt.attemptDir,
    agent: agentName,
    status: attempt.agentResult.status,
    changedFiles: attempt.agentResult.changedFiles,
    diffSummary: attempt.gitDiffSummary
  }
  pushTrace(state, node, 'completed', `Repair attempt ${attempt.agentResult.status}`, {
    toolCall: {
      id: `${state.agentRunId}-apply-repair`,
      toolName: 'applyFix',
      inputSummary: `${state.issueId} via ${agentName}`,
      outputSummary: attempt.attemptDir,
      status: attempt.agentResult.success ? 'completed' : 'failed',
      startedAt: attempt.agentResult.startedAt,
      completedAt: attempt.agentResult.completedAt
    }
  })
  return { node, status: 'completed', message: 'Repair attempt recorded' }
}
