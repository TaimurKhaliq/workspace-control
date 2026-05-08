import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  AppProfile,
  AppSubtype,
  CrawlGraph,
  CrawlState,
  Issue,
  ProductExperienceContext,
  ProductExperienceCriticMode,
  ProductExperienceDecision,
  ProductExperienceFinding,
  ProductExperiencePageIntent,
  ProductExperienceResult,
  ProductExperienceRubricItem,
  ProductIntentModel,
  RuntimeAppModel,
  RuntimeDomSnapshot,
  ScenarioRun,
  SourceGraph
} from '../types.js'
import type { LlmProvider } from '../llm/provider.js'

const thisFile = fileURLToPath(import.meta.url)
const snifferRoot = path.resolve(path.dirname(thisFile), '..', '..')
const rubricPath = path.join(snifferRoot, 'rubrics', 'product_experience_heuristics.json')

export async function loadProductExperienceRubric(file = rubricPath): Promise<ProductExperienceRubricItem[]> {
  const candidates = [
    file,
    path.join(process.cwd(), 'rubrics', 'product_experience_heuristics.json'),
    path.resolve(path.dirname(thisFile), '..', '..', '..', 'rubrics', 'product_experience_heuristics.json')
  ]
  let lastError: unknown
  for (const candidate of [...new Set(candidates)]) {
    try {
      return JSON.parse(await readFile(candidate, 'utf8')) as ProductExperienceRubricItem[]
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Product experience rubric not found')
}

export function snifferDashboardPageIntents(): ProductExperiencePageIntent[] {
  return [
    intent('Summary', 'Summary', 'Summarize the latest Sniffer report and expose the next audit/fix actions.', 'Review latest audit status and launch a new run.', ['What report is loaded?', 'Did it pass?', 'What should I inspect next?'], ['latest run/report status', 'project/ad hoc context', 'key counts', 'top issues or empty state'], ['Run Audit', 'Open Latest Report', 'Generate Fix Packets'], ['project/ad hoc context', 'generated timestamp or report status'], ['summary', 'latest sniffer run', 'run audit']),
    intent('Run Timeline', 'Run Timeline', 'Explain the ordered phases and evidence for a specific Sniffer audit run.', 'Replay what Sniffer did during the selected/latest audit.', ['Which run am I looking at?', 'What project/app was audited?', 'When did it run?', 'Which phases ran?', 'Where should I inspect evidence next?'], ['run identity', 'project/ad hoc context', 'timestamp/status', 'ordered phase list', 'phase status counts'], ['Open scenarios', 'Open crawl path', 'Open issues', 'Open screenshots'], ['latest/selected run identity', 'project/ad hoc context', 'timestamp or generated time', 'status', 'phase list'], ['run timeline', 'what sniffer did', 'source discovery', 'runtime crawl', 'scenario']),
    intent('Scenarios', 'Scenarios', 'Show generated and executed workflow scenarios with assertions and screenshots.', 'Understand which workflow checks ran and why they passed, failed, or were blocked.', ['Which scenarios were generated?', 'Which ran?', 'Why was one blocked?', 'Which screenshot belongs to a failed step?'], ['generated vs executed scenarios', 'pass/fail/blocked status', 'steps/assertions', 'screenshots'], ['Open screenshot', 'Open issue', 'Inspect crawl path'], ['project/ad hoc context', 'scenario counts', 'execution status'], ['scenarios', 'workflow execution', 'generated', 'executed']),
    intent('Crawl Path', 'Crawl Path', 'Replay chronological runtime states, actions, screenshots, and skipped safe actions.', 'Debug the path Sniffer crawled and the state changes it observed.', ['Which screen did Sniffer reach?', 'What action changed the state?', 'What was skipped?', 'Which screenshot belongs to the state?'], ['state sequence', 'URLs/routes', 'action labels', 'changed state yes/no', 'screenshot per state'], ['Open screenshot', 'Inspect workflow evidence'], ['project/ad hoc context', 'state/action counts', 'route/status context'], ['crawl path', 'runtime states', 'safe actions']),
    intent('Workflow Evidence', 'Workflow Evidence', 'Compare source workflow intent with runtime controls and scenario evidence.', 'Understand whether source-discovered workflows are supported in the running UI.', ['What did source say should exist?', 'What did runtime show?', 'Which scenario exercised it?'], ['source workflows', 'runtime workflows', 'expected controls', 'observed controls', 'related scenarios'], ['Open scenarios', 'Open issues'], ['project/ad hoc context', 'source/runtime counts'], ['workflow evidence', 'source intent', 'runtime behavior']),
    intent('Issues', 'Issues', 'Show grouped issues with severity, evidence, suspected files, and fix-packet/verification actions.', 'Decide what needs repair and why.', ['Were there issues?', 'What was checked?', 'What evidence supports each issue?', 'How do I verify it?'], ['issue groups or checked-scope empty state', 'severity/type', 'evidence', 'suspected files'], ['Copy fix prompt', 'Run verification', 'Open fix packet'], ['project/ad hoc context', 'raw/triaged counts', 'checked-scope summary'], ['issues', 'raw findings', 'triaged issues']),
    intent('Fix Packets', 'Fix Packets', 'Show Codex-ready fix packets with prompt, suspected files, verification command, and repair status.', 'Inspect or copy a safe repair prompt.', ['What issue does this packet fix?', 'Which files are suspected?', 'How do I verify it?', 'Will this run an agent?'], ['fix prompt', 'suspected files', 'verification command', 'pass conditions', 'copy action'], ['Copy prompt', 'Generate Fix Packets'], ['project/ad hoc context', 'repair/manual status'], ['fix packets', 'repair packets', 'copy prompt']),
    intent('Screenshots', 'Screenshots', 'Browse captured screenshots with enough state/scenario/action context to use them as evidence.', 'Inspect visual evidence from crawl and scenarios.', ['Which state/scenario is this image from?', 'What action produced it?', 'Is it tied to an issue?'], ['screenshot groups', 'state/scenario/action context', 'thumbnail and enlarge affordance'], ['Open screenshot'], ['project/ad hoc context', 'screenshot count or grouping'], ['screenshots', 'evidence gallery']),
    intent('Graph Explorer', 'Graph Explorer', 'Explore focused source/runtime/issue/fix-packet graph relationships with filters and detail panels.', 'Understand relationships without a full graph hairball.', ['What graph mode am I in?', 'What do colors mean?', 'What node is selected?', 'How does this relate to an issue or workflow?'], ['focused graph mode', 'legend', 'filters', 'node detail panel', 'relation explanation'], ['Filter issues', 'Change graph mode'], ['project/ad hoc context', 'graph mode', 'legend or detail panel'], ['graph explorer', 'graph filters', 'legend']),
    intent('Raw JSON', 'Raw JSON', 'Expose the raw report payload as an advanced/debug view with copy action and context.', 'Inspect exact report data without relying on it for normal comprehension.', ['What JSON is this?', 'How do I copy it?', 'Should I use this for normal review?'], ['report payload context', 'copy action', 'formatted JSON'], ['Copy JSON'], ['project/ad hoc context', 'payload identity'], ['raw json', 'latest report payload', 'copy json']),
    intent('Settings', 'Settings', 'Show local provider/agent configuration status without exposing secrets.', 'Confirm LLM and agent readiness safely.', ['Is the provider configured?', 'Which model/style is used?', 'Will Codex run automatically?', 'Are secrets hidden?'], ['provider status', 'model/API style', 'agent/manual status', 'no secrets'], ['Review config'], ['configuration status', 'agent/provider status'], ['settings', 'provider', 'codex', 'model'])
  ]
}

function intent(
  screen_name: string,
  nav_label: string,
  page_intent: string,
  workflow_intent: string,
  expected_user_questions: string[],
  expected_primary_content: string[],
  expected_next_actions: string[],
  required_context: string[],
  evidence_keywords: string[]
): ProductExperiencePageIntent {
  return { screen_name, nav_label, page_intent, workflow_intent, expected_user_questions, expected_primary_content, expected_next_actions, required_context, evidence_keywords }
}

export async function runProductExperienceCritic(input: {
  mode: ProductExperienceCriticMode
  provider?: Pick<LlmProvider, 'critiqueProductExperience'>
  sourceGraph: SourceGraph
  crawlGraph: CrawlGraph
  appProfile?: AppProfile
  appSubtype?: AppSubtype
  productIntent?: ProductIntentModel
  runtimeDomSnapshot?: RuntimeDomSnapshot
  runtimeAppModel?: RuntimeAppModel
  scenarioRuns: ScenarioRun[]
  productGoal?: string
  reportDir: string
  projectId?: string
}): Promise<ProductExperienceResult> {
  const rubric = await loadProductExperienceRubric()
  if (input.mode === 'off') {
    return emptyResult('off', rubric)
  }

  const contexts = buildProductExperienceContexts(input)
  const decisions: ProductExperienceDecision[] = []
  for (const context of contexts) {
    const deterministic = deterministicProductExperienceDecision(context)
    if ((input.mode === 'llm' || input.mode === 'auto') && input.provider?.critiqueProductExperience) {
      try {
        const llmDecision = await input.provider.critiqueProductExperience({ ...context, candidate_findings: deterministic.findings })
        decisions.push(normalizeLlmDecision(llmDecision, context, deterministic))
        continue
      } catch {
        if (input.mode === 'llm') {
          decisions.push({
            ...deterministic,
            overall: {
              classification: deterministic.findings.length ? 'minor_gap' : 'inconclusive',
              confidence: 'low',
              summary: 'LLM product experience critic failed; deterministic candidates were retained.'
            }
          })
          continue
        }
      }
    }
    decisions.push(deterministic)
  }

  const issues = decisions.flatMap((decision) =>
    decision.findings
      .filter((finding) => finding.should_report)
      .map((finding) => productExperienceIssue(finding, decision))
  )
  return {
    mode: input.mode,
    screensReviewed: contexts.length,
    aligned: decisions.filter((decision) => decision.overall.classification === 'aligned').length,
    minorGaps: decisions.filter((decision) => decision.overall.classification === 'minor_gap').length,
    majorGaps: decisions.filter((decision) => decision.overall.classification === 'major_gap').length,
    inconclusive: decisions.filter((decision) => decision.overall.classification === 'inconclusive').length,
    rubric,
    contexts,
    decisions,
    issues
  }
}

export function buildProductExperienceContexts(input: {
  sourceGraph: SourceGraph
  crawlGraph: CrawlGraph
  appProfile?: AppProfile
  appSubtype?: AppSubtype
  productIntent?: ProductIntentModel
  runtimeDomSnapshot?: RuntimeDomSnapshot
  runtimeAppModel?: RuntimeAppModel
  scenarioRuns: ScenarioRun[]
  productGoal?: string
  reportDir: string
  projectId?: string
}): ProductExperienceContext[] {
  const intents = input.appSubtype === 'sniffer_dashboard' ? snifferDashboardPageIntents() : genericPageIntents(input)
  return intents
    .map((pageIntent) => contextForPageIntent(pageIntent, input))
    .filter((context): context is ProductExperienceContext => Boolean(context))
}

export function deterministicProductExperienceDecision(context: ProductExperienceContext): ProductExperienceDecision {
  const findings: ProductExperienceFinding[] = [
    ...navigationPromiseFindings(context),
    ...runContextFindings(context),
    ...screenshotContextFindings(context),
    ...graphContextFindings(context),
    ...emptyStateFindings(context)
  ]
  const reportable = findings.filter((finding) => finding.should_report)
  const major = reportable.some((finding) => finding.severity === 'high' || finding.severity === 'critical')
  return {
    screen_name: context.current_screen_name,
    nav_label: context.nav_label_clicked,
    workflow_intent: context.workflow_intent,
    overall: {
      classification: reportable.length === 0 ? 'aligned' : major ? 'major_gap' : 'minor_gap',
      confidence: reportable.length === 0 ? 'medium' : 'high',
      summary: reportable.length === 0
        ? `${context.current_screen_name} appears aligned with the expected user job.`
        : `${context.current_screen_name} has ${reportable.length} evidence-backed product experience gap(s).`
    },
    findings,
    non_issues: reportable.length === 0 ? [{ observation: 'No evidence-backed product experience gaps detected.', reason_not_reported: 'The page label, visible content, and expected workflow context were sufficiently aligned.' }] : []
  }
}

function contextForPageIntent(pageIntent: ProductExperiencePageIntent, input: Parameters<typeof buildProductExperienceContexts>[0]): ProductExperienceContext | undefined {
  const state = findStateForPage(pageIntent, input.crawlGraph.states)
  const textBlocks = state?.primaryVisibleText ?? input.runtimeDomSnapshot?.visibleTextBlocks ?? []
  const domText = compactLines(textBlocks)
  const controls = (state?.visible ?? input.runtimeDomSnapshot?.controls ?? [])
    .map((control) => controlLabel(control))
    .filter(Boolean)
    .slice(0, 40)
  const screenshotPath = state?.screenshotPath ?? input.runtimeDomSnapshot?.screenshotPath
  return {
    app_name: input.runtimeAppModel?.app_name ?? input.runtimeDomSnapshot?.title ?? input.sourceGraph.packageName ?? 'Unknown app',
    app_profile: input.appProfile,
    app_subtype: input.appSubtype,
    product_intent_summary: input.productIntent?.product_summary,
    primary_user_jobs: input.productIntent?.primary_user_jobs.map((job) => job.name) ?? input.appProfile?.primary_user_jobs ?? [],
    current_screen_name: pageIntent.screen_name,
    nav_label_clicked: pageIntent.nav_label,
    page_intent: pageIntent.page_intent,
    workflow_intent: pageIntent.workflow_intent,
    scenario_name: matchingScenario(pageIntent, input.scenarioRuns)?.name,
    user_goal: input.productGoal,
    expected_user_questions: pageIntent.expected_user_questions,
    expected_primary_content: pageIntent.expected_primary_content,
    expected_next_actions: pageIntent.expected_next_actions,
    required_context: pageIntent.required_context,
    screenshot_path: screenshotPath,
    screenshot_artifact_url: screenshotPath ? artifactUrlForReport(input.reportDir, screenshotPath, input.projectId) : undefined,
    dom_summary: domText,
    headings: headingsFromText(pageIntent, domText, input.runtimeDomSnapshot),
    visible_controls: controls,
    visible_status_text: statusText(domText),
    visible_empty_states: domText.filter((line) => /no .*found|no .*yet|empty|not found|unavailable/i.test(line)),
    visible_errors: domText.filter((line) => /error|failed|warning|not found|unavailable/i.test(line)),
    active_nav_state: pageIntent.nav_label,
    run_project_report_context_visible: visibleRunContext(domText),
    source_evidence: sourceEvidenceForPage(pageIntent, input.sourceGraph),
    runtime_evidence: runtimeEvidenceForPage(pageIntent, state, input.runtimeDomSnapshot),
    related_issues: [],
    related_fix_packets: []
  }
}

function genericPageIntents(input: Parameters<typeof buildProductExperienceContexts>[0]): ProductExperiencePageIntent[] {
  const labels = new Set<string>()
  for (const state of input.crawlGraph.states) {
    const label = screenNameFromState(state)
    if (label) labels.add(label)
  }
  return [...labels].slice(0, 8).map((label) =>
    intent(label, label, `Support the user job implied by ${label}.`, `Inspect ${label}.`, [`What is ${label}?`, 'What should I inspect next?'], ['clear heading', 'relevant primary content'], ['inspect evidence'], ['current context'], [label.toLowerCase()])
  )
}

function findStateForPage(pageIntent: ProductExperiencePageIntent, states: CrawlState[]): CrawlState | undefined {
  const expectedHash = hashForScreen(pageIntent.screen_name)
  return states.find((state) => routeOf(state) === expectedHash)
    ?? states.find((state) => textOfState(state).includes(pageIntent.nav_label.toLowerCase()))
    ?? (pageIntent.screen_name === 'Summary' ? states[0] : undefined)
}

function navigationPromiseFindings(context: ProductExperienceContext): ProductExperienceFinding[] {
  const text = allText(context)
  const nav = normalize(context.nav_label_clicked)
  const keywordMatch = context.expected_primary_content.some((item) => text.includes(normalize(item))) || context.source_evidence.some((item) => text.includes(normalize(item)))
  if (text.includes(nav) || keywordMatch) return []
  return [finding(context, {
    title: `${context.nav_label_clicked} does not clearly match the visible page content`,
    type: 'navigation_promise_gap',
    severity: 'medium',
    rubric_ids: ['navigation_promise', 'intent_fit'],
    expected: `The page should visibly deliver: ${context.page_intent}`,
    observed: `The visible DOM did not clearly mention "${context.nav_label_clicked}" or equivalent content.`,
    evidence: evidence(context, [`nav_label: ${context.nav_label_clicked}`, `visible_headings: ${context.headings.join(', ') || 'none'}`]),
    why_it_matters: 'Users rely on navigation labels to predict what they will inspect next.',
    suggested_fix: `Make the ${context.nav_label_clicked} page heading or summary explicitly match the navigation promise.`
  })]
}

function runContextFindings(context: ProductExperienceContext): ProductExperienceFinding[] {
  if (!/run timeline|scenarios|crawl path|workflow evidence|issues|fix packets|screenshots|graph explorer|raw json/i.test(context.current_screen_name)) return []
  const text = allText(context)
  const hasProjectContext = /project|ad hoc|selected project|workspace control|latest\s*\/\s*ad hoc/i.test(text)
  const hasRunIdentity = /latest run|selected run|current run|run id|report payload|latest report/i.test(text)
  const hasTimestampOrStatus = /generated\s+\d|generated at|status|passed|failed|warning|idle|running|\d{1,2}\/\d{1,2}\/\d{2,4}/i.test(text)
  if (hasProjectContext && hasRunIdentity && hasTimestampOrStatus) return []
  const missing = [
    hasProjectContext ? undefined : 'project/ad hoc context',
    hasRunIdentity ? undefined : 'latest/selected run identity',
    hasTimestampOrStatus ? undefined : 'timestamp or status'
  ].filter(Boolean) as string[]
  return [finding(context, {
    title: `${context.current_screen_name} lacks clear run/report context`,
    type: 'context_gap',
    severity: context.current_screen_name === 'Run Timeline' ? 'medium' : 'low',
    rubric_ids: ['context_clarity', 'workflow_continuity'],
    expected: `Visible context should include ${context.required_context.join(', ')}.`,
    observed: `Missing visible context: ${missing.join(', ')}.`,
    evidence: evidence(context, [
      `missing_context: ${missing.join(', ')}`,
      `screen: ${context.current_screen_name}`,
      `dom_excerpt: ${context.dom_summary.join(' ').slice(0, 240)}`
    ]),
    why_it_matters: 'A QA dashboard must make clear which report/run the evidence belongs to before users trust or act on it.',
    suggested_fix: `Add a compact report context strip to ${context.current_screen_name}: latest/selected run, project/ad hoc context, generated timestamp, status, and links to related evidence.`
  })]
}

function screenshotContextFindings(context: ProductExperienceContext): ProductExperienceFinding[] {
  if (context.current_screen_name !== 'Screenshots') return []
  const text = allText(context)
  const hasContext = /state|scenario|step|action|crawl|evidence|issue/i.test(text)
  if (hasContext) return []
  return [finding(context, {
    title: 'Screenshots view does not explain screenshot context',
    type: 'evidence_gap',
    severity: 'medium',
    rubric_ids: ['evidence_proximity'],
    expected: 'Screenshots should show scenario/state/action context near each image.',
    observed: 'Visible screenshot content appears image/file oriented without scenario or state context.',
    evidence: evidence(context, [`dom_excerpt: ${context.dom_summary.join(' ').slice(0, 240)}`]),
    why_it_matters: 'Screenshots are only useful QA evidence when the user knows what action or state produced them.',
    suggested_fix: 'Show state/scenario/action metadata on screenshot thumbnails and in the modal.'
  })]
}

function graphContextFindings(context: ProductExperienceContext): ProductExperienceFinding[] {
  if (context.current_screen_name !== 'Graph Explorer') return []
  const text = allText(context)
  const hasMode = /graph mode|crawl|scenario|workflow|issue|source/i.test(text)
  const hasLegendOrDetail = /legend|node detail|selected node|filters/i.test(text)
  if (hasMode && hasLegendOrDetail) return []
  return [finding(context, {
    title: 'Graph Explorer does not provide enough graph-reading context',
    type: 'information_hierarchy_gap',
    severity: 'medium',
    rubric_ids: ['information_hierarchy', 'navigation_promise'],
    expected: 'Graph Explorer should show focused mode, legend, filters, and selected-node detail.',
    observed: 'The visible graph screen lacks either mode context or legend/detail context.',
    evidence: evidence(context, [`has_mode_context: ${hasMode}`, `has_legend_or_detail: ${hasLegendOrDetail}`]),
    why_it_matters: 'Graph visualizations are hard to trust unless users can understand scope, symbols, and selected-node meaning.',
    suggested_fix: 'Keep Graph Explorer scoped by default and make the legend, mode, and node detail panel visible above the fold.'
  })]
}

function emptyStateFindings(context: ProductExperienceContext): ProductExperienceFinding[] {
  const empty = context.visible_empty_states.join(' ')
  if (!empty) return []
  const text = allText(context)
  const hasWhy = /because|run an audit|no raw findings|no .*recorded|after an audit|generate|load/i.test(text)
  const hasNext = /run audit|open|generate|select|inspect|copy|verify/i.test(text)
  if (hasWhy && hasNext) return []
  return [finding(context, {
    title: `${context.current_screen_name} empty state lacks explanation or next action`,
    type: 'empty_state_gap',
    severity: 'low',
    rubric_ids: ['state_empty_honesty', 'actionability'],
    expected: 'Empty states should explain why content is missing and what creates or loads it.',
    observed: empty.slice(0, 220),
    evidence: evidence(context, [`empty_state: ${empty.slice(0, 220)}`]),
    why_it_matters: 'Users need to know whether an empty report means no problems, no data, or a failed load.',
    suggested_fix: `Improve the ${context.current_screen_name} empty state with checked scope and a clear next action.`
  })]
}

function finding(context: ProductExperienceContext, input: Omit<ProductExperienceFinding, 'should_report' | 'screenshotPath'>): ProductExperienceFinding {
  return { ...input, should_report: true, screenshotPath: context.screenshot_path }
}

function evidence(context: ProductExperienceContext, evidenceItems: string[]): string[] {
  return [
    `screen: ${context.current_screen_name}`,
    `nav_label: ${context.nav_label_clicked}`,
    ...evidenceItems,
    context.screenshot_path ? `screenshot: ${context.screenshot_path}` : undefined
  ].filter(Boolean) as string[]
}

function productExperienceIssue(finding: ProductExperienceFinding, decision: ProductExperienceDecision): Issue {
  return {
    severity: finding.severity,
    type: 'product_experience_gap',
    title: finding.title,
    description: [
      `Screen: ${decision.screen_name}`,
      `Workflow intent: ${decision.workflow_intent}`,
      `Expected: ${finding.expected}`,
      `Observed: ${finding.observed}`,
      `Why it matters: ${finding.why_it_matters}`
    ].join('\n'),
    evidence: [
      `finding_type: ${finding.type}`,
      `rubric_id: ${finding.rubric_ids.join(',')}`,
      ...finding.evidence
    ],
    screenshotPath: finding.screenshotPath,
    suggestedFixPrompt: [
      `Improve product experience for ${decision.screen_name}.`,
      '',
      `Issue: ${finding.title}`,
      `Intended job: ${decision.workflow_intent}`,
      `Expected: ${finding.expected}`,
      `Observed: ${finding.observed}`,
      '',
      `Suggested fix: ${finding.suggested_fix}`,
      '',
      'Verification:',
      `- Run Sniffer audit with --product-experience-critic deterministic or llm.`,
      `- Confirm ${decision.screen_name} is classified as aligned or only minor non-reportable gaps remain.`
    ].join('\n')
  }
}

function normalizeLlmDecision(decision: ProductExperienceDecision, context: ProductExperienceContext, deterministic: ProductExperienceDecision): ProductExperienceDecision {
  const findings = (decision.findings ?? [])
    .filter((finding) => finding.should_report)
    .filter((finding) => hasEvidenceSupport(finding, context))
  return {
    screen_name: decision.screen_name || context.current_screen_name,
    nav_label: decision.nav_label || context.nav_label_clicked,
    workflow_intent: decision.workflow_intent || context.workflow_intent,
    overall: decision.overall ?? deterministic.overall,
    findings,
    non_issues: decision.non_issues ?? []
  }
}

function hasEvidenceSupport(finding: ProductExperienceFinding, context: ProductExperienceContext): boolean {
  const evidenceText = finding.evidence.join(' ').toLowerCase()
  const contextText = allText(context)
  return finding.evidence.length > 0 && (
    finding.evidence.some((item) => /screen:|nav_label:|dom|screenshot|workflow|rubric|missing|visible|heading/i.test(item)) ||
    importantTokens(evidenceText).some((token) => contextText.includes(token))
  )
}

function emptyResult(mode: ProductExperienceCriticMode, rubric: ProductExperienceRubricItem[]): ProductExperienceResult {
  return { mode, screensReviewed: 0, aligned: 0, minorGaps: 0, majorGaps: 0, inconclusive: 0, rubric, contexts: [], decisions: [], issues: [] }
}

function matchingScenario(pageIntent: ProductExperiencePageIntent, runs: ScenarioRun[]): ScenarioRun | undefined {
  const label = pageIntent.nav_label.toLowerCase()
  return runs.find((run) => run.name.toLowerCase().includes(label) || run.assertions.some((assertion) => assertion.label.toLowerCase().includes(label)))
}

function routeOf(state: CrawlState): string {
  try {
    const url = new URL(state.url)
    return url.hash || state.hashRoute || '/'
  } catch {
    return state.hashRoute ?? '/'
  }
}

function hashForScreen(screenName: string): string {
  const map: Record<string, string> = {
    Summary: '#summary',
    Projects: '#projects',
    'Run Timeline': '#timeline',
    Scenarios: '#scenarios',
    'Crawl Path': '#crawl',
    'Workflow Evidence': '#workflows',
    Issues: '#issues',
    'Fix Packets': '#fix-packets',
    Screenshots: '#screenshots',
    'Graph Explorer': '#graph',
    'Raw JSON': '#raw-json',
    Settings: '#settings'
  }
  return map[screenName] ?? '/'
}

function textOfState(state: CrawlState): string {
  return compactLines([
    state.inferredScreenName,
    state.hashRoute,
    state.url,
    ...(state.primaryVisibleText ?? []),
    ...state.visible.map((control) => controlLabel(control))
  ]).join(' ').toLowerCase()
}

function screenNameFromState(state: CrawlState): string {
  const route = routeOf(state)
  return Object.entries({
    '#summary': 'Summary',
    '#timeline': 'Run Timeline',
    '#scenarios': 'Scenarios',
    '#crawl': 'Crawl Path',
    '#workflows': 'Workflow Evidence',
    '#issues': 'Issues',
    '#fix-packets': 'Fix Packets',
    '#screenshots': 'Screenshots',
    '#graph': 'Graph Explorer',
    '#raw-json': 'Raw JSON',
    '#settings': 'Settings'
  }).find(([hash]) => hash === route)?.[1] ?? state.inferredScreenName ?? ''
}

function controlLabel(control: { accessibleName?: string; visibleText?: string; labelText?: string; placeholder?: string; dataTestId?: string; href?: string; id?: string; text?: string; name?: string }): string {
  return (control.accessibleName ?? control.visibleText ?? control.labelText ?? control.placeholder ?? control.dataTestId ?? control.text ?? control.name ?? control.href ?? control.id ?? '').replace(/\s+/g, ' ').trim()
}

function compactLines(values: Array<string | undefined>): string[] {
  return values
    .map((value) => (value ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 24)
}

function headingsFromText(pageIntent: ProductExperiencePageIntent, domText: string[], snapshot?: RuntimeDomSnapshot): string[] {
  const snapshotHeadings = snapshot?.headings.map(controlLabel).filter(Boolean) ?? []
  return compactLines([pageIntent.nav_label, ...snapshotHeadings, ...domText.filter((line) => /^[A-Z][A-Z /-]{3,}$/.test(line)).slice(0, 4)])
}

function statusText(domText: string[]): string[] {
  return domText.filter((line) => /passed|failed|blocked|warning|idle|running|error|configured|unconfigured|generated/i.test(line)).slice(0, 12)
}

function visibleRunContext(domText: string[]): string[] {
  const text = domText.join(' ')
  return [
    /project|ad hoc|workspace control/i.test(text) ? 'project/ad hoc context' : undefined,
    /latest run|selected run|current run|run id|latest report/i.test(text) ? 'run/report identity' : undefined,
    /generated\s+\d|generated at|\d{1,2}\/\d{1,2}\/\d{2,4}/i.test(text) ? 'timestamp' : undefined,
    /passed|failed|warning|idle|running/i.test(text) ? 'status' : undefined
  ].filter(Boolean) as string[]
}

function sourceEvidenceForPage(pageIntent: ProductExperiencePageIntent, sourceGraph: SourceGraph): string[] {
  const keywords = pageIntent.evidence_keywords.map(normalize)
  return [
    ...sourceGraph.uiSurfaces.filter((surface) => keywords.some((keyword) => normalize(`${surface.display_name} ${surface.surface_type} ${surface.evidence.join(' ')}`).includes(keyword))).map((surface) => `surface:${surface.display_name} (${surface.file})`),
    ...sourceGraph.sourceWorkflows.filter((workflow) => keywords.some((keyword) => normalize(`${workflow.name} ${workflow.evidence.join(' ')}`).includes(keyword))).map((workflow) => `workflow:${workflow.name}`)
  ].slice(0, 10)
}

function runtimeEvidenceForPage(pageIntent: ProductExperiencePageIntent, state?: CrawlState, snapshot?: RuntimeDomSnapshot): string[] {
  return [
    state ? `state:${state.sequenceNumber ?? state.id ?? 'unknown'} ${state.url}` : undefined,
    state?.screenshotPath ? `screenshot:${state.screenshotPath}` : undefined,
    snapshot?.title ? `title:${snapshot.title}` : undefined,
    ...pageIntent.evidence_keywords.filter((keyword) => state ? textOfState(state).includes(keyword) : false).map((keyword) => `visible:${keyword}`)
  ].filter(Boolean).slice(0, 12) as string[]
}

function artifactUrlForReport(reportDir: string, screenshotPath: string, projectId?: string): string | undefined {
  const relative = path.relative(reportDir, screenshotPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return undefined
  const query = projectId ? `?project=${encodeURIComponent(projectId)}` : ''
  return `/api/reports/latest/artifacts/${encodeURIComponent(relative.replace(/\\/g, '/'))}${query}`
}

function allText(context: ProductExperienceContext): string {
  return normalize([
    context.current_screen_name,
    context.nav_label_clicked,
    context.page_intent,
    ...context.dom_summary,
    ...context.headings,
    ...context.visible_controls,
    ...context.visible_status_text,
    ...context.visible_empty_states,
    ...context.run_project_report_context_visible
  ].join(' '))
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function importantTokens(value: string): string[] {
  return value.split(/[^a-z0-9]+/i).filter((token) => token.length >= 5)
}
