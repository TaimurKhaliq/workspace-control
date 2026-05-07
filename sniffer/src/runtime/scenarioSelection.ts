import type { AppProfile, ScenarioSlug } from '../types.js'

export function shouldRunBuiltInScenarioPack(input: {
  scenarioSlug?: ScenarioSlug
  appProfile: AppProfile
}): boolean {
  if (!input.scenarioSlug) return false
  if (input.scenarioSlug === 'auto') return false
  if (input.scenarioSlug === 'prompt-output-consistency') return false
  if (input.scenarioSlug === 'all') return input.appProfile.profile_type === 'planning_control_panel'
  return true
}

export function shouldRunPromptConsistency(input: {
  consistencyCheckEnabled: boolean
  scenarioSlug?: ScenarioSlug
  promptsSource?: string
  appProfile: AppProfile
}): boolean {
  if (!input.consistencyCheckEnabled) return false
  if (input.scenarioSlug === 'prompt-output-consistency') return true
  if (input.promptsSource && input.promptsSource !== 'built-in') return true
  return input.appProfile.profile_type === 'planning_control_panel'
}
