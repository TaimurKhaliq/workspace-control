import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import type {
  AgentDecision,
  AgentRunStatus,
  AgentTraceEvent,
  HumanApprovalState,
  RepairAgentName,
  RepairAttemptRef,
  SnifferAgentState,
  VerificationRef
} from '../snifferAgentState.js'
import type { EvidencePacket, FixPacket, Issue, RepairAttempt, SnifferReport, VerificationResult } from '../../types.js'
import { pushTrace } from '../snifferAgentState.js'
import { applyRepairNode } from '../nodes/applyRepairNode.js'
import { decideNextStepNode } from '../nodes/decideNextStepNode.js'
import { generateFixPacketNode } from '../nodes/generateFixPacketNode.js'
import { humanApprovalNode } from '../nodes/humanApprovalNode.js'
import { loadReportNode } from '../nodes/loadReportNode.js'
import { retrieveEvidenceNode } from '../nodes/retrieveEvidenceNode.js'
import { selectIssueNode } from '../nodes/selectIssueNode.js'
import { verifyIssueNode } from '../nodes/verifyIssueNode.js'

export type SnifferRepairGraphRoute =
  | 'continue'
  | 'approved'
  | 'retry'
  | 'fixed'
  | 'human_review'
  | 'unsafe'
  | 'failed'

export type SnifferRepairAgentState = SnifferAgentState

export const SnifferRepairAgentAnnotation = Annotation.Root({
  agentRunId: Annotation<string>(),
  status: Annotation<AgentRunStatus>(),
  finalStatus: Annotation<AgentDecision | undefined>(),
  reportPath: Annotation<string>(),
  reportDir: Annotation<string>(),
  projectId: Annotation<string | undefined>(),
  appUrl: Annotation<string | undefined>(),
  issueId: Annotation<string | undefined>(),
  selectedIssue: Annotation<Issue | undefined>(),
  report: Annotation<SnifferReport | undefined>(),
  evidencePacket: Annotation<EvidencePacket | undefined>(),
  evidenceRef: Annotation<SnifferAgentState['evidenceRef'] | undefined>(),
  fixPacket: Annotation<FixPacket | undefined>(),
  fixPacketPath: Annotation<string | undefined>(),
  approval: Annotation<HumanApprovalState>(),
  repairAttempt: Annotation<RepairAttempt | undefined>(),
  repairAttemptRef: Annotation<RepairAttemptRef | undefined>(),
  verification: Annotation<VerificationResult | undefined>(),
  verificationRef: Annotation<VerificationRef | undefined>(),
  retryCount: Annotation<number>(),
  maxRetries: Annotation<number>(),
  finalDecision: Annotation<AgentDecision | undefined>(),
  agent: Annotation<RepairAgentName>(),
  autoApprove: Annotation<boolean>(),
  dryRun: Annotation<boolean>(),
  allowDestructive: Annotation<boolean>(),
  errors: Annotation<string[]>(),
  humanReviewReason: Annotation<string | undefined>(),
  traceEvents: Annotation<AgentTraceEvent[]>(),
  startedAt: Annotation<string>(),
  completedAt: Annotation<string | undefined>(),
  agentRunDir: Annotation<string | undefined>()
})

export function createSnifferRepairGraph() {
  return new StateGraph(SnifferRepairAgentAnnotation)
    .addNode('loadReport', langGraphNode('LoadReport', loadReportNode))
    .addNode('selectIssue', langGraphNode('SelectIssue', selectIssueNode))
    .addNode('retrieveEvidence', langGraphNode('RetrieveEvidence', retrieveEvidenceNode))
    .addNode('generateFixPacket', langGraphNode('GenerateFixPacket', generateFixPacketNode))
    .addNode('humanApproval', langGraphNode('HumanApproval', humanApprovalNode))
    .addNode('applyRepair', langGraphNode('ApplyRepair', applyRepairNode))
    .addNode('verifyIssue', langGraphNode('VerifyIssue', verifyIssueNode))
    .addNode('decideNextStep', langGraphNode('DecideNextStep', decideNextStepNode))
    .addEdge(START, 'loadReport')
    .addConditionalEdges('loadReport', routeAfterToolNode, {
      continue: 'selectIssue',
      failed: END
    })
    .addConditionalEdges('selectIssue', routeAfterSelectIssue, {
      continue: 'retrieveEvidence',
      fixed: END,
      failed: END
    })
    .addConditionalEdges('retrieveEvidence', routeAfterToolNode, {
      continue: 'generateFixPacket',
      failed: END
    })
    .addConditionalEdges('generateFixPacket', routeAfterToolNode, {
      continue: 'humanApproval',
      failed: END
    })
    .addConditionalEdges('humanApproval', routeAfterHumanApproval, {
      approved: 'applyRepair',
      human_review: END,
      unsafe: END,
      failed: END
    })
    .addConditionalEdges('applyRepair', routeAfterToolNode, {
      continue: 'verifyIssue',
      failed: END
    })
    .addConditionalEdges('verifyIssue', routeAfterToolNode, {
      continue: 'decideNextStep',
      failed: END
    })
    .addConditionalEdges('decideNextStep', routeAfterDecision, {
      fixed: END,
      retry: 'retrieveEvidence',
      human_review: END,
      unsafe: END,
      failed: END
    })
    .compile({
      name: 'sniffer-repair-agent',
      description: 'LangGraph repair agent over Sniffer audit reports, evidence retrieval, fix packets, approval, repair, and verification.'
    })
}

export const snifferRepairGraph = createSnifferRepairGraph()

function langGraphNode(
  graphNodeName: string,
  node: (state: SnifferAgentState) => Promise<unknown>
): (state: SnifferRepairAgentState) => Promise<Partial<SnifferRepairAgentState>> {
  return async (state) => {
    const mutable = cloneStateForNode(state)
    try {
      await node(mutable)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      mutable.errors = [...mutable.errors, message]
      mutable.status = 'failed'
      mutable.finalDecision = 'failed'
      mutable.finalStatus = 'failed'
      mutable.completedAt = new Date().toISOString()
      pushTrace(mutable, graphNodeName, 'failed', message, { decision: 'failed' })
    }
    return mutable
  }
}

function routeAfterSelectIssue(state: SnifferRepairAgentState): SnifferRepairGraphRoute {
  if (state.finalDecision === 'fixed') return 'fixed'
  if (state.finalDecision === 'failed' || state.errors.length) return 'failed'
  return 'continue'
}

function routeAfterToolNode(state: SnifferRepairAgentState): SnifferRepairGraphRoute {
  if (state.finalDecision === 'failed' || state.errors.length) return 'failed'
  return 'continue'
}

function routeAfterHumanApproval(state: SnifferRepairAgentState): SnifferRepairGraphRoute {
  if (state.finalDecision === 'failed' || state.errors.length) return 'failed'
  if (state.finalDecision === 'unsafe') return 'unsafe'
  if (state.approval.approved) return 'approved'
  return 'human_review'
}

function routeAfterDecision(state: SnifferRepairAgentState): SnifferRepairGraphRoute {
  if (state.finalDecision === 'retry' && state.retryCount <= state.maxRetries) return 'retry'
  if (state.finalDecision === 'fixed') return 'fixed'
  if (state.finalDecision === 'unsafe') return 'unsafe'
  if (state.finalDecision === 'failed') return 'failed'
  return 'human_review'
}

function cloneStateForNode(state: SnifferRepairAgentState): SnifferAgentState {
  return {
    ...state,
    approval: { ...state.approval },
    traceEvents: [...state.traceEvents],
    errors: [...state.errors]
  }
}
