import { retrieveEvidenceFromReport } from '../../evidence/retrieval.js'
import type { AgentNodeResult, SnifferAgentState } from '../snifferAgentState.js'
import { evidenceRef, pushTrace } from '../snifferAgentState.js'

export async function retrieveEvidenceNode(state: SnifferAgentState): Promise<AgentNodeResult> {
  const node = 'RetrieveEvidence'
  if (!state.report || !state.selectedIssue || !state.issueId) throw new Error('Report and selected issue are required before evidence retrieval.')
  const query = `${state.issueId} ${state.selectedIssue.title} ${state.selectedIssue.type} ${state.selectedIssue.evidence.join(' ')}`
  pushTrace(state, node, 'started', `Retrieving evidence for ${state.issueId}`)
  const packet = retrieveEvidenceFromReport(query, state.report, {
    issueId: state.issueId,
    entityHints: state.selectedIssue.suspected_files,
    includeRuntime: true,
    includeScreenshots: true,
    includePriorRepairs: true,
    maxResults: 16
  })
  state.evidencePacket = packet
  state.evidenceRef = evidenceRef(packet)
  pushTrace(state, node, 'completed', `Retrieved ${packet.retrievedDocuments.length} evidence documents`, { evidence: state.evidenceRef })
  return { node, status: 'completed', message: 'Evidence retrieved' }
}
