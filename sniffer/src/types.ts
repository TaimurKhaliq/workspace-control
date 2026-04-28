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
  | 'layout_issue'
  | 'workflow_confusion'
  | 'visual_clutter'
  | 'product_intent_gap'
  | 'semantic_mismatch'
  | 'stale_output'
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
  unvisitedSafeActions?: SkippedSafeAction[]
  coverage?: CrawlCoverage
  consoleErrors: RuntimeMessage[]
  networkFailures: NetworkFailure[]
  screenshots: string[]
  generatedAt: string
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
  consoleErrorsOnState?: RuntimeMessage[]
  networkErrorsOnState?: NetworkFailure[]
  outgoingActions?: string[]
  incomingAction?: string
  isDuplicateOfStateId?: string
  duplicateCount?: number
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
  id?: string
  sequenceNumber?: number
  type: 'click' | 'type' | 'open' | 'close' | 'skip'
  actionType?: 'click' | 'type' | 'open' | 'close' | 'skip'
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

export interface RuntimeMessage {
  text: string
  location?: string
}

export interface NetworkFailure {
  url: string
  method: string
  failureText: string
  statusCode?: number
  responseBody?: string
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
  productIntent?: ProductIntentModel
  productIntentFindings?: ProductIntentFinding[]
  promptConsistency?: PromptConsistencyResult
  runtimeSurfaceMatches: RuntimeSurfaceMatch[]
  runtimeWorkflowVerifications: RuntimeWorkflowVerification[]
  scenarioRuns?: ScenarioRun[]
  criticDecisions: WorkflowCriticDecision[]
  uxCriticFindings?: UxCriticFinding[]
  deferredFindings: CandidateFinding[]
  blockedChecks: CandidateFinding[]
  needsMoreCrawling: CandidateFinding[]
  rawFindings?: Issue[]
  issues: Issue[]
  generatedAt: string
}

export type ProductIntentMode = 'deterministic' | 'llm' | 'auto'
export type ProductIntentConfidence = 'high' | 'medium' | 'low'
export type ProductIntentSupport =
  | 'source_supported'
  | 'runtime_supported'
  | 'inferred_from_common_pattern'
  | 'user_stated'

export type ProductAppCategory =
  | 'local_dev_tool'
  | 'planning_control_panel'
  | 'admin_console'
  | 'dashboard'
  | 'crud_app'
  | 'design_unknown'

export interface ProductIntentItem {
  name: string
  description?: string
  support: ProductIntentSupport[]
  evidence: string[]
  confidence: ProductIntentConfidence
}

export interface ProductIntentModel {
  app_category: ProductAppCategory
  product_summary: string
  primary_user_jobs: ProductIntentItem[]
  core_entities: ProductIntentItem[]
  expected_workflows: ProductIntentItem[]
  expected_navigation_model: ProductIntentItem[]
  expected_persistence_model: ProductIntentItem[]
  expected_output_review_model: ProductIntentItem[]
  confidence: ProductIntentConfidence
  evidence: string[]
  assumptions: string[]
  risks_of_hallucination: string[]
  product_goal?: string
  llmUsed?: boolean
}

export type ProductIntentGapCategory =
  | 'navigation_context'
  | 'plan_run_history'
  | 'output_review_copy'
  | 'repo_workspace_management'
  | 'semantic_enrichment_clarity'

export interface ProductIntentFinding {
  finding_id: string
  title: string
  category: ProductIntentGapCategory
  expected_behavior: string
  observed_behavior: string
  evidence: string[]
  source_support: boolean
  runtime_support: boolean
  user_support: boolean
  common_pattern_only: boolean
  confidence: ProductIntentConfidence
  should_report: boolean
  suggested_fix_prompt: string
}

export interface ProductIntentContext {
  app_identity: {
    repo_path: string
    package_name?: string
    framework: string
    build_tool: string
    app_url: string
  }
  deterministic_model: ProductIntentModel
  source_signals: {
    ui_surfaces: UiSurface[]
    source_workflows: SourceWorkflow[]
    api_calls: ApiCall[]
    state_actions: StateActionHints[]
  }
  runtime_observation: {
    visible_controls: VisibleElement[]
    screenshots: string[]
    console_errors: RuntimeMessage[]
    network_errors: NetworkFailure[]
    dom_text_summary: string[]
  }
  user_product_goal?: string
  question_for_intent: string
  omitted_counts: Record<string, number>
}

export interface IssueTriageContext {
  sourceGraph: SourceGraph
  crawlGraph: CrawlGraph
  runtimeWorkflowVerifications: RuntimeWorkflowVerification[]
  rawFindings: Issue[]
  question_for_triage: string
}

export interface PromptConsistencyPrompt {
  id: string
  input_prompt: string
  expected_concepts: string[]
  forbidden_stale_concepts: string[]
}

export interface PromptConsistencyRun {
  prompt_id: string
  input_prompt: string
  response_feature_request?: string
  rendered_text: string
  handoff_text: string
  semantic_labels: string[]
  recommended_paths: string[]
  stale_concepts_detected: string[]
  consistency_status: 'consistent' | 'stale_output' | 'semantic_mismatch' | 'inconclusive'
  screenshotPath?: string
}

export interface PromptConsistencyDecision {
  classification: 'consistent' | 'stale_output' | 'semantic_mismatch' | 'inconclusive'
  confidence: 'low' | 'medium' | 'high'
  reasoning_summary: string
  stale_concepts: string[]
  should_report: boolean
}

export interface PromptConsistencyContext {
  current_prompt: string
  prior_prompt?: string
  rendered_output_excerpt: string
  handoff_excerpt: string
  semantic_labels: string[]
  recommended_paths: string[]
  response_feature_request?: string
  forbidden_concepts_detected: string[]
  question_for_critic: string
}

export interface PromptConsistencyResult {
  enabled: boolean
  prompts: PromptConsistencyPrompt[]
  runs: PromptConsistencyRun[]
  decisions: PromptConsistencyDecision[]
  issues: Issue[]
  screenshots: string[]
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

export interface AgentResult {
  agent: string
  status: 'not_run' | 'applied' | 'failed' | 'unsafe_blocked'
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  startedAt: string
  completedAt: string
  commandsRun: string[]
  modifiedFiles: string[]
  changedFiles: string[]
  diffSummary: string
  notes: string[]
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
  gitStatusAfter: string
  gitDiffAfter: string
  gitDiffSummary: string
  commandsRun: string[]
  verification?: VerificationResult
  createdAt: string
  attemptDir: string
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

export type ScenarioSlug =
  | 'all'
  | 'create-select-workspace'
  | 'add-repo-target'
  | 'validate-local-repo-path'
  | 'refresh-discovery'
  | 'refresh-learning'
  | 'generate-plan-bundle'
  | 'review-plan-output'
  | 'copy-handoff-prompt'
  | 'inspect-raw-json'
  | 'prompt-output-consistency'
  | 'semantic-enrichment-toggle'

export interface ScenarioStep {
  name: string
  action: string
  expectedControls: string[]
  safe: boolean
  unsafeReason?: string
}

export interface ScenarioDefinition {
  slug: Exclude<ScenarioSlug, 'all'>
  name: string
  prerequisites: string[]
  steps: ScenarioStep[]
  expectedResult: string
  assertions: string[]
}

export interface ScenarioAssertionResult {
  label: string
  status: 'passed' | 'failed' | 'blocked'
  evidence: string[]
  screenshotPath?: string
}

export interface ScenarioRun {
  slug: string
  name: string
  status: 'passed' | 'failed' | 'blocked'
  prerequisites: string[]
  stepsAttempted: string[]
  screenshots: string[]
  assertions: ScenarioAssertionResult[]
  issues: Issue[]
}

export interface UxCriticFinding {
  title: string
  severity: Severity
  type: 'usability_issue' | 'layout_issue' | 'accessibility_issue' | 'workflow_confusion' | 'visual_clutter'
  evidence: string[]
  suggested_fix: string
  should_report: boolean
  screenshotPath?: string
}

export interface UxCriticContext {
  app_purpose: string
  workflow?: SourceWorkflow
  runtime_visible_controls: VisibleElement[]
  screenshot_paths: string[]
  dom_text_summary: string[]
  known_state: KnownRuntimeState
  candidate_heuristic_issues: Issue[]
  question_for_critic: string
}
