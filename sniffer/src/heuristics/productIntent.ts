import type {
  AppIntent,
  CrawlGraph,
  Issue,
  ProductAppCategory,
  ProductIntentConfidence,
  ProductIntentContext,
  ProductIntentFinding,
  ProductIntentItem,
  ProductIntentMode,
  ProductIntentModel,
  ProductIntentSupport,
  RuntimeWorkflowVerification,
  SourceGraph,
  VisibleElement
} from '../types.js'
import type { LlmProvider } from '../llm/provider.js'

export interface ProductIntentInput {
  sourceGraph: SourceGraph
  crawlGraph: CrawlGraph
  appIntent: AppIntent
  runtimeWorkflowVerifications: RuntimeWorkflowVerification[]
  appUrl: string
  productGoal?: string
  mode: ProductIntentMode
  provider?: LlmProvider
}

export interface ProductIntentResult {
  productIntent: ProductIntentModel
  productIntentFindings: ProductIntentFinding[]
  issues: Issue[]
}

export async function synthesizeProductIntent(input: ProductIntentInput): Promise<ProductIntentResult> {
  const deterministic = buildDeterministicProductIntent(input)
  const shouldUseLlm = (input.mode === 'llm' || input.mode === 'auto') && input.provider?.synthesizeProductIntent
  const productIntent = shouldUseLlm
    ? normalizeProductIntentModel(await input.provider!.synthesizeProductIntent!(buildProductIntentContext(input, deterministic)), deterministic)
    : deterministic
  const productIntentFindings = buildProductIntentFindings(input, productIntent)
  return {
    productIntent,
    productIntentFindings,
    issues: productIntentFindings.filter((finding) => finding.should_report).map(findingToIssue)
  }
}

export function buildDeterministicProductIntent(input: Pick<ProductIntentInput, 'sourceGraph' | 'crawlGraph' | 'appIntent' | 'productGoal'>): ProductIntentModel {
  const source = sourceText(input.sourceGraph)
  const runtime = runtimeText(input.crawlGraph)
  const goal = input.productGoal ?? ''
  const all = `${source}\n${runtime}\n${goal}`
  const category = inferCategory(all)
  const isPlanning = category === 'planning_control_panel'
  const evidence = evidenceForTerms(source, runtime, goal, [
    'workspace',
    'repo',
    'featureRequest',
    'Feature request',
    'Plan Runs',
    'planBundle',
    'plan-bundles',
    'handoff',
    'learning',
    'semantic'
  ]).slice(0, 18)

  const coreEntities = [
    entity('workspace', 'A container for local planning context.', ['workspace'], input),
    entity('repo target', 'A connected repository target that can be discovered and planned against.', ['repo', 'repository target', 'target_id'], input),
    entity('feature request', 'The user prompt/change request to plan.', ['featureRequest', 'Feature request', 'prompt'], input),
    entity('plan run', 'A generated planning run for a prompt/target.', ['Plan Runs', 'runId', 'plan_runs', 'plan-bundles'], input),
    entity('plan bundle', 'The structured generated output for a plan run.', ['planBundle', 'Plan Bundle', 'recommended_change_set'], input),
    entity('recipe/learning state', 'Learned recipe and discovery state for repo planning.', ['recipe', 'learning', 'Refresh learning'], input),
    entity('handoff prompt', 'A generated prompt copied into a coding agent.', ['handoff', 'handoff_prompts', 'Copy prompt'], input),
    entity('semantic enrichment', 'Optional LLM/semantic assistance for better planning recommendations.', ['semantic', 'useSemantic'], input)
  ].filter((item) => item.evidence.length > 0)

  const primaryJobs = [
    workflowItem('create/select workspace', ['Create/select workspace', 'Workspace', 'New workspace'], input),
    workflowItem('add/manage repos', ['Add repo', 'Add repository', 'Discovery targets', 'repo target'], input),
    workflowItem('run feature prompts', ['Generate plan bundle', 'featureRequest', 'Feature request'], input),
    workflowItem('browse/reopen previous plan runs', ['Plan Runs', 'runId', 'plan_runs', 'plan-bundles', 'previous plan', 'browse previous'], input),
    workflowItem('inspect plan output and evidence', ['View plan bundle tabs', 'Graph Evidence', 'Validation', 'Raw JSON', 'recommended_change_set'], input),
    workflowItem('copy handoff prompts', ['Copy handoff prompt', 'handoff_prompts', 'Copy prompt'], input),
    workflowItem('refresh discovery/learning', ['Refresh discovery', 'Refresh learning', 'learningStatus', 'discoverRepo'], input)
  ].filter((item) => item.evidence.length > 0 || item.support.includes('user_stated'))

  const outputReview = [
    workflowItem('plan runs should be browseable by prompt/time/target/status', ['Plan Runs', 'runId', 'plan_runs', 'plan-bundles', 'browse previous', 'multiple prompts'], input),
    workflowItem('plan bundle should have overview/change set/recipes/graph/validation/handoff/raw JSON sections', ['Overview', 'Change Set', 'Recipes', 'Graph Evidence', 'Validation', 'Handoff', 'Raw JSON'], input),
    workflowItem('generated outputs should have copy/export actions', ['Copy prompt', 'Copy JSON', 'copy', 'handoff'], input)
  ].filter((item) => item.evidence.length > 0 || item.support.includes('user_stated'))

  const expectedNavigation = [
    workflowItem('left navigation should expose workspaces, repositories, plan runs, learning, and settings', ['Workspaces', 'Repositories', 'Plan Runs', 'Learning', 'Settings'], input),
    workflowItem('active workspace and repo target context should remain visible while reviewing output', ['selectedWorkspaceId', 'selectedTargetId', 'Workspace', 'Target'], input)
  ].filter((item) => item.evidence.length > 0 || item.support.includes('user_stated'))

  const expectedPersistence = [
    workflowItem('workspace/repo/plan-run state should persist locally', ['/api/workspaces', '/api/workspaces/${workspaceId}/repos', '/api/workspaces/${workspaceId}/plan-bundles', 'plan_runs'], input),
    workflowItem('learning/recipe state should be refreshable per repo target', ['learning-status', 'refresh-learning', 'recipe_count'], input)
  ].filter((item) => item.evidence.length > 0)

  return {
    app_category: category,
    product_summary: isPlanning
      ? 'A local-first planning/control-panel UI for connecting repo targets, running feature prompts, reviewing generated plan bundles, and copying handoff prompts to coding agents.'
      : input.appIntent.summary || 'A UI application with partially inferred product intent.',
    primary_user_jobs: primaryJobs,
    core_entities: coreEntities,
    expected_workflows: primaryJobs,
    expected_navigation_model: expectedNavigation,
    expected_persistence_model: expectedPersistence,
    expected_output_review_model: outputReview,
    confidence: coreEntities.length >= 5 && primaryJobs.length >= 4 ? 'high' : evidence.length >= 4 ? 'medium' : 'low',
    evidence,
    assumptions: [
      ...(goal ? ['User-provided product goal is treated as strong evidence for intended jobs.'] : []),
      ...(isPlanning ? ['Plan run browsing is expected because source/runtime expose plan-run or plan-bundle concepts.'] : [])
    ],
    risks_of_hallucination: [
      'Common UI/product patterns are not reportable issues unless source, runtime, or user evidence supports them.',
      'Sniffer does not infer backend data semantics beyond discovered API/state names.'
    ],
    product_goal: input.productGoal,
    llmUsed: false
  }
}

export function buildProductIntentContext(input: ProductIntentInput, deterministic: ProductIntentModel): ProductIntentContext {
  const visible = input.crawlGraph.states.flatMap((state) => state.visible)
  return {
    app_identity: {
      repo_path: input.sourceGraph.repoPath,
      package_name: input.sourceGraph.packageName,
      framework: input.sourceGraph.framework,
      build_tool: input.sourceGraph.buildTool,
      app_url: input.appUrl
    },
    deterministic_model: deterministic,
    source_signals: {
      ui_surfaces: input.sourceGraph.uiSurfaces.slice(0, 24),
      source_workflows: input.sourceGraph.sourceWorkflows.slice(0, 18),
      api_calls: input.sourceGraph.apiCalls.slice(0, 24),
      state_actions: input.sourceGraph.stateActions.slice(0, 12)
    },
    runtime_observation: {
      visible_controls: visible.slice(0, 80),
      screenshots: input.crawlGraph.screenshots.slice(-8),
      console_errors: input.crawlGraph.consoleErrors.slice(0, 12),
      network_errors: input.crawlGraph.networkFailures.slice(0, 12),
      dom_text_summary: visible.map(visibleLabel).filter(Boolean).slice(0, 80)
    },
    user_product_goal: input.productGoal,
    question_for_intent: 'Synthesize the product-level intent. Mark each expected workflow/item with support sources. Do not turn common-pattern-only suggestions into bugs.',
    omitted_counts: {
      visible_controls: Math.max(0, visible.length - 80),
      ui_surfaces: Math.max(0, input.sourceGraph.uiSurfaces.length - 24),
      api_calls: Math.max(0, input.sourceGraph.apiCalls.length - 24),
      state_actions: Math.max(0, input.sourceGraph.stateActions.length - 12)
    }
  }
}

export function buildProductIntentFindings(input: Pick<ProductIntentInput, 'sourceGraph' | 'crawlGraph' | 'productGoal'>, model: ProductIntentModel): ProductIntentFinding[] {
  const findings: ProductIntentFinding[] = []
  if (model.app_category === 'planning_control_panel' || hasItem(model.core_entities, /plan run|plan bundle/i)) {
    findings.push(planRunHistoryFinding(input, model))
    findings.push(commonPatternSuggestion(input))
  }
  return findings.map((finding) => ({
    ...finding,
    should_report: shouldReportFinding(finding)
  }))
}

function planRunHistoryFinding(input: Pick<ProductIntentInput, 'sourceGraph' | 'crawlGraph' | 'productGoal'>, model: ProductIntentModel): ProductIntentFinding {
  const source = sourceText(input.sourceGraph)
  const runtime = runtimeText(input.crawlGraph)
  const goal = input.productGoal ?? ''
  const sourceEvidence = evidenceForTerms(source, '', '', ['Plan Runs', 'runId', 'plan_runs', 'plan-bundles', 'PlanBundleRunResponse'])
  const runtimeEvidence = evidenceForTerms('', runtime, '', ['Plan Runs', 'run ', 'plan bundle'])
  const userEvidence = evidenceForTerms('', '', goal, ['browse previous', 'previous plan runs', 'many feature prompts', 'multiple prompts', 'plan runs'])
  const sourceHasPlanRunList = /PlanRunsPanel|planRuns|listPlanRuns|plan-runs-list/i.test(source)
  const sourceHasReopen = /reopen-plan-run-button|onReopen|Reopen|getPlanRun/i.test(source)
  const sourceHasRunMetadata = /plan-run-prompt|plan-run-target|plan-run-created-at|plan-run-status|feature_request|created_at|status/i.test(source)
  const runtimeHasBrowseSurface = /previous plan|recent plan|plan history|run history|reopen|open run|compare runs|created at|status.+target|plan-run/i.test(runtime)
  const hasBrowseSurface = runtimeHasBrowseSurface || (sourceHasPlanRunList && sourceHasReopen && sourceHasRunMetadata)
  const confidence: ProductIntentConfidence = hasBrowseSurface
    ? 'low'
    : userEvidence.length > 0 ? 'high' : sourceEvidence.length > 0 && runtimeEvidence.length > 0 ? 'medium' : 'low'
  return {
    finding_id: 'product-intent-plan-run-history',
    title: 'Plan run history is not usable for repeated prompt workflows',
    category: 'plan_run_history',
    expected_behavior: 'Users should be able to browse previous plan runs by prompt, time, target, and status; reopen a prior plan bundle; and copy handoff prompts from prior runs.',
    observed_behavior: hasBrowseSurface
      ? 'Source or runtime exposes a browseable plan-run list with reopen and run metadata affordances.'
      : 'Runtime exposes plan generation/Plan Runs signals, but no clear browsable run history or reopen controls were detected.',
    evidence: [
      ...sourceEvidence.map((item) => `source: ${item}`),
      ...runtimeEvidence.map((item) => `runtime: ${item}`),
      ...userEvidence.map((item) => `user_goal: ${item}`),
      ...model.expected_output_review_model.filter((item) => /plan runs/i.test(item.name)).flatMap((item) => item.evidence).map((item) => `model: ${item}`)
    ].slice(0, 14),
    source_support: sourceEvidence.length > 0,
    runtime_support: runtimeEvidence.length > 0,
    user_support: userEvidence.length > 0,
    common_pattern_only: false,
    confidence,
    should_report: false,
    suggested_fix_prompt: [
      'Improve plan run browsing in the UI.',
      'Users should be able to run multiple prompts, see previous plan runs by prompt/time/target/status, reopen a prior plan bundle, and copy handoff prompts from prior runs.',
      'Evidence:',
      ...sourceEvidence.map((item) => `- Source: ${item}`),
      ...runtimeEvidence.map((item) => `- Runtime: ${item}`),
      ...userEvidence.map((item) => `- User goal: ${item}`),
      'Keep the repair scoped to making existing plan-run concepts discoverable; do not invent unrelated workflows.'
    ].join('\n')
  }
}

function commonPatternSuggestion(input: Pick<ProductIntentInput, 'sourceGraph' | 'crawlGraph' | 'productGoal'>): ProductIntentFinding {
  return {
    finding_id: 'product-intent-compare-plan-runs-suggestion',
    title: 'Consider compare support for multiple generated plans',
    category: 'plan_run_history',
    expected_behavior: 'Some planning tools let users compare generated runs.',
    observed_behavior: 'No compare workflow was verified.',
    evidence: ['inferred_from_common_pattern: planning tools sometimes compare outputs'],
    source_support: false,
    runtime_support: false,
    user_support: false,
    common_pattern_only: true,
    confidence: 'low',
    should_report: false,
    suggested_fix_prompt: 'Consider plan-run comparison only if user research or source requirements confirm it.'
  }
}

function findingToIssue(finding: ProductIntentFinding): Issue {
  return {
    severity: finding.confidence === 'high' ? 'medium' : 'low',
    type: 'product_intent_gap',
    title: finding.title,
    description: [
      `Expected behavior: ${finding.expected_behavior}`,
      `Observed behavior: ${finding.observed_behavior}`,
      `Support: source=${finding.source_support ? 'yes' : 'no'}, runtime=${finding.runtime_support ? 'yes' : 'no'}, user=${finding.user_support ? 'yes' : 'no'}, common_only=${finding.common_pattern_only ? 'yes' : 'no'}.`,
      `Confidence: ${finding.confidence}.`
    ].join('\n'),
    evidence: finding.evidence,
    suggestedFixPrompt: finding.suggested_fix_prompt
  }
}

function shouldReportFinding(finding: ProductIntentFinding): boolean {
  if (finding.common_pattern_only) return false
  if (finding.confidence === 'low') return false
  return finding.source_support || finding.runtime_support || finding.user_support
}

function normalizeProductIntentModel(model: ProductIntentModel, fallback: ProductIntentModel): ProductIntentModel {
  return {
    app_category: normalizeCategory(model.app_category, fallback.app_category),
    product_summary: model.product_summary || fallback.product_summary,
    primary_user_jobs: normalizeItems(model.primary_user_jobs, fallback.primary_user_jobs),
    core_entities: normalizeItems(model.core_entities, fallback.core_entities),
    expected_workflows: normalizeItems(model.expected_workflows, fallback.expected_workflows),
    expected_navigation_model: normalizeItems(model.expected_navigation_model, fallback.expected_navigation_model),
    expected_persistence_model: normalizeItems(model.expected_persistence_model, fallback.expected_persistence_model),
    expected_output_review_model: normalizeItems(model.expected_output_review_model, fallback.expected_output_review_model),
    confidence: normalizeConfidence(model.confidence, fallback.confidence),
    evidence: normalizeStrings(model.evidence, fallback.evidence),
    assumptions: normalizeStrings(model.assumptions, fallback.assumptions),
    risks_of_hallucination: normalizeStrings(model.risks_of_hallucination, fallback.risks_of_hallucination),
    product_goal: model.product_goal ?? fallback.product_goal,
    llmUsed: true
  }
}

function entity(name: string, description: string, terms: string[], input: Pick<ProductIntentInput, 'sourceGraph' | 'crawlGraph' | 'productGoal'>): ProductIntentItem {
  const support = supportFor(terms, input)
  return item(name, description, support, evidenceForTerms(sourceText(input.sourceGraph), runtimeText(input.crawlGraph), input.productGoal ?? '', terms))
}

function workflowItem(name: string, terms: string[], input: Pick<ProductIntentInput, 'sourceGraph' | 'crawlGraph' | 'productGoal'>): ProductIntentItem {
  const support = supportFor(terms, input)
  return item(name, undefined, support, evidenceForTerms(sourceText(input.sourceGraph), runtimeText(input.crawlGraph), input.productGoal ?? '', terms))
}

function item(name: string, description: string | undefined, support: ProductIntentSupport[], evidence: string[]): ProductIntentItem {
  return {
    name,
    description,
    support,
    evidence: evidence.slice(0, 8),
    confidence: support.includes('user_stated') || support.includes('source_supported') && support.includes('runtime_supported') ? 'high' : support.length > 0 ? 'medium' : 'low'
  }
}

function supportFor(terms: string[], input: Pick<ProductIntentInput, 'sourceGraph' | 'crawlGraph' | 'productGoal'>): ProductIntentSupport[] {
  const support: ProductIntentSupport[] = []
  const source = sourceText(input.sourceGraph)
  const runtime = runtimeText(input.crawlGraph)
  const goal = input.productGoal ?? ''
  if (terms.some((term) => includesLoose(source, term))) support.push('source_supported')
  if (terms.some((term) => includesLoose(runtime, term))) support.push('runtime_supported')
  if (goal && terms.some((term) => includesLoose(goal, term))) support.push('user_stated')
  return [...new Set(support)]
}

function evidenceForTerms(source: string, runtime: string, goal: string, terms: string[]): string[] {
  const evidence: string[] = []
  for (const term of terms) {
    if (source && includesLoose(source, term)) evidence.push(term)
    if (runtime && includesLoose(runtime, term)) evidence.push(term)
    if (goal && includesLoose(goal, term)) evidence.push(term)
  }
  return [...new Set(evidence)]
}

function inferCategory(text: string): ProductAppCategory {
  if (/plan bundle|feature request|handoff|repo target|learning|workspace/i.test(text)) return 'planning_control_panel'
  if (/admin|users|roles|permissions/i.test(text)) return 'admin_console'
  if (/dashboard|metrics|analytics/i.test(text)) return 'dashboard'
  if (/create|edit|delete|list|record/i.test(text)) return 'crud_app'
  if (/localhost|repo|dev/i.test(text)) return 'local_dev_tool'
  return 'design_unknown'
}

function sourceText(sourceGraph: SourceGraph): string {
  return [
    sourceGraph.packageName,
    sourceGraph.framework,
    sourceGraph.buildTool,
    ...sourceGraph.uiSurfaces.flatMap((surface) => [surface.surface_type, surface.display_name, ...surface.evidence, ...surface.relatedButtons, ...surface.relatedInputs]),
    ...sourceGraph.sourceWorkflows.flatMap((workflow) => [workflow.name, ...workflow.evidence, ...workflow.likelyUserActions]),
    ...sourceGraph.apiCalls.flatMap((call) => [call.method, call.endpoint, call.functionName, call.likelyWorkflow]),
    ...sourceGraph.stateActions.flatMap((state) => [...state.stateVariables, ...state.handlerNames, ...state.submitHandlers, ...state.loadingStateVariables, ...state.errorStateVariables])
  ].filter(Boolean).join('\n')
}

function runtimeText(crawlGraph: CrawlGraph): string {
  return [
    crawlGraph.title,
    crawlGraph.finalUrl,
    ...crawlGraph.states.flatMap((state) => state.visible.map(visibleLabel)),
    ...crawlGraph.actions.map((action) => action.label)
  ].filter(Boolean).join('\n')
}

function visibleLabel(element: VisibleElement): string {
  return [element.kind, element.name, element.text, element.href, element.type].filter(Boolean).join(' ')
}

function includesLoose(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

function hasItem(items: ProductIntentItem[], pattern: RegExp): boolean {
  return items.some((item) => pattern.test(item.name))
}

function normalizeItems(value: ProductIntentItem[] | undefined, fallback: ProductIntentItem[]): ProductIntentItem[] {
  if (!Array.isArray(value)) return fallback
  return value.map((item) => ({
    name: typeof item.name === 'string' ? item.name : 'unknown',
    description: typeof item.description === 'string' ? item.description : undefined,
    support: Array.isArray(item.support)
      ? item.support.filter((support): support is ProductIntentSupport => ['source_supported', 'runtime_supported', 'inferred_from_common_pattern', 'user_stated'].includes(support))
      : [],
    evidence: normalizeStrings(item.evidence, []),
    confidence: normalizeConfidence(item.confidence, 'low')
  }))
}

function normalizeStrings(value: string[] | undefined, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, 30) : fallback
}

function normalizeConfidence(value: ProductIntentConfidence | undefined, fallback: ProductIntentConfidence): ProductIntentConfidence {
  return value === 'high' || value === 'medium' || value === 'low' ? value : fallback
}

function normalizeCategory(value: ProductAppCategory | undefined, fallback: ProductAppCategory): ProductAppCategory {
  return ['local_dev_tool', 'planning_control_panel', 'admin_console', 'dashboard', 'crud_app', 'design_unknown'].includes(value ?? '')
    ? value as ProductAppCategory
    : fallback
}
