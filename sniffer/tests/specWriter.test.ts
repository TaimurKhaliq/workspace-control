import { describe, expect, it } from 'vitest'
import { generatePlaywrightSpecs } from '../src/testgen/specWriter.js'

describe('generatePlaywrightSpecs', () => {
  it('writes accessible baseline assertions for workflows', () => {
    const specs = generatePlaywrightSpecs({
      summary: 'demo',
      sourceSignals: [],
      llmUsed: false,
      likelyWorkflows: [{ name: 'Visit settings', route: '/settings', steps: ['open'], confidence: 0.8 }]
    }, 'http://localhost:3000')

    expect(specs[0].fileName).toContain('visit-settings')
    expect(specs[0].content).toContain("import { test, expect }")
    expect(specs[0].content).toContain('toHaveTitle')
    expect(specs[0].content).toContain('http://localhost:3000/settings')
  })
})
