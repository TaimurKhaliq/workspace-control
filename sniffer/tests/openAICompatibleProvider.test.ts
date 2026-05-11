import { describe, expect, it } from 'vitest'
import { OpenAICompatibleProvider, extractProviderText, parseJsonFromText, resolveOpenAICompatibleConfig } from '../src/llm/openAICompatibleProvider.js'
import { encodeImageAsDataUrl } from '../src/llm/imageInput.js'
import type { ProductExperienceContext } from '../src/types.js'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

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

  it('encodes PNG screenshots as data URLs', async () => {
    const file = await tinyPngFile()
    const result = await encodeImageAsDataUrl(file)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.image.mimeType).toBe('image/png')
      expect(result.image.dataUrl).toMatch(/^data:image\/png;base64,/)
      expect(result.image.bytes).toBeGreaterThan(0)
    }
  })

  it('returns a clear skip reason for missing screenshots', async () => {
    const result = await encodeImageAsDataUrl('/tmp/sniffer-missing-image.png')

    expect(result).toEqual({ ok: false, reason: 'screenshot_file_missing' })
  })

  it('skips oversized screenshots before encoding', async () => {
    const file = await tinyPngFile()
    const result = await encodeImageAsDataUrl(file, { maxBytes: 1 })

    expect(result).toEqual({ ok: false, reason: 'image_too_large' })
  })

  it('sends Responses API input_image content when vision is enabled', async () => {
    const calls: Array<{ url: string; body: any }> = []
    const screenshotPath = await tinyPngFile()
    const provider = new OpenAICompatibleProvider({
      SNIFFER_LLM_BASE_URL: 'https://api.openai.com/v1',
      SNIFFER_LLM_API_KEY: 'test-key',
      SNIFFER_LLM_MODEL: 'gpt-4.1-mini',
      SNIFFER_LLM_API_STYLE: 'responses'
    }, async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return new Response(JSON.stringify({ output: [{ content: [{ text: JSON.stringify(productDecision()) }] }] }), { status: 200 })
    })

    const decision = await provider.critiqueProductExperience(productContext(screenshotPath))

    expect(calls[0].url).toBe('https://api.openai.com/v1/responses')
    const content = calls[0].body.input[0].content
    expect(content[0]).toMatchObject({ type: 'input_text' })
    expect(content[1]).toMatchObject({ type: 'input_image', detail: 'auto' })
    expect(content[1].image_url).toMatch(/^data:image\/png;base64,/)
    expect(decision.vision_used).toBe(true)
    expect(decision.screenshot_attached).toBe(true)
  })

  it('sends Chat Completions image_url content when chat style is selected', async () => {
    const calls: Array<{ body: any }> = []
    const screenshotPath = await tinyPngFile()
    const provider = new OpenAICompatibleProvider({
      SNIFFER_LLM_BASE_URL: 'https://api.openai.com/v1',
      SNIFFER_LLM_API_KEY: 'test-key',
      SNIFFER_LLM_MODEL: 'gpt-4.1-mini',
      SNIFFER_LLM_API_STYLE: 'chat_completions'
    }, async (_url, init) => {
      calls.push({ body: JSON.parse(String(init?.body)) })
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(productDecision()) } }] }), { status: 200 })
    })

    await provider.critiqueProductExperience(productContext(screenshotPath))

    const content = calls[0].body.messages[0].content
    expect(content[0]).toMatchObject({ type: 'text' })
    expect(content[1].image_url.url).toMatch(/^data:image\/png;base64,/)
  })

  it('does not attach images when vision is disabled by env override', async () => {
    const calls: Array<{ body: any }> = []
    const provider = new OpenAICompatibleProvider({
      SNIFFER_LLM_BASE_URL: 'https://api.openai.com/v1',
      SNIFFER_LLM_API_KEY: 'test-key',
      SNIFFER_LLM_MODEL: 'gpt-4.1-mini',
      SNIFFER_LLM_API_STYLE: 'responses',
      SNIFFER_LLM_VISION_ENABLED: 'false'
    }, async (_url, init) => {
      calls.push({ body: JSON.parse(String(init?.body)) })
      return new Response(JSON.stringify({ output: [{ content: [{ text: JSON.stringify(productDecision()) }] }] }), { status: 200 })
    })

    const decision = await provider.critiqueProductExperience(productContext(await tinyPngFile()))

    expect(provider.supportsVision()).toBe(false)
    expect(calls[0].body.input).toEqual(expect.any(String))
    expect(decision.vision_used).toBe(false)
    expect(decision.vision_not_used_reason).toBe('provider_does_not_support_vision')
  })
})

async function failingFetch(): Promise<Response> {
  throw new Error('fetch should not be called')
}

async function tinyPngFile(): Promise<string> {
  const dir = path.join(os.tmpdir(), 'sniffer-openai-provider-tests')
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, `tiny-${Date.now()}-${Math.random().toString(16).slice(2)}.png`)
  await writeFile(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64'))
  return file
}

function productContext(screenshotPath: string): ProductExperienceContext {
  return {
    app_name: 'Sniffer Dashboard',
    primary_user_jobs: ['inspect report'],
    current_screen_name: 'Summary',
    nav_label_clicked: 'Summary',
    page_intent: 'Summarize the selected report.',
    workflow_intent: 'Review audit results.',
    expected_user_questions: [],
    expected_primary_content: [],
    expected_next_actions: [],
    required_context: [],
    screenshot_path: screenshotPath,
    screenshot_artifact_url: '/api/reports/latest/artifacts/screenshots%2Fsummary.png',
    scenario_screenshot_used: true,
    dom_summary: ['SUMMARY Latest report'],
    headings: ['Summary'],
    visible_controls: [],
    visible_status_text: [],
    visible_empty_states: [],
    visible_errors: [],
    run_project_report_context_visible: ['run/report identity'],
    source_evidence: [],
    runtime_evidence: [],
    related_issues: [],
    related_fix_packets: [],
    rubric: [],
    context_sufficiency: 'high',
    context_sufficiency_score: 1,
    context_sufficiency_signals: [],
    context_warnings: [],
    vision_capable: true,
    vision_requested: true,
    vision_used: false,
    real_llm_expected: true
  }
}

function productDecision() {
  return {
    screen_name: 'Summary',
    nav_label: 'Summary',
    workflow_intent: 'Review audit results.',
    llm_used: true,
    real_llm_used: true,
    llm_request_status: 'success',
    vision_used: false,
    scenario_screenshot_used: true,
    context_sufficiency: 'high',
    context_sufficiency_score: 1,
    context_warnings: [],
    overall: { classification: 'aligned', confidence: 'high', summary: 'Looks coherent.' },
    findings: [],
    non_issues: []
  }
}
