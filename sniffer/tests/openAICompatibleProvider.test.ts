import { describe, expect, it } from 'vitest'
import { OpenAICompatibleProvider, extractProviderText, parseJsonFromText, resolveOpenAICompatibleConfig } from '../src/llm/openAICompatibleProvider.js'

describe('OpenAI-compatible provider response parsing', () => {
  it('extracts text from Responses API output content parts', () => {
    const text = extractProviderText({
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: '{"classification":"consistent"}' }]
      }]
    })

    expect(text).toBe('{"classification":"consistent"}')
  })

  it('extracts text from chat completions responses', () => {
    const text = extractProviderText({
      choices: [{ message: { content: '{"issues":[]}' } }]
    })

    expect(text).toBe('{"issues":[]}')
  })

  it('parses fenced JSON and ignores explanatory wrapping text', () => {
    expect(parseJsonFromText<{ ok: boolean }>('```json\n{"ok":true}\n```')).toEqual({ ok: true })
    expect(parseJsonFromText<{ ok: boolean }>('Here is JSON:\n{"ok":true}\nThanks')).toEqual({ ok: true })
  })

  it('diagnoses missing API key without attempting a request', async () => {
    const provider = new OpenAICompatibleProvider({
      SNIFFER_LLM_BASE_URL: 'https://api.openai.com/v1',
      SNIFFER_LLM_MODEL: 'gpt-test',
      SNIFFER_LLM_API_STYLE: 'responses'
    }, failingFetch)

    const result = await provider.checkConnection()

    expect(result.authConfigured).toBe(false)
    expect(result.request.attempted).toBe(false)
    expect(result.request.success).toBe(false)
    expect(result.request.errorSummary).toContain('Missing API key')
    expect(result.env.SNIFFER_LLM_API_KEY).toBe(false)
  })

  it('reports invalid API key status safely', async () => {
    const provider = new OpenAICompatibleProvider({
      SNIFFER_LLM_BASE_URL: 'https://api.openai.com/v1',
      SNIFFER_LLM_API_KEY: 'not-secret-for-test',
      SNIFFER_LLM_MODEL: 'gpt-test',
      SNIFFER_LLM_API_STYLE: 'responses'
    }, async () => new Response(JSON.stringify({ error: { message: 'Incorrect API key provided.' } }), { status: 401 }))

    const result = await provider.checkConnection()

    expect(result.authConfigured).toBe(true)
    expect(result.request.attempted).toBe(true)
    expect(result.request.success).toBe(false)
    expect(result.request.statusCode).toBe(401)
    expect(result.request.errorSummary).toContain('Incorrect API key')
    expect(result.request.errorSummary).not.toContain('not-secret-for-test')
  })

  it('preflights a successful Responses API JSON call', async () => {
    const provider = new OpenAICompatibleProvider({
      SNIFFER_LLM_BASE_URL: 'https://api.openai.com/v1',
      SNIFFER_LLM_API_KEY: 'test-key',
      SNIFFER_LLM_MODEL: 'gpt-test',
      SNIFFER_LLM_API_STYLE: 'responses'
    }, async () => new Response(JSON.stringify({ output: [{ content: [{ text: '{"ok":true}' }] }] }), { status: 200 }))

    const result = await provider.checkConnection()

    expect(result.realProvider).toBe(true)
    expect(result.baseUrlHost).toBe('api.openai.com')
    expect(result.request.success).toBe(true)
    expect(result.request.responseTextExtracted).toBe(true)
  })

  it('supports Sniffer env vars before legacy fallbacks', () => {
    const config = resolveOpenAICompatibleConfig({
      STACKPILOT_SEMANTIC_API_KEY: 'legacy',
      SNIFFER_LLM_API_KEY: 'sniffer',
      STACKPILOT_SEMANTIC_MODEL: 'legacy-model',
      SNIFFER_LLM_MODEL: 'sniffer-model'
    })

    expect(config.sources.apiKey).toBe('SNIFFER_LLM_API_KEY')
    expect(config.sources.model).toBe('SNIFFER_LLM_MODEL')
    expect(config.env.STACKPILOT_SEMANTIC_API_KEY).toBe(true)
    expect(config.env.OPENAI_API_KEY).toBe(false)
  })
})

async function failingFetch(): Promise<Response> {
  throw new Error('fetch should not be called')
}
