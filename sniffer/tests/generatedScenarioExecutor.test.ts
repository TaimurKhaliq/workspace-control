import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { executeGeneratedScenarios } from '../src/runtime/generatedScenarioExecutor.js'
import type { GeneratedScenario } from '../src/types.js'

let server: Server
let url = ''

beforeEach(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html')
    if (req.url === '/login') {
      res.end('<h1>Sign in</h1><form><label>Email <input name="email"></label><label>Password <input type="password" name="password"></label><button>Sign in</button></form>')
      return
    }
    res.end('<h1>Home</h1><nav><a href="/login">Sign in</a></nav><main><article>Article feed item</article></main>')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('server did not bind')
  url = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('generated scenario executor', () => {
  it('executes safe navigation and list scenarios without submitting credentials', async () => {
    const dir = path.join(os.tmpdir(), `sniffer-generated-scenarios-${randomUUID()}`)
    await mkdir(dir, { recursive: true })
    const runs = await executeGeneratedScenarios({
      url,
      reportDir: dir,
      scenarios: [
        scenario('navigation-smoke', 'Navigation smoke test'),
        scenario('table-list-scan', 'Table/list scan')
      ]
    })

    expect(runs.map((run) => run.slug)).toEqual(['navigation-smoke', 'table-list-scan'])
    expect(runs[0].status).toBe('passed')
    expect(runs[1].status).toBe('passed')
    expect(runs.flatMap((run) => run.stepsAttempted)).toContain('Open primary navigation items')
    await rm(dir, { recursive: true, force: true })
  })
})

function scenario(id: string, name: string): GeneratedScenario {
  return {
    id,
    name,
    profileApplicability: ['unknown'],
    prerequisites: [],
    steps: [{ name: id === 'navigation-smoke' ? 'Open primary navigation items' : 'Find list/table/card content', action: 'inspect', expectedControls: [], safe: true }],
    expectedControls: [],
    expectedOutcomes: [],
    destructiveRisk: 'none',
    confidence: 'medium',
    evidence: []
  }
}
