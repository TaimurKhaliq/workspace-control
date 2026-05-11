export type Severity = 'critical' | 'high' | 'medium' | 'low'

export interface Issue {
  issue_id?: string
  severity: Severity
  type: string
  title: string
  description: string
  evidence: string[]
  status?: string
  suspected_files?: string[]
  screenshotPath?: string
  tracePath?: string
  suggestedFixPrompt?: string
  fix_prompt?: string
  critic_decision?: {
    classification: string
    confidence: number
    reasoning_summary: string
    should_report: boolean
  }
}

export interface ScenarioRun {
  slug?: string
  name: string
  status: 'passed' | 'failed' | 'skipped' | 'blocked'
  prerequisites?: string[]
  stepsAttempted?: string[]
  assertions?: Array<{ label: string; status: string; evidence?: string[]; screenshotPath?: string }>
  steps?: Array<{ name?: string; status?: string; action?: string; error?: string; evidence?: string[] }>
  stepTraces?: Array<{
    scenarioName?: string
    scenarioSlug?: string
    stepName?: string
    actionLabel?: string
    url?: string
    screenName?: string
    screenshotPath?: string
    headings?: string[]
    visibleControls?: string[]
  }>
  issues?: Issue[]
  screenshots?: string[]
}

export interface SnifferReport {
  generatedAt: string
  issues: Issue[]
  rawFindings?: Issue[]
  sourceInventory?: SourceInventory
  uiIntentGraph?: UIIntentGraph
  graphRefinement?: GraphRefinementResult
  evidenceRetrievalSummaries?: EvidenceRetrievalSummary[]
  evidenceProvenance?: Record<string, unknown>
  suppressedRuntimeEvents?: Array<Record<string, unknown>>
  appProfile?: AppProfile
  discoveryMode?: string
  runtimeDomSnapshot?: {
    url: string
    title: string
    headings: Array<{ accessibleName?: string; visibleText?: string }>
    buttons: unknown[]
    links: unknown[]
    inputs: unknown[]
    selects: unknown[]
    textareas: unknown[]
    forms: unknown[]
    tables: unknown[]
    controls: unknown[]
    screenshotPath?: string
  }
  runtimeAppModel?: {
    app_name: string
    inferred_app_type: string
    workflows: Array<{ name: string; confidence: string; evidence?: string[]; source?: string; steps?: Array<{ action: string; target_name: string; expected_result?: string }> }>
    route_candidates: string[]
    actions: Array<{ target: string; safe: boolean; reason: string }>
    locator_inventory: unknown[]
    confidence: string
    evidence: string[]
  }
  llmRuntimeIntent?: {
    app_type: string
    primary_user_jobs: string[]
    workflows: Array<{ name: string; confidence: string }>
    notes: string[]
  }
  generatedScenarios?: GeneratedScenario[]
  deferredFindings?: CandidateFinding[]
  blockedChecks?: CandidateFinding[]
  needsMoreCrawling?: CandidateFinding[]
  scenarioRuns?: ScenarioRun[]
  runtimeWorkflowVerifications?: RuntimeWorkflowVerification[]
  runtimeSurfaceMatches?: Array<Record<string, unknown>>
  criticDecisions?: CriticDecision[]
  uxCriticFindings?: UxFinding[]
  productIntentFindings?: ProductIntentFinding[]
  productIntent?: {
    app_category?: string
    product_summary?: string
    confidence?: string
    core_entities?: Array<{ name: string; confidence?: string }>
    primary_user_jobs?: Array<{ name: string; confidence?: string }>
  }
  productExperience?: {
    mode?: string
    status?: string
    providerName?: string
    providerModel?: string
    providerApiStyle?: string
    screensReviewed?: number
    realLlmScreensReviewed?: number
    llmScreensReviewed?: number
    visionScreensReviewed?: number
    contexts?: ProductExperienceContext[]
    decisions?: ProductExperienceDecision[]
    evidenceRetrievalSummaries?: EvidenceRetrievalSummary[]
    issues?: Issue[]
  }
  promptConsistency?: {
    enabled: boolean
    runs: Array<{
      input_prompt: string
      response_feature_request?: string
      consistency_status: string
      stale_concepts_detected?: string[]
      screenshotPath?: string
    }>
  }
  crawlGraph?: {
    startUrl: string
    finalUrl: string
    states?: CrawlState[]
    actions?: CrawlAction[]
    unvisitedSafeActions?: SkippedSafeAction[]
    coverage?: CrawlCoverage
    consoleErrors: unknown[]
    networkFailures: NetworkFailure[]
    screenshots: string[]
  }
  sourceGraph?: {
    repoPath: string
    packageName?: string
    framework: string
    buildTool: string
    pages?: Array<{ file: string; name: string }>
    components?: Array<{ file: string; name: string }>
    uiSurfaces?: UiSurface[]
    sourceWorkflows?: SourceWorkflow[]
    apiCalls?: ApiCall[]
    stateActions?: StateAction[]
    sourceInventory?: SourceInventory
    uiIntentGraph?: UIIntentGraph
    graphRefinement?: GraphRefinementResult
    discoveryAdapters?: Array<{ adapterId: string; framework: string; confidence: number; evidence: string[]; warnings?: string[] }>
    workflowDiscoverySummary?: {
      source_workflows_count: number
      runtime_workflows_count?: number
      llm_workflows_count?: number
      generated_scenarios_count?: number
      executed_scenarios_count?: number
    }
  }
}

export interface EvidenceFact {
  id: string
  kind: string
  value: string
  source: string
  label?: string
  controlType?: string
  handler?: string
  ariaDescribedBy?: string
  placeholder?: string
  testId?: string
  options?: string[]
  safeActionHint?: boolean
  rawText?: string
  suppressedFromSemanticGraph?: boolean
  refinedFromFactId?: string
  filePath?: string
  symbol?: string
  snippet?: string
  confidence: number
  extractionMethod: 'deterministic' | 'heuristic' | 'llm' | 'runtime' | string
}

export interface SourceInventory {
  files?: Array<{ path: string; extension?: string; moduleName?: string; evidenceIds?: string[] }>
  modules?: string[]
  frameworkSignals?: EvidenceFact[]
  packageBuildSignals?: EvidenceFact[]
  rawExtractedSymbols?: EvidenceFact[]
  rawRoutes?: EvidenceFact[]
  rawTemplates?: EvidenceFact[]
  rawHandlers?: EvidenceFact[]
  rawApiCalls?: EvidenceFact[]
  provenance?: EvidenceFact[]
  facts: EvidenceFact[]
  generatedAt?: string
}

export interface UIIntentNode {
  id: string
  kind: string
  label: string
  filePath?: string
  symbol?: string
  route?: string
  confidence: number
  evidenceIds: string[]
  extractionMethod: string
  metadata?: Record<string, unknown>
}

export interface UIIntentEdge {
  id: string
  source: string
  target: string
  kind: string
  confidence: number
  evidenceIds: string[]
}

export interface EvidenceInference {
  id: string
  claim: string
  basedOn: string[]
  confidence: number
  method: string
  contradictedBy?: string[]
}

export interface UIIntentGraph {
  surfaces: UIIntentNode[]
  workflows: UIIntentNode[]
  actions: UIIntentNode[]
  controls: UIIntentNode[]
  forms: UIIntentNode[]
  state: UIIntentNode[]
  validation: UIIntentNode[]
  apiDataDependencies: UIIntentNode[]
  domainEntities: UIIntentNode[]
  edges: UIIntentEdge[]
  confidence: number
  evidenceReferences?: string[]
  inferences?: EvidenceInference[]
  generatedAt?: string
}

export interface GraphRefinementSuggestion {
  id: string
  type: string
  targetId: string
  fromValue?: unknown
  toValue?: unknown
  reason: string
  evidenceIds: string[]
  confidence: string
  risk: string
}

export interface AppliedGraphRefinementSuggestion extends GraphRefinementSuggestion {
  appliedAt: string
}

export interface RejectedGraphRefinementSuggestion extends GraphRefinementSuggestion {
  rejectedReason: string
}

export interface GraphRefinementResult {
  mode?: string
  status?: string
  modelReviewed: string
  llmUsed: boolean
  provider?: string
  model?: string
  suggestions: GraphRefinementSuggestion[]
  appliedSuggestions: AppliedGraphRefinementSuggestion[]
  rejectedSuggestions: RejectedGraphRefinementSuggestion[]
  warnings: string[]
}

export interface EvidenceRetrievalSummary {
  context: {
    issueId?: string
    screenName?: string
    workflowName?: string
    featureRequest?: string
    query: string
  }
  retrievedDocumentCount: number
  sourceFactCount: number
  runtimeFactCount: number
  contradictionCount: number
  kindBreakdown?: Record<string, number>
  sourceRuntimeRepairSplit?: {
    source: number
    runtime: number
    scenario: number
    productExperience: number
    priorFindings: number
    priorFixPackets: number
    priorRepairAttempts: number
  }
  averageScore?: number
  topDocuments: Array<{ id: string; kind: string; text: string; score?: number; whyRetrieved?: string[] }>
}

export interface EvidenceRetrievalDocument {
  id: string
  kind: string
  text: string
  metadata: Record<string, unknown>
  relatedEvidenceIds: string[]
  score?: number
  whyRetrieved?: string[]
}

export interface EvidencePacket {
  context: EvidenceRetrievalSummary['context']
  intent?: string
  retrievedDocuments: EvidenceRetrievalDocument[]
  graphNodes: UIIntentNode[]
  sourceFacts: EvidenceFact[]
  runtimeFacts: EvidenceFact[]
  screenshots: string[]
  priorFindings?: Issue[]
  priorFixPackets?: unknown[]
  priorRepairAttempts?: EvidenceRetrievalDocument[]
  contradictions: EvidenceInference[]
  confidenceSummary: Record<string, number>
}

export interface ProductExperienceContext {
  app_name?: string
  current_screen_name?: string
  nav_label_clicked?: string
  page_intent?: string
  workflow_intent?: string
  screenshot_path?: string
  screenshot_artifact_url?: string
  dom_summary?: string
  headings?: string[]
  visible_controls?: unknown[]
  evidence_retrieval_summary?: EvidenceRetrievalSummary
  [key: string]: unknown
}

export interface ProductExperienceDecision {
  screen_name?: string
  nav_label?: string
  workflow_intent?: string
  overall?: { classification?: string; confidence?: string; summary?: string }
  findings?: Array<Record<string, unknown>>
  non_issues?: Array<{ observation?: string; reason_not_reported?: string }>
  [key: string]: unknown
}

export interface AppProfile {
  profile_type: string
  confidence: string
  evidence: string[]
  core_entities: string[]
  primary_user_jobs: string[]
  expected_navigation_patterns: string[]
  expected_workflows: string[]
  expected_output_surfaces: string[]
}

export interface GeneratedScenario {
  id: string
  name: string
  profileApplicability: string[]
  prerequisites: string[]
  expectedControls: string[]
  expectedOutcomes: string[]
  steps?: Array<{ name: string; action: string; expectedControls: string[]; safe: boolean; unsafeReason?: string }>
  destructiveRisk?: string
  confidence: string
  evidence: string[]
}

export interface SnifferProject {
  id: string
  name: string
  repoPath: string
  appUrl: string
  framework: string
  buildTool: string
  packageName?: string
  workingDirectory: string
  devCommand?: string
  buildCommand?: string
  testCommand?: string
  profile?: AppProfile
  createdAt: string
  updatedAt: string
  latestReportPath?: string
  latestRunId?: string
  discoveryMode?: string
  lastRuntimeDomSnapshotPath?: string
  inferredAppProfile?: AppProfile
}

export interface RuntimeWorkflowVerification {
  name: string
  sourceFiles: string[]
  status: 'verified' | 'missing' | 'partial' | 'unknown' | string
  evidence: string[]
  controls: Array<{ label: string; status: string; matchedEvidence?: string[]; missingReason?: string }>
  attemptedInteractions: string[]
  issues: Issue[]
}

export interface CandidateFinding {
  finding_id: string
  severity: Severity
  type: string
  title: string
  description: string
  evidence: string[]
  workflowName?: string
  screenshotPath?: string
}

export interface CriticDecision {
  finding_id: string
  classification: string
  is_real_bug?: boolean
  confidence: number
  required_precondition?: string
  next_safe_action?: string
  reasoning_summary: string
  evidence: string[]
  should_report: boolean
  should_generate_fix_packet: boolean
}

export interface UxFinding {
  title: string
  severity: Severity
  type: string
  evidence: string[]
  suggested_fix?: string
  should_report?: boolean
  screenshotPath?: string
}

export interface ProductIntentFinding {
  title: string
  severity?: Severity
  type?: string
  expected_behavior?: string
  observed_behavior?: string
  evidence?: string[]
  confidence?: string
  should_report?: boolean
  suggested_fix_prompt?: string
}

export interface UiSurface {
  file: string
  surface_type: string
  display_name: string
  evidence: string[]
  relatedButtons?: string[]
  relatedInputs?: string[]
  confidence: number
}

export interface SourceWorkflow {
  name: string
  sourceFiles: string[]
  evidence: string[]
  likelyUserActions: string[]
  confidence: number
  discoveredBy?: string[]
  framework?: string
}

export interface ApiCall {
  method?: string
  endpoint: string
  sourceFile: string
  functionName?: string
  likelyWorkflow?: string
}

export interface StateAction {
  file: string
  stateVariables: string[]
  handlerNames: string[]
  submitHandlers: string[]
  loadingStateVariables: string[]
  errorStateVariables: string[]
}

export interface CrawlState {
  id?: string
  sequenceNumber?: number
  url: string
  hashRoute?: string
  title: string
  hash: string
  stateHash?: string
  inferredScreenName?: string
  inferredPageType?: string
  screenshotPath?: string
  visibleControlSummary?: VisibleControlSummary
  primaryVisibleText?: string[]
  matchedSourceWorkflows?: string[]
  matchedUiSurfaces?: string[]
  issuesOnState?: string[]
  consoleErrorsOnState?: unknown[]
  networkErrorsOnState?: NetworkFailure[]
  outgoingActions?: string[]
  incomingAction?: string
  isDuplicateOfStateId?: string
  duplicateCount?: number
  visible: VisibleControl[]
}

export interface VisibleControl {
  kind: string
  text?: string
  name?: string
  href?: string
  type?: string
  selectorHint?: string
}

export interface CrawlAction {
  id?: string
  sequenceNumber?: number
  type: string
  actionType?: string
  label: string
  role?: string
  locatorUsed?: string
  target: string
  urlBefore: string
  urlAfter?: string
  stateHashBefore?: string
  stateHashAfter?: string
  changedState?: boolean
  safe: boolean
  safeReason?: string
  skipped?: boolean
  skippedReason?: string
  screenshotBefore?: string
  screenshotAfter?: string
  workflowContext?: string
  scenarioContext?: string
  reason?: string
}

export interface ControlKindSummary {
  count: number
  topLabels: string[]
}

export interface VisibleControlSummary {
  links: ControlKindSummary
  buttons: ControlKindSummary
  tabs: ControlKindSummary
  inputs: ControlKindSummary
  forms: ControlKindSummary
  dialogs: ControlKindSummary
}

export interface SkippedSafeAction {
  label: string
  reason: string
  stateId?: string
  route?: string
}

export interface CrawlCoverage {
  sourceRoutes: string[]
  visitedRoutes: string[]
  missedRoutes: string[]
  workflowsDiscovered: number
  workflowsExercised: number
  scenariosPassed: number
  scenariosFailed: number
  scenariosSkipped: number
  safeActionsSkipped: SkippedSafeAction[]
}

export interface NetworkFailure {
  url: string
  method?: string
  failureText?: string
  statusCode?: number
  responseBody?: string
}

export interface ServerStatus {
  version: string
  status: 'idle' | 'running'
  provider: {
    configured: boolean
    baseUrlConfigured: boolean
    model: string | null
    apiStyle: string
  }
  agent: {
    configured: boolean
    name: string
  }
  latestReport: {
    path: string
    generatedAt?: string
    issues: number
    rawFindings: number
    repoPath?: string
    appUrl?: string
  } | null
  reportDir: string
  projects?: SnifferProject[]
}

export interface AuditForm {
  projectId?: string
  repoPath: string
  url: string
  productGoal: string
  auditDepth: 'fast' | 'deep'
  discoveryMode: string
  scenario: string
  executeGeneratedScenarios: boolean
  criticMode: string
  uxCritic: string
  intentMode: string
  productExperienceCritic: string
  provider: string
  maxIterations: number
  consistencyCheck: boolean
}

export interface RunEvent {
  type: 'phase_started' | 'phase_completed' | 'log' | 'error'
  phase: string
  message: string
  timestamp: string
}

export interface RunRecord {
  runId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  phase: string
  command?: string[]
  events?: RunEvent[]
  logs: string[]
  stdout: string
  stderr: string
  stdoutTail?: string
  stderrTail?: string
  startedAt: string
  endedAt?: string
  exitCode?: number | null
  errorSummary?: string
  reportPath?: string
}

export interface ScreenshotItem {
  name: string
  relativePath: string
  group: string
  url: string
}

export interface FixPacketItem {
  issueId: string
  name: string
  relativePath: string
  kind: 'md' | 'json'
}

export interface LatestIssueSummary {
  issueId: string
  title: string
  severity: Severity
  type: string
  status: string
  evidenceSummary: string[]
  suspectedFiles: string[]
  screenshotPath?: string
  screenshotArtifactUrl?: string
  hasFixPacket: boolean
  repairStatus?: string
}

export interface FixPacketDetail {
  issueId: string
  markdown: string
  json?: {
    issue_id: string
    title: string
    repo_path: string
    repair_root: string
    allowed_paths: string[]
    working_directory: string
    evidence_paths: string[]
    suspected_files: string[]
    prompt: string
    constraints: string[]
    verification_command: string
    pass_conditions: string[]
  }
  suspectedFiles: string[]
  prompt: string
  constraints: string[]
  verificationCommand: string
  passConditions: string[]
  path: {
    markdown: string
    json: string
  }
}

export interface RepairAttemptSummary {
  repairRunId?: string
  issueId: string
  agent: string
  mode?: 'repair-proof' | 'apply-fix'
  status: string
  agentInvoked: boolean
  changedFiles: string[]
  diffSummary: string
  verification: {
    status: 'not_run' | 'passed' | 'failed' | 'inconclusive'
    command?: string
    summary?: string
  }
  createdAt: string
  updatedAt: string
  attemptDir: string
  fixPacketPath?: string
}

export interface RepairRunRecord {
  repairRunId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  issueId: string
  project?: string
  agent: 'manual' | 'codex'
  mode: 'repair-proof' | 'apply-fix'
  command: string[]
  commandSummary: string
  stdout: string
  stderr: string
  logs: string[]
  stdoutTail: string
  stderrTail: string
  startedAt: string
  endedAt?: string
  exitCode?: number | null
  reportPath: string
  repairAttemptDir?: string
  changedFiles: string[]
  diffSummary: string
  rawDiff?: string
  verification: {
    status: 'not_run' | 'passed' | 'failed' | 'inconclusive' | 'running'
    command?: string
    summary?: string
  }
}

export async function getStatus(): Promise<ServerStatus> {
  return request('/api/status')
}

export async function getProjects(): Promise<SnifferProject[]> {
  return request('/api/projects')
}

export async function addProject(input: {
  id?: string
  name: string
  repoPath: string
  appUrl: string
  productGoal?: string
  devCommand?: string
}): Promise<SnifferProject> {
  return request('/api/projects', { method: 'POST', body: JSON.stringify(input) })
}

export async function removeProject(id: string): Promise<{ removed: boolean }> {
  return request(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function startAudit(form: AuditForm): Promise<{ runId: string; command?: string[]; auditDepth?: string }> {
  return request('/api/audits', { method: 'POST', body: JSON.stringify(form) })
}

export async function getRun(runId: string): Promise<RunRecord> {
  return request(`/api/audits/${encodeURIComponent(runId)}`)
}

export async function getLatestReport(projectId?: string): Promise<SnifferReport> {
  return request(projectPath('/api/reports/latest', projectId))
}

export async function getSourceInventory(projectId?: string): Promise<SourceInventory> {
  return request(projectPath('/api/reports/latest/source-inventory', projectId))
}

export async function getUiIntentGraph(projectId?: string): Promise<UIIntentGraph> {
  return request(projectPath('/api/reports/latest/ui-intent-graph', projectId))
}

export async function getGraphRefinements(projectId?: string): Promise<GraphRefinementResult> {
  return request(projectPath('/api/reports/latest/graph-refinements', projectId))
}

export async function getEvidenceRetrieval(projectId?: string): Promise<unknown> {
  return request(projectPath('/api/reports/latest/evidence-retrieval', projectId))
}

export async function retrieveEvidence(query: string, projectId?: string): Promise<EvidencePacket> {
  const base = `/api/reports/latest/retrieve-evidence?query=${encodeURIComponent(query)}`
  return request(projectPath(base, projectId))
}

export async function getEvidencePackets(projectId?: string): Promise<unknown> {
  return request(projectPath('/api/reports/latest/evidence-packets', projectId))
}

export async function getSuppressions(projectId?: string): Promise<unknown> {
  return request(projectPath('/api/reports/latest/suppressions', projectId))
}

export async function getLatestMarkdown(projectId?: string): Promise<string> {
  const response = await fetch(projectPath('/api/reports/latest/markdown', projectId))
  if (!response.ok) throw new Error(await response.text())
  return response.text()
}

export async function getScreenshots(projectId?: string): Promise<ScreenshotItem[]> {
  return request(projectPath('/api/reports/latest/screenshots', projectId))
}

export async function getFixPackets(projectId?: string): Promise<FixPacketItem[]> {
  return request(projectPath('/api/reports/latest/fix-packets', projectId))
}

export async function getFixPacket(issueId: string, projectId?: string): Promise<string> {
  const response = await fetch(projectPath(`/api/reports/latest/fix-packets/${encodeURIComponent(issueId)}`, projectId))
  if (!response.ok) throw new Error(await response.text())
  return response.text()
}

export async function getFixPacketDetail(issueId: string, projectId?: string): Promise<FixPacketDetail> {
  return request(projectPath(`/api/reports/latest/fix-packets/${encodeURIComponent(issueId)}?format=json`, projectId))
}

export async function generateFixPackets(projectId?: string): Promise<{ runId: string }> {
  return request(projectPath('/api/reports/latest/fix-packets/generate', projectId), { method: 'POST' })
}

export async function generateFixPacketsForIssues(projectId?: string, issueIds?: string[]): Promise<{ packets: FixPacketItem[]; generated: Array<{ issueId: string; title: string }> }> {
  return request('/api/reports/latest/generate-fixes', {
    method: 'POST',
    body: JSON.stringify({ project: projectId, issueIds })
  })
}

export async function verifyIssue(issueId: string, url: string, projectId?: string): Promise<{ runId: string }> {
  return request(projectPath(`/api/reports/latest/issues/${encodeURIComponent(issueId)}/verify`, projectId), {
    method: 'POST',
    body: JSON.stringify({ url })
  })
}

export async function getLatestIssues(projectId?: string): Promise<LatestIssueSummary[]> {
  return request(projectPath('/api/reports/latest/issues', projectId))
}

export async function startRepair(input: {
  project?: string
  issueId: string
  agent: 'manual' | 'codex'
  mode: 'repair-proof' | 'apply-fix'
  allowDestructiveConfirmed?: boolean
}): Promise<{ repairRunId: string; status: RepairRunRecord['status'] }> {
  return request('/api/repairs/start', { method: 'POST', body: JSON.stringify(input) })
}

export async function getRepairRun(repairRunId: string): Promise<RepairRunRecord> {
  return request(`/api/repairs/${encodeURIComponent(repairRunId)}`)
}

export async function getRepairLogs(repairRunId: string): Promise<{ stdout: string; stderr: string; logs: string[] }> {
  return request(`/api/repairs/${encodeURIComponent(repairRunId)}/logs`)
}

export async function verifyRepair(repairRunId: string, url?: string): Promise<{ repairRunId: string; status: RepairRunRecord['verification']['status'] }> {
  return request(`/api/repairs/${encodeURIComponent(repairRunId)}/verify`, {
    method: 'POST',
    body: JSON.stringify({ url })
  })
}

export async function rerunRepairAudit(repairRunId: string, options?: Partial<AuditForm>): Promise<{ runId: string }> {
  return request(`/api/repairs/${encodeURIComponent(repairRunId)}/rerun-audit`, {
    method: 'POST',
    body: JSON.stringify(options ?? {})
  })
}

export async function getRepairHistory(projectId?: string, issueId?: string): Promise<RepairAttemptSummary[]> {
  const params = new URLSearchParams()
  if (projectId) params.set('project', projectId)
  if (issueId) params.set('issueId', issueId)
  const query = params.toString()
  return request(`/api/repairs/history${query ? `?${query}` : ''}`)
}

function projectPath(path: string, projectId?: string): string {
  if (!projectId) return path
  const joiner = path.includes('?') ? '&' : '?'
  return `${path}${joiner}project=${encodeURIComponent(projectId)}`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers
    }
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || response.statusText)
  }
  return response.json() as Promise<T>
}
