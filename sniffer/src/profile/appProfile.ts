import type { AppProfile, AppProfileType, CrawlGraph, ProductIntentConfidence, ProductIntentModel, ScenarioPackSelection, SourceGraph } from '../types.js'

type ProfileScore = {
  type: AppProfileType
  score: number
  evidence: string[]
}

const PROFILE_TERMS: Array<{ type: AppProfileType; terms: string[] }> = [
  { type: 'planning_control_panel', terms: ['workspace', 'repo target', 'target repo', 'feature request', 'plan bundle', 'plan run', 'handoff', 'semantic enrichment', 'recipe', 'source discovery'] },
  { type: 'admin_console', terms: ['admin', 'user', 'role', 'permission', 'settings', 'manage', 'audit log', 'team', 'organization'] },
  { type: 'dashboard_app', terms: ['dashboard', 'metric', 'analytics', 'chart', 'trend', 'report', 'kpi', 'monitor'] },
  { type: 'crud_app', terms: ['create', 'edit', 'delete', 'detail', 'list', 'table', 'filter', 'search', 'save', 'cancel'] },
  { type: 'ecommerce_app', terms: ['product', 'cart', 'checkout', 'order', 'price', 'shipping', 'payment', 'wishlist'] },
  { type: 'docs_site', terms: ['docs', 'documentation', 'guide', 'search docs', 'markdown', 'api reference', 'tutorial'] },
  { type: 'marketing_site', terms: ['pricing', 'contact', 'cta', 'hero', 'landing', 'testimonial', 'signup', 'demo'] },
  { type: 'auth_app', terms: ['login', 'sign in', 'password', 'auth', 'session', 'register', 'forgot password', 'mfa'] }
]

export function inferAppProfile(input: {
  sourceGraph: SourceGraph
  crawlGraph?: CrawlGraph
  productGoal?: string
}): AppProfile {
  const corpus = buildCorpus(input.sourceGraph, input.crawlGraph, input.productGoal)
  const scores = PROFILE_TERMS
    .map(({ type, terms }) => scoreProfile(type, terms, corpus))
    .sort((left, right) => right.score - left.score)
  const best = scores[0]
  const profileType: AppProfileType = best && best.score > 0 ? best.type : 'unknown'
  const confidence = confidenceFor(best?.score ?? 0)
  const evidence = unique([
    ...(best?.evidence ?? []),
    ...frameworkEvidence(input.sourceGraph),
    ...(input.productGoal ? [`User product goal: ${input.productGoal}`] : [])
  ]).slice(0, 16)
  return {
    profile_type: profileType,
    confidence,
    evidence,
    core_entities: inferCoreEntities(profileType, corpus),
    primary_user_jobs: inferPrimaryJobs(profileType, corpus),
    expected_navigation_patterns: inferNavigation(profileType, corpus),
    expected_workflows: inferExpectedWorkflows(profileType, corpus),
    expected_output_surfaces: inferOutputSurfaces(profileType, corpus)
  }
}

export function augmentAppProfileWithProductIntent(profile: AppProfile, productIntent?: ProductIntentModel): AppProfile {
  if (!productIntent?.llmUsed) return profile
  const mappedType = mapProductCategory(productIntent.app_category)
  return {
    ...profile,
    profile_type: mappedType === 'unknown' ? profile.profile_type : mappedType,
    confidence: higherConfidence(profile.confidence, productIntent.confidence),
    evidence: unique([
      ...profile.evidence,
      ...productIntent.evidence.map((item) => `LLM product intent: ${item}`),
      ...productIntent.core_entities.flatMap((item) => item.evidence.map((evidence) => `LLM entity ${item.name}: ${evidence}`))
    ]).slice(0, 20),
    core_entities: unique([...profile.core_entities, ...productIntent.core_entities.map((item) => item.name)]).slice(0, 16),
    primary_user_jobs: unique([...profile.primary_user_jobs, ...productIntent.primary_user_jobs.map((item) => item.name)]).slice(0, 16),
    expected_navigation_patterns: unique([...profile.expected_navigation_patterns, ...productIntent.expected_navigation_model.map((item) => item.name)]).slice(0, 16),
    expected_workflows: unique([...profile.expected_workflows, ...productIntent.expected_workflows.map((item) => item.name)]).slice(0, 18),
    expected_output_surfaces: unique([...profile.expected_output_surfaces, ...productIntent.expected_output_review_model.map((item) => item.name)]).slice(0, 16)
  }
}

export function applyScenarioPackProfileGate(profile: AppProfile, selection?: ScenarioPackSelection): AppProfile {
  if (selection?.scenarioPack !== 'sniffer_dashboard' || selection.confidence !== 'high') return profile
  return {
    ...profile,
    profile_type: 'planning_control_panel',
    confidence: 'high',
    evidence: unique([
      'Generic profile candidates suppressed because high-confidence sniffer_dashboard subtype was selected.',
      `Scenario pack reason: ${selection.reason}`,
      ...profile.evidence
    ]).slice(0, 20),
    core_entities: unique(['Sniffer audit run', 'report', 'scenario', 'crawl state', 'source inventory', 'UI intent graph', 'evidence packet', 'fix packet', 'repair attempt', ...profile.core_entities]).slice(0, 16),
    primary_user_jobs: unique(['run UI audits', 'review report evidence', 'inspect scenarios and crawl paths', 'inspect agent/evidence model', 'generate and review fix packets', 'run repair workbench', ...profile.primary_user_jobs]).slice(0, 16),
    expected_navigation_patterns: unique(['dashboard sidebar sections are reachable', 'report/evidence pages preserve current run context', ...profile.expected_navigation_patterns]).slice(0, 16),
    expected_workflows: unique(['dashboard navigation', 'audit launcher form discoverability', 'report section navigation', 'review run timeline', 'review crawl path', 'inspect workflow evidence', 'inspect issues and fix packets', 'browse screenshots/evidence', 'inspect graph explorer', 'inspect raw report payload', 'review settings', ...profile.expected_workflows]).slice(0, 20),
    expected_output_surfaces: unique(['summary cards', 'run timeline', 'scenario traces', 'crawl path', 'workflow evidence', 'issues', 'fix packets', 'screenshots', 'graph explorer', 'raw JSON', 'agent model', ...profile.expected_output_surfaces]).slice(0, 20)
  }
}

function mapProductCategory(category: ProductIntentModel['app_category']): AppProfileType {
  if (category === 'planning_control_panel' || category === 'local_dev_tool') return 'planning_control_panel'
  if (category === 'admin_console') return 'admin_console'
  if (category === 'dashboard') return 'dashboard_app'
  if (category === 'crud_app') return 'crud_app'
  return 'unknown'
}

function higherConfidence(left: ProductIntentConfidence, right: ProductIntentConfidence): ProductIntentConfidence {
  const order: ProductIntentConfidence[] = ['low', 'medium', 'high']
  return order.indexOf(right) > order.indexOf(left) ? right : left
}

function buildCorpus(sourceGraph: SourceGraph, crawlGraph?: CrawlGraph, productGoal?: string): string[] {
  return [
    sourceGraph.packageName,
    sourceGraph.framework,
    sourceGraph.buildTool,
    productGoal,
    ...sourceGraph.routes.map((route) => route.path),
    ...sourceGraph.pages.flatMap((page) => [page.file, page.name]),
    ...sourceGraph.components.flatMap((component) => [component.file, component.name]),
    ...sourceGraph.forms.flatMap((form) => [form.file, form.name, ...form.inputs]),
    ...sourceGraph.uiSurfaces.flatMap((surface) => [surface.surface_type, surface.display_name, ...surface.evidence, ...surface.relatedButtons, ...surface.relatedInputs]),
    ...sourceGraph.sourceWorkflows.flatMap((workflow) => [workflow.name, ...workflow.evidence, ...workflow.likelyUserActions]),
    ...sourceGraph.apiCalls.flatMap((call) => [call.endpoint, call.method, call.functionName, call.likelyWorkflow]),
    ...sourceGraph.stateActions.flatMap((state) => [state.file, ...state.stateVariables, ...state.handlerNames, ...state.submitHandlers, ...state.loadingStateVariables, ...state.errorStateVariables]),
    ...(crawlGraph?.states ?? []).flatMap((state) => [
      state.url,
      state.hashRoute,
      ...(state.primaryVisibleText ?? []),
      ...state.visible.flatMap((control) => [control.kind, control.text, control.name, control.href])
    ])
  ].filter((value): value is string => Boolean(value && value.trim()))
}

function scoreProfile(type: AppProfileType, terms: string[], corpus: string[]): ProfileScore {
  const evidence: string[] = []
  let score = 0
  for (const term of terms) {
    const matched = corpus.find((entry) => entry.toLowerCase().includes(term.toLowerCase()))
    if (matched) {
      score += term.includes(' ') ? 2 : 1
      evidence.push(`${type}: matched "${term}" in "${matched.slice(0, 120)}"`)
    }
  }
  return { type, score, evidence }
}

function confidenceFor(score: number): ProductIntentConfidence {
  if (score >= 6) return 'high'
  if (score >= 3) return 'medium'
  return score > 0 ? 'low' : 'low'
}

function frameworkEvidence(sourceGraph: SourceGraph): string[] {
  const evidence = [`Framework: ${sourceGraph.framework}`, `Build tool: ${sourceGraph.buildTool}`]
  if (sourceGraph.packageName) evidence.unshift(`Package: ${sourceGraph.packageName}`)
  return evidence
}

function inferCoreEntities(type: AppProfileType, corpus: string[]): string[] {
  const generic = entitiesFromCorpus(corpus)
  if (type === 'planning_control_panel') return unique(['workspace', 'repo target', 'feature request', 'plan run', 'plan bundle', 'handoff prompt', ...generic]).slice(0, 12)
  if (type === 'admin_console') return unique(['user', 'role', 'permission', 'setting', ...generic]).slice(0, 12)
  if (type === 'dashboard_app') return unique(['dashboard', 'metric', 'report', 'chart', ...generic]).slice(0, 12)
  if (type === 'crud_app') return unique(['record', 'list', 'detail', 'form', ...generic]).slice(0, 12)
  if (type === 'ecommerce_app') return unique(['product', 'cart', 'order', 'customer', ...generic]).slice(0, 12)
  if (type === 'docs_site') return unique(['document', 'guide', 'search result', 'section', ...generic]).slice(0, 12)
  if (type === 'auth_app') return unique(['account', 'session', 'credential', ...generic]).slice(0, 12)
  return generic.slice(0, 12)
}

function entitiesFromCorpus(corpus: string[]): string[] {
  const text = corpus.join(' ').toLowerCase()
  const candidates = ['workspace', 'repository', 'repo', 'target', 'plan', 'run', 'user', 'project', 'team', 'file', 'product', 'order', 'document', 'account']
  return candidates.filter((candidate) => text.includes(candidate)).map((candidate) => candidate === 'repo' ? 'repo target' : candidate)
}

function inferPrimaryJobs(type: AppProfileType, corpus: string[]): string[] {
  const jobs: string[] = []
  const text = corpus.join(' ').toLowerCase()
  if (type === 'planning_control_panel') jobs.push('connect repositories', 'run feature prompts', 'review generated plan bundles', 'browse previous plan runs', 'copy handoff prompts')
  if (type === 'admin_console') jobs.push('manage records and settings', 'review user or team state', 'apply safe administrative changes')
  if (type === 'dashboard_app') jobs.push('monitor metrics', 'filter or drill into data', 'share reports')
  if (type === 'crud_app') jobs.push('browse list views', 'create or edit records', 'validate form inputs', 'open detail views')
  if (type === 'ecommerce_app') jobs.push('browse products', 'review product details', 'manage cart and checkout')
  if (type === 'docs_site') jobs.push('navigate docs', 'search content', 'follow reference links')
  if (type === 'auth_app') jobs.push('sign in', 'recover access', 'understand validation errors')
  if (/copy/.test(text)) jobs.push('copy generated output')
  if (/search|filter/.test(text)) jobs.push('search or filter content')
  return unique(jobs.length > 0 ? jobs : ['navigate primary UI', 'complete visible forms', 'recover from errors'])
}

function inferNavigation(type: AppProfileType, corpus: string[]): string[] {
  const nav = ['primary navigation is discoverable', 'current location/context is visible']
  const text = corpus.join(' ').toLowerCase()
  if (type === 'planning_control_panel' || /workspace|project/.test(text)) nav.push('active workspace/project selector is visible')
  if (/settings/.test(text)) nav.push('settings are separated from primary work')
  if (/tab|overview|raw json|handoff/.test(text)) nav.push('related output sections use tabs or segmented controls')
  return unique(nav)
}

function inferExpectedWorkflows(type: AppProfileType, corpus: string[]): string[] {
  const text = corpus.join(' ').toLowerCase()
  const workflows: string[] = ['navigation smoke test', 'forms discoverability', 'no console/network errors', 'accessibility labels check']
  if (type === 'planning_control_panel') workflows.push('select workspace', 'select repo target', 'generate plan/output', 'review output tabs', 'browse/reopen history', 'copy/export output')
  if (type === 'crud_app' || /create|edit|delete|list|detail/.test(text)) workflows.push('list view visible', 'create form discoverable', 'detail view discoverable', 'save/cancel affordances visible')
  if (/search|filter/.test(text)) workflows.push('search/filter controls are discoverable')
  if (type === 'auth_app') workflows.push('login form discoverable', 'validation and error states visible')
  if (type === 'docs_site') workflows.push('docs navigation and search work')
  if (type === 'marketing_site') workflows.push('primary CTAs and navigation links work')
  return unique(workflows)
}

function inferOutputSurfaces(type: AppProfileType, corpus: string[]): string[] {
  const text = corpus.join(' ').toLowerCase()
  const surfaces: string[] = []
  if (type === 'planning_control_panel' || /handoff|raw json|plan bundle|change set/.test(text)) surfaces.push('overview', 'change set', 'validation', 'handoff prompt', 'raw JSON', 'copy/export actions')
  if (/table|list|grid/.test(text)) surfaces.push('scan-friendly list/table')
  if (/chart|metric/.test(text)) surfaces.push('summary metrics and charts')
  if (/form|input|textarea|select/.test(text)) surfaces.push('labelled forms and inline errors')
  return unique(surfaces.length > 0 ? surfaces : ['visible page content', 'accessible controls', 'error/loading states'])
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}
