import type { AppIntent } from '../types.js'
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
