import { verifyIssue } from '../../repair/verify.js'
import type { AgentNodeResult, SnifferAgentState } from '../snifferAgentState.js'
import { pushTrace } from '../snifferAgentState.js'

export async function verifyIssueNode(state: SnifferAgentState): Promise<AgentNodeResult> {
  const node = 'VerifyIssue'
  if (!state.issueId) throw new Error('Issue id is required before verification.')
  if (!state.repairAttempt) {
    state.verificationRef = { issueId: state.issueId, status: 'not_run' }
    pushTrace(state, node, 'skipped', 'Verification skipped because no repair attempt was applied.')
    return { node, status: 'skipped', message: 'Verification skipped' }
  }
  if (!state.appUrl) {
    state.verificationRef = { issueId: state.issueId, status: 'inconclusive' }
    pushTrace(state, node, 'skipped', 'Verification skipped because no app URL is available.')
    return { node, status: 'skipped', message: 'Verification URL missing' }
  }
  pushTrace(state, node, 'started', `Verifying ${state.issueId}`)
  const verification = await verifyIssue({
    issueId: state.issueId,
    reportPath: state.reportPath,
    url: state.appUrl
  })
  state.verification = verification
  state.verificationRef = {
    issueId: state.issueId,
    status: verification.status,
    reportPath: verification.reportPath,
    command: verification.verificationCommand
  }
  pushTrace(state, node, 'completed', `Verification ${verification.status}`, {
    toolCall: {
      id: `${state.agentRunId}-verify-issue`,
      toolName: 'verifyIssue',
      inputSummary: `${state.issueId} ${state.appUrl}`,
      outputSummary: verification.status,
      status: verification.status === 'fixed' ? 'completed' : 'failed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    }
  })
  return { node, status: 'completed', message: 'Verification completed' }
}
