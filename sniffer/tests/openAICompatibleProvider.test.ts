import { describe, expect, it } from 'vitest'
import { extractProviderText, parseJsonFromText } from '../src/llm/openAICompatibleProvider.js'

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
})
