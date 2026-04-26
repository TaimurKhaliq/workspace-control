import { describe, expect, it } from 'vitest'
import { resolveRepairPathPolicy } from '../src/repair/pathPolicy.js'

describe('resolveRepairPathPolicy', () => {
  it('infers project repair root from web repo with backend suspects', () => {
    const policy = resolveRepairPathPolicy({
      repoPath: '/Users/example/workspace-control/web',
      suspectedFiles: ['../server/app.py', '../server/routes/learning.py', 'src/api.ts'],
      reportDir: '/Users/example/workspace-control/sniffer/reports/sniffer/latest'
    })

    expect(policy.repairRoot).toBe('/Users/example/workspace-control')
    expect(policy.allowedPaths).toEqual(expect.arrayContaining([
      'server/',
      'web/src/',
      'sniffer/reports/sniffer/latest/repair_attempts/'
    ]))
    expect(policy.normalizedSuspectedFiles).toEqual(expect.arrayContaining([
      'server/app.py',
      'server/routes/learning.py',
      'web/src/api.ts'
    ]))
  })
})
