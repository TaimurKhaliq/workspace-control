import type { AppIntent } from '../types.js'
import type { LlmProvider } from './provider.js'

export class MockLlmProvider implements LlmProvider {
  name = 'mock'

  async inferIntent(input: Parameters<LlmProvider['inferIntent']>[0]): Promise<AppIntent> {
    return {
      ...input.deterministicIntent,
      summary: `Mock LLM interpretation: ${input.deterministicIntent.summary}`,
      llmUsed: true
    }
  }

  async repairTest(input: { testFile: string }): Promise<string> {
    return input.testFile
  }
}
