import { describe, expect, it } from 'vitest'
import { builtInScenarios } from '../src/runtime/scenarios.js'

describe('scenario packs', () => {
  it('defines plan generation and review scenarios with safe steps', () => {
    const scenarios = builtInScenarios()
    const generate = scenarios.find((scenario) => scenario.slug === 'generate-plan-bundle')
    const review = scenarios.find((scenario) => scenario.slug === 'review-plan-output')

    expect(generate?.steps.map((step) => step.action)).toContain('enter_sample_prompt')
    expect(generate?.assertions).toContain('Generate Plan button')
    expect(review?.assertions).toEqual(expect.arrayContaining(['Overview', 'Change Set', 'Handoff', 'Raw JSON']))
    expect(scenarios.flatMap((scenario) => scenario.steps).every((step) => step.safe)).toBe(true)
  })
})
