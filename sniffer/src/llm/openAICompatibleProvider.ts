import type { AppIntent } from '../types.js'
import type { GraphRefinementResult, GraphStructureCriticContext, Issue, IssueTriageContext, ProductExperienceContext, ProductExperienceDecision, ProductIntentContext, ProductIntentModel, PromptConsistencyContext, PromptConsistencyDecision, RuntimeIntentContext, RuntimeLlmIntent, SnifferCriticContext, UxCriticContext, UxCriticFinding, WorkflowCriticDecision } from '../types.js'
import type { LlmProvider, LlmProviderCheckResult, LlmProviderEnvDiagnostics } from './provider.js'

type ApiStyle = 'responses' | 'chat_completions' | 'auto'
type FetchLike = typeof fetch

interface OpenAICompatibleConfig {
  baseUrl: string
  apiKey: string
  model: string
  apiStyle: ApiStyle
  sources: {
    baseUrl?: string
    apiKey?: string
    model?: string
    apiStyle?: string
  }
  env: LlmProviderEnvDiagnostics
}

export class LlmProviderError extends Error {
  statusCode?: number
  responseBody?: string

  constructor(message: string, options: { statusCode?: number; responseBody?: string } = {}) {
    super(message)
    this.name = 'LlmProviderError'
    this.statusCode = options.statusCode
    this.responseBody = options.responseBody
  }
}

export class OpenAICompatibleProvider implements LlmProvider {
  name = 'openai-compatible'
  private baseUrl: string
  private apiKey: string
  private model: string
  private apiStyle: ApiStyle
  private config: OpenAICompatibleConfig
  private fetchImpl: FetchLike

  constructor(env = process.env, fetchImpl: FetchLike = fetch) {
    this.config = resolveOpenAICompatibleConfig(env)
    this.baseUrl = this.config.baseUrl
    this.apiKey = this.config.apiKey
    this.model = this.config.model
    this.apiStyle = this.config.apiStyle
    this.fetchImpl = fetchImpl
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.model)
  }

  supportsVision(): boolean {
    return false
  }

  metadata() {
    return {
      name: this.name,
      model: this.model || undefined,
      apiStyle: this.apiStyle,
      baseUrlHost: baseUrlHost(this.baseUrl),
      realProvider: true,
      visionSupported: this.supportsVision()
    }
  }

  async checkConnection(): Promise<LlmProviderCheckResult> {
    const base = this.providerCheckBase()
    if (!this.apiKey || !this.model || !this.baseUrl) {
      return {
        ...base,
        request: {
          attempted: false,
          success: false,
          errorSummary: missingConfigMessage(this.config)
        }
      }
    }

    try {
      const text = await this.complete('Return JSON only: {"ok": true}')
      parseJsonFromText<{ ok: boolean }>(text)
      return {
        ...base,
        request: {
          attempted: true,
          success: true,
          responseTextExtracted: Boolean(text.trim())
        }
      }
    } catch (error) {
      return {
        ...base,
        request: {
          attempted: true,
          success: false,
          statusCode: error instanceof LlmProviderError ? error.statusCode : undefined,
          errorSummary: safeProviderErrorSummary(error),
          responseTextExtracted: false
        }
      }
    }
  }

  async inferIntent(input: Parameters<LlmProvider['inferIntent']>[0]): Promise<AppIntent> {
    if (!this.isConfigured()) return input.deterministicIntent

    const prompt = [
      'Infer likely UI workflows from this deterministic source graph.',
      'Return concise JSON with summary and likelyWorkflows.',
      JSON.stringify(input.sourceGraph)
    ].join('\n\n')

    const text = await this.complete(prompt)
    try {
      const parsed = parseJsonFromText<Partial<AppIntent>>(text)
      return {
        ...input.deterministicIntent,
        ...parsed,
        sourceSignals: input.deterministicIntent.sourceSignals,
        llmUsed: true
      }
    } catch {
      return {
        ...input.deterministicIntent,
        summary: `${input.deterministicIntent.summary}\n\nLLM notes: ${text.slice(0, 1000)}`,
        llmUsed: true
      }
    }
  }

  async repairTest(input: { testFile: string; failure: string }): Promise<string | undefined> {
    if (!this.isConfigured()) return undefined
    return this.complete(`Repair this Playwright test if the failure is likely a selector or timing test bug. Return only the full test file.\n\nFailure:\n${input.failure}\n\nTest:\n${input.testFile}`)
  }

  async critiqueWorkflow(context: SnifferCriticContext): Promise<WorkflowCriticDecision> {
    if (!this.isConfigured()) throw new Error('LLM provider is not configured')
    const prompt = [
      'You are a UI workflow analyst for Sniffer.',
      'Use source intent, runtime observation, execution trace, known app state, and candidate findings.',
      'Decide whether the candidate is a real bug, expected conditional UI, crawler precondition gap, test bug, inconclusive, or needs more crawling.',
      'Do not suggest destructive actions. Safe action policy is authoritative.',
      'Return JSON only matching this shape:',
      '{"finding_id":"...","classification":"real_bug|conditional_ui_not_bug|crawler_needs_precondition|test_bug|inconclusive|needs_more_crawling","is_real_bug":true,"confidence":0.0,"required_precondition":"...","next_safe_action":"...","reasoning_summary":"...","evidence":["..."],"should_report":true,"should_generate_fix_packet":true}',
      JSON.stringify(context)
    ].join('\n\n')
    const text = await this.complete(prompt)
    return parseJsonFromText<WorkflowCriticDecision>(text)
  }

  async critiqueUx(context: UxCriticContext): Promise<UxCriticFinding[]> {
    if (!this.isConfigured()) throw new Error('LLM provider is not configured')
    const prompt = [
      'You are a UI/UX critic for a context-aware QA agent.',
      'Use app purpose, source workflow, visible DOM controls, screenshots paths, known state, and candidate heuristic issues.',
      'Decide whether the screen is usable for the workflow and identify confusing, broken, cluttered, unreadable, or inaccessible UI.',
      'Do not suggest destructive actions. Return structured JSON only.',
      'Return exactly this shape:',
      '{"ux_findings":[{"title":"...","severity":"critical|high|medium|low","type":"usability_issue|layout_issue|accessibility_issue|workflow_confusion|visual_clutter","evidence":["..."],"suggested_fix":"...","should_report":true}]}',
      JSON.stringify(context)
    ].join('\n\n')
    const text = await this.complete(prompt)
    const parsed = parseJsonFromText<{ ux_findings?: UxCriticFinding[] }>(text)
    return parsed.ux_findings ?? []
  }

  async synthesizeProductIntent(context: ProductIntentContext): Promise<ProductIntentModel> {
    if (!this.isConfigured()) throw new Error('LLM provider is not configured')
    const prompt = [
      'You are a product-intent synthesizer for Sniffer, a context-aware UI QA agent.',
      'Use source graph signals, runtime DOM observations, screenshots paths, and any user product goal.',
      'Infer the app category, primary user jobs, core entities, expected workflows, expected navigation, persistence, and output-review model.',
      'Do not freely redesign the app. Every item must include support markers: source_supported, runtime_supported, inferred_from_common_pattern, or user_stated.',
      'Common-pattern-only items are suggestions, not bugs. Do not claim they are reportable issues.',
      'Return JSON only matching this shape:',
      '{"app_category":"local_dev_tool|planning_control_panel|admin_console|dashboard|crud_app|design_unknown","product_summary":"...","primary_user_jobs":[{"name":"...","description":"...","support":["source_supported"],"evidence":["..."],"confidence":"high|medium|low"}],"core_entities":[],"expected_workflows":[],"expected_navigation_model":[],"expected_persistence_model":[],"expected_output_review_model":[],"confidence":"high|medium|low","evidence":["..."],"assumptions":["..."],"risks_of_hallucination":["..."],"product_goal":"..."}',
      JSON.stringify(context)
    ].join('\n\n')
    const text = await this.complete(prompt)
    return parseJsonFromText<ProductIntentModel>(text)
  }

  async critiqueProductExperience(context: ProductExperienceContext): Promise<ProductExperienceDecision> {
    if (!this.isConfigured()) throw new Error('LLM provider is not configured')
    const compact = {
      app_name: context.app_name,
      app_profile: context.app_profile,
      app_subtype: context.app_subtype,
      product_intent_summary: truncateText(context.product_intent_summary, 700),
      primary_user_jobs: truncateList(context.primary_user_jobs, 12, 180),
      current_screen_name: context.current_screen_name,
      nav_label_clicked: context.nav_label_clicked,
      page_intent: context.page_intent,
      workflow_intent: context.workflow_intent,
      scenario_name: context.scenario_name,
      scenario_step: context.scenario_step,
      user_goal: context.user_goal,
      expected_user_questions: truncateList(context.expected_user_questions, 10, 180),
      expected_primary_content: truncateList(context.expected_primary_content, 12, 180),
      expected_next_actions: truncateList(context.expected_next_actions, 10, 180),
      required_context: truncateList(context.required_context, 10, 180),
      screenshot_path: context.screenshot_path,
      screenshot_artifact_url: context.screenshot_artifact_url,
      scenario_screenshot_used: context.scenario_screenshot_used,
      screenshot_binary_included: false,
      dom_summary: truncateList(context.dom_summary, 18, 500),
      headings: truncateList(context.headings, 12, 180),
      visible_controls: truncateList(context.visible_controls, 30, 220),
      visible_status_text: truncateList(context.visible_status_text, 12, 220),
      visible_empty_states: truncateList(context.visible_empty_states, 8, 220),
      visible_errors: truncateList(context.visible_errors, 8, 220),
      active_nav_state: truncateText(context.active_nav_state, 180),
      run_project_report_context_visible: truncateList(context.run_project_report_context_visible, 16, 220),
      source_evidence: truncateList(context.source_evidence, 12, 260),
      runtime_evidence: truncateList(context.runtime_evidence, 12, 260),
      related_issues: truncateList(context.related_issues, 8, 220),
      related_fix_packets: truncateList(context.related_fix_packets, 8, 220),
      rubric: context.rubric.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        applies_to: item.applies_to,
        evidence_required: item.evidence_required,
        default_severity: item.default_severity
      })),
      context_sufficiency: context.context_sufficiency,
      context_sufficiency_score: context.context_sufficiency_score,
      context_sufficiency_signals: context.context_sufficiency_signals,
      context_warnings: truncateList(context.context_warnings, 10, 240),
      vision_capable: context.vision_capable,
      vision_used: context.vision_used,
      vision_not_used_reason: context.vision_not_used_reason,
      llm_provider: context.llm_provider,
      llm_model: context.llm_model,
      llm_api_style: context.llm_api_style,
      real_llm_expected: context.real_llm_expected,
      candidate_findings: context.candidate_findings?.slice(0, 8),
      evidence_retrieval_summary: context.evidence_retrieval_summary,
      evidence_packet_summary: context.evidence_packet ? {
        context: context.evidence_packet.context,
        retrievedDocumentCount: context.evidence_packet.retrievedDocuments.length,
        graphNodeCount: context.evidence_packet.graphNodes.length,
        sourceFactCount: context.evidence_packet.sourceFacts.length,
        runtimeFactCount: context.evidence_packet.runtimeFacts.length,
        screenshots: context.evidence_packet.screenshots.slice(0, 6),
        contradictions: context.evidence_packet.contradictions.slice(0, 6).map((item) => item.claim),
        confidenceSummary: context.evidence_packet.confidenceSummary,
      topRetrievedDocuments: context.evidence_packet.retrievedDocuments.slice(0, 8).map((doc) => ({
          id: doc.id,
          kind: doc.kind,
          text: truncateText(doc.text, 280),
          metadata: doc.metadata
        }))
      } : undefined
    }
    const prompt = [
      'You are an intent-aware Product Experience Critic for Sniffer.',
      'Question: Given what this app is trying to do, does this screen make sense for the user job being tested?',
      'Use product intent, app profile, workflow/page intent, scenario/runtime evidence, DOM summary, screenshot path/metadata, and the included product UX rubric as the judging lens.',
      'Do not freestyle redesign. Do not report vague visual opinions. Report only evidence-backed product/UX mismatches.',
      'All findings must be scoped to the current screen being reviewed. If screen_name is Issues, do not claim Raw JSON copy controls are missing unless the Issues screen itself embeds a Raw JSON panel or the issue is explicitly about navigation from Issues to Raw JSON.',
      'Before reporting a missing control, check same-screen DOM summary, headings, visible controls, and runtime_evidence for positive evidence. If positive evidence such as Copy JSON, Raw JSON payload, or Copy prompt exists, mark the candidate as a non_issue or inconclusive.',
      'For Raw JSON, raw report payload, debug payload, exact report data, or JSON inspection screens, a visible copy/export action is expected. Accept Copy JSON, Copy raw payload, Copy report JSON, Download JSON, or Export JSON. If a JSON/raw payload is visible and no such control appears in same-screen DOM/visible_controls, report actionability_gap titled "Raw JSON lacks copy action". Do not suppress this as cosmetic; copying raw data is a core debug/report user job.',
      'For Sniffer Dashboard report pages, issue titles, fix-packet titles, and raw report findings are loaded report data. Do not treat a loaded issue title as proof the current dashboard chrome has that defect.',
      'If a report context strip is visible with project/ad hoc context, selected/latest run or report identity, generated timestamp/status, and counts, do not report a context_gap solely because the loaded report data mentions an older context issue.',
      'On the Raw JSON screen, the JSON payload is intentionally report data. Do not report missing UI surfaces or workflow gaps based on embedded rawFindings, deferredFindings, runtimeSurfaceMatches, or sourceGraph values inside the payload; judge whether the Raw JSON page itself exposes the payload and copy action.',
      'If vision_used=false, do not claim screenshot evidence proves visual hierarchy, blending, spacing, prominence, or layout. Use DOM context only, or mark the visual judgment inconclusive/non_issue.',
      'Distinguish aesthetic preference, generic UX improvement, product intent mismatch, workflow mismatch, missing context, misleading information architecture, and blocked/unclear next step.',
      'If context_sufficiency is low, still judge the available evidence, but choose inconclusive if the evidence cannot support a product judgment.',
      'If unsure, choose inconclusive or non_issues. Prefer minor_gap over major_gap unless the user cannot understand or complete the job.',
      'Return JSON only matching this exact shape:',
      '{"screen_name":"...","nav_label":"...","workflow_intent":"...","llm_used":true,"vision_used":false,"context_sufficiency":"low|medium|high","context_sufficiency_score":0.0,"context_warnings":["..."],"overall":{"classification":"aligned|minor_gap|major_gap|inconclusive","confidence":"low|medium|high","summary":"..."},"findings":[{"title":"...","type":"product_intent_mismatch|workflow_mismatch|context_gap|navigation_promise_gap|evidence_gap|information_hierarchy_gap|actionability_gap|empty_state_gap|safety_clarity_gap","severity":"low|medium|high|critical","rubric_ids":["..."],"expected":"...","observed":"...","evidence":["screen-scoped DOM evidence","screenshot evidence","workflow evidence"],"why_it_matters":"...","suggested_fix":"...","should_report":true}],"non_issues":[{"observation":"...","reason_not_reported":"..."}]}',
      JSON.stringify(compact)
    ].join('\n\n')
    const text = await this.complete(prompt)
    return parseJsonFromText<ProductExperienceDecision>(text)
  }

  async inferRuntimeIntent(context: RuntimeIntentContext): Promise<RuntimeLlmIntent> {
    if (!this.isConfigured()) throw new Error('LLM provider is not configured')
    const prompt = [
      'You are a runtime UI workflow analyst for Sniffer.',
      'Use the rendered DOM/accessibility/control snapshot plus compact source summary.',
      'Infer app type, evidence-backed user jobs, safe workflows, important controls, and recommended Playwright locators.',
      'Do not invent unsupported workflows. Common-pattern guesses must be low confidence unless source/runtime supports them.',
      'Do not suggest destructive actions. Safe action policy is authoritative. Prefer accessible locators.',
      'Return JSON only matching this shape:',
      '{"app_type":"planning_control_panel|admin_console|dashboard_app|crud_app|ecommerce_app|docs_site|marketing_site|auth_app|unknown","primary_user_jobs":["..."],"workflows":[{"name":"...","confidence":"low|medium|high","evidence":["..."],"source":"llm","steps":[{"action":"click|type|select|assert","target_name":"...","locator_strategy":"role|label|placeholder|testid|text|css","locator_value":"...","safe":true,"expected_result":"...","confidence":"low|medium|high","evidence":["..."]}]}],"safe_next_actions":[],"unsafe_actions":[],"notes":["..."]}',
      JSON.stringify(context)
    ].join('\n\n')
    const text = await this.complete(prompt)
    return parseJsonFromText<RuntimeLlmIntent>(text)
  }

  async critiquePromptConsistency(context: PromptConsistencyContext): Promise<PromptConsistencyDecision> {
    if (!this.isConfigured()) throw new Error('LLM provider is not configured')
    const prompt = [
      'You are a prompt/output consistency critic for Sniffer, a context-aware UI QA agent.',
      'Decide whether generated UI output answers the current prompt or appears stale/unrelated from a prior prompt.',
      'Use the current prompt, prior prompt, rendered output excerpt, handoff excerpt, semantic labels, recommended paths, response feature request, and deterministic stale concept hits.',
      'Do not execute actions. Return JSON only matching this shape:',
      '{"classification":"consistent|stale_output|semantic_mismatch|inconclusive","confidence":"low|medium|high","reasoning_summary":"...","stale_concepts":["..."],"should_report":true}',
      JSON.stringify(context)
    ].join('\n\n')
    const text = await this.complete(prompt)
    return parseJsonFromText<PromptConsistencyDecision>(text)
  }

  async triageIssues(context: IssueTriageContext): Promise<Issue[]> {
    if (!this.isConfigured()) throw new Error('LLM provider is not configured')
    const compact = {
      sourceGraph: {
        repoPath: context.sourceGraph.repoPath,
        framework: context.sourceGraph.framework,
        buildTool: context.sourceGraph.buildTool,
        workflows: context.sourceGraph.sourceWorkflows,
        apiCalls: context.sourceGraph.apiCalls,
        uiSurfaces: context.sourceGraph.uiSurfaces
      },
      runtimeWorkflowVerifications: context.runtimeWorkflowVerifications,
      crawl: {
        startUrl: context.crawlGraph.startUrl,
        finalUrl: context.crawlGraph.finalUrl,
        screenshots: context.crawlGraph.screenshots,
        consoleErrors: context.crawlGraph.consoleErrors,
        networkFailures: context.crawlGraph.networkFailures
      },
      rawFindings: context.rawFindings
    }
    const prompt = [
      'You are triaging raw Sniffer UI QA findings into repair-sized groups.',
      'Group tiny missing-control findings into actionable themes. Preserve severe API issues. Mark likely locator/test issues as inconclusive in the evidence or status.',
      'Return JSON only with this shape:',
      '{"issues":[{"severity":"critical|high|medium|low","type":"functional_bug|api_error|workflow_confusion|layout_issue|usability_issue|accessibility_issue|product_intent_gap|product_experience_gap|semantic_mismatch|stale_output|inconclusive","title":"...","description":"...","evidence":["..."],"suggestedFixPrompt":"...","screenshotPath":"..."}]}',
      JSON.stringify(compact)
    ].join('\n\n')
    const text = await this.complete(prompt)
    const parsed = parseJsonFromText<{ issues?: Issue[] }>(text)
    return parsed.issues ?? []
  }

  async critiqueGraphStructure(context: GraphStructureCriticContext): Promise<Pick<GraphRefinementResult, 'suggestions' | 'warnings'>> {
    if (!this.isConfigured()) throw new Error('LLM provider is not configured')
    const prompt = [
      'You are the Graph Structure Critic for Sniffer, an agentic UI QA system.',
      'Review a draft SourceInventory and UIIntentGraph. Suggest corrections, but do not rewrite the graph directly.',
      'Look for misclassified facts, noisy/raw controls, wrong surface types, missing workflow/action/API relationships, duplicates/splits, source-only claims needing runtime confirmation, static assets mislabeled as APIs, and repeated row action patterns.',
      'Every suggestion must be evidence-backed. Use evidenceIds from the SourceInventory only.',
      'Sniffer only applies high-confidence, low/medium-risk, schema-valid suggestions with valid targetId and evidenceIds. If unsure, emit a warning instead of a suggestion.',
      'Do not suggest deletion of deterministic facts. Use mark_as_noise for noisy facts.',
      'Useful target surface types include history_list, dialog_form, debug_payload_view, repair_packet_view, copy_action, prompt_composer, plan_bundle_view, unknown_ui_section.',
      'Return JSON only matching this shape:',
      '{"suggestions":[{"id":"...","type":"reclassify_fact|normalize_control|merge_duplicate_surface|split_surface|add_edge|remove_edge|raise_confidence|lower_confidence|mark_as_noise|add_workflow|reclassify_surface","targetId":"...","fromValue":"...","toValue":"...","reason":"...","evidenceIds":["fact-..."],"confidence":"low|medium|high","risk":"low|medium|high"}],"warnings":["..."]}',
      'For normalize_control, put JSON in toValue, for example {"kind":"form_control","label":"Workspace name","controlType":"input","handler":"onNameChange","testId":"workspace-name-input"}.',
      'For reclassify_fact, toValue can be a fact kind like static_asset_reference or JSON {"kind":"static_asset_reference","value":"/src/main.tsx"}.',
      'For reclassify_surface, targetId should be a surface node id and toValue should be a valid surface type.',
      'For add_workflow, targetId should be an evidence fact id and toValue should be JSON {"name":"Browse/reopen previous plan runs","likelyUserActions":["click Reopen"]}.',
      JSON.stringify(context)
    ].join('\n\n')
    const text = await this.complete(prompt)
    const parsed = parseJsonFromText<Pick<GraphRefinementResult, 'suggestions' | 'warnings'>>(text)
    return {
      suggestions: parsed.suggestions ?? [],
      warnings: parsed.warnings ?? []
    }
  }

  private async complete(prompt: string): Promise<string> {
    const useResponses = this.apiStyle === 'responses' || this.apiStyle === 'auto'
    const url = useResponses ? `${this.baseUrl.replace(/\/$/, '')}/responses` : `${this.baseUrl.replace(/\/$/, '')}/chat/completions`
    const body = useResponses
      ? { model: this.model, input: prompt }
      : { model: this.model, messages: [{ role: 'user', content: prompt }] }

    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      const responseBody = await response.text().catch(() => '')
      throw new LlmProviderError(`LLM request failed: ${response.status}`, {
        statusCode: response.status,
        responseBody
      })
    }
    const json = await response.json()
    const text = extractProviderText(json)
    if (!text.trim()) throw new Error('LLM response did not contain text output')
    return text
  }

  private providerCheckBase(): Omit<LlmProviderCheckResult, 'request'> {
    return {
      provider: this.name,
      baseUrlHost: baseUrlHost(this.baseUrl),
      model: this.model || undefined,
      apiStyle: this.apiStyle,
      authConfigured: Boolean(this.apiKey),
      configSource: this.config.sources,
      env: this.config.env,
      realProvider: true
    }
  }
}

export function resolveOpenAICompatibleConfig(env: NodeJS.ProcessEnv = process.env): OpenAICompatibleConfig {
  const baseUrl = firstConfigured(env, [
    'SNIFFER_LLM_BASE_URL',
    'STACKPILOT_SEMANTIC_BASE_URL'
  ]) ?? { value: 'https://api.openai.com/v1', key: 'default' }
  const apiKey = firstConfigured(env, [
    'SNIFFER_LLM_API_KEY',
    'STACKPILOT_SEMANTIC_API_KEY',
    'OPENAI_API_KEY'
  ])
  const model = firstConfigured(env, [
    'SNIFFER_LLM_MODEL',
    'STACKPILOT_SEMANTIC_MODEL'
  ])
  const apiStyle = firstConfigured(env, [
    'SNIFFER_LLM_API_STYLE',
    'STACKPILOT_SEMANTIC_API_STYLE'
  ]) ?? { value: 'auto', key: 'default' }

  return {
    baseUrl: baseUrl.value,
    apiKey: apiKey?.value ?? '',
    model: model?.value ?? '',
    apiStyle: normalizeApiStyle(apiStyle.value),
    sources: {
      baseUrl: baseUrl.key,
      apiKey: apiKey?.key,
      model: model?.key,
      apiStyle: apiStyle.key
    },
    env: {
      SNIFFER_LLM_BASE_URL: hasEnv(env, 'SNIFFER_LLM_BASE_URL'),
      SNIFFER_LLM_API_KEY: hasEnv(env, 'SNIFFER_LLM_API_KEY'),
      SNIFFER_LLM_MODEL: hasEnv(env, 'SNIFFER_LLM_MODEL'),
      SNIFFER_LLM_API_STYLE: hasEnv(env, 'SNIFFER_LLM_API_STYLE'),
      STACKPILOT_SEMANTIC_BASE_URL: hasEnv(env, 'STACKPILOT_SEMANTIC_BASE_URL'),
      STACKPILOT_SEMANTIC_API_KEY: hasEnv(env, 'STACKPILOT_SEMANTIC_API_KEY'),
      STACKPILOT_SEMANTIC_MODEL: hasEnv(env, 'STACKPILOT_SEMANTIC_MODEL'),
      STACKPILOT_SEMANTIC_API_STYLE: hasEnv(env, 'STACKPILOT_SEMANTIC_API_STYLE'),
      OPENAI_API_KEY: hasEnv(env, 'OPENAI_API_KEY')
    }
  }
}

function firstConfigured(env: NodeJS.ProcessEnv, keys: string[]): { key: string; value: string } | undefined {
  for (const key of keys) {
    const value = env[key]
    if (typeof value === 'string' && value.trim()) return { key, value: value.trim() }
  }
  return undefined
}

function hasEnv(env: NodeJS.ProcessEnv, key: string): boolean {
  return typeof env[key] === 'string' && Boolean(env[key]?.trim())
}

function normalizeApiStyle(value: string): ApiStyle {
  return value === 'responses' || value === 'chat_completions' || value === 'auto' ? value : 'auto'
}

function baseUrlHost(baseUrl: string): string | undefined {
  try {
    return new URL(baseUrl).host
  } catch {
    return undefined
  }
}

function missingConfigMessage(config: OpenAICompatibleConfig): string {
  const missing = [
    config.apiKey ? undefined : 'API key',
    config.model ? undefined : 'model',
    config.baseUrl ? undefined : 'base URL'
  ].filter(Boolean)
  return `Missing ${missing.join(', ')}. Set SNIFFER_LLM_API_KEY, SNIFFER_LLM_MODEL, and SNIFFER_LLM_BASE_URL or run sniffer providers check --provider openai-compatible.`
}

export function safeProviderErrorSummary(error: unknown): string {
  if (error instanceof LlmProviderError) {
    const body = summarizeResponseBody(error.responseBody)
    return body ? `${error.message}: ${body}` : error.message
  }
  return error instanceof Error ? error.message : 'Unknown LLM provider error'
}

function summarizeResponseBody(body?: string): string | undefined {
  if (!body?.trim()) return undefined
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    const error = parsed.error as Record<string, unknown> | undefined
    if (typeof error?.message === 'string') return redactSecrets(error.message).slice(0, 240)
    if (typeof parsed.message === 'string') return redactSecrets(parsed.message).slice(0, 240)
  } catch {
    // fall through to safe text excerpt
  }
  return redactSecrets(body.replace(/\s+/g, ' ')).slice(0, 240)
}

function redactSecrets(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_*.-]{8,}/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer ***')
}

function truncateList(values: string[] | undefined, limit: number, maxChars: number): string[] {
  return (values ?? []).slice(0, limit).map((value) => truncateText(value, maxChars)).filter(Boolean) as string[]
}

function truncateText(value: string | undefined, maxChars: number): string | undefined {
  if (!value) return undefined
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length > maxChars ? `${compact.slice(0, maxChars - 3)}...` : compact
}

export function extractProviderText(json: unknown): string {
  if (!json || typeof json !== 'object') return ''
  const record = json as Record<string, unknown>
  if (typeof record.output_text === 'string') return record.output_text
  const choices = record.choices
  if (Array.isArray(choices)) {
    const first = choices[0] as Record<string, unknown> | undefined
    const message = first?.message as Record<string, unknown> | undefined
    if (typeof message?.content === 'string') return message.content
  }
  const output = record.output
  if (Array.isArray(output)) {
    const parts = output.flatMap((item) => {
      const outputItem = item as Record<string, unknown>
      if (typeof outputItem.text === 'string') return [outputItem.text]
      const content = outputItem.content
      if (!Array.isArray(content)) return []
      return content.flatMap((contentItem) => {
        const part = contentItem as Record<string, unknown>
        if (typeof part.text === 'string') return [part.text]
        if (typeof part.output_text === 'string') return [part.output_text]
        return []
      })
    })
    return parts.join('\n')
  }
  return ''
}

export function parseJsonFromText<T>(text: string): T {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('LLM returned empty text when JSON was required')
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return JSON.parse(fenced[1].trim()) as T
  try {
    return JSON.parse(trimmed) as T
  } catch {
    const objectStart = trimmed.indexOf('{')
    const objectEnd = trimmed.lastIndexOf('}')
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(trimmed.slice(objectStart, objectEnd + 1)) as T
    }
    const arrayStart = trimmed.indexOf('[')
    const arrayEnd = trimmed.lastIndexOf(']')
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1)) as T
    }
    throw new Error(`LLM returned non-JSON text: ${trimmed.slice(0, 160)}`)
  }
}
