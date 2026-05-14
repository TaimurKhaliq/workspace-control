import type { AgentDecision, AgentNodeResult, SnifferAgentState } from '../snifferAgentState.js'
import { pushTrace } from '../snifferAgentState.js'

export async function decideNextStepNode(state: SnifferAgentState): Promise<AgentNodeResult> {
  const node = 'DecideNextStep'
  pushTrace(state, node, 'started', 'Evaluating final repair outcome')
  let decision: AgentDecision
  if (state.verification?.status === 'fixed') decision = 'fixed'
  else if (!state.approval.approved) decision = 'human_review'
  else if (state.repairAttempt?.agentResult.status === 'unsafe_blocked') decision = 'unsafe'
  else if (state.verification?.status === 'still_failing' && state.retryCount < state.maxRetries) decision = 'retry'
  else if (state.verification?.status === 'inconclusive') decision = 'human_review'
  else decision = state.repairAttempt ? 'failed' : 'human_review'

  state.finalDecision = decision
  state.finalStatus = decision
  if (decision === 'retry') state.retryCount += 1
  if (decision === 'human_review') state.humanReviewReason = state.approval.reason ?? 'Human review is required before the agent can continue.'
  state.status = decision === 'fixed' ? 'succeeded' : decision === 'failed' || decision === 'unsafe' ? 'failed' : 'awaiting_approval'
  state.completedAt = new Date().toISOString()
  pushTrace(state, node, 'completed', `Decision: ${decision}`, { decision })
  return { node, status: 'completed', message: `Decision: ${decision}`, decision }
}
