import { describe, expect, it } from 'vitest'
import { classifyActionSafety } from '../src/runtime/safeActions.js'

describe('classifyActionSafety', () => {
  it('allows navigation and tabs', () => {
    expect(classifyActionSafety('Settings', 'link').safe).toBe(true)
    expect(classifyActionSafety('Overview', 'tab').safe).toBe(true)
  })

  it('blocks destructive labels', () => {
    expect(classifyActionSafety('Delete account', 'button').safe).toBe(false)
    expect(classifyActionSafety('Reset workspace', 'button').safe).toBe(false)
  })
})
