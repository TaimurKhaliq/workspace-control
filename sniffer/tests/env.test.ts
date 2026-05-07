import { describe, expect, it } from 'vitest'
import { parseEnvLine } from '../src/config/env.js'

describe('env loader', () => {
  it('parses simple and quoted values without exposing secrets in code paths', () => {
    expect(parseEnvLine('SNIFFER_LLM_MODEL=gpt-4.1-mini')).toEqual(['SNIFFER_LLM_MODEL', 'gpt-4.1-mini'])
    expect(parseEnvLine('SNIFFER_LLM_API_KEY="secret value"')).toEqual(['SNIFFER_LLM_API_KEY', 'secret value'])
    expect(parseEnvLine('# comment')).toBeUndefined()
  })
})
