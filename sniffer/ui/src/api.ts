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
  issues?: Issue[]
  screenshots?: string[]
}

export interface SnifferReport {
  generatedAt: string
  issues: Issue[]
  rawFindings?: Issue[]
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
  discoveryMode: string
  scenario: string
  criticMode: string
  uxCritic: string
  intentMode: string
  provider: string
  maxIterations: number
  consistencyCheck: boolean
}

export interface RunRecord {
  runId: string
  status: 'queued' | 'running' | 'success' | 'error'
  phase: string
  logs: string[]
  stdout: string
  stderr: string
  startedAt: string
  completedAt?: string
  exitCode?: number | null
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

export async function startAudit(form: AuditForm): Promise<{ runId: string }> {
  return request('/api/audits', { method: 'POST', body: JSON.stringify(form) })
}

export async function getRun(runId: string): Promise<RunRecord> {
  return request(`/api/audits/${encodeURIComponent(runId)}`)
}

export async function getLatestReport(projectId?: string): Promise<SnifferReport> {
  return request(projectPath('/api/reports/latest', projectId))
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

export async function generateFixPackets(projectId?: string): Promise<{ runId: string }> {
  return request(projectPath('/api/reports/latest/fix-packets/generate', projectId), { method: 'POST' })
}

export async function verifyIssue(issueId: string, url: string, projectId?: string): Promise<{ runId: string }> {
  return request(projectPath(`/api/reports/latest/issues/${encodeURIComponent(issueId)}/verify`, projectId), {
    method: 'POST',
    body: JSON.stringify({ url })
  })
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
