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
    if (req.url === '/buttons') {
      res.end(`
        <h1>Sniffer Dashboard</h1>
        <nav aria-label="Dashboard navigation">
          <button onclick="document.querySelector('main').textContent='Summary view'">Summary</button>
          <button onclick="document.querySelector('main').textContent='Projects view'">Projects</button>
          <button onclick="document.querySelector('main').textContent='Run Timeline view'">Run Timeline</button>
          <button onclick="document.querySelector('main').textContent='Issues view'">Issues</button>
          <button onclick="document.querySelector('main').innerHTML='<h2>Raw JSON</h2><p>Latest report payload</p><button>Copy JSON</button><pre>{&quot;ok&quot;:true}</pre>'">Raw JSON</button>
        </nav>
        <main>Initial view</main>
      `)
      return
    }
    if (req.url === '/plan-runs') {
      res.end(`
        <main>
          <h1>Plan Runs</h1>
          <article data-testid="plan-run-item">
            <h2 data-testid="plan-run-prompt">Add OwnersPage (no actions yet)</h2>
            <span data-testid="plan-run-target">petclinic-react</span>
            <time data-testid="plan-run-created-at">May 7, 1:45 PM</time>
            <span data-testid="plan-run-status">completed</span>
            <span data-testid="plan-run-semantic-chip">Semantic Off</span>
            <button data-testid="reopen-plan-run-button" onclick="document.querySelector('main').setAttribute('data-reopened', 'true')">Reopen</button>
          </article>
        </main>
      `)
      return
    }
    if (req.url === '/empty-plan-runs') {
      res.end('<main><h1>Plan Runs</h1><p>Plan Runs 0 runs</p><p>No plan runs yet</p></main>')
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

  it('treats sidebar buttons as safe navigation controls', async () => {
    const dir = path.join(os.tmpdir(), `sniffer-button-navigation-${randomUUID()}`)
    await mkdir(dir, { recursive: true })
    const runs = await executeGeneratedScenarios({
      url: `${url}/buttons`,
      reportDir: dir,
      scenarios: [scenario('navigation-smoke', 'Navigation smoke test')]
    })

    expect(runs[0].status).toBe('passed')
    expect(runs[0].assertions[0].evidence.join('\n')).toContain('Projects')
    await rm(dir, { recursive: true, force: true })
  })

  it('passes targeted Raw JSON copy scenario when Copy JSON exists', async () => {
    const dir = path.join(os.tmpdir(), `sniffer-raw-json-copy-${randomUUID()}`)
    await mkdir(dir, { recursive: true })
    const runs = await executeGeneratedScenarios({
      url: `${url}/buttons`,
      reportDir: dir,
      scenarios: [scenario('sniffer-raw-json-copy', 'Raw JSON copy action')]
    })

    expect(runs[0].status).toBe('passed')
    expect(runs[0].assertions[0].evidence).toEqual(expect.arrayContaining(['copy_json_visible:true']))
    await rm(dir, { recursive: true, force: true })
  })

  it('verifies plan run history items and reopen buttons', async () => {
    const dir = path.join(os.tmpdir(), `sniffer-plan-run-history-${randomUUID()}`)
    await mkdir(dir, { recursive: true })
    const runs = await executeGeneratedScenarios({
      url: `${url}/plan-runs`,
      reportDir: dir,
      scenarios: [scenario('plan-run-history', 'Browse/reopen previous plan runs')]
    })

    expect(runs[0].status).toBe('passed')
    expect(runs[0].assertions[0].evidence).toEqual(expect.arrayContaining([
      'plan_run_items:1',
      'reopen_buttons:1'
    ]))
    await rm(dir, { recursive: true, force: true })
  })

  it('blocks plan run history scenario when no plan runs are available', async () => {
    const dir = path.join(os.tmpdir(), `sniffer-empty-plan-runs-${randomUUID()}`)
    await mkdir(dir, { recursive: true })
    const runs = await executeGeneratedScenarios({
      url: `${url}/empty-plan-runs`,
      reportDir: dir,
      scenarios: [scenario('plan-run-history', 'Browse/reopen previous plan runs')]
    })

    expect(runs[0].status).toBe('blocked')
    expect(runs[0].assertions[0].evidence).toEqual(expect.arrayContaining([
      'no plan runs available',
      'suggested_next_safe_action: generate_plan_bundle_with_sample_prompt'
    ]))
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
