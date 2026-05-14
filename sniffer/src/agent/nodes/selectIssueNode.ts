import type { Issue, Severity } from '../../types.js'
import type { AgentNodeResult, SnifferAgentState } from '../snifferAgentState.js'
import { pushTrace } from '../snifferAgentState.js'

const severityOrder: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 }

export async function selectIssueNode(state: SnifferAgentState): Promise<AgentNodeResult> {
  const node = 'SelectIssue'
  pushTrace(state, node, 'started', state.issueId ? `Selecting requested issue ${state.issueId}` : 'Selecting highest severity open issue')
  if (!state.report) throw new Error('Report must be loaded before selecting an issue.')
  const issue = state.issueId
    ? state.report.issues.find((item) => item.issue_id === state.issueId)
    : selectHighestSeverityIssue(state.report.issues)
  if (!issue && !state.issueId) {
    state.finalDecision = 'fixed'
    state.finalStatus = 'fixed'
    state.status = 'succeeded'
    state.completedAt = new Date().toISOString()
    pushTrace(state, node, 'completed', 'No open issue found; no repair needed.', { decision: 'fixed' })
    return { node, status: 'completed', message: 'No repair needed', decision: 'fixed' }
  }
  if (!issue) throw new Error(`Issue not found: ${state.issueId}`)
  if (!issue.issue_id) throw new Error(`Selected issue is missing issue_id: ${issue.title}`)
  state.selectedIssue = issue
  state.issueId = issue.issue_id
  pushTrace(state, node, 'completed', `Selected ${issue.severity} ${issue.type}: ${issue.title}`)
  return { node, status: 'completed', message: 'Issue selected' }
}

function selectHighestSeverityIssue(issues: Issue[]): Issue | undefined {
  return issues
    .filter((issue) => issue.status !== 'fixed')
    .sort((left, right) => severityOrder[right.severity] - severityOrder[left.severity] || left.title.localeCompare(right.title))[0]
}
