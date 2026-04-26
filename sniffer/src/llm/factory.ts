import type { LlmProvider } from './provider.js'
import { OpenAICompatibleProvider } from './openAICompatibleProvider.js'

export function createLlmProvider(): LlmProvider | undefined {
  const provider = new OpenAICompatibleProvider()
  return provider.isConfigured() ? provider : undefined
}
