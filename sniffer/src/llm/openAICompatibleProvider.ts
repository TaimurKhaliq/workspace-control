import type { AppIntent } from '../types.js'
import type { SnifferCriticContext, WorkflowCriticDecision } from '../types.js'
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
      const parsed = JSON.parse(text) as Partial<AppIntent>
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
    return JSON.parse(text) as WorkflowCriticDecision
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
    const json = await response.json() as {
      output_text?: string
      choices?: { message?: { content?: string } }[]
    }
    return json.output_text ?? json.choices?.[0]?.message?.content ?? ''
  }
}
