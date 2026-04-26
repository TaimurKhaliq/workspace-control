export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type IssueStatus = 'open' | 'fixing' | 'fixed' | 'failed' | 'inconclusive'

export type IssueType =
  | 'functional_bug'
  | 'broken_navigation'
  | 'missing_ui_surface'
  | 'broken_interaction'
  | 'missing_form_control'
  | 'broken_form'
  | 'api_error'
  | 'console_error'
  | 'network_error'
  | 'accessibility_issue'
  | 'usability_issue'
  | 'test_bug'
  | 'inconclusive'

export interface SourceGraph {
  repoPath: string
  packageName?: string
  framework: string
  buildTool: string
  routes: SourceRoute[]
  pages: SourceFileSummary[]
  components: SourceFileSummary[]
  forms: SourceForm[]
  uiSurfaces: UiSurface[]
  sourceWorkflows: SourceWorkflow[]
  apiCalls: ApiCall[]
  stateActions: StateActionHints[]
  packageScripts: Record<string, string>
  generatedAt: string
}

export interface SourceRoute {
  path: string
  file: string
  source: 'filesystem' | 'router' | 'link'
}

export interface SourceFileSummary {
  file: string
  name: string
}

export interface SourceForm {
  file: string
  name: string
  inputs: string[]
}

export type UiSurfaceType =
  | 'app_shell'
  | 'workspace_selector'
  | 'workspace_list'
  | 'repo_list'
  | 'add_repo_form'
  | 'repo_validation_panel'
  | 'prompt_composer'
  | 'generate_plan_action'
  | 'plan_bundle_view'
  | 'change_set_table'
  | 'recipe_panel'
  | 'graph_evidence_panel'
  | 'validation_panel'
  | 'handoff_prompt_panel'
  | 'raw_json_panel'
  | 'copy_action'
  | 'unknown_ui_section'

export interface UiSurface {
  file: string
  surface_type: UiSurfaceType
  display_name: string
  evidence: string[]
  relatedButtons: string[]
  relatedInputs: string[]
  confidence: number
}

export interface SourceWorkflow {
  name: string
  sourceFiles: string[]
  evidence: string[]
  likelyUserActions: string[]
  confidence: number
}

export interface ApiCall {
  method?: string
  endpoint: string
  sourceFile: string
  functionName?: string
  likelyWorkflow?: string
}

export interface StateActionHints {
  file: string
  stateVariables: string[]
  handlerNames: string[]
  submitHandlers: string[]
  loadingStateVariables: string[]
  errorStateVariables: string[]
}

export interface CrawlGraph {
  startUrl: string
  title: string
  finalUrl: string
  states: CrawlState[]
  actions: CrawlAction[]
  consoleErrors: RuntimeMessage[]
  networkFailures: NetworkFailure[]
  screenshots: string[]
  generatedAt: string
}

export interface CrawlState {
  url: string
  title: string
  hash: string
  visible: VisibleElement[]
}

export interface VisibleElement {
  kind: 'button' | 'link' | 'tab' | 'input' | 'form' | 'dialog'
  text?: string
  name?: string
  href?: string
  type?: string
  selectorHint?: string
}

export interface CrawlAction {
  type: 'click' | 'type' | 'open' | 'close' | 'skip'
  label: string
  target: string
  urlBefore: string
  urlAfter?: string
  safe: boolean
  reason?: string
}

export interface RuntimeMessage {
  text: string
  location?: string
}

export interface NetworkFailure {
  url: string
  method: string
  failureText: string
}

export interface AppIntent {
  summary: string
  likelyWorkflows: Workflow[]
  sourceSignals: string[]
  llmUsed: boolean
}

export interface Workflow {
  name: string
  route?: string
  steps: string[]
  confidence: number
}

export interface Issue {
  issue_id?: string
  severity: Severity
  type: IssueType
  title: string
  description: string
  evidence: string[]
  suspected_files?: string[]
  fix_prompt?: string
  verification_steps?: string[]
  pass_conditions?: string[]
  status?: IssueStatus
  attempts?: number
  screenshotPath?: string
  tracePath?: string
  suggestedFixPrompt: string
  critic_decision?: WorkflowCriticDecision
}

export interface SnifferReport {
  sourceGraph: SourceGraph
  crawlGraph: CrawlGraph
  appIntent: AppIntent
  runtimeSurfaceMatches: RuntimeSurfaceMatch[]
  runtimeWorkflowVerifications: RuntimeWorkflowVerification[]
  criticDecisions: WorkflowCriticDecision[]
  deferredFindings: CandidateFinding[]
  blockedChecks: CandidateFinding[]
  needsMoreCrawling: CandidateFinding[]
  issues: Issue[]
  generatedAt: string
}

export interface RuntimeSurfaceMatch {
  surface_type: UiSurfaceType
  display_name: string
  file: string
  seenInRuntime: 'yes' | 'no' | 'partial' | 'unknown'
  matchingDomEvidence: string[]
  missingControls?: string[]
}

export interface RuntimeWorkflowVerification {
  name: string
  sourceFiles: string[]
  status: 'verified' | 'partial' | 'missing' | 'unknown'
  evidence: string[]
  controls: RuntimeControlCheck[]
  attemptedInteractions: string[]
  issues: RuntimeWorkflowIssue[]
}

export interface RuntimeControlCheck {
  label: string
  status: 'found' | 'missing' | 'not_applicable'
  matchedEvidence: string[]
  missingReason?: string
}

export interface RuntimeWorkflowIssue {
  type: IssueType
  title: string
  description: string
  evidence: string[]
}

export interface GeneratedSpec {
  fileName: string
  content: string
}

export interface TestRunResult {
  status: 'passed' | 'failed'
  failures: ClassifiedFailure[]
}

export interface ClassifiedFailure {
  testTitle: string
  classification: 'app_bug' | 'test_bug' | 'inconclusive'
  reason: string
  tracePath?: string
  screenshotPath?: string
}

export interface FixPacket {
  issue_id: string
  title: string
  repo_path: string
  working_directory: string
  evidence_paths: string[]
  suspected_files: string[]
  prompt: string
  constraints: string[]
  verification_command: string
  pass_conditions: string[]
}

export interface AgentResult {
  agent: string
  status: 'not_run' | 'applied' | 'failed' | 'unsafe_blocked'
  stdout: string
  stderr: string
  commandsRun: string[]
  modifiedFiles: string[]
}

export interface VerificationResult {
  issue_id: string
  status: 'fixed' | 'still_failing' | 'inconclusive'
  beforeEvidence: string[]
  afterEvidence: string[]
  verificationCommand: string
  reportPath: string
}

export interface RepairAttempt {
  issue_id: string
  iteration: number
  agentResult: AgentResult
  gitStatusBefore: string
  gitDiffAfter: string
  verification?: VerificationResult
  createdAt: string
}

export type CriticClassification =
  | 'real_bug'
  | 'conditional_ui_not_bug'
  | 'crawler_needs_precondition'
  | 'test_bug'
  | 'inconclusive'
  | 'needs_more_crawling'

export type NextSafeAction =
  | 'navigate_to_repositories'
  | 'navigate_to_plan_runs'
  | 'open_add_repo_modal'
  | 'open_workspace_modal'
  | 'select_first_workspace'
  | 'select_first_repo_target'
  | 'generate_plan_bundle_with_sample_prompt'
  | 'open_plan_tab'
  | 'copy_handoff_prompt'

export interface CandidateFinding {
  finding_id: string
  severity: Severity
  type: IssueType
  title: string
  description: string
  evidence: string[]
  workflowName?: string
  surfaceType?: UiSurfaceType
  screenshotPath?: string
  tracePath?: string
  suggestedFixPrompt: string
}

export interface WorkflowCriticDecision {
  finding_id: string
  classification: CriticClassification
  is_real_bug: boolean
  confidence: number
  required_precondition?: string
  next_safe_action?: NextSafeAction
  reasoning_summary: string
  evidence: string[]
  should_report: boolean
  should_generate_fix_packet: boolean
}

export interface SnifferCriticContext {
  app_identity: {
    repo_path: string
    package_name?: string
    framework: string
    build_tool: string
    app_url: string
  }
  source_intent: {
    relevant_ui_surfaces: UiSurface[]
    relevant_source_workflows: SourceWorkflow[]
    relevant_api_calls: ApiCall[]
    relevant_state_actions: StateActionHints[]
  }
  runtime_observation: {
    current_url: string
    final_url: string
    visible_controls: VisibleElement[]
    forms: VisibleElement[]
    dialogs: VisibleElement[]
    screenshots: string[]
    console_errors: RuntimeMessage[]
    network_errors: NetworkFailure[]
  }
  execution_trace: {
    actions_attempted: CrawlAction[]
    state_transitions: string[]
    repeated_actions: string[]
    skipped_actions: CrawlAction[]
    unvisited_safe_actions: string[]
  }
  known_state: KnownRuntimeState
  candidate_findings: CandidateFinding[]
  question_for_critic: string
  omitted_counts: Record<string, number>
}

export interface LlmCriticProvider {
  name: string
  critiqueWorkflow(context: SnifferCriticContext): Promise<WorkflowCriticDecision>
}

export interface KnownRuntimeState {
  workspace_exists: boolean
  workspace_selected: boolean
  repo_exists: boolean
  repo_selected: boolean
  plan_bundle_generated: boolean
  handoff_prompt_exists: boolean
  raw_json_visible: boolean
  add_repo_modal_open: boolean
  workspace_modal_open: boolean
  semantic_enabled: boolean
  last_action_changed_state: boolean
}
