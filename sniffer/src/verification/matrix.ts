import { spawn, type ChildProcess } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { access, cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { chromium } from 'playwright'
import type { SnifferReport } from '../types.js'
import { writeJson } from '../reporting/json.js'
import { AD_HOC_PROJECT_ID, projectLatestReportDir, reportsRoot, safeProjectId } from '../reporting/paths.js'

export interface MatrixTarget {
  id: string
  name: string
  repoPath: string
  appUrl: string
  expectedFramework: string
  expectedProfiles: string[]
  expectedMinRuntimeWorkflows: number
  expectedMinGeneratedScenarios: number
  expectedMinExecutedScenarioRuns: number
  kind: 'external' | 'fixture' | 'dogfood'
}

export interface MatrixCriterion {
  name: string
  passed: boolean
  expected: string
  actual: string | number | boolean
}

export interface MatrixTargetResult {
  id: string
  name: string
  status: 'passed' | 'failed' | 'skipped'
  repoPath: string
  appUrl: string
  expectedFramework: string
  expectedProfiles: string[]
  framework?: string
  profile?: string
  sourceWorkflows: number
  runtimeWorkflows: number
  generatedScenarios: number
  scenarioRuns: number
  reportPath?: string
  reportMarkdownPath?: string
  screenshotsDir?: string
  criteria: MatrixCriterion[]
  command?: string
  durationMs?: number
  skipReason?: string
  error?: string
  stdout?: string
  stderr?: string
}

export interface DogfoodResult {
  status: 'passed' | 'failed' | 'skipped'
  appUrl?: string
  checks: MatrixCriterion[]
  error?: string
  skipReason?: string
}

export interface MatrixResult {
  generatedAt: string
  status: 'passed' | 'failed'
  targets: MatrixTargetResult[]
  dogfood: DogfoodResult
  summary: {
    total: number
    passed: number
    failed: number
    skipped: number
  }
  reportJsonPath: string
  reportMarkdownPath: string
}

interface ServedApp {
  url: string
  close: () => Promise<void>
}

interface SpawnResult {
  code: number | null
  stdout: string
  stderr: string
  command: string[]
  durationMs: number
}

export async function runVerificationMatrix(baseDir = process.cwd()): Promise<MatrixResult> {
  const matrixDir = path.join(reportsRoot(baseDir), 'matrix')
  const latestJson = path.join(matrixDir, 'latest_matrix.json')
  const latestMarkdown = path.join(matrixDir, 'latest_matrix.md')
  await mkdir(matrixDir, { recursive: true })

  const cleanup: Array<() => Promise<void>> = []
  const targets = await buildMatrixTargets(baseDir, cleanup)
  const results: MatrixTargetResult[] = []
  let dogfood: DogfoodResult = { status: 'skipped', checks: [], skipReason: 'Sniffer dashboard UI was not available.' }

  try {
    for (const target of targets) {
      results.push(await runMatrixTarget(baseDir, target))
    }
    dogfood = await runDogfoodChecks(baseDir, targets.find((target) => target.kind === 'dogfood')?.appUrl)
  } finally {
    for (const close of cleanup.reverse()) {
      await close().catch(() => undefined)
    }
  }

  const summary = {
    total: results.length,
    passed: results.filter((result) => result.status === 'passed').length,
    failed: results.filter((result) => result.status === 'failed').length,
    skipped: results.filter((result) => result.status === 'skipped').length
  }
  const matrix: MatrixResult = {
    generatedAt: new Date().toISOString(),
    status: summary.failed === 0 && dogfood.status !== 'failed' ? 'passed' : 'failed',
    targets: results,
    dogfood,
    summary,
    reportJsonPath: latestJson,
    reportMarkdownPath: latestMarkdown
  }
  await writeJson(latestJson, matrix)
  await writeFile(latestMarkdown, renderMatrixMarkdown(matrix), 'utf8')
  return matrix
}

async function buildMatrixTargets(baseDir: string, cleanup: Array<() => Promise<void>>): Promise<MatrixTarget[]> {
  const fixtureReactRepo = path.join(baseDir, 'fixtures', 'tiny-react')
  const fixtureHtmlRepo = path.join(baseDir, 'fixtures', 'static-html')
  const tinyReact = await startStaticServer(fixtureReactRepo)
  const staticHtml = await startStaticServer(fixtureHtmlRepo)
  cleanup.push(tinyReact.close, staticHtml.close)

  const targets: MatrixTarget[] = [
    {
      id: 'tiny-react-fixture',
      name: 'Tiny React Fixture',
      repoPath: fixtureReactRepo,
      appUrl: tinyReact.url,
      expectedFramework: 'react',
      expectedProfiles: ['crud_app', 'dashboard_app'],
      expectedMinRuntimeWorkflows: 2,
      expectedMinGeneratedScenarios: 4,
      expectedMinExecutedScenarioRuns: 4,
      kind: 'fixture'
    },
    {
      id: 'static-html-fixture',
      name: 'Static HTML Fixture',
      repoPath: fixtureHtmlRepo,
      appUrl: staticHtml.url,
      expectedFramework: 'unknown',
      expectedProfiles: ['crud_app', 'dashboard_app', 'unknown'],
      expectedMinRuntimeWorkflows: 2,
      expectedMinGeneratedScenarios: 4,
      expectedMinExecutedScenarioRuns: 4,
      kind: 'fixture'
    }
  ]

  const workspaceControl = {
    id: 'workspace-control-web',
    name: 'Workspace Control Web',
    repoPath: path.resolve(baseDir, '..', 'web'),
    appUrl: process.env.SNIFFER_MATRIX_WORKSPACE_URL ?? 'http://127.0.0.1:5173',
    expectedFramework: 'react',
    expectedProfiles: ['planning_control_panel'],
    expectedMinRuntimeWorkflows: 2,
    expectedMinGeneratedScenarios: 5,
    expectedMinExecutedScenarioRuns: 5,
    kind: 'external' as const
  }
  targets.unshift(workspaceControl)

  const angularRepo = process.env.SNIFFER_MATRIX_ANGULAR_REPO ?? '/Users/taimurkhaliq/ai_projects/angular-realworld-example-app'
  targets.push({
    id: 'sample-angular-app',
    name: 'Sample Angular App',
    repoPath: angularRepo,
    appUrl: process.env.SNIFFER_MATRIX_ANGULAR_URL ?? 'http://localhost:4200',
    expectedFramework: 'angular',
    expectedProfiles: ['crud_app', 'auth_app', 'docs_site'],
    expectedMinRuntimeWorkflows: 2,
    expectedMinGeneratedScenarios: 5,
    expectedMinExecutedScenarioRuns: 5,
    kind: 'external'
  })

  const dashboard = await startSnifferDashboard(baseDir)
  if (dashboard) {
    cleanup.push(dashboard.close)
    targets.push({
      id: 'sniffer-dashboard-ui',
      name: 'Sniffer Dashboard UI',
      repoPath: path.join(baseDir, 'ui'),
      appUrl: dashboard.url,
      expectedFramework: 'react',
      expectedProfiles: ['dashboard_app', 'admin_console', 'planning_control_panel', 'unknown'],
      expectedMinRuntimeWorkflows: 1,
      expectedMinGeneratedScenarios: 4,
      expectedMinExecutedScenarioRuns: 4,
      kind: 'dogfood'
    })
  }

  return targets
}

async function runMatrixTarget(baseDir: string, target: MatrixTarget): Promise<MatrixTargetResult> {
  const repoExists = await exists(target.repoPath)
  const urlReachable = await isUrlReachable(target.appUrl)
  if (!repoExists || !urlReachable) {
    return {
      id: target.id,
      name: target.name,
      status: 'skipped',
      repoPath: target.repoPath,
      appUrl: target.appUrl,
      expectedFramework: target.expectedFramework,
      expectedProfiles: target.expectedProfiles,
      sourceWorkflows: 0,
      runtimeWorkflows: 0,
      generatedScenarios: 0,
      scenarioRuns: 0,
      criteria: [],
      skipReason: !repoExists ? `Repo path not found: ${target.repoPath}` : `App URL not reachable: ${target.appUrl}`
    }
  }

  const started = Date.now()
  const args = [
    'src/cli/index.ts',
    'audit',
    '--repo', target.repoPath,
    '--url', target.appUrl,
    '--discovery-mode', 'hybrid',
    '--scenario', 'all',
    '--execute-generated-scenarios',
    '--critic-mode', 'deterministic',
    '--ux-critic', 'deterministic',
    '--intent-mode', 'deterministic',
    '--provider', 'auto',
    '--max-iterations', '0',
    '--max-actions', target.kind === 'external' ? '14' : '10',
    '--max-states', target.kind === 'external' ? '10' : '8',
    '--max-duplicate-actions', '1'
  ]
  const run = await spawnProcess(tsxBin(baseDir), args, baseDir)
  if (run.code !== 0) {
    return {
      id: target.id,
      name: target.name,
      status: 'failed',
      repoPath: target.repoPath,
      appUrl: target.appUrl,
      expectedFramework: target.expectedFramework,
      expectedProfiles: target.expectedProfiles,
      sourceWorkflows: 0,
      runtimeWorkflows: 0,
      generatedScenarios: 0,
      scenarioRuns: 0,
      criteria: [criterion('audit command exits cleanly', false, 'exit code 0', String(run.code))],
      command: run.command.join(' '),
      durationMs: Date.now() - started,
      stdout: run.stdout,
      stderr: run.stderr,
      error: run.stderr || run.stdout
    }
  }

  const adHocDir = projectLatestReportDir(AD_HOC_PROJECT_ID, baseDir)
  const targetDir = path.join(reportsRoot(baseDir), 'matrix', 'targets', safeProjectId(target.id))
  await rm(targetDir, { recursive: true, force: true })
  await mkdir(path.dirname(targetDir), { recursive: true })
  await cp(adHocDir, targetDir, { recursive: true, force: true })

  const reportPath = path.join(targetDir, 'latest_report.json')
  const markdownPath = path.join(targetDir, 'latest_report.md')
  const report = JSON.parse(await readFile(reportPath, 'utf8')) as SnifferReport
  const markdown = await readFile(markdownPath, 'utf8').catch(() => '')
  const evaluated = evaluateMatrixTarget({
    target,
    report,
    reportPath,
    markdown,
    screenshotsDirExists: await exists(path.join(targetDir, 'screenshots'))
  })
  return {
    ...evaluated,
    reportMarkdownPath: markdownPath,
    screenshotsDir: path.join(targetDir, 'screenshots'),
    command: run.command.join(' '),
    durationMs: Date.now() - started,
    stdout: run.stdout,
    stderr: run.stderr
  }
}

export function evaluateMatrixTarget(input: {
  target: MatrixTarget
  report: SnifferReport
  reportPath: string
  markdown: string
  screenshotsDirExists: boolean
}): MatrixTargetResult {
  const sourceWorkflows = input.report.sourceGraph.sourceWorkflows.length
  const runtimeWorkflows = input.report.runtimeAppModel?.workflows.length ?? 0
  const generatedScenarios = input.report.generatedScenarios?.length ?? 0
  const scenarioRuns = input.report.scenarioRuns?.length ?? 0
  const framework = input.report.sourceGraph.framework
  const profile = input.report.appProfile?.profile_type ?? 'unknown'
  const criteria = [
    criterion('framework detected or unknown handled', framework === input.target.expectedFramework || input.target.expectedFramework === 'unknown' && framework === 'unknown', input.target.expectedFramework, framework),
    criterion('expected profile family', input.target.expectedProfiles.includes(profile), input.target.expectedProfiles.join(' or '), profile),
    criterion('source + runtime workflows are nonzero', sourceWorkflows + runtimeWorkflows > 0, '> 0', sourceWorkflows + runtimeWorkflows),
    criterion('minimum runtime workflows', runtimeWorkflows >= input.target.expectedMinRuntimeWorkflows, `>= ${input.target.expectedMinRuntimeWorkflows}`, runtimeWorkflows),
    criterion('generated scenarios exist', generatedScenarios >= input.target.expectedMinGeneratedScenarios, `>= ${input.target.expectedMinGeneratedScenarios}`, generatedScenarios),
    criterion('executed scenario runs exist', scenarioRuns >= input.target.expectedMinExecutedScenarioRuns, `>= ${input.target.expectedMinExecutedScenarioRuns}`, scenarioRuns),
    criterion('report file exists', Boolean(input.reportPath), 'true', Boolean(input.reportPath)),
    criterion('screenshots directory exists', input.screenshotsDirExists, 'true', input.screenshotsDirExists),
    criterion('report avoids misleading no-workflows message', !(runtimeWorkflows > 0 && /No workflows/i.test(input.markdown)), 'no "No workflows" when runtime workflows exist', runtimeWorkflows > 0 ? /No workflows/i.test(input.markdown) : false)
  ]
  return {
    id: input.target.id,
    name: input.target.name,
    status: criteria.every((item) => item.passed) ? 'passed' : 'failed',
    repoPath: input.target.repoPath,
    appUrl: input.target.appUrl,
    expectedFramework: input.target.expectedFramework,
    expectedProfiles: input.target.expectedProfiles,
    framework,
    profile,
    sourceWorkflows,
    runtimeWorkflows,
    generatedScenarios,
    scenarioRuns,
    reportPath: input.reportPath,
    criteria
  }
}

async function runDogfoodChecks(baseDir: string, appUrl?: string): Promise<DogfoodResult> {
  if (!appUrl) {
    return { status: 'skipped', checks: [], skipReason: 'Dashboard server was not started because ui/dist is missing.' }
  }
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const checks: MatrixCriterion[] = []
  try {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => undefined)
    checks.push(await visibleCheck(page, 'dashboard loads', /Sniffer Dashboard/i))
    checks.push(await locatorVisibleCheck(page, 'project selector visible', () => page.getByLabel(/selected sniffer project/i)))
    checks.push(await visibleCheck(page, 'run launcher visible', /Run Audit/i))
    checks.push(await visibleCheck(page, 'report navigation visible', /Run Timeline/i))
    checks.push(await clickNavCheck(page, 'timeline page visible', 'Run Timeline', /Run Timeline/i))
    checks.push(await clickNavCheck(page, 'crawl path page visible', 'Crawl Path', /Crawl Path/i))
    checks.push(await clickNavCheck(page, 'graph page visible', 'Graph Explorer', /Graph Explorer|Graph filters/i))
    checks.push(await clickNavCheck(page, 'screenshots page visible', 'Screenshots', /Screenshots|Evidence gallery/i))
    checks.push(await clickNavCheck(page, 'fix packets page visible', 'Fix Packets', /Fix Packets/i))
    return {
      status: checks.every((check) => check.passed) ? 'passed' : 'failed',
      appUrl,
      checks
    }
  } catch (error) {
    return {
      status: 'failed',
      appUrl,
      checks,
      error: error instanceof Error ? error.message : String(error)
    }
  } finally {
    await browser.close()
  }
}

async function visibleCheck(page: import('playwright').Page, name: string, text: RegExp): Promise<MatrixCriterion> {
  const visible = await page.getByText(text).first().isVisible({ timeout: 3_000 }).catch(() => false)
  return criterion(name, visible, 'visible', visible)
}

async function locatorVisibleCheck(page: import('playwright').Page, name: string, locator: () => import('playwright').Locator): Promise<MatrixCriterion> {
  const visible = await locator().first().isVisible({ timeout: 3_000 }).catch(() => false)
  return criterion(name, visible, 'visible', visible)
}

async function clickNavCheck(page: import('playwright').Page, name: string, buttonName: string, expectedText: RegExp): Promise<MatrixCriterion> {
  const button = page.getByRole('button', { name: buttonName })
  await button.click({ timeout: 3_000 }).catch(() => undefined)
  const visible = await page.getByText(expectedText).first().isVisible({ timeout: 3_000 }).catch(() => false)
  return criterion(name, visible, 'visible after nav click', visible)
}

function criterion(name: string, passed: boolean, expected: string, actual: string | number | boolean): MatrixCriterion {
  return { name, passed, expected, actual }
}

async function startStaticServer(root: string): Promise<ServedApp> {
  const server = createServer((req, res) => {
    const parsed = new URL(req.url ?? '/', 'http://127.0.0.1')
    const candidate = parsed.pathname === '/' ? 'index.html' : parsed.pathname.slice(1)
    const file = safeJoin(root, candidate)
    void (async () => {
      const chosen = file && await exists(file) && (await stat(file)).isFile()
        ? file
        : path.join(root, 'index.html')
      if (!await exists(chosen)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Not found')
        return
      }
      res.writeHead(200, { 'Content-Type': contentType(chosen) })
      createReadStream(chosen).pipe(res)
    })().catch((error) => {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(error instanceof Error ? error.message : String(error))
    })
  })
  await listen(server)
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Fixture server did not expose a port')
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server)
  }
}

async function startSnifferDashboard(baseDir: string): Promise<ServedApp | undefined> {
  const distIndex = path.join(baseDir, 'ui', 'dist', 'index.html')
  if (!await exists(distIndex)) return undefined
  const port = await freePort()
  const child = spawn(tsxBin(baseDir), ['server/uiServer.ts'], {
    cwd: baseDir,
    env: { ...process.env, SNIFFER_UI_PORT: String(port), SNIFFER_UI_HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const url = `http://127.0.0.1:${port}`
  const ready = await waitForUrl(url, 12_000)
  if (!ready) {
    child.kill()
    return undefined
  }
  return {
    url,
    close: () => closeChild(child)
  }
}

async function spawnProcess(command: string, args: string[], cwd: string): Promise<SpawnResult> {
  const started = Date.now()
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', (error) => {
      stderr += error.message
      resolve({ code: 1, stdout, stderr, command: [command, ...args], durationMs: Date.now() - started })
    })
    child.on('close', (code) => {
      resolve({ code, stdout, stderr, command: [command, ...args], durationMs: Date.now() - started })
    })
  })
}

function renderMatrixMarkdown(matrix: MatrixResult): string {
  return [
    '# Sniffer Verification Matrix',
    '',
    `Generated: ${matrix.generatedAt}`,
    '',
    `Overall status: **${matrix.status.toUpperCase()}**`,
    '',
    `Targets: ${matrix.summary.passed} passed, ${matrix.summary.failed} failed, ${matrix.summary.skipped} skipped.`,
    '',
    '## Targets',
    '',
    ...matrix.targets.flatMap((target) => [
      `### ${statusIcon(target.status)} ${target.name}`,
      '',
      `- ID: ${target.id}`,
      `- Status: ${target.status}`,
      `- Repo: ${target.repoPath}`,
      `- URL: ${target.appUrl}`,
      `- Framework: ${target.framework ?? 'n/a'} (expected ${target.expectedFramework})`,
      `- Profile: ${target.profile ?? 'n/a'} (expected ${target.expectedProfiles.join(' or ')})`,
      `- Source workflows: ${target.sourceWorkflows}`,
      `- Runtime workflows: ${target.runtimeWorkflows}`,
      `- Generated scenarios: ${target.generatedScenarios}`,
      `- Executed scenario runs: ${target.scenarioRuns}`,
      target.reportPath ? `- Report: ${target.reportPath}` : undefined,
      target.skipReason ? `- Skip reason: ${target.skipReason}` : undefined,
      target.error ? `- Error: ${target.error}` : undefined,
      '',
      '| Criterion | Expected | Actual | Status |',
      '| --- | --- | --- | --- |',
      ...(target.criteria.length
        ? target.criteria.map((item) => `| ${item.name} | ${item.expected} | ${String(item.actual)} | ${item.passed ? 'PASS' : 'FAIL'} |`)
        : ['| n/a | n/a | n/a | n/a |']),
      ''
    ].filter((line): line is string => Boolean(line))),
    '## Dogfood Dashboard',
    '',
    `Status: ${matrix.dogfood.status}`,
    matrix.dogfood.appUrl ? `URL: ${matrix.dogfood.appUrl}` : undefined,
    matrix.dogfood.skipReason ? `Skip reason: ${matrix.dogfood.skipReason}` : undefined,
    matrix.dogfood.error ? `Error: ${matrix.dogfood.error}` : undefined,
    '',
    '| Check | Expected | Actual | Status |',
    '| --- | --- | --- | --- |',
    ...(matrix.dogfood.checks.length
      ? matrix.dogfood.checks.map((item) => `| ${item.name} | ${item.expected} | ${String(item.actual)} | ${item.passed ? 'PASS' : 'FAIL'} |`)
      : ['| n/a | n/a | n/a | n/a |']),
    ''
  ].filter((line): line is string => Boolean(line !== undefined)).join('\n')
}

function statusIcon(status: 'passed' | 'failed' | 'skipped'): string {
  if (status === 'passed') return 'PASS'
  if (status === 'failed') return 'FAIL'
  return 'SKIP'
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

async function closeChild(child: ChildProcess): Promise<void> {
  if (child.killed) return
  child.kill()
  await new Promise<void>((resolve) => {
    child.once('close', () => resolve())
    setTimeout(resolve, 1_000)
  })
}

async function freePort(): Promise<number> {
  const server = net.createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  if (!address || typeof address === 'string') throw new Error('Could not find a free port')
  return address.port
}

async function isUrlReachable(url: string): Promise<boolean> {
  return waitForUrl(url, 2_500)
}

async function waitForUrl(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ok = await fetch(url, { method: 'GET' }).then((response) => response.status < 500).catch(() => false)
    if (ok) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(() => true).catch(() => false)
}

function safeJoin(root: string, relative: string): string | undefined {
  const file = path.resolve(root, relative)
  const resolvedRoot = path.resolve(root)
  return file === resolvedRoot || file.startsWith(`${resolvedRoot}${path.sep}`) ? file : undefined
}

function contentType(file: string): string {
  const ext = path.extname(file).toLowerCase()
  if (ext === '.html') return 'text/html; charset=utf-8'
  if (ext === '.css') return 'text/css; charset=utf-8'
  if (ext === '.js') return 'text/javascript; charset=utf-8'
  if (ext === '.json') return 'application/json; charset=utf-8'
  return 'text/plain; charset=utf-8'
}

function tsxBin(baseDir: string): string {
  return process.platform === 'win32'
    ? path.join(baseDir, 'node_modules', '.bin', 'tsx.cmd')
    : path.join(baseDir, 'node_modules', '.bin', 'tsx')
}
