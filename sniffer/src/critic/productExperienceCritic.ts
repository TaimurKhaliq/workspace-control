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
  ProductExperienceContextSufficiency,
  ProductExperienceCriticMode,
  ProductExperienceDecision,
  ProductExperienceFinding,
  ProductExperiencePageIntent,
  ProductExperienceResult,
  ProductExperienceRubricDocument,
  ProductExperienceRubricItem,
  ProductIntentModel,
  RuntimeAppModel,
  RuntimeDomSnapshot,
  ScenarioRun,
  ScenarioStepTrace,
  SourceGraph
} from '../types.js'
import type { LlmProvider, LlmProviderMetadata } from '../llm/provider.js'
import { evidencePacketSummary, retrieveEvidence } from '../evidence/retrieval.js'

const thisFile = fileURLToPath(import.meta.url)
const snifferRoot = path.resolve(path.dirname(thisFile), '..', '..')
const PRODUCT_EXPERIENCE_RUBRIC_VERSION = 'product-experience.v1'
const rubricPath = path.join(snifferRoot, 'src', 'rubrics', 'productExperience.v1.json')

export async function loadProductExperienceRubric(file = rubricPath): Promise<ProductExperienceRubricItem[]> {
  return (await loadProductExperienceRubricDocument(file)).rules
}

export async function loadProductExperienceRubricDocument(file = rubricPath): Promise<ProductExperienceRubricDocument> {
  const candidates = [
    file,
    path.join(process.cwd(), 'src', 'rubrics', 'productExperience.v1.json'),
    path.resolve(path.dirname(thisFile), '..', '..', '..', 'src', 'rubrics', 'productExperience.v1.json'),
    path.join(process.cwd(), 'rubrics', 'product_experience_heuristics.json'),
    path.resolve(path.dirname(thisFile), '..', '..', '..', 'rubrics', 'product_experience_heuristics.json')
  ]
  let lastError: unknown
  for (const candidate of [...new Set(candidates)]) {
    try {
      return normalizeRubricDocument(JSON.parse(await readFile(candidate, 'utf8')))
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Product experience rubric not found')
}

function normalizeRubricDocument(value: unknown): ProductExperienceRubricDocument {
  if (Array.isArray(value)) {
    return { version: 'legacy-product-experience-heuristics', rules: value as ProductExperienceRubricItem[] }
  }
  const doc = value as { version?: string; rules?: Array<Record<string, unknown>> }
  return {
    version: doc.version ?? PRODUCT_EXPERIENCE_RUBRIC_VERSION,
    rules: (doc.rules ?? []).map((rule) => ({
      id: String(rule.id ?? ''),
      name: String(rule.name ?? humanizeRuleId(String(rule.id ?? ''))),
      description: String(rule.description ?? ''),
      applies_to: Array.isArray(rule.applies_to) ? rule.applies_to.map(String) : Array.isArray(rule.appliesTo) ? rule.appliesTo.map(String) : [],
      evidence_required: Array.isArray(rule.evidence_required) ? rule.evidence_required.map(String) : Array.isArray(rule.expectedEvidence) ? rule.expectedEvidence.map(String) : [],
      example_good: typeof rule.example_good === 'string'
        ? rule.example_good
        : typeof (rule.examples as { good?: unknown } | undefined)?.good === 'string' ? String((rule.examples as { good: string }).good) : '',
      example_bad: typeof rule.example_bad === 'string'
        ? rule.example_bad
        : typeof (rule.examples as { bad?: unknown } | undefined)?.bad === 'string' ? String((rule.examples as { bad: string }).bad) : '',
      default_severity: severityOf(rule.severity ?? rule.default_severity)
    }))
  }
}

function humanizeRuleId(id: string): string {
  return id.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function severityOf(value: unknown): ProductExperienceRubricItem['default_severity'] {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low' ? value : 'medium'
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
  provider?: Pick<LlmProvider, 'critiqueProductExperience' | 'isConfigured' | 'supportsVision' | 'metadata' | 'name'>
  providerPreflightError?: string
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
  const rubricDocument = await loadProductExperienceRubricDocument()
  const rubric = rubricDocument.rules
  if (input.mode === 'off') {
    return emptyResult('off', rubric, 'disabled', 'not_run', rubricDocument.version)
  }

  const providerMetadata = providerMetadataOf(input.provider)
  const rawContexts = buildProductExperienceContexts(input)
  const contexts = rawContexts.map((context) => enrichProductExperienceContext(context, rubric, providerMetadata))
  if (input.mode === 'llm' && input.providerPreflightError) {
    return {
      ...emptyResult('llm', rubric, input.providerPreflightError, 'provider_error', rubricDocument.version),
      providerName: providerMetadata?.name,
      providerModel: providerMetadata?.model,
      providerApiStyle: providerMetadata?.apiStyle,
      contexts,
      decisions: contexts.map((context) => llmPreflightFailedDecision(context, input.providerPreflightError ?? 'LLM provider preflight failed.')),
      screensReviewed: contexts.length,
      inconclusive: contexts.length
    }
  }
  const providerAvailable = Boolean(input.provider?.critiqueProductExperience && (input.provider.isConfigured?.() ?? true))
  if (input.mode === 'llm' && !providerAvailable) {
    return {
      ...emptyResult('llm', rubric, 'LLM provider unavailable or does not implement product experience critique. Set SNIFFER_LLM_API_KEY or run sniffer providers check --provider openai-compatible.', 'not_run', rubricDocument.version),
      providerName: providerMetadata?.name,
      providerModel: providerMetadata?.model,
      providerApiStyle: providerMetadata?.apiStyle,
      contexts,
      screensReviewed: contexts.length
    }
  }

  const useLlm = input.mode === 'llm' || (input.mode === 'auto' && providerAvailable)
  const decisions: ProductExperienceDecision[] = []
  for (const context of contexts) {
    const candidates = deterministicProductExperienceDecision(context)
    if (useLlm && input.provider?.critiqueProductExperience) {
      try {
        const llmDecision = await input.provider.critiqueProductExperience({ ...context, candidate_findings: candidates.findings })
        decisions.push(normalizeLlmDecision(llmDecision, context, candidates))
        continue
      } catch (error) {
        decisions.push(llmFailedDecision(context, error))
        continue
      }
    }
    decisions.push(candidates)
  }

  const issues = reportableProductExperienceFindings(decisions, contexts)
    .map(({ finding, decision }) => productExperienceIssue(finding, decision))
  return {
    mode: input.mode,
    status: productExperienceStatus(input.mode, providerMetadata, decisions),
    providerName: providerMetadata?.name,
    providerModel: providerMetadata?.model,
    providerApiStyle: providerMetadata?.apiStyle,
    screensReviewed: contexts.length,
    llmScreensReviewed: decisions.filter((decision) => decision.llm_used).length,
    realLlmScreensReviewed: decisions.filter((decision) => decision.real_llm_used).length,
    visionScreensReviewed: decisions.filter((decision) => decision.vision_used).length,
    aligned: decisions.filter((decision) => decision.overall.classification === 'aligned').length,
    minorGaps: decisions.filter((decision) => decision.overall.classification === 'minor_gap').length,
    majorGaps: decisions.filter((decision) => decision.overall.classification === 'major_gap').length,
    inconclusive: decisions.filter((decision) => decision.overall.classification === 'inconclusive').length,
    rubricVersion: rubricDocument.version,
    ruleIdsEvaluated: rubric.map((rule) => rule.id),
    ruleIdsTriggered: unique(decisions.flatMap((decision) => decision.findings.filter((finding) => finding.should_report).flatMap((finding) => finding.rubric_ids))),
    ruleIdsPassed: passedRuleIds(rubric, decisions),
    rubric,
    contexts,
    decisions,
    evidenceRetrievalSummaries: contexts.flatMap((context) => context.evidence_retrieval_summary ? [context.evidence_retrieval_summary] : []),
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
    ...rawJsonActionabilityFindings(context),
    ...summaryInformationHierarchyFindings(context),
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
    llm_used: false,
    real_llm_used: false,
    llm_provider: context.llm_provider,
    llm_model: context.llm_model,
    llm_api_style: context.llm_api_style,
    llm_request_status: 'not_requested',
    vision_used: false,
    vision_not_used_reason: context.vision_not_used_reason,
    scenario_screenshot_used: context.scenario_screenshot_used,
    context_sufficiency: context.context_sufficiency,
    context_sufficiency_score: context.context_sufficiency_score,
    context_warnings: context.context_warnings,
    evidence_retrieval_summary: context.evidence_retrieval_summary,
    overall: {
      classification: reportable.length === 0 ? 'aligned' : major ? 'major_gap' : 'minor_gap',
      confidence: evidenceGatedConfidence(context, reportable, reportable.length === 0 ? 'medium' : 'high'),
      summary: reportable.length === 0
        ? `${context.current_screen_name} appears aligned with the expected user job.`
        : `${context.current_screen_name} has ${reportable.length} evidence-backed product experience gap(s).`
    },
    findings,
    non_issues: reportable.length === 0 ? [{ observation: 'No evidence-backed product experience gaps detected.', reason_not_reported: 'The page label, visible content, and expected workflow context were sufficiently aligned.' }] : []
  }
}

function contextForPageIntent(pageIntent: ProductExperiencePageIntent, input: Parameters<typeof buildProductExperienceContexts>[0]): ProductExperienceContext | undefined {
  const scenarioTrace = findScenarioTraceForPage(pageIntent, input.scenarioRuns)
  const scenarioMatch = matchingScenario(pageIntent, input.scenarioRuns)
  const state = findStateForPage(pageIntent, input.crawlGraph.states)
  const textBlocks = scenarioTrace?.domSummary ?? state?.primaryVisibleText ?? input.runtimeDomSnapshot?.visibleTextBlocks ?? []
  const domText = compactLines(textBlocks)
  const controls = scenarioTrace?.visibleControls ?? (state?.visible ?? input.runtimeDomSnapshot?.controls ?? [])
      .map((control) => controlLabel(control))
      .filter(Boolean)
      .slice(0, 40)
  const screenshotPath = scenarioTrace?.screenshotPath ?? state?.screenshotPath ?? input.runtimeDomSnapshot?.screenshotPath
  const evidencePacket = retrieveEvidence(`${pageIntent.screen_name} ${pageIntent.workflow_intent}`, {
    sourceGraph: input.sourceGraph,
    crawlGraph: input.crawlGraph,
    runtimeDomSnapshot: input.runtimeDomSnapshot,
    runtimeWorkflows: input.runtimeAppModel?.workflows,
    scenarioRuns: input.scenarioRuns,
    screenName: pageIntent.screen_name,
    workflowName: pageIntent.workflow_intent,
    entityHints: pageIntent.evidence_keywords,
    includeRuntime: true,
    includePriorRepairs: false,
    maxResults: 10
  })
  const retrievalSummary = evidencePacketSummary(evidencePacket)
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
    scenario_name: scenarioTrace?.scenarioName ?? scenarioMatch?.name,
    scenario_step: scenarioTrace?.stepName,
    user_goal: input.productGoal,
    expected_user_questions: pageIntent.expected_user_questions,
    expected_primary_content: pageIntent.expected_primary_content,
    expected_next_actions: pageIntent.expected_next_actions,
    required_context: pageIntent.required_context,
    screenshot_path: screenshotPath,
    screenshot_artifact_url: screenshotPath ? artifactUrlForReport(input.reportDir, screenshotPath, input.projectId) : undefined,
    scenario_screenshot_used: Boolean(scenarioTrace?.screenshotPath),
    dom_summary: domText,
    headings: scenarioTrace?.headings?.length ? scenarioTrace.headings : headingsFromText(pageIntent, domText, input.runtimeDomSnapshot),
    visible_controls: controls,
    visible_status_text: statusText(domText),
    visible_empty_states: domText.filter((line) => /no .*found|no .*yet|no issues|empty|not found|unavailable/i.test(line)),
    visible_errors: domText.filter((line) => /error|failed|warning|not found|unavailable/i.test(line)),
    active_nav_state: scenarioTrace?.activeNavState ?? pageIntent.nav_label,
    run_project_report_context_visible: visibleRunContext(domText),
    source_evidence: unique([
      ...sourceEvidenceForPage(pageIntent, input.sourceGraph),
      ...evidencePacket.sourceFacts.slice(0, 8).map((fact) => `${fact.kind}: ${fact.value}`)
    ]),
    runtime_evidence: unique([
      ...runtimeEvidenceForPage(pageIntent, state, input.runtimeDomSnapshot, scenarioTrace),
      ...evidencePacket.runtimeFacts.slice(0, 6).map((fact) => `${fact.kind}: ${fact.value.slice(0, 160)}`)
    ]),
    related_issues: [],
    related_fix_packets: [],
    rubric: [],
    context_sufficiency: 'low',
    context_sufficiency_score: 0,
    context_sufficiency_signals: [],
    context_warnings: [],
    vision_capable: false,
    vision_used: false,
    vision_not_used_reason: undefined,
    real_llm_expected: false,
    evidence_packet: evidencePacket,
    evidence_retrieval_summary: retrievalSummary
  }
}

function enrichProductExperienceContext(
  context: ProductExperienceContext,
  rubric: ProductExperienceRubricItem[],
  provider?: LlmProviderMetadata
): ProductExperienceContext {
  const visionCapable = Boolean(provider?.visionSupported)
  const visionUsed = visionCapable && Boolean(context.screenshot_path)
  const visionNotUsedReason = visionUsed
    ? undefined
    : context.screenshot_path
      ? 'provider wrapper does not support image input'
      : 'screenshot unavailable'
  const signals = contextSufficiencySignals(context)
  const total = signals.reduce((sum, signal) => sum + signal.weight, 0)
  const present = signals.reduce((sum, signal) => sum + (signal.present ? signal.weight : 0), 0)
  const score = total > 0 ? Number((present / total).toFixed(2)) : 0
  const sufficiency: ProductExperienceContextSufficiency = score >= 0.75 ? 'high' : score >= 0.45 ? 'medium' : 'low'
  const warnings = [
    sufficiency === 'low' ? 'context_sufficiency=low; LLM should judge available evidence and choose inconclusive if evidence is insufficient.' : undefined,
    !context.screenshot_path ? 'screenshot missing' : undefined,
    !context.dom_summary.length ? 'DOM summary missing' : undefined,
    !context.scenario_name ? 'scenario/workflow trace not directly matched' : undefined,
    !context.run_project_report_context_visible.length && /run timeline|scenarios|crawl path|workflow evidence|issues|fix packets|screenshots|graph explorer|raw json/i.test(context.current_screen_name)
      ? 'run/project/report context not visible in extracted DOM'
      : undefined,
    context.screenshot_path && !visionCapable ? 'vision not available; provider wrapper does not support image input; using screenshot path plus DOM visible text' : undefined,
    !context.scenario_screenshot_used ? 'scenario screenshot not used for this screen' : undefined
  ].filter(Boolean) as string[]
  return {
    ...context,
    rubric,
    context_sufficiency: sufficiency,
    context_sufficiency_score: score,
    context_sufficiency_signals: signals,
    context_warnings: warnings,
    vision_capable: visionCapable,
    vision_used: visionUsed,
    vision_not_used_reason: visionNotUsedReason,
    llm_provider: provider?.name,
    llm_model: provider?.model,
    llm_api_style: provider?.apiStyle,
    real_llm_expected: Boolean(provider?.realProvider)
  }
}

function contextSufficiencySignals(context: ProductExperienceContext): ProductExperienceContext['context_sufficiency_signals'] {
  const runContextRelevant = /run timeline|scenarios|crawl path|workflow evidence|issues|fix packets|screenshots|graph explorer|raw json/i.test(context.current_screen_name)
  return [
    { name: 'product_intent', present: Boolean(context.product_intent_summary || context.primary_user_jobs.length || context.user_goal), weight: 2 },
    { name: 'page_intent', present: Boolean(context.page_intent && context.workflow_intent), weight: 2 },
    { name: 'screenshot', present: Boolean(context.screenshot_path), weight: 2 },
    { name: 'dom_summary', present: context.dom_summary.length > 0 || context.visible_controls.length > 0, weight: 2 },
    { name: 'workflow_or_scenario_context', present: Boolean(context.scenario_name || context.runtime_evidence.length || context.source_evidence.length), weight: 1 },
    { name: 'active_nav_or_page_label', present: Boolean(context.nav_label_clicked || context.active_nav_state), weight: 1 },
    { name: 'report_run_project_context', present: !runContextRelevant || context.run_project_report_context_visible.length > 0, weight: 1 }
  ]
}

function genericPageIntents(input: Parameters<typeof buildProductExperienceContexts>[0]): ProductExperiencePageIntent[] {
  const labels = new Set<string>()
  for (const state of input.crawlGraph.states) {
    const label = screenNameFromState(state)
    if (label) labels.add(label)
  }
  const intents: ProductExperiencePageIntent[] = []
  if (input.runtimeAppModel?.workflows.some((workflow) => /browse\/reopen previous plan runs/i.test(workflow.name))) {
    intents.push(intent(
      'Plan Runs',
      'Plan Runs',
      'Help users browse previous plan runs by prompt, time, target, semantic status, and result status.',
      'Browse previous plan runs and reopen a prior plan bundle.',
      ['Which prompt produced this run?', 'Which target did it run against?', 'When was it generated?', 'What status is it in?', 'How do I reopen it?'],
      ['plan run list', 'prompt/title', 'target', 'created timestamp', 'status', 'semantic chip', 'reopen action'],
      ['Reopen a prior plan run', 'Inspect the reopened plan bundle'],
      ['selected workspace/project context', 'run metadata', 'unambiguous reopen actions'],
      ['plan run', 'plan-run-item', 'reopen', 'created', 'status', 'semantic']
    ))
  }
  intents.push(...[...labels].slice(0, 8).map((label) =>
    intent(label, label, `Support the user job implied by ${label}.`, `Inspect ${label}.`, [`What is ${label}?`, 'What should I inspect next?'], ['clear heading', 'relevant primary content'], ['inspect evidence'], ['current context'], [label.toLowerCase()])
  ))
  return dedupePageIntents(intents)
}

function dedupePageIntents(intents: ProductExperiencePageIntent[]): ProductExperiencePageIntent[] {
  const seen = new Set<string>()
  return intents.filter((item) => {
    const key = item.screen_name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function findStateForPage(pageIntent: ProductExperiencePageIntent, states: CrawlState[]): CrawlState | undefined {
  const expectedHash = hashForScreen(pageIntent.screen_name)
  return states.find((state) => routeOf(state) === expectedHash)
    ?? states.find((state) => textOfState(state).includes(pageIntent.nav_label.toLowerCase()))
    ?? (pageIntent.screen_name === 'Summary' ? states[0] : undefined)
}

function navigationPromiseFindings(context: ProductExperienceContext): ProductExperienceFinding[] {
  const text = visibleText(context)
  const nav = normalize(context.nav_label_clicked)
  const keywordMatch = context.expected_primary_content.some((item) => text.includes(normalize(item))) || context.source_evidence.some((item) => text.includes(normalize(item)))
  if (text.includes(nav) || keywordMatch) return []
  return [finding(context, {
    title: `${context.nav_label_clicked} does not clearly match the visible page content`,
    type: 'navigation_promise_gap',
    severity: 'medium',
    rubric_ids: ['navigation_label_content_alignment'],
    expected: `The page should visibly deliver: ${context.page_intent}`,
    observed: `The visible DOM did not clearly mention "${context.nav_label_clicked}" or equivalent content.`,
    evidence: evidence(context, [`nav_label: ${context.nav_label_clicked}`, `visible_headings: ${context.headings.join(', ') || 'none'}`]),
    why_it_matters: 'Users rely on navigation labels to predict what they will inspect next.',
    suggested_fix: `Make the ${context.nav_label_clicked} page heading or summary explicitly match the navigation promise.`
  })]
}

function runContextFindings(context: ProductExperienceContext): ProductExperienceFinding[] {
  if (!/run timeline|scenarios|crawl path|workflow evidence|issues|fix packets|screenshots|graph explorer|raw json/i.test(context.current_screen_name)) return []
  const text = visibleText(context)
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
    rubric_ids: ['run_report_context_clarity'],
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
  const text = [
    ...context.dom_summary,
    ...context.headings,
    ...context.visible_controls
  ].join(' ')
  const hasContext = /scenario\s*:|step\s*:|action\s*:|url\s*:|crawl state|state\s+\d|evidence for|related issue|screen\s*:/i.test(text)
  if (hasContext) return []
  return [finding(context, {
    title: 'Screenshots view does not explain screenshot context',
    type: 'evidence_gap',
    severity: 'medium',
    rubric_ids: ['screenshot_gallery_context'],
    expected: 'Screenshots should show scenario/state/action context near each image.',
    observed: 'Visible screenshot content appears image/file oriented without scenario or state context.',
    evidence: evidence(context, [`dom_excerpt: ${context.dom_summary.join(' ').slice(0, 240)}`]),
    why_it_matters: 'Screenshots are only useful QA evidence when the user knows what action or state produced them.',
    suggested_fix: 'Show state/scenario/action metadata on screenshot thumbnails and in the modal.'
  })]
}

function rawJsonActionabilityFindings(context: ProductExperienceContext): ProductExperienceFinding[] {
  if (!isRawJsonDebugPayloadScreen(context)) return []
  if (!rawJsonPayloadVisible(context) || rawJsonCopyExportActionVisible(context)) return []
  return [finding(context, {
    title: 'Raw JSON lacks copy action',
    type: 'actionability_gap',
    severity: 'medium',
    rubric_ids: ['raw_json_copy_export_action'],
    expected: 'Raw JSON/debug payload screens should expose a visible copy/export action.',
    observed: 'Raw JSON payload is visible but no Copy JSON/export/download control was found.',
    evidence: evidence(context, [
      `dom_excerpt: ${context.dom_summary.join(' ').slice(0, 240)}`,
      `visible_controls_checked: ${context.visible_controls.join(', ') || 'none'}`,
      'missing_control: Copy JSON / Copy raw payload / Copy report JSON / Download JSON / Export JSON'
    ]),
    why_it_matters: 'Copying or exporting exact raw data is a core user job for debug/report payload screens, not a cosmetic convenience.',
    suggested_fix: 'Add a visible, accessible Copy JSON, Copy raw payload, Copy report JSON, Download JSON, or Export JSON control near the payload.'
  })]
}

function isRawJsonDebugPayloadScreen(context: ProductExperienceContext): boolean {
  const intentText = [
    context.current_screen_name,
    context.nav_label_clicked,
    context.page_intent,
    context.workflow_intent,
    ...context.expected_primary_content,
    ...context.expected_next_actions
  ].join(' ')
  return /raw json|raw report payload|debug payload|debug_payload|exact report data|json inspection|report payload|json payload/i.test(intentText)
}

function rawJsonPayloadVisible(context: ProductExperienceContext): boolean {
  const domText = [
    ...context.dom_summary,
    ...context.visible_status_text
  ].join(' ')
  return /raw report payload|debug payload|json payload|report payload|latest report payload|\{\s*["{]|"[^"]+"\s*:/i.test(domText)
}

function rawJsonCopyExportActionVisible(context: ProductExperienceContext): boolean {
  const controlText = [
    ...context.visible_controls,
    ...context.dom_summary
  ].join(' ')
  return /copy\s+(json|raw payload|report json|raw json)|download\s+(json|report json|raw json)|export\s+(json|report json|raw json)/i.test(controlText)
}

function summaryInformationHierarchyFindings(context: ProductExperienceContext): ProductExperienceFinding[] {
  if (context.current_screen_name !== 'Summary') return []
  const text = [
    ...context.dom_summary,
    ...context.headings,
    ...context.visible_controls
  ].join(' ')
  const rawJsonSignals = (text.match(/"[^"]+"\s*:|\{|\}|\[|\]/g) ?? []).length
  const hasHumanSummary = /overall status|latest run|selected run|scenario (pass|fail|count)|scenarios (passed|failed|executed)|issues (found|open|count)|fix packets (generated|available|count)|screenshots captured|summary card|run audit/i.test(text)
  if (rawJsonSignals < 8 || hasHumanSummary) return []
  return [finding(context, {
    title: 'Summary relies on raw JSON instead of human-readable report summary',
    type: 'information_hierarchy_gap',
    severity: 'medium',
    rubric_ids: ['raw_json_not_primary_summary'],
    expected: 'Summary should lead with human-readable run status, issue counts, scenario status, screenshots, and next actions, with raw JSON kept as an advanced view.',
    observed: 'The Summary screen is dominated by raw JSON-shaped content without an obvious human-readable summary.',
    evidence: evidence(context, [`raw_json_signal_count: ${rawJsonSignals}`, `dom_excerpt: ${context.dom_summary.join(' ').slice(0, 240)}`]),
    why_it_matters: 'The first report screen should help users decide what to inspect next; raw JSON forces users to parse internal data before understanding the run.',
    suggested_fix: 'Replace the primary Summary content with compact status cards and top repair groups, and link to Raw JSON for advanced debugging.'
  })]
}

function graphContextFindings(context: ProductExperienceContext): ProductExperienceFinding[] {
  if (context.current_screen_name !== 'Graph Explorer') return []
  const text = visibleText(context)
  const hasMode = /graph mode|crawl|scenario|workflow|issue|source/i.test(text)
  const hasLegendOrDetail = /legend|node detail|selected node|filters/i.test(text)
  if (hasMode && hasLegendOrDetail) return []
  return [finding(context, {
    title: 'Graph Explorer does not provide enough graph-reading context',
    type: 'information_hierarchy_gap',
    severity: 'medium',
    rubric_ids: ['graph_legend_filter_detail'],
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
  const text = normalize(empty)
  const hasWhy = /because|run an audit|no raw findings|no .*recorded|no .*detected|after an audit|after running|checked|verified|load a report/i.test(text)
  const hasNext = /run audit|open|generate fix|generate packet|select|inspect|copy|verify|start/i.test(text)
  if (hasWhy && hasNext) return []
  return [finding(context, {
    title: `${context.current_screen_name} empty state lacks explanation or next action`,
    type: 'empty_state_gap',
    severity: context.current_screen_name === 'Issues' ? 'medium' : 'low',
    rubric_ids: ['issue_empty_state_honesty'],
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
      `reviewed_screen: ${finding.reviewed_screen ?? decision.screen_name}`,
      `screenshot_used: ${finding.screenshot_used ?? finding.screenshotPath ?? 'none'}`,
      finding.scenario_step ? `scenario_step: ${finding.scenario_step}` : undefined,
      `page_intent: ${finding.page_intent ?? decision.nav_label}`,
      `workflow_intent: ${finding.workflow_intent ?? decision.workflow_intent}`,
      `evidence_scope: ${finding.evidence_scope ?? 'unknown'}`,
      `contradiction_check_result: ${finding.contradiction_check_result ?? 'unknown'}`,
      finding.dom_excerpt ? `dom_excerpt: ${finding.dom_excerpt}` : undefined,
      ...(finding.positive_evidence_checked ?? []).map((item) => `positive_evidence_checked: ${item}`),
      ...(finding.negative_evidence_checked ?? []).map((item) => `negative_evidence_checked: ${item}`),
      `finding_type: ${finding.type}`,
      `rubric_id: ${finding.rubric_ids.join(',')}`,
      ...finding.evidence
    ].filter(Boolean) as string[],
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
  const findings = mergeMandatoryDeterministicFindings(
    (decision.findings ?? []).map((finding) => normalizeFinding(finding, context)),
    deterministic,
    context
  )
  const overall = normalizeOverall(decision, deterministic, context, findings)
  const nonIssues = [
    ...(decision.non_issues ?? []),
    ...suppressedFindingNotes(findings)
  ]
  return {
    screen_name: decision.screen_name || context.current_screen_name,
    nav_label: decision.nav_label || context.nav_label_clicked,
    workflow_intent: decision.workflow_intent || context.workflow_intent,
    llm_used: true,
    real_llm_used: context.real_llm_expected,
    llm_provider: decision.llm_provider ?? context.llm_provider,
    llm_model: decision.llm_model ?? context.llm_model,
    llm_api_style: decision.llm_api_style ?? context.llm_api_style,
    llm_request_status: 'success',
    vision_used: context.vision_used,
    vision_not_used_reason: context.vision_not_used_reason,
    scenario_screenshot_used: context.scenario_screenshot_used,
    context_sufficiency: decision.context_sufficiency ?? context.context_sufficiency,
    context_sufficiency_score: decision.context_sufficiency_score ?? context.context_sufficiency_score,
    context_warnings: decision.context_warnings ?? context.context_warnings,
    evidence_retrieval_summary: context.evidence_retrieval_summary,
    overall,
    findings,
    non_issues: nonIssues
  }
}

function mergeMandatoryDeterministicFindings(
  llmFindings: ProductExperienceFinding[],
  deterministic: ProductExperienceDecision,
  context: ProductExperienceContext
): ProductExperienceFinding[] {
  const merged = [...llmFindings]
  for (const candidate of deterministic.findings.filter((finding) => isMandatoryDeterministicFinding(finding, context))) {
    if (merged.some((finding) => sameProductExperienceFinding(finding, candidate))) continue
    const normalized = normalizeFinding({
      ...candidate,
      evidence: [
        ...candidate.evidence,
        'deterministic_candidate_preserved: LLM did not return this evidence-backed core debug-payload actionability finding.'
      ]
    }, context)
    if (normalized.should_report) merged.push(normalized)
  }
  return merged
}

function isMandatoryDeterministicFinding(finding: ProductExperienceFinding, context: ProductExperienceContext): boolean {
  return finding.type === 'actionability_gap' &&
    finding.title === 'Raw JSON lacks copy action' &&
    isRawJsonDebugPayloadScreen(context) &&
    rawJsonPayloadVisible(context) &&
    !rawJsonCopyExportActionVisible(context)
}

function sameProductExperienceFinding(left: ProductExperienceFinding, right: ProductExperienceFinding): boolean {
  return left.type === right.type && normalize(left.title) === normalize(right.title)
}

function normalizeOverall(
  decision: ProductExperienceDecision,
  deterministic: ProductExperienceDecision,
  context: ProductExperienceContext,
  findings: ProductExperienceFinding[]
): ProductExperienceDecision['overall'] {
  const overall = decision.overall ?? deterministic.overall
  const reportable = findings.filter((finding) => finding.should_report)
  if (reportable.length > 0) {
    if (overall.classification !== 'aligned' && overall.classification !== 'inconclusive') return overall
    const major = reportable.some((finding) => finding.severity === 'high' || finding.severity === 'critical')
    return {
      classification: major ? 'major_gap' : 'minor_gap',
      confidence: evidenceGatedConfidence(context, reportable, 'high'),
      summary: `${context.current_screen_name} has ${reportable.length} evidence-backed product experience gap(s) after deterministic candidate preservation and evidence gating.`
    }
  }
  if (overall.classification === 'aligned' || overall.classification === 'inconclusive') return overall

  const suppressed = findings.filter((finding) => finding.suppression_reason)
  const suffix = suppressed.length > 0
    ? ` Suppressed ${suppressed.length} candidate finding(s) because screen-scoped evidence contradicted the claim or placed it outside ${context.current_screen_name}.`
    : ' No evidence-backed product experience gaps remained after evidence gating.'
  return {
    classification: 'aligned',
    confidence: evidenceGatedConfidence(context, [], overall.confidence),
    summary: `${context.current_screen_name} is aligned after screen-scoped evidence checks.${suffix}`
  }
}

function evidenceGatedConfidence(
  context: ProductExperienceContext,
  findings: ProductExperienceFinding[],
  proposed: ProductExperienceDecision['overall']['confidence']
): ProductExperienceDecision['overall']['confidence'] {
  if (proposed !== 'high') return proposed
  const hasPageIntent = Boolean(context.page_intent)
  const hasWorkflowIntent = Boolean(context.workflow_intent)
  const hasScreenEvidence = Boolean(context.screenshot_path || context.dom_summary.length || context.visible_controls.length)
  const matchedRubric = findings.length === 0
    ? Boolean(context.rubric.length)
    : findings.some((finding) => finding.rubric_ids.length > 0)
  const hasContradiction = findings.some((finding) => finding.suppression_reason || finding.contradiction_check_result?.startsWith('contradicted'))
  return hasPageIntent && hasWorkflowIntent && hasScreenEvidence && matchedRubric && !hasContradiction ? 'high' : 'medium'
}

function suppressedFindingNotes(findings: ProductExperienceFinding[]): ProductExperienceDecision['non_issues'] {
  return findings
    .filter((finding) => finding.suppression_reason)
    .map((finding) => ({
      observation: `${finding.title} was not reported.`,
      reason_not_reported: `candidate suppressed due to contradictory runtime evidence: ${finding.suppression_reason}`
    }))
}

function normalizeFinding(finding: ProductExperienceFinding, context: ProductExperienceContext): ProductExperienceFinding {
  const positive = positiveEvidenceForFinding(finding, context)
  const negative = negativeEvidenceForFinding(finding, context)
  const suppressionReason = suppressionReasonForFinding(finding, context, positive)
  const shouldReport = Boolean(finding.should_report) &&
    hasEvidenceSupport(finding, context) &&
    !isAestheticOnly(finding) &&
    !suppressionReason
  return {
    ...finding,
    evidence: [
      ...(finding.evidence ?? []),
      suppressionReason ? `candidate suppressed due to contradictory runtime evidence: ${suppressionReason}` : undefined
    ].filter(Boolean) as string[],
    rubric_ids: finding.rubric_ids ?? [],
    screenshotPath: finding.screenshotPath ?? context.screenshot_path,
    reviewed_screen: context.current_screen_name,
    screenshot_used: finding.screenshotPath ?? context.screenshot_path,
    scenario_step: context.scenario_step,
    page_intent: context.page_intent,
    workflow_intent: context.workflow_intent,
    dom_excerpt: context.dom_summary.join(' ').slice(0, 360),
    positive_evidence_checked: positive,
    negative_evidence_checked: negative,
    evidence_scope: evidenceScopeForFinding(finding, context),
    suppression_reason: suppressionReason,
    contradiction_check_result: suppressionReason ? `contradicted: ${suppressionReason}` : 'no_contradiction',
    should_report: shouldReport
  }
}

function suppressionReasonForFinding(finding: ProductExperienceFinding, context: ProductExperienceContext, positiveEvidence: string[]): string | undefined {
  if (isCrossScreenRawJsonCopyClaim(finding, context)) return `finding reviewed ${context.current_screen_name} but claims Raw JSON copy control is missing`
  if (isLoadedReportContextEcho(finding, context)) return 'loaded report issue titles are report data, not current dashboard chrome evidence'
  if (isUnsupportedReportContextProminenceClaim(finding, context)) return 'visual report-context prominence claim requires vision or concrete DOM evidence'
  if (isRawJsonPayloadEcho(finding, context)) return 'embedded Raw JSON payload findings are report data, not current Raw JSON page behavior'
  if (isRawJsonCopyActionContradicted(finding, context)) return 'Copy JSON is visible in same-screen runtime evidence'
  const contradictingControlEvidence = positiveEvidence.filter((item) => /same_screen_control|retrieved_.*copy|download json|export json/i.test(item))
  if (contradictingControlEvidence.length > 0 && missingControlClaim(finding)) return contradictingControlEvidence.join('; ')
  return undefined
}

function positiveEvidenceForFinding(finding: ProductExperienceFinding, context: ProductExperienceContext): string[] {
  const text = visibleText(context)
  const evidence = [
    rawJsonCopyExportActionVisible(context) ? 'same_screen_control: Raw JSON copy/export/download action present' : undefined,
    /raw json/.test(text) && /latest report payload|report payload/.test(text) ? 'same_screen_surface: Raw JSON payload visible' : undefined,
    /copy prompt|copy fix prompt|copy repair prompt/.test(text) ? 'same_screen_control: fix prompt copy present' : undefined,
    /copy/.test(text) && /fix packet|prompt|repair/.test(text) ? 'same_screen_control: fix-packet copy affordance present' : undefined
  ].filter(Boolean) as string[]
  const retrievedEvidence = (context.evidence_packet?.retrievedDocuments ?? [])
    .filter((doc) => /copy json|copy raw json|copy prompt|copy fix prompt/i.test(doc.text))
    .map((doc) => `retrieved_${doc.kind}: ${doc.text.slice(0, 160)}`)
  if (!missingControlClaim(finding)) return evidence.slice(0, 4)
  const findingText = findingTextFor(finding)
  if (/raw json/.test(findingText)) return [...evidence, ...retrievedEvidence].filter((item) => /Raw JSON|Copy JSON/i.test(item))
  if (/copy/.test(findingText)) return [...evidence, ...retrievedEvidence].filter((item) => /copy/i.test(item))
  return evidence.slice(0, 4)
}

function negativeEvidenceForFinding(finding: ProductExperienceFinding, context: ProductExperienceContext): string[] {
  const text = findingTextFor(finding)
  if (!missingControlClaim(finding)) return []
  return [
    /raw json/.test(text) ? 'checked_same_screen_for: Raw JSON payload/copy controls' : undefined,
    /copy/.test(text) ? 'checked_same_screen_for: copy controls' : undefined,
    `reviewed_screen: ${context.current_screen_name}`
  ].filter(Boolean) as string[]
}

function evidenceScopeForFinding(finding: ProductExperienceFinding, context: ProductExperienceContext): ProductExperienceFinding['evidence_scope'] {
  const text = findingTextFor(finding)
  if (/raw json/.test(text) && context.current_screen_name !== 'Raw JSON') return 'cross_screen'
  if (/fix packets?/.test(text) && context.current_screen_name !== 'Fix Packets') return 'cross_screen'
  if (/issues/.test(text) && context.current_screen_name !== 'Issues') return 'cross_screen'
  if (context.current_screen_name) return 'same_screen'
  return 'unknown'
}

function isLoadedReportContextEcho(finding: ProductExperienceFinding, context: ProductExperienceContext): boolean {
  if (!['context_gap', 'product_intent_mismatch'].includes(finding.type)) return false
  const text = `${finding.title} ${finding.expected} ${finding.observed} ${finding.evidence.join(' ')}`.toLowerCase()
  if (!/run|report|timestamp|project|summary section|issues screen|identity|context/.test(text)) return false
  if (!hasVisibleRunReportContext(context)) return false
  return /summary|issues|fix packets|screenshots|graph explorer|run timeline|scenarios|crawl path|workflow evidence/i.test(context.current_screen_name)
}

function isUnsupportedReportContextProminenceClaim(finding: ProductExperienceFinding, context: ProductExperienceContext): boolean {
  if (!['context_gap', 'product_intent_mismatch'].includes(finding.type)) return false
  if (context.vision_used) return false
  if (!hasVisibleRunReportContext(context)) return false
  const text = `${finding.title} ${finding.expected} ${finding.observed} ${finding.evidence.join(' ')}`.toLowerCase()
  const concernsReportContext = /run|report|timestamp|project|identity|context/.test(text)
  const reliesOnVisualJudgment = /visual|hierarchy|blend|spacing|prominen|separation|screenshot evidence/.test(text)
  return concernsReportContext && reliesOnVisualJudgment
}

function isRawJsonPayloadEcho(finding: ProductExperienceFinding, context: ProductExperienceContext): boolean {
  if (context.current_screen_name !== 'Raw JSON') return false
  const screenText = visibleText(context)
  const rawJsonViewVisible = /raw json/.test(screenText) && /latest report payload|copy json|report payload/.test(screenText)
  if (!rawJsonViewVisible) return false
  const findingText = `${finding.title} ${finding.expected} ${finding.observed} ${finding.evidence.join(' ')}`.toLowerCase()
  return /missing runtime|missing ui|missing_ui_surface|inspect raw json|raw json payload panel|runtime workflow missing|source workflow expects|runtimesurfacematches|deferredfindings|rawfindings/.test(findingText)
}

function isRawJsonCopyActionContradicted(finding: ProductExperienceFinding, context: ProductExperienceContext): boolean {
  if (context.current_screen_name !== 'Raw JSON') return false
  if (!rawJsonCopyExportActionVisible(context)) return false
  const findingText = findingTextFor(finding)
  return /copy/.test(findingText) && /missing|no .*found|lacks|not visible|not clearly visible/.test(findingText)
}

function isCrossScreenRawJsonCopyClaim(finding: ProductExperienceFinding, context: ProductExperienceContext): boolean {
  if (context.current_screen_name === 'Raw JSON') return false
  const text = findingTextFor(finding)
  if (!/raw json/.test(text) || !/copy/.test(text) || !missingControlClaim(finding)) return false
  return !hasEmbeddedRawJsonPanel(context)
}

function hasEmbeddedRawJsonPanel(context: ProductExperienceContext): boolean {
  const text = visibleText(context)
  return /raw json/.test(text) && /copy json|copy raw json|download json|export json|latest report payload|report payload|\{\s*"/.test(text)
}

function missingControlClaim(finding: ProductExperienceFinding): boolean {
  return /missing|no .*found|lacks|not visible|not accessible|not discoverable|absence/.test(findingTextFor(finding))
}

function findingTextFor(finding: ProductExperienceFinding): string {
  return `${finding.title} ${finding.type} ${finding.expected} ${finding.observed} ${finding.evidence.join(' ')}`.toLowerCase()
}

function hasVisibleRunReportContext(context: ProductExperienceContext): boolean {
  const signals = new Set(context.run_project_report_context_visible)
  const hasProject = signals.has('project/ad hoc context')
  const hasIdentity = signals.has('run/report identity')
  const hasTimestampOrStatus = signals.has('timestamp') || signals.has('status')
  return hasProject && hasIdentity && hasTimestampOrStatus
}

function llmFailedDecision(context: ProductExperienceContext, error: unknown): ProductExperienceDecision {
  const reason = error instanceof Error ? error.message : 'Unknown LLM product critic error'
  const actionableReason = `${reason}. Set SNIFFER_LLM_API_KEY or run sniffer providers check --provider openai-compatible.`
  return {
    screen_name: context.current_screen_name,
    nav_label: context.nav_label_clicked,
    workflow_intent: context.workflow_intent,
    llm_used: false,
    real_llm_used: false,
    llm_provider: context.llm_provider,
    llm_model: context.llm_model,
    llm_api_style: context.llm_api_style,
    llm_request_status: 'provider_error',
    vision_used: false,
    vision_not_used_reason: context.vision_not_used_reason,
    scenario_screenshot_used: context.scenario_screenshot_used,
    context_sufficiency: context.context_sufficiency,
    context_sufficiency_score: context.context_sufficiency_score,
    context_warnings: context.context_warnings,
    critic_not_run_reason: `LLM product experience critic failed: ${actionableReason}`,
    overall: {
      classification: 'inconclusive',
      confidence: 'low',
      summary: 'Product Experience Critic could not complete because the LLM call failed.'
    },
    findings: [],
    non_issues: [{ observation: 'LLM product critic failed before judgment.', reason_not_reported: actionableReason }]
  }
}

function llmPreflightFailedDecision(context: ProductExperienceContext, reason: string): ProductExperienceDecision {
  return {
    screen_name: context.current_screen_name,
    nav_label: context.nav_label_clicked,
    workflow_intent: context.workflow_intent,
    llm_used: false,
    real_llm_used: false,
    llm_provider: context.llm_provider,
    llm_model: context.llm_model,
    llm_api_style: context.llm_api_style,
    llm_request_status: 'provider_error',
    vision_used: false,
    vision_not_used_reason: context.vision_not_used_reason,
    scenario_screenshot_used: context.scenario_screenshot_used,
    context_sufficiency: context.context_sufficiency,
    context_sufficiency_score: context.context_sufficiency_score,
    context_warnings: context.context_warnings,
    critic_not_run_reason: reason,
    overall: {
      classification: 'inconclusive',
      confidence: 'low',
      summary: 'Product Experience Critic could not run because the LLM provider preflight failed.'
    },
    findings: [],
    non_issues: [{ observation: 'LLM product critic preflight failed before screen judgment.', reason_not_reported: reason }]
  }
}

function reportableProductExperienceFindings(decisions: ProductExperienceDecision[], contexts: ProductExperienceContext[]): Array<{ finding: ProductExperienceFinding; decision: ProductExperienceDecision }> {
  const contextByScreen = new Map(contexts.map((context) => [context.current_screen_name, context]))
  const candidates = decisions.flatMap((decision) =>
    decision.findings
      .filter((finding) => finding.should_report)
      .filter((finding) => !isAestheticOnly(finding))
      .filter((finding) => hasEvidenceSupport(finding, contextByScreen.get(decision.screen_name)))
      .map((finding) => ({ finding, decision }))
  )
  const lowCounts = new Map<string, number>()
  for (const candidate of candidates.filter(({ finding }) => finding.severity === 'low')) {
    const key = lowSeverityKey(candidate.finding)
    lowCounts.set(key, (lowCounts.get(key) ?? 0) + 1)
  }
  return candidates.filter(({ finding }) => {
    if (finding.severity !== 'low') return true
    return (lowCounts.get(lowSeverityKey(finding)) ?? 0) > 1
  })
}

function hasEvidenceSupport(finding: ProductExperienceFinding, context?: ProductExperienceContext): boolean {
  if (!context) return finding.evidence.length > 0
  const evidenceText = finding.evidence.join(' ').toLowerCase()
  const contextText = allText(context)
  return finding.evidence.length > 0 && (
    finding.evidence.some((item) => /screen:|nav_label:|dom|screenshot|workflow|rubric|missing|visible|heading/i.test(item)) ||
    importantTokens(evidenceText).some((token) => contextText.includes(token))
  )
}

function isAestheticOnly(finding: ProductExperienceFinding): boolean {
  const text = `${finding.title} ${finding.expected} ${finding.observed} ${finding.evidence.join(' ')} ${finding.why_it_matters} ${finding.suggested_fix}`.toLowerCase()
  return /prettier|aesthetic|style preference|looks nicer|visual opinion/.test(text) &&
    !/workflow|intent|context|evidence|navigation|action|empty|run|scenario|screenshot|graph|raw json/.test(text)
}

function lowSeverityKey(finding: ProductExperienceFinding): string {
  return `${finding.type}:${finding.rubric_ids[0] ?? 'none'}`
}

function emptyResult(mode: ProductExperienceCriticMode, rubric: ProductExperienceRubricItem[], reason?: string, status: ProductExperienceResult['status'] = 'not_run', rubricVersion?: string): ProductExperienceResult {
  return {
    mode,
    status,
    notRunReason: reason,
    screensReviewed: 0,
    llmScreensReviewed: 0,
    realLlmScreensReviewed: 0,
    visionScreensReviewed: 0,
    aligned: 0,
    minorGaps: 0,
    majorGaps: 0,
    inconclusive: 0,
    rubricVersion,
    ruleIdsEvaluated: rubric.map((rule) => rule.id),
    ruleIdsTriggered: [],
    ruleIdsPassed: [],
    rubric,
    contexts: [],
    decisions: [],
    issues: []
  }
}

function passedRuleIds(rubric: ProductExperienceRubricItem[], decisions: ProductExperienceDecision[]): string[] {
  const triggered = new Set(decisions.flatMap((decision) =>
    decision.findings.filter((finding) => finding.should_report).flatMap((finding) => finding.rubric_ids)
  ))
  return rubric.map((rule) => rule.id).filter((ruleId) => !triggered.has(ruleId))
}

function providerMetadataOf(provider?: Pick<LlmProvider, 'metadata' | 'name' | 'supportsVision'>): LlmProviderMetadata | undefined {
  const metadata = provider?.metadata?.()
  if (metadata) return metadata
  if (!provider) return undefined
  return {
    name: provider.name ?? 'unknown',
    realProvider: provider.name !== 'mock',
    visionSupported: Boolean(provider.supportsVision?.())
  }
}

function productExperienceStatus(mode: ProductExperienceCriticMode, provider: LlmProviderMetadata | undefined, decisions: ProductExperienceDecision[]): ProductExperienceResult['status'] {
  if (decisions.some((decision) => decision.critic_not_run_reason || decision.llm_request_status === 'provider_error')) return 'provider_error'
  if (mode === 'llm' && provider && !provider.realProvider) return 'not_real_llm'
  return 'completed'
}

function matchingScenario(pageIntent: ProductExperiencePageIntent, runs: ScenarioRun[]): ScenarioRun | undefined {
  const label = pageIntent.nav_label.toLowerCase()
  return runs.find((run) => run.name.toLowerCase().includes(label) || run.assertions.some((assertion) => assertion.label.toLowerCase().includes(label)))
}

function findScenarioTraceForPage(pageIntent: ProductExperiencePageIntent, runs: ScenarioRun[]): ScenarioStepTrace | undefined {
  const expectedHash = hashForScreen(pageIntent.screen_name)
  const label = normalize(pageIntent.nav_label)
  const traces = runs.flatMap((run) => run.stepTraces ?? [])
  return traces.find((trace) => routeKey(trace.url) === expectedHash)
    ?? traces.find((trace) => normalize(`${trace.screenName ?? ''} ${trace.navLabel ?? ''} ${trace.stepName} ${trace.actionLabel ?? ''}`).includes(label))
    ?? traces.find((trace) => normalize(trace.domSummary.join(' ')).includes(label))
}

function routeOf(state: CrawlState): string {
  try {
    const url = new URL(state.url)
    return url.hash || state.hashRoute || '/'
  } catch {
    return state.hashRoute ?? '/'
  }
}

function routeKey(value: string): string {
  try {
    const url = new URL(value)
    return url.hash || url.pathname || '/'
  } catch {
    return value.startsWith('#') ? value : '/'
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

function runtimeEvidenceForPage(pageIntent: ProductExperiencePageIntent, state?: CrawlState, snapshot?: RuntimeDomSnapshot, trace?: ScenarioStepTrace): string[] {
  return [
    trace ? `scenario:${trace.scenarioName}` : undefined,
    trace ? `scenario_step:${trace.stepName}` : undefined,
    trace?.screenshotPath ? `scenario_screenshot:${trace.screenshotPath}` : undefined,
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

function visibleText(context: ProductExperienceContext): string {
  return normalize([
    context.current_screen_name,
    context.nav_label_clicked,
    ...context.dom_summary,
    ...context.headings,
    ...context.visible_controls,
    ...context.visible_status_text,
    ...context.visible_empty_states,
    ...context.visible_errors,
    ...context.run_project_report_context_visible
  ].join(' '))
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function importantTokens(value: string): string[] {
  return value.split(/[^a-z0-9]+/i).filter((token) => token.length >= 5)
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))]
}
