import type { AgentDecision, AgentNodeResult, SnifferAgentState } from '../snifferAgentState.js'
import { pushTrace } from '../snifferAgentState.js'

export async function humanApprovalNode(state: SnifferAgentState): Promise<AgentNodeResult> {
  const node = 'HumanApproval'
  pushTrace(state, node, 'started', 'Checking repair approval policy')
  if (state.autoApprove || (state.dryRun && state.agent === 'manual')) {
    state.approval = {
      required: !state.dryRun,
      approved: true,
      status: 'approved',
      reason: state.dryRun ? 'Dry-run manual proof is allowed without modifying files.' : 'autoApprove=true'
    }
    pushTrace(state, node, 'completed', state.approval.reason ?? 'Approved')
    return { node, status: 'completed', message: 'Repair approved' }
  }
  state.approval = {
    required: true,
    approved: false,
    status: 'required',
    reason: 'Human approval is required before applying repair.'
  }
  state.status = 'awaiting_approval'
  state.humanReviewReason = state.approval.reason
  const decision: AgentDecision = 'human_review'
  state.finalDecision = decision
  state.finalStatus = decision
  pushTrace(state, node, 'completed', state.approval.reason ?? 'Human approval required', { decision })
  return { node, status: 'completed', message: 'Human approval required', decision }
}
