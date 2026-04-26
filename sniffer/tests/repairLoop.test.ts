import { describe, expect, it } from 'vitest'
import { runRepairLoop } from '../src/repair/repairLoop.js'

describe('runRepairLoop', () => {
  it('stops immediately when max iterations is zero', async () => {
    const result = await runRepairLoop({
      repo: '/tmp/repo',
      url: 'http://localhost:5173',
      agentName: 'mock',
      maxIterations: 0
    })

    expect(result.iterations).toBe(0)
    expect(result.fixed).toEqual([])
  })
})
