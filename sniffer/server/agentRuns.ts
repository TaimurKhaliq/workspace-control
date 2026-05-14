import { access, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const agentNodeOrder = [
  'AuditReportLoaded',
  'SelectIssue',
  'RetrieveEvidence',
  'GenerateFixPacket',
  'HumanApproval',
  'ApplyRepair',
  'VerifyIssue',
  'DecideNextStep'
]

export type AgentRunTerminalStatus = 'fixed' | 'human_review' | 'failed' | 'unsafe' | 'cancelled'

export interface AgentRunTraceEvent {
  id: string
  timestamp: string
  node: string
  type?: string
  status: string
  title?: string
  summary?: string
  message: string
  toolCall?: {
    id: string
    toolName: string
    inputSummary: string
    outputSummary?: string
    status: string
    startedAt: string
    completedAt?: string
  }
  decision?: string
  evidence?: AgentRunRecord['evidencePacketSummary']
  relatedFiles?: string[]
  durationMs?: number
}

export interface AgentRunRecord {
  graphEngine?: string
  agentRunId: string
  runId: string
  status: 'queued' | 'running' | 'waiting_for_human' | 'awaiting_approval' | 'succeeded' | 'failed'
  currentNode?: string
  finalStatus?: 'fixed' | 'retry' | 'human_review' | 'unsafe' | 'failed'
  finalDecision?: 'fixed' | 'retry' | 'human_review' | 'unsafe' | 'failed'
  issueId?: string
  projectId?: string
  agent?: string
  autoApprove?: boolean
  dryRun?: boolean
  reportPath?: string
  selectedIssue?: {
    issue_id: string
    title: string
    severity: string
    type: string
  }
  traceEvents: AgentRunTraceEvent[]
  nodeStatuses: AgentNodeStatus[]
  evidencePacketSummary?: {
    query: string
    retrievedDocumentCount: number
    sourceFactCount: number
    runtimeFactCount: number
    screenshotCount: number
    contradictionCount: number
  }
  fixPacketSummary?: {
    path?: string
    ready: boolean
  }
  fixPacketPath?: string
  approval: {
    required: boolean
    approved: boolean
    status: string
    reason?: string
  }
  repairAttempt?: {
    issueId: string
    attemptDir?: string
    agent: string
    status: string
    changedFiles: string[]
    diffSummary?: string
  }
  verification?: {
    issueId: string
    status: string
    reportPath?: string
    command?: string
  }
  changedFiles: string[]
  diffSummary: string
  startedAt?: string
  completedAt?: string
  durationMs?: number
  traceJsonPath: string
  traceMarkdownPath: string
  errors: string[]
  humanReviewReason?: string
}

export interface AgentNodeStatus {
  id: string
  label: string
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'waiting_for_human' | 'skipped'
  startedAt?: string
  completedAt?: string
  durationMs?: number
  summary?: string
  badges: {
    evidence?: number
    filesChanged?: number
    logs?: number
    errors?: number
    retries?: number
  }
}

export async function listAgentRuns(reportDir: string, projectId?: string): Promise<AgentRunRecord[]> {
  const root = path.join(reportDir, 'agent_runs')
  if (!await exists(root)) return []
  const runIds = await directoryNames(root)
  const runs = await Promise.all(runIds.map((runId) => readAgentRun(reportDir, runId).catch(() => undefined)))
  return runs
    .filter((run): run is AgentRunRecord => Boolean(run))
    .filter((run) => !projectId || run.projectId === projectId || !run.projectId)
    .sort((left, right) => String(right.startedAt ?? '').localeCompare(String(left.startedAt ?? '')))
}

export async function readAgentRun(reportDir: string, runId: string): Promise<AgentRunRecord | undefined> {
  const runDir = safeJoin(path.join(reportDir, 'agent_runs'), runId)
  if (!runDir) return undefined
  const traceJsonPath = path.join(runDir, 'agent_trace.json')
  if (!await exists(traceJsonPath)) return undefined
  const raw = JSON.parse(await readFile(traceJsonPath, 'utf8')) as Record<string, unknown>
  return normalizeAgentRun(raw, traceJsonPath, path.join(runDir, 'agent_trace.md'))
}

export async function writeRejectedAgentRun(run: AgentRunRecord, reason = 'Human rejected repair approval.'): Promise<AgentRunRecord> {
  const timestamp = new Date().toISOString()
  const event: AgentRunTraceEvent = {
    id: `${run.traceEvents.length + 1}-HumanApproval-rejected`,
    timestamp,
    node: 'HumanApproval',
    type: 'approval_rejected',
    status: 'completed',
    title: 'Approval rejected',
    summary: reason,
    message: reason,
    decision: 'human_review'
  }
  const next = normalizeAgentRun({
    ...run,
    status: 'awaiting_approval',
    finalDecision: 'human_review',
    finalStatus: 'human_review',
    approval: { ...run.approval, approved: false, status: 'rejected', reason },
    humanReviewReason: reason,
    completedAt: timestamp,
    traceEvents: [...run.traceEvents, event]
  }, run.traceJsonPath, run.traceMarkdownPath)
  await writeFile(run.traceJsonPath, JSON.stringify(next, null, 2))
  await writeFile(run.traceMarkdownPath, renderRejectedTrace(next), 'utf8')
  return next
}

export function normalizeAgentRun(raw: Record<string, unknown>, traceJsonPath: string, traceMarkdownPath: string): AgentRunRecord {
  const traceEvents = Array.isArray(raw.traceEvents) ? raw.traceEvents as AgentRunTraceEvent[] : []
  const finalDecision = stringValue(raw.finalDecision) as AgentRunRecord['finalDecision']
  const status = normalizeStatus(stringValue(raw.status), finalDecision)
  const currentNode = traceEvents.at(-1)?.node
  const evidence = raw.evidence as AgentRunRecord['evidencePacketSummary'] | undefined
  const repairAttempt = raw.repairAttempt as AgentRunRecord['repairAttempt'] | undefined
  const verification = raw.verification as AgentRunRecord['verification'] | undefined
  const startedAt = stringValue(raw.startedAt)
  const completedAt = stringValue(raw.completedAt)
  const durationMs = startedAt && completedAt ? Date.parse(completedAt) - Date.parse(startedAt) : undefined
  return {
    graphEngine: stringValue(raw.graphEngine) ?? 'langgraph',
    agentRunId: stringValue(raw.agentRunId) ?? path.basename(path.dirname(traceJsonPath)),
    runId: stringValue(raw.agentRunId) ?? path.basename(path.dirname(traceJsonPath)),
    status,
    currentNode,
    finalStatus: (stringValue(raw.finalStatus) ?? finalDecision) as AgentRunRecord['finalStatus'],
    finalDecision,
    issueId: stringValue(raw.issueId),
    projectId: stringValue(raw.projectId),
    agent: stringValue(raw.agent),
    autoApprove: typeof raw.autoApprove === 'boolean' ? raw.autoApprove : undefined,
    dryRun: typeof raw.dryRun === 'boolean' ? raw.dryRun : undefined,
    reportPath: stringValue(raw.reportPath),
    selectedIssue: raw.selectedIssue as AgentRunRecord['selectedIssue'] | undefined,
    traceEvents,
    nodeStatuses: buildNodeStatuses(traceEvents, evidence, repairAttempt),
    evidencePacketSummary: evidence,
    fixPacketSummary: { path: stringValue(raw.fixPacketPath), ready: Boolean(raw.fixPacketPath) },
    fixPacketPath: stringValue(raw.fixPacketPath),
    approval: (raw.approval as AgentRunRecord['approval'] | undefined) ?? { required: false, approved: false, status: 'not_required' },
    repairAttempt,
    verification,
    changedFiles: repairAttempt?.changedFiles ?? [],
    diffSummary: repairAttempt?.diffSummary ?? '',
    startedAt,
    completedAt,
    durationMs: Number.isFinite(durationMs) ? durationMs : undefined,
    traceJsonPath,
    traceMarkdownPath,
    errors: Array.isArray(raw.errors) ? raw.errors as string[] : [],
    humanReviewReason: stringValue(raw.humanReviewReason)
  }
}

function buildNodeStatuses(
  events: AgentRunTraceEvent[],
  evidence?: AgentRunRecord['evidencePacketSummary'],
  repairAttempt?: AgentRunRecord['repairAttempt']
): AgentNodeStatus[] {
  return agentNodeOrder.map((label) => {
    const nodeEvents = events.filter((event) => event.node === label)
    const last = nodeEvents.at(-1)
    const started = nodeEvents.find((event) => event.status === 'started')
    const completed = [...nodeEvents].reverse().find((event) => ['completed', 'failed', 'skipped'].includes(event.status))
    const status = nodeStatus(label, last)
    const startedAt = started?.timestamp
    const completedAt = completed?.timestamp
    const durationMs = startedAt && completedAt ? Date.parse(completedAt) - Date.parse(startedAt) : undefined
    return {
      id: label,
      label: readableNode(label),
      status,
      startedAt,
      completedAt,
      durationMs: Number.isFinite(durationMs) ? durationMs : undefined,
      summary: completed?.summary ?? completed?.message ?? started?.message,
      badges: {
        evidence: label === 'RetrieveEvidence' ? evidence?.retrievedDocumentCount : undefined,
        filesChanged: label === 'ApplyRepair' ? repairAttempt?.changedFiles.length : undefined,
        logs: nodeEvents.length || undefined,
        errors: nodeEvents.filter((event) => event.status === 'failed').length || undefined
      }
    }
  })
}

function nodeStatus(label: string, event?: AgentRunTraceEvent): AgentNodeStatus['status'] {
  if (!event) return 'pending'
  if (event.status === 'started') return 'running'
  if (event.status === 'failed') return 'failed'
  if (event.status === 'skipped') return 'skipped'
  if (label === 'HumanApproval' && event.type === 'approval_required') return 'waiting_for_human'
  return 'succeeded'
}

function normalizeStatus(status?: string, decision?: string): AgentRunRecord['status'] {
  if (status === 'awaiting_approval') return 'waiting_for_human'
  if (status === 'running' || status === 'queued' || status === 'succeeded' || status === 'failed') return status
  if (decision === 'human_review') return 'waiting_for_human'
  return 'queued'
}

function renderRejectedTrace(run: AgentRunRecord): string {
  return [
    '# Sniffer Repair Agent Trace',
    '',
    '- Graph engine: LangGraph JS (@langchain/langgraph)',
    `- Agent run: ${run.agentRunId}`,
    `- Status: ${run.status}`,
    `- Final decision: ${run.finalDecision ?? 'human_review'}`,
    `- Issue: ${run.issueId ?? 'not selected'}`,
    '',
    '## Approval',
    '',
    `- Status: ${run.approval.status}`,
    `- Required: ${run.approval.required ? 'yes' : 'no'}`,
    `- Approved: ${run.approval.approved ? 'yes' : 'no'}`,
    run.approval.reason ? `- Reason: ${run.approval.reason}` : '',
    '',
    '## Trace Events',
    '',
    ...run.traceEvents.map((event) => `- ${event.timestamp} · ${event.node} · ${event.status}: ${event.message}${event.decision ? ` (${event.decision})` : ''}`),
    ''
  ].join('\n')
}

function readableNode(label: string): string {
  return label.replace(/([a-z])([A-Z])/g, '$1 $2')
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function safeJoin(root: string, relative: string): string | undefined {
  const file = path.resolve(root, relative)
  return file.startsWith(path.resolve(root) + path.sep) || file === path.resolve(root) ? file : undefined
}

async function directoryNames(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(() => true).catch(() => false)
}
