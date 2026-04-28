import type { AppIntent } from '../types.js'
import type { Issue, IssueTriageContext, ProductIntentContext, ProductIntentModel, PromptConsistencyContext, PromptConsistencyDecision, SnifferCriticContext, UxCriticContext, UxCriticFinding, WorkflowCriticDecision } from '../types.js'
import type { LlmProvider } from './provider.js'

type ApiStyle = 'responses' | 'chat_completions' | 'auto'

export class OpenAICompatibleProvider implements LlmProvider {
  name = 'openai-compatible'
  private baseUrl: string
  private apiKey: string
  private model: string
  private apiStyle: ApiStyle

  constructor(env = process.env) {
    this.baseUrl = env.SNIFFER_LLM_BASE_URL ?? 'https://api.openai.com/v1'
    this.apiKey = env.SNIFFER_LLM_API_KEY ?? ''
    this.model = env.SNIFFER_LLM_MODEL ?? ''
    this.apiStyle = (env.SNIFFER_LLM_API_STYLE as ApiStyle | undefined) ?? 'auto'
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.model)
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
      '{"issues":[{"severity":"critical|high|medium|low","type":"functional_bug|api_error|workflow_confusion|layout_issue|usability_issue|accessibility_issue|product_intent_gap|semantic_mismatch|stale_output|inconclusive","title":"...","description":"...","evidence":["..."],"suggestedFixPrompt":"...","screenshotPath":"..."}]}',
      JSON.stringify(compact)
    ].join('\n\n')
    const text = await this.complete(prompt)
    const parsed = parseJsonFromText<{ issues?: Issue[] }>(text)
    return parsed.issues ?? []
  }

  private async complete(prompt: string): Promise<string> {
    const useResponses = this.apiStyle === 'responses' || this.apiStyle === 'auto'
    const url = useResponses ? `${this.baseUrl.replace(/\/$/, '')}/responses` : `${this.baseUrl.replace(/\/$/, '')}/chat/completions`
    const body = useResponses
      ? { model: this.model, input: prompt }
      : { model: this.model, messages: [{ role: 'user', content: prompt }] }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    if (!response.ok) throw new Error(`LLM request failed: ${response.status}`)
    const json = await response.json()
    const text = extractProviderText(json)
    if (!text.trim()) throw new Error('LLM response did not contain text output')
    return text
  }
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
