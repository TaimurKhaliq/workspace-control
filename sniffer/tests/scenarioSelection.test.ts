import { describe, expect, it } from 'vitest'
import { shouldRunBuiltInScenarioPack, shouldRunPromptConsistency } from '../src/runtime/scenarioSelection.js'
import type { AppProfile } from '../src/types.js'

describe('profile-aware scenario selection', () => {
  it('does not run workspace-control scenario pack for non-planning apps when scenario is all', () => {
    expect(shouldRunBuiltInScenarioPack({
      scenarioSlug: 'all',
      appProfile: profile('crud_app')
    })).toBe(false)
  })

  it('does not run workspace-control scenario pack for auto scenario mode', () => {
    expect(shouldRunBuiltInScenarioPack({
      scenarioSlug: 'auto',
      appProfile: profile('planning_control_panel')
    })).toBe(false)
  })

  it('keeps explicit named scenarios available', () => {
    expect(shouldRunBuiltInScenarioPack({
      scenarioSlug: 'generate-plan-bundle',
      appProfile: profile('crud_app')
    })).toBe(true)
  })

  it('skips built-in consistency prompts for non-planning apps by default', () => {
    expect(shouldRunPromptConsistency({
      consistencyCheckEnabled: true,
      scenarioSlug: 'all',
      promptsSource: 'built-in',
      appProfile: profile('crud_app')
    })).toBe(false)
  })

  it('allows custom consistency prompt files for non-planning apps', () => {
    expect(shouldRunPromptConsistency({
      consistencyCheckEnabled: true,
      scenarioSlug: 'all',
      promptsSource: '/tmp/prompts.json',
      appProfile: profile('crud_app')
    })).toBe(true)
  })
})

function profile(profile_type: AppProfile['profile_type']): AppProfile {
  return {
    profile_type,
    confidence: 'medium',
    evidence: [],
    core_entities: [],
    primary_user_jobs: [],
    expected_navigation_patterns: [],
    expected_workflows: [],
    expected_output_surfaces: []
  }
}
