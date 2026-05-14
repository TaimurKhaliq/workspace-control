import { createServer, type Server } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { crawlApp } from '../src/runtime/crawler.js'

let server: Server | undefined

afterEach(async () => {
  if (!server) return
  await new Promise<void>((resolve) => server?.close(() => resolve()))
  server = undefined
})

describe('deep/live runtime crawler', () => {
  it('explores multiple branches with the deep frontier', async () => {
    const url = await serve(`
      <main>
        <nav><button>Overview</button><button onclick="show('Details panel')">Details</button><button onclick="show('Settings panel')">Settings</button></nav>
        <section id="panel">Overview panel</section>
      </main>
      <script>function show(text){document.getElementById('panel').textContent=text}</script>
    `)
    const graph = await crawlApp(url, {
      reportDir: await tempReportDir(),
      crawlMode: 'deep',
      maxActions: 6,
      maxStates: 6,
      maxDepth: 2
    })

    expect(graph.crawlMode).toBe('deep')
    expect(graph.runtimeGraphCoverage?.edgesExplored).toBeGreaterThanOrEqual(2)
    expect(graph.actions.map((action) => action.label)).toEqual(expect.arrayContaining(['Details', 'Settings']))
    expect(graph.runtimeGraph?.unresolvedFrontier).toBeDefined()
  }, 30_000)

  it('captures async output during live observation windows', async () => {
    const url = await serve(`
      <main>
        <button onclick="run()">Generate output</button>
        <p role="status" id="status">Idle</p>
        <pre id="output"></pre>
      </main>
      <script>
        function run(){
          document.getElementById('status').textContent='Running';
          setTimeout(() => {
            document.getElementById('status').textContent='Succeeded';
            document.getElementById('output').textContent='Generated artifact ready';
          }, 700);
        }
      </script>
    `)
    const graph = await crawlApp(url, {
      reportDir: await tempReportDir(),
      crawlMode: 'live',
      maxActions: 3,
      maxStates: 4,
      maxDepth: 1,
      liveObserveMs: 2500,
      livePollMs: 200
    })

    const kinds = graph.runtimeObservations?.map((observation) => observation.kind) ?? []
    expect(graph.runtimeGraphCoverage?.liveObservationWindows).toBeGreaterThan(0)
    expect(kinds).toEqual(expect.arrayContaining(['status_change']))
    expect(graph.runtimeObservations?.some((observation) => /Generated artifact|Succeeded|Running/.test(observation.text))).toBe(true)
  }, 30_000)

  it('skips long-running actions in safe mode and executes them in live mode when allowed', async () => {
    const url = await serve(`
      <main>
        <button onclick="document.getElementById('status').textContent='Audit succeeded'">Run Audit</button>
        <p role="status" id="status">Idle</p>
      </main>
    `)
    const safe = await crawlApp(url, {
      reportDir: await tempReportDir(),
      crawlMode: 'safe',
      maxActions: 2,
      maxStates: 2
    })
    const live = await crawlApp(url, {
      reportDir: await tempReportDir(),
      crawlMode: 'live',
      allowLongRunningActions: true,
      maxActions: 2,
      maxStates: 3,
      liveObserveMs: 1200,
      livePollMs: 200
    })

    expect(safe.unvisitedSafeActions?.some((action) => action.label === 'Run Audit' && /long-running/.test(action.reason))).toBe(true)
    expect(live.actions.some((action) => action.label === 'Run Audit' && !action.skipped)).toBe(true)
    expect(live.runtimeGraphCoverage?.longRunningActionsExecuted).toBeGreaterThanOrEqual(1)
  }, 45_000)
})

async function serve(body: string): Promise<string> {
  server = createServer((_, response) => {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end(`<!doctype html><html><head><title>Fixture</title></head><body>${body}</body></html>`)
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No server port')
  return `http://127.0.0.1:${address.port}/`
}

async function tempReportDir(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), 'sniffer-deep-live-'))
}
