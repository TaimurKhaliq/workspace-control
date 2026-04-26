import { describe, expect, it } from 'vitest'
import { hashState } from '../src/graph/stateHash.js'

describe('hashState', () => {
  it('is stable across object key ordering', () => {
    expect(hashState({ b: 1, a: 2 })).toBe(hashState({ a: 2, b: 1 }))
  })

  it('changes when state changes', () => {
    expect(hashState({ url: '/a' })).not.toBe(hashState({ url: '/b' }))
  })
})
