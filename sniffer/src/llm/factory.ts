import type { LlmProvider } from './provider.js'
import { OpenAICompatibleProvider } from './openAICompatibleProvider.js'
import { MockLlmProvider } from './mockProvider.js'

export function createLlmProvider(name: string = 'auto'): LlmProvider | undefined {
  if (name === 'mock') return new MockLlmProvider()
  const provider = new OpenAICompatibleProvider()
  return provider.isConfigured() ? provider : undefined
}
