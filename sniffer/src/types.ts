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
  | 'locator_quality_issue'
  | 'usability_issue'
  | 'scanability_issue'
  | 'layout_issue'
  | 'visibility_issue'
  | 'runtime_dom_quality_warning'
  | 'workflow_confusion'
  | 'visual_clutter'
  | 'product_intent_gap'
  | 'product_experience_gap'
  | 'semantic_mismatch'
  | 'stale_output'
  | 'test_bug'
  | 'inconclusive'

export interface SourceGraph {
  repoPath: string
  packageName?: string
  rootPackageName?: string
  uiPackageName?: string
  framework: string
  rootFramework?: string
  uiFramework?: string
  buildTool: string
  rootBuildTool?: string
  uiBuildTool?: string
  sourceScopeSummary?: SourceScopeSummary
  sourceInventory?: SourceInventory
  uiIntentGraph?: UIIntentGraph
  graphRefinement?: GraphRefinementResult
  workflowInferenceIntegrity?: WorkflowInferenceIntegrity
  routes: SourceRoute[]
  pages: SourceFileSummary[]
  components: SourceFileSummary[]
  forms: SourceForm[]
  uiSurfaces: UiSurface[]
  sourceWorkflows: SourceWorkflow[]
  apiCalls: ApiCall[]
  stateActions: StateActionHints[]
  packageScripts: Record<string, string>
  discoveryAdapters?: DiscoveryAdapterSummary[]
  workflowDiscoverySummary?: WorkflowDiscoverySummary
  generatedAt: string
}

export type EvidenceExtractionMethod = 'deterministic' | 'heuristic' | 'llm' | 'runtime'
export type SourceScope =
  | 'primary_ui_source'
  | 'api_server_support'
  | 'agent_engine'
  | 'fixture'
  | 'test'
  | 'config'
  | 'unknown'

export interface EvidenceFact {
  id: string
  kind: string
  value: string
  source: string
  label?: string
  controlType?: 'input' | 'textarea' | 'select' | 'checkbox' | 'button' | 'unknown'
  handler?: string
  ariaDescribedBy?: string
  placeholder?: string
  testId?: string
  options?: string[]
  safeActionHint?: boolean
  rawText?: string
  suppressedFromSemanticGraph?: boolean
  refinedFromFactId?: string
  sourceScope?: SourceScope
  filePath?: string
  symbol?: string
  snippet?: string
  confidence: number
  extractionMethod: EvidenceExtractionMethod
}

export interface EvidenceInference {
  id: string
  claim: string
  basedOn: string[]
  confidence: number
  method: EvidenceExtractionMethod
  contradictedBy?: string[]
}

export interface SourceInventoryFile {
  path: string
  extension: string
  moduleName?: string
  sourceScope?: SourceScope
  evidenceIds: string[]
}

export interface SourceScopeRoot {
  path: string
  scope: SourceScope
  reason: string
  framework?: string
  buildTool?: string
  packageName?: string
}

export interface SourceScopeSummary {
  primaryUiRoots: SourceScopeRoot[]
  supportRoots: SourceScopeRoot[]
  fixtureRoots: SourceScopeRoot[]
  excludedPaths: string[]
  scannedFileCountsByScope: Record<SourceScope, number>
  rootFramework?: string
  rootBuildTool?: string
  uiFramework?: string
  uiBuildTool?: string
}

export interface SourceInventory {
  files: SourceInventoryFile[]
  modules: string[]
  frameworkSignals: EvidenceFact[]
  packageBuildSignals: EvidenceFact[]
  rawExtractedSymbols: EvidenceFact[]
  rawRoutes: EvidenceFact[]
  rawTemplates: EvidenceFact[]
  rawHandlers: EvidenceFact[]
  rawApiCalls: EvidenceFact[]
  provenance: EvidenceFact[]
  facts: EvidenceFact[]
  generatedAt: string
}

export type UIIntentNodeKind =
  | 'surface'
  | 'workflow'
  | 'action'
  | 'control'
  | 'form'
  | 'state'
  | 'validation'
  | 'api_dependency'
  | 'data_dependency'
  | 'domain_entity'

export interface UIIntentNode {
  id: string
  kind: UIIntentNodeKind
  label: string
  filePath?: string
  sourceScope?: SourceScope
  symbol?: string
  route?: string
  confidence: number
  evidenceIds: string[]
  extractionMethod: EvidenceExtractionMethod
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
  evidenceReferences: string[]
  inferences: EvidenceInference[]
  generatedAt: string
}

export type EvidenceRetrievalDocumentKind =
  | 'source_chunk'
  | 'graph_node'
  | 'workflow'
  | 'surface'
  | 'api_call'
  | 'runtime_dom'
  | 'scenario_trace'
  | 'product_experience'
  | 'screenshot_metadata'
  | 'issue'
  | 'fix_packet'
  | 'repair_attempt'

export interface EvidenceRetrievalDocument {
  id: string
  kind: EvidenceRetrievalDocumentKind
  text: string
  metadata: Record<string, unknown>
  relatedEvidenceIds: string[]
  score?: number
  whyRetrieved?: string[]
}

export interface EvidenceRetrievalOptions {
  featureRequest?: string
  screenName?: string
  workflowName?: string
  issueId?: string
  surfaceId?: string
  filePath?: string
  entityHints?: string[]
  kinds?: EvidenceRetrievalDocumentKind[]
  maxResults?: number
  includeRuntime?: boolean
  includeScreenshots?: boolean
  includePriorRepairs?: boolean
  minConfidence?: number
}

export interface EvidencePacket {
  context: {
    issueId?: string
    screenName?: string
    workflowName?: string
    featureRequest?: string
    query: string
  }
  intent?: string
  retrievedDocuments: EvidenceRetrievalDocument[]
  graphNodes: UIIntentNode[]
  sourceFacts: EvidenceFact[]
  runtimeFacts: EvidenceFact[]
  screenshots: string[]
  priorFindings?: Issue[]
  priorFixPackets?: FixPacket[]
  priorRepairAttempts?: EvidenceRetrievalDocument[]
  contradictions: EvidenceInference[]
  confidenceSummary: {
    sourceFactCount: number
    runtimeFactCount: number
    sourceDocumentCount?: number
    runtimeDocumentCount?: number
    scenarioDocumentCount?: number
    priorFindingCount?: number
    priorFixPacketCount?: number
    priorRepairAttemptCount?: number
    heuristicInferenceCount: number
    llmInferenceCount: number
    contradictionCount: number
    averageConfidence: number
    averageScore?: number
  }
}

export interface EvidenceRetrievalSummary {
  context: EvidencePacket['context']
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
  topDocuments: Array<{
    id: string
    kind: EvidenceRetrievalDocumentKind
    text: string
    score?: number
    whyRetrieved?: string[]
  }>
}

export interface DiscoveryAdapterSummary {
  adapterId: string
  framework: string
  confidence: number
  evidence: string[]
  warnings?: string[]
}

export interface WorkflowDiscoverySummary {
  source_workflows_count: number
  runtime_workflows_count?: number
  llm_workflows_count?: number
  generated_scenarios_count?: number
  executed_scenarios_count?: number
}

export type WorkflowVocabularyPack = 'workspace_control' | 'sniffer_dashboard' | 'generic' | 'unknown'
export type WorkflowKind = 'user_workflow' | 'internal_engine_step' | 'support_api_dependency' | 'debug_evidence'

export interface WorkflowInferenceRecord {
  workflowName: string
  source: string
  appSubtype: AppSubtype | 'unknown'
  matchedVocabularyPack: WorkflowVocabularyPack
  requiredEvidence: string[]
  matchedEvidence: string[]
  missingEvidence: string[]
  confidence: number
  reason: string
  sourceFiles?: string[]
  workflowKind?: WorkflowKind
}

export interface WorkflowInferenceIntegrity {
  appSubtype: AppSubtype | 'unknown'
  selectedVocabularyPacks: WorkflowVocabularyPack[]
  emittedWorkflows: WorkflowInferenceRecord[]
  suppressedWorkflows: WorkflowInferenceRecord[]
  appSpecificWorkflowMismatchesPrevented: number
}

export interface SourceRoute {
  path: string
  file: string
  source: 'filesystem' | 'router' | 'link'
  sourceScope?: SourceScope
  discoveredBy?: string[]
  confidence?: number
  evidence?: string[]
  framework?: string
}

export interface SourceFileSummary {
  file: string
  name: string
  sourceScope?: SourceScope
  discoveredBy?: string[]
  confidence?: number
  evidence?: string[]
  framework?: string
}

export interface SourceForm {
  file: string
  name: string
  inputs: string[]
  sourceScope?: SourceScope
  discoveredBy?: string[]
  confidence?: number
  evidence?: string[]
  framework?: string
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
  | 'history_list'
  | 'change_set_table'
  | 'recipe_panel'
  | 'graph_evidence_panel'
  | 'validation_panel'
  | 'handoff_prompt_panel'
  | 'raw_json_panel'
  | 'debug_payload_view'
  | 'repair_packet_view'
  | 'dialog_form'
  | 'copy_action'
  | 'unknown_ui_section'

export type GraphRefinerMode = 'off' | 'llm' | 'auto'

export type GraphRefinementSuggestionType =
  | 'reclassify_fact'
  | 'normalize_control'
  | 'merge_duplicate_surface'
  | 'split_surface'
  | 'add_edge'
  | 'remove_edge'
  | 'raise_confidence'
  | 'lower_confidence'
  | 'mark_as_noise'
  | 'add_workflow'
  | 'reclassify_surface'

export type GraphRefinementConfidence = 'low' | 'medium' | 'high'
export type GraphRefinementRisk = 'low' | 'medium' | 'high'

export interface GraphRefinementSuggestion {
  id: string
  type: GraphRefinementSuggestionType
  targetId: string
  fromValue?: unknown
  toValue?: unknown
  reason: string
  evidenceIds: string[]
  confidence: GraphRefinementConfidence
  risk: GraphRefinementRisk
}

export interface AppliedGraphRefinementSuggestion extends GraphRefinementSuggestion {
  appliedAt: string
}

export interface RejectedGraphRefinementSuggestion extends GraphRefinementSuggestion {
  rejectedReason: string
}

export interface GraphStructureCriticContext {
  modelReviewed: string
  sourceInventorySummary: {
    totalFacts: number
    factKinds: Record<string, number>
    suspiciousFacts: Array<Pick<EvidenceFact, 'id' | 'kind' | 'value' | 'filePath' | 'symbol' | 'confidence' | 'extractionMethod'>>
    topFacts: Array<Pick<EvidenceFact, 'id' | 'kind' | 'value' | 'label' | 'controlType' | 'handler' | 'filePath' | 'confidence' | 'extractionMethod'>>
  }
  uiIntentGraphDraft: {
    surfaces: UIIntentNode[]
    workflows: UIIntentNode[]
    actions: UIIntentNode[]
    controls: UIIntentNode[]
    apiDataDependencies: UIIntentNode[]
    edges: UIIntentEdge[]
  }
  runtimeEvidence?: {
    url: string
    title: string
    headings: string[]
    buttons: string[]
    links: string[]
    inputs: string[]
    testIds: string[]
    visibleText: string[]
  }
  instructions: string[]
}

export interface GraphRefinementResult {
  mode?: GraphRefinerMode
  status?: 'completed' | 'skipped' | 'provider_error'
  modelReviewed: string
  llmUsed: boolean
  provider?: string
  model?: string
  suggestions: GraphRefinementSuggestion[]
  appliedSuggestions: AppliedGraphRefinementSuggestion[]
  rejectedSuggestions: RejectedGraphRefinementSuggestion[]
  warnings: string[]
}

export interface UiSurface {
  file: string
  surface_type: UiSurfaceType
  display_name: string
  evidence: string[]
  relatedButtons: string[]
  relatedInputs: string[]
  confidence: number
  sourceScope?: SourceScope
  discoveredBy?: string[]
  framework?: string
}

export interface SourceWorkflow {
  name: string
  sourceFiles: string[]
  evidence: string[]
  likelyUserActions: string[]
  confidence: number
  workflowKind?: WorkflowKind
  appSubtype?: AppSubtype | 'unknown'
  matchedVocabularyPack?: WorkflowVocabularyPack
  requiredEvidence?: string[]
  matchedEvidence?: string[]
  missingEvidence?: string[]
  reason?: string
  sourceScope?: SourceScope
  discoveredBy?: string[]
  framework?: string
}

export interface ApiCall {
  method?: string
  endpoint: string
  sourceFile: string
  functionName?: string
  likelyWorkflow?: string
  sourceScope?: SourceScope
  discoveredBy?: string[]
  confidence?: number
  evidence?: string[]
  framework?: string
}

export interface StateActionHints {
  file: string
  stateVariables: string[]
  handlerNames: string[]
  submitHandlers: string[]
  loadingStateVariables: string[]
  errorStateVariables: string[]
  sourceScope?: SourceScope
  discoveredBy?: string[]
  confidence?: number
  evidence?: string[]
  framework?: string
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

export type DiscoveryMode = 'source' | 'runtime' | 'hybrid'

export type RuntimeControlKind =
  | 'link'
  | 'button'
  | 'input'
  | 'select'
  | 'textarea'
  | 'form'
  | 'table'
  | 'tab'
  | 'tablist'
  | 'dialog'
  | 'landmark'
  | 'heading'
  | 'text'

export type LocatorStrategy =
  | 'role'
  | 'label'
  | 'placeholder'
  | 'testid'
  | 'text'
  | 'css'

export interface LocatorCandidate {
  strategy: LocatorStrategy
  value: string
  playwright: string
  confidence: number
  reason: string
}

export interface RuntimeDomControl {
  id: string
  kind: RuntimeControlKind
  tagName: string
  role?: string
  visibleText?: string
  accessibleName?: string
  labelText?: string
  placeholder?: string
  dataTestId?: string
  name?: string
  type?: string
  href?: string
  value?: string
  disabled: boolean
  visible: boolean
  selectorHint?: string
  boundingBox?: {
    x: number
    y: number
    width: number
    height: number
  }
  locatorCandidates: LocatorCandidate[]
  confidence: number
  safeAction: SafeActionDecision
}

export interface RuntimeDomForm {
  id: string
  name?: string
  action?: string
  method?: string
  controls: RuntimeDomControl[]
  locatorCandidates: LocatorCandidate[]
}

export interface RuntimeDomTable {
  id: string
  caption?: string
  headers: string[]
  rowCount: number
  locatorCandidates: LocatorCandidate[]
}

export interface RuntimeDomSnapshot {
  url: string
  title: string
  htmlExcerpt: string
  domText: string
  accessibilitySnapshot?: unknown
  headings: RuntimeDomControl[]
  landmarks: RuntimeDomControl[]
  links: RuntimeDomControl[]
  buttons: RuntimeDomControl[]
  inputs: RuntimeDomControl[]
  selects: RuntimeDomControl[]
  textareas: RuntimeDomControl[]
  forms: RuntimeDomForm[]
  tables: RuntimeDomTable[]
  tabs: RuntimeDomControl[]
  tablists: RuntimeDomControl[]
  dialogs: RuntimeDomControl[]
  visibleTextBlocks: string[]
  controls: RuntimeDomControl[]
  screenshotPath?: string
  capturedAt: string
}

export interface RuntimeWorkflowStep {
  action: 'click' | 'type' | 'select' | 'assert'
  target_name: string
  locator_strategy: LocatorStrategy
  locator_value: string
  safe: boolean
  expected_result: string
  confidence: ProductIntentConfidence
  evidence: string[]
}

export interface RuntimeInferredWorkflow {
  name: string
  confidence: ProductIntentConfidence
  evidence: string[]
  steps: RuntimeWorkflowStep[]
  source: 'runtime' | 'source' | 'llm' | 'hybrid'
}

export interface RuntimeActionPlanItem {
  action: 'click' | 'type' | 'select' | 'assert' | 'skip'
  target: string
  locator?: LocatorCandidate
  safe: boolean
  reason: string
  expectedStateChange?: string
  controlId?: string
  priority: number
}

export interface RuntimeAppModel {
  app_name: string
  inferred_app_type: AppProfileType
  screens: Array<{
    name: string
    url: string
    evidence: string[]
    confidence: ProductIntentConfidence
  }>
  nav_items: RuntimeDomControl[]
  forms: RuntimeDomForm[]
  workflows: RuntimeInferredWorkflow[]
  entities: string[]
  actions: RuntimeActionPlanItem[]
  route_candidates: string[]
  locator_inventory: RuntimeDomControl[]
  confidence: ProductIntentConfidence
  evidence: string[]
  llmInferredWorkflows?: RuntimeInferredWorkflow[]
  unsafe_actions?: RuntimeActionPlanItem[]
}

export interface RuntimeIntentContext {
  project: {
    id?: string
    name?: string
    repoPath?: string
    appUrl: string
    framework?: string
    buildTool?: string
    packageName?: string
  }
  source_summary?: {
    workflows: SourceWorkflow[]
    uiSurfaces: UiSurface[]
    apiCalls: ApiCall[]
    routes: SourceRoute[]
  }
  runtime_snapshot: {
    url: string
    title: string
    headings: RuntimeDomControl[]
    nav_items: RuntimeDomControl[]
    buttons: RuntimeDomControl[]
    links: RuntimeDomControl[]
    forms: RuntimeDomForm[]
    inputs: RuntimeDomControl[]
    tables: RuntimeDomTable[]
    dialogs: RuntimeDomControl[]
    visible_text_blocks: string[]
    screenshot_path?: string
  }
  candidate_actions: RuntimeActionPlanItem[]
  question_for_llm: string
}

export interface RuntimeLlmIntent {
  app_type: AppProfileType | string
  primary_user_jobs: string[]
  workflows: RuntimeInferredWorkflow[]
  safe_next_actions: RuntimeActionPlanItem[]
  unsafe_actions: RuntimeActionPlanItem[]
  notes: string[]
}

export interface LocatorRepairResult {
  status: 'resolved' | 'bad_locator' | 'missing_control' | 'blocked_by_state' | 'inconclusive'
  locator?: LocatorCandidate
  attempted: LocatorCandidate[]
  reason: string
}

export interface SafeActionDecision {
  safe: boolean
  reason: string
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
  sourceInventory?: SourceInventory
  uiIntentGraph?: UIIntentGraph
  crawlGraph: CrawlGraph
  appIntent: AppIntent
  appProfile?: AppProfile
  appSubtype?: AppSubtype
  scenarioSelection?: ScenarioPackSelection
  discoveryMode?: DiscoveryMode
  runtimeDomSnapshot?: RuntimeDomSnapshot
  runtimeAppModel?: RuntimeAppModel
  llmRuntimeIntent?: RuntimeLlmIntent
  locatorFailures?: LocatorRepairResult[]
  generatedScenarios?: GeneratedScenario[]
  productIntent?: ProductIntentModel
  productIntentFindings?: ProductIntentFinding[]
  productExperience?: ProductExperienceResult
  graphRefinement?: GraphRefinementResult
  evidenceRetrievalSummaries?: EvidenceRetrievalSummary[]
  evidenceProvenance?: EvidenceProvenanceSummary
  suppressedRuntimeEvents?: SuppressedRuntimeEvent[]
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

export type ScreenshotEvidenceSource =
  | 'current_audit_screen'
  | 'dashboard_displayed_report'
  | 'previous_report'
  | 'unknown'

export type ProductExperienceContextScope =
  | 'current_audit'
  | 'displayed_report'
  | 'mixed'
  | 'unknown'

export type RuntimeEventProvenance =
  | 'current_audit_runtime'
  | 'dashboard_displayed_report'
  | 'previous_report_data'
  | 'browser_extension_noise'
  | 'known_benign'
  | 'unknown'

export interface EvidenceProvenanceContextSummary {
  screen: string
  navLabel?: string
  scenarioName?: string
  screenshotPath?: string
  screenshotSource?: ScreenshotEvidenceSource
  contextScope?: ProductExperienceContextScope
  displayedReportId?: string
  displayedReportGeneratedAt?: string
  displayedReportPath?: string
  warnings: string[]
}

export interface EvidenceProvenanceSummary {
  outerAuditRunId?: string
  outerAuditReportGeneratedAt?: string
  contextScopeCounts: Record<ProductExperienceContextScope | 'unset', number>
  screenshotSourceCounts: Record<ScreenshotEvidenceSource | 'unset', number>
  displayedReportContexts: EvidenceProvenanceContextSummary[]
  warnings: string[]
}

export interface SuppressedRuntimeEvent {
  type: 'console_error' | 'network_error'
  text: string
  location?: string
  url?: string
  method?: string
  failureText?: string
  reason: string
  provenance: RuntimeEventProvenance
}

export type AppProfileType =
  | 'planning_control_panel'
  | 'admin_console'
  | 'dashboard_app'
  | 'crud_app'
  | 'ecommerce_app'
  | 'docs_site'
  | 'marketing_site'
  | 'auth_app'
  | 'unknown'

export type AppSubtype =
  | 'workspace_control'
  | 'sniffer_dashboard'
  | 'generic_control_panel'
  | 'generic_app'
  | 'unknown'

export interface AppProfile {
  profile_type: AppProfileType
  confidence: ProductIntentConfidence
  evidence: string[]
  core_entities: string[]
  primary_user_jobs: string[]
  expected_navigation_patterns: string[]
  expected_workflows: string[]
  expected_output_surfaces: string[]
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
  env: Record<string, string>
  profile: AppProfile
  createdAt: string
  updatedAt: string
  latestReportPath?: string
  latestRunId?: string
  discoveryMode?: DiscoveryMode
  lastRuntimeDomSnapshotPath?: string
  inferredAppProfile?: AppProfile
  generatedScenarioPack?: GeneratedScenario[]
  lastCrawlCoverage?: CrawlCoverage
}

export interface ProjectRegistryFile {
  version: 1
  projects: SnifferProject[]
  updatedAt: string
}

export interface GeneratedScenario {
  id: string
  name: string
  profileApplicability: AppProfileType[]
  appSubtype?: AppSubtype
  scenarioPack?: string
  applicability?: ScenarioApplicability
  prerequisites: string[]
  steps: ScenarioStep[]
  expectedControls: string[]
  expectedOutcomes: string[]
  destructiveRisk: 'none' | 'low' | 'medium' | 'high'
  confidence: ProductIntentConfidence
  evidence: string[]
}

export interface ScenarioApplicability {
  scenarioId: string
  scenarioName: string
  appProfileSupport: number
  sourceEvidenceSupport: number
  runtimeEvidenceSupport: number
  productGoalSupport: number
  negativeEvidence: string[]
  confidence: ProductIntentConfidence
  shouldRun: boolean
  reason: string
}

export interface SkippedScenario {
  scenarioId: string
  scenarioName: string
  reason: string
}

export interface ScenarioPackSelection {
  appSubtype: AppSubtype
  scenarioPack: 'workspace_control' | 'sniffer_dashboard' | 'generic_control_panel' | 'generic'
  confidence: ProductIntentConfidence
  reason: string
  applicability: ScenarioApplicability[]
  skippedScenarios: SkippedScenario[]
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

export type ProductExperienceCriticMode = 'off' | 'deterministic' | 'llm' | 'auto'
export type ProductExperienceRunStatus = 'completed' | 'partial' | 'not_run' | 'provider_error' | 'not_real_llm'
export type ProductExperienceClassification = 'aligned' | 'minor_gap' | 'major_gap' | 'inconclusive'
export type ProductExperienceContextSufficiency = 'low' | 'medium' | 'high'
export type ProductExperienceFindingType =
  | 'product_intent_mismatch'
  | 'workflow_mismatch'
  | 'context_gap'
  | 'navigation_promise_gap'
  | 'evidence_gap'
  | 'information_hierarchy_gap'
  | 'actionability_gap'
  | 'empty_state_gap'
  | 'safety_clarity_gap'

export interface ProductExperienceRubricItem {
  id: string
  name: string
  description: string
  applies_to: string[]
  evidence_required: string[]
  example_good: string
  example_bad: string
  default_severity: Severity
}

export interface ProductExperienceRubricDocument {
  version: string
  rules: ProductExperienceRubricItem[]
}

export interface ProductExperiencePageIntent {
  screen_name: string
  nav_label: string
  page_intent: string
  workflow_intent: string
  expected_user_questions: string[]
  expected_primary_content: string[]
  expected_next_actions: string[]
  required_context: string[]
  evidence_keywords: string[]
}

export interface ProductExperienceContext {
  app_name: string
  app_profile?: AppProfile
  app_subtype?: AppSubtype
  product_intent_summary?: string
  primary_user_jobs: string[]
  current_screen_name: string
  nav_label_clicked: string
  page_intent: string
  workflow_intent: string
  scenario_name?: string
  scenario_step?: string
  user_goal?: string
  expected_user_questions: string[]
  expected_primary_content: string[]
  expected_next_actions: string[]
  required_context: string[]
  screenshot_path?: string
  screenshot_artifact_url?: string
  screenshot_attached?: boolean
  screenshot_mime_type?: string
  screenshot_bytes?: number
  outerAuditRunId?: string
  outerReportGeneratedAt?: string
  displayedReportId?: string
  displayedReportGeneratedAt?: string
  displayedReportPath?: string
  screenshotSource?: ScreenshotEvidenceSource
  contextScope?: ProductExperienceContextScope
  scenario_screenshot_used: boolean
  dom_summary: string[]
  headings: string[]
  visible_controls: string[]
  visible_status_text: string[]
  visible_empty_states: string[]
  visible_errors: string[]
  active_nav_state?: string
  run_project_report_context_visible: string[]
  source_evidence: string[]
  runtime_evidence: string[]
  related_issues: string[]
  related_fix_packets: string[]
  rubric: ProductExperienceRubricItem[]
  context_sufficiency: ProductExperienceContextSufficiency
  context_sufficiency_score: number
  context_sufficiency_signals: Array<{
    name: string
    present: boolean
    weight: number
  }>
  context_warnings: string[]
  vision_capable: boolean
  vision_requested?: boolean
  vision_used: boolean
  vision_not_used_reason?: string
  vision_detail?: string
  llm_provider?: string
  llm_model?: string
  llm_api_style?: string
  real_llm_expected: boolean
  candidate_findings?: ProductExperienceFinding[]
  evidence_packet?: EvidencePacket
  evidence_retrieval_summary?: EvidenceRetrievalSummary
}

export interface ProductExperienceFinding {
  title: string
  type: ProductExperienceFindingType
  severity: Severity
  rubric_ids: string[]
  expected: string
  observed: string
  evidence: string[]
  why_it_matters: string
  suggested_fix: string
  should_report: boolean
  screenshotPath?: string
  reviewed_screen?: string
  screenshot_used?: string
  scenario_step?: string
  page_intent?: string
  workflow_intent?: string
  dom_excerpt?: string
  positive_evidence_checked?: string[]
  negative_evidence_checked?: string[]
  evidence_scope?: 'same_screen' | 'cross_screen' | 'mixed' | 'unknown'
  suppression_reason?: string
  contradiction_check_result?: string
}

export interface ProductExperienceDecision {
  screen_name: string
  nav_label: string
  workflow_intent: string
  llm_used: boolean
  real_llm_used: boolean
  llm_provider?: string
  llm_model?: string
  llm_api_style?: string
  llm_request_status: 'success' | 'not_requested' | 'not_run' | 'provider_error'
  vision_used: boolean
  vision_not_used_reason?: string
  screenshot_attached?: boolean
  screenshot_mime_type?: string
  screenshot_bytes?: number
  vision_requested?: boolean
  vision_detail?: string
  outerAuditRunId?: string
  outerReportGeneratedAt?: string
  displayedReportId?: string
  displayedReportGeneratedAt?: string
  displayedReportPath?: string
  screenshotSource?: ScreenshotEvidenceSource
  contextScope?: ProductExperienceContextScope
  scenario_screenshot_used: boolean
  context_sufficiency: ProductExperienceContextSufficiency
  context_sufficiency_score: number
  context_warnings: string[]
  evidence_retrieval_summary?: EvidenceRetrievalSummary
  critic_not_run_reason?: string
  overall: {
    classification: ProductExperienceClassification
    confidence: ProductIntentConfidence
    summary: string
  }
  findings: ProductExperienceFinding[]
  non_issues: Array<{
    observation: string
    reason_not_reported: string
  }>
}

export interface ProductExperienceResult {
  mode: ProductExperienceCriticMode
  status: ProductExperienceRunStatus
  notRunReason?: string
  providerName?: string
  providerModel?: string
  providerApiStyle?: string
  screensReviewed: number
  llmScreensReviewed: number
  realLlmScreensReviewed: number
  visionScreensReviewed: number
  visionSkippedScreens?: number
  visionSkipReasons?: Record<string, number>
  aligned: number
  minorGaps: number
  majorGaps: number
  inconclusive: number
  rubricVersion?: string
  ruleIdsEvaluated?: string[]
  ruleIdsTriggered?: string[]
  ruleIdsPassed?: string[]
  rubric: ProductExperienceRubricItem[]
  contexts: ProductExperienceContext[]
  decisions: ProductExperienceDecision[]
  evidenceProvenance?: EvidenceProvenanceSummary
  evidenceRetrievalSummaries?: EvidenceRetrievalSummary[]
  issues: Issue[]
}

export interface ScenarioStepTrace {
  scenarioName: string
  scenarioSlug: string
  stepName: string
  actionLabel?: string
  url: string
  screenName?: string
  navLabel?: string
  screenshotPath?: string
  domSummary: string[]
  headings: string[]
  visibleControls: string[]
  activeNavState?: string
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
  evidence_packet?: EvidencePacket
  evidence_retrieval_summary?: EvidenceRetrievalSummary
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
  | 'auto'
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
  slug: Exclude<ScenarioSlug, 'all' | 'auto'>
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
  stepTraces?: ScenarioStepTrace[]
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
