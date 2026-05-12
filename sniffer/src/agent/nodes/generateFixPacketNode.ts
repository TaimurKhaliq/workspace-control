import path from 'node:path'
import { generateFixPackets, loadFixPacket } from '../../repair/fixPackets.js'
import type { AgentNodeResult, SnifferAgentState } from '../snifferAgentState.js'
import { pushTrace } from '../snifferAgentState.js'

export async function generateFixPacketNode(state: SnifferAgentState): Promise<AgentNodeResult> {
  const node = 'GenerateFixPacket'
  if (!state.issueId) throw new Error('Issue id is required before generating a fix packet.')
  pushTrace(state, node, 'started', `Generating/loading fix packet for ${state.issueId}`)
  await generateFixPackets(state.reportPath, state.allowDestructive)
  const packet = await loadFixPacket(state.reportPath, state.issueId)
  state.fixPacket = packet
  state.fixPacketPath = path.join(state.reportDir, 'fix_packets', `${state.issueId}.md`)
  pushTrace(state, node, 'completed', `Fix packet ready at ${state.fixPacketPath}`, {
    toolCall: {
      id: `${state.agentRunId}-generate-fix-packet`,
      toolName: 'generateFixPackets',
      inputSummary: state.reportPath,
      outputSummary: state.fixPacketPath,
      status: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    }
  })
  return { node, status: 'completed', message: 'Fix packet ready' }
}
