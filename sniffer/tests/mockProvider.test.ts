import { describe, expect, it } from 'vitest'
import { MockLlmProvider } from '../src/llm/mockProvider.js'

describe('MockLlmProvider', () => {
  it('marks intent as LLM-enhanced without external calls', async () => {
    const provider = new MockLlmProvider()
    const intent = await provider.inferIntent({
      sourceGraph: {
        repoPath: '/tmp/demo',
        framework: 'react',
        buildTool: 'vite',
        routes: [],
        pages: [],
        components: [],
        forms: [],
        uiSurfaces: [],
        sourceWorkflows: [],
        apiCalls: [],
        stateActions: [],
        packageScripts: {},
        generatedAt: ''
      },
      deterministicIntent: { summary: 'demo', likelyWorkflows: [], sourceSignals: [], llmUsed: false }
    })
    expect(intent.llmUsed).toBe(true)
    expect(intent.summary).toContain('Mock LLM')
  })
})
