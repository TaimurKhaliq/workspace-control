import { loadReport } from '../../repair/fixPackets.js'
import type { AgentNodeResult, SnifferAgentState } from '../snifferAgentState.js'
import { pushTrace } from '../snifferAgentState.js'

export async function loadReportNode(state: SnifferAgentState): Promise<AgentNodeResult> {
  const node = 'AuditReportLoaded'
  pushTrace(state, node, 'started', `Loading report ${state.reportPath}`)
  state.report = await loadReport(state.reportPath)
  state.appUrl = state.appUrl ?? state.report.crawlGraph?.startUrl
  pushTrace(state, node, 'completed', `Loaded report with ${state.report.issues.length} issues`)
  return { node, status: 'completed', message: 'Report loaded' }
}
