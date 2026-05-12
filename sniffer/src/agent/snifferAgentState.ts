import path from 'node:path'
import type { EvidencePacket, FixPacket, Issue, RepairAttempt, SnifferReport, VerificationResult } from '../types.js'

export type AgentRunStatus = 'queued' | 'running' | 'awaiting_approval' | 'succeeded' | 'failed'
export type AgentDecision = 'fixed' | 'retry' | 'human_review' | 'unsafe' | 'failed'
export type AgentNodeStatus = 'started' | 'completed' | 'skipped' | 'failed'
export type RepairAgentName = 'manual' | 'codex'

export interface AgentToolCall {
  id: string
  toolName: string
  inputSummary: string
  outputSummary?: string
  status: AgentNodeStatus
  startedAt: string
  completedAt?: string
}

export interface AgentEvidencePacketRef {
  query: string
  retrievedDocumentCount: number
  sourceFactCount: number
  runtimeFactCount: number
  screenshotCount: number
  contradictionCount: number
}

export interface HumanApprovalState {
  required: boolean
  approved: boolean
  status: 'not_required' | 'required' | 'approved' | 'rejected'
  reason?: string
}

export interface RepairAttemptRef {
  issueId: string
  attemptDir?: string
  agent: RepairAgentName
  status: string
  changedFiles: string[]
  diffSummary?: string
}

export interface VerificationRef {
  issueId: string
  status: 'fixed' | 'still_failing' | 'inconclusive' | 'not_run'
  reportPath?: string
  command?: string
}

export interface AgentTraceEvent {
  id: string
  timestamp: string
  node: string
  status: AgentNodeStatus
  message: string
  toolCall?: AgentToolCall
  decision?: AgentDecision
  evidence?: AgentEvidencePacketRef
}

export interface AgentNodeResult {
  node: string
  status: AgentNodeStatus
  message: string
  decision?: AgentDecision
}

export interface SnifferAgentState {
  agentRunId: string
  status: AgentRunStatus
  reportPath: string
  reportDir: string
  projectId?: string
  appUrl?: string
  issueId?: string
  selectedIssue?: Issue
  report?: SnifferReport
  evidencePacket?: EvidencePacket
  evidenceRef?: AgentEvidencePacketRef
  fixPacket?: FixPacket
  fixPacketPath?: string
  approval: HumanApprovalState
  repairAttempt?: RepairAttempt
  repairAttemptRef?: RepairAttemptRef
  verification?: VerificationResult
  verificationRef?: VerificationRef
  retryCount: number
  maxRetries: number
  finalDecision?: AgentDecision
  agent: RepairAgentName
  autoApprove: boolean
  dryRun: boolean
  allowDestructive: boolean
  traceEvents: AgentTraceEvent[]
  startedAt: string
  completedAt?: string
  agentRunDir?: string
}

export function createInitialAgentState(input: {
  agentRunId: string
  reportPath: string
  projectId?: string
  issueId?: string
  agent?: RepairAgentName
  maxRetries?: number
  autoApprove?: boolean
  dryRun?: boolean
  allowDestructive?: boolean
  appUrl?: string
}): SnifferAgentState {
  const reportDir = path.dirname(input.reportPath)
  return {
    agentRunId: input.agentRunId,
    status: 'queued',
    reportPath: input.reportPath,
    reportDir,
    projectId: input.projectId,
    issueId: input.issueId,
    appUrl: input.appUrl,
    approval: { required: false, approved: false, status: 'not_required' },
    retryCount: 0,
    maxRetries: input.maxRetries ?? 1,
    agent: input.agent ?? 'manual',
    autoApprove: Boolean(input.autoApprove),
    dryRun: Boolean(input.dryRun),
    allowDestructive: Boolean(input.allowDestructive),
    traceEvents: [],
    startedAt: new Date().toISOString()
  }
}

export function pushTrace(
  state: SnifferAgentState,
  node: string,
  status: AgentNodeStatus,
  message: string,
  extra: Partial<Omit<AgentTraceEvent, 'id' | 'timestamp' | 'node' | 'status' | 'message'>> = {}
): void {
  state.traceEvents.push({
    id: `${state.traceEvents.length + 1}-${node}-${status}`,
    timestamp: new Date().toISOString(),
    node,
    status,
    message,
    ...extra
  })
}

export function evidenceRef(packet: EvidencePacket): AgentEvidencePacketRef {
  return {
    query: packet.context.query,
    retrievedDocumentCount: packet.retrievedDocuments.length,
    sourceFactCount: packet.sourceFacts.length,
    runtimeFactCount: packet.runtimeFacts.length,
    screenshotCount: packet.screenshots.length,
    contradictionCount: packet.contradictions.length
  }
}
