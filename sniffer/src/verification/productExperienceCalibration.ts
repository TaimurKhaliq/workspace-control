import { createServer, type Server } from 'node:http'
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { discoverSource } from '../discovery/sourceDiscovery.js'
import { buildDeterministicIntent } from '../heuristics/intent.js'
import { synthesizeProductIntent } from '../heuristics/productIntent.js'
import { inferAppProfile, augmentAppProfileWithProductIntent } from '../profile/appProfile.js'
import { inspectUrl } from '../runtime/domSnapshot.js'
import { buildRuntimeAppModel } from '../runtime/runtimeAppModel.js'
import { analyzeRuntimeDomQuality } from '../heuristics/runtimeDomQuality.js'
import { runProductExperienceCritic } from '../critic/productExperienceCritic.js'
import { writeJson } from '../reporting/json.js'
import type { LlmProvider } from '../llm/provider.js'
import type { AppSubtype, CrawlGraph, CrawlState, Issue, ProductExperienceCriticMode, ProductExperienceResult, RuntimeDomSnapshot, VisibleElement } from '../types.js'

type ProductExperienceCalibrationProvider = Pick<LlmProvider, 'name'> & Partial<Pick<LlmProvider, 'critiqueProductExperience' | 'isConfigured' | 'supportsVision' | 'metadata'>>

export interface ProductExperienceCalibrationExpectedFinding {
  type: string
  titleIncludes: string
}

export interface ProductExperienceCalibrationFixture {
  id: string
  name: string
  root: string
  hash: string
  appSubtype?: AppSubtype
  expectedFindings: ProductExperienceCalibrationExpectedFinding[]
}

export interface ProductExperienceCalibrationDetectedFinding {
  source: 'product_experience' | 'runtime_dom_quality'
  type: string
  title: string
  screen?: string
  severity?: string
  evidence: string[]
}

export interface ProductExperienceCalibrationTargetResult {
  fixture: string
  name: string
  url: string
  status: 'passed' | 'failed'
  criticMode: ProductExperienceCriticMode
  llmUsed: boolean
  expectedFindings: ProductExperienceCalibrationExpectedFinding[]
  detectedFindings: ProductExperienceCalibrationDetectedFinding[]
  missingFindings: ProductExperienceCalibrationExpectedFinding[]
  unexpectedFindings: ProductExperienceCalibrationDetectedFinding[]
  screenshotPath?: string
  productExperienceStatus: ProductExperienceResult['status']
}

export interface ProductExperienceCalibrationResult {
  generatedAt: string
  status: 'passed' | 'failed'
  criticMode: ProductExperienceCriticMode
  llmUsed: boolean
  targets: ProductExperienceCalibrationTargetResult[]
  reportJsonPath: string
  reportMarkdownPath: string
}

export const BAD_PRODUCT_EXPERIENCE_FIXTURES: ProductExperienceCalibrationFixture[] = [
  fixture('missing-run-context', 'Missing run context', '#timeline', undefined, [
    { type: 'context_gap', titleIncludes: 'Run Timeline lacks clear run/report context' }
  ]),
  fixture('missing-copy-action', 'Missing Raw JSON copy action', '#raw-json', undefined, [
    { type: 'actionability_gap', titleIncludes: 'Raw JSON lacks copy action' }
  ]),
  fixture('unclear-graph', 'Unclear graph explorer', '#graph', undefined, [
    { type: 'information_hierarchy_gap', titleIncludes: 'Graph Explorer does not provide enough graph-reading context' }
  ]),
  fixture('ambiguous-reopen', 'Ambiguous repeated Reopen buttons', '#plan-runs', undefined, [
    { type: 'locator_quality_issue', titleIncludes: 'Repeated Reopen buttons have ambiguous accessible names' }
  ]),
  fixture('duplicate-status-text', 'Duplicate plan-run status/chip text', '#plan-runs', undefined, [
    { type: 'scanability_issue', titleIncludes: 'Plan run card repeats status/chip text' }
  ]),
  fixture('screenshot-gallery-no-context', 'Screenshot gallery without context', '#screenshots', undefined, [
    { type: 'evidence_gap', titleIncludes: 'Screenshots view does not explain screenshot context' }
  ]),
  fixture('unhelpful-empty-state', 'Unhelpful Issues empty state', '#issues', undefined, [
    { type: 'empty_state_gap', titleIncludes: 'Issues empty state lacks explanation or next action' }
  ]),
  fixture('raw-json-primary-summary', 'Raw JSON as primary summary', '#summary', undefined, [
    { type: 'information_hierarchy_gap', titleIncludes: 'Summary relies on raw JSON instead of human-readable report summary' }
  ])
]

export const GOOD_PRODUCT_EXPERIENCE_FIXTURES: ProductExperienceCalibrationFixture[] = [
  {
    id: 'good-sniffer-dashboard',
    name: 'Good Sniffer dashboard baseline',
    root: path.join('fixtures', 'product-experience-good', 'sniffer-dashboard'),
    hash: '#timeline',
    appSubtype: undefined,
    expectedFindings: []
  }
]

export async function runProductExperienceCalibration(input: {
  snifferRoot: string
  provider?: ProductExperienceCalibrationProvider
  mode?: ProductExperienceCriticMode
  fixtureIds?: string[]
  includeGood?: boolean
}): Promise<ProductExperienceCalibrationResult> {
  const generatedAt = new Date().toISOString()
  const reportRoot = path.join(input.snifferRoot, 'reports', 'sniffer', 'product-calibration')
  const runDir = path.join(reportRoot, 'runs', generatedAt.replace(/[:.]/g, '-'))
  const latestDir = path.join(reportRoot, 'latest')
  await mkdir(runDir, { recursive: true })
  await mkdir(latestDir, { recursive: true })

  const providerConfigured = Boolean(input.provider?.critiqueProductExperience && (input.provider.isConfigured?.() ?? true))
  const criticMode = input.mode ?? (providerConfigured ? 'llm' : 'deterministic')
  const fixtures = [...BAD_PRODUCT_EXPERIENCE_FIXTURES, ...(input.includeGood ? GOOD_PRODUCT_EXPERIENCE_FIXTURES : [])]
    .filter((item) => !input.fixtureIds?.length || input.fixtureIds.includes(item.id))
  if (fixtures.length === 0) {
    throw new Error(`No product experience calibration fixtures matched${input.fixtureIds?.length ? `: ${input.fixtureIds.join(', ')}` : '.'}`)
  }
  const targets: ProductExperienceCalibrationTargetResult[] = []

  for (const item of fixtures) {
    const target = await runFixture({ fixture: item, snifferRoot: input.snifferRoot, runDir, criticMode, provider: input.provider })
    targets.push(target)
  }

  const result: ProductExperienceCalibrationResult = {
    generatedAt,
    status: targets.every((target) => target.status === 'passed') ? 'passed' : 'failed',
    criticMode,
    llmUsed: targets.some((target) => target.llmUsed),
    targets,
    reportJsonPath: path.join(latestDir, 'latest_calibration.json'),
    reportMarkdownPath: path.join(latestDir, 'latest_calibration.md')
  }
  await writeJson(result.reportJsonPath, result)
  await writeFile(result.reportMarkdownPath, renderCalibrationMarkdown(result), 'utf8')
  await writeJson(path.join(runDir, 'latest_calibration.json'), result)
  await writeFile(path.join(runDir, 'latest_calibration.md'), renderCalibrationMarkdown(result), 'utf8')
  return result
}

async function runFixture(input: {
  fixture: ProductExperienceCalibrationFixture
  snifferRoot: string
  runDir: string
  criticMode: ProductExperienceCriticMode
  provider?: ProductExperienceCalibrationProvider
}): Promise<ProductExperienceCalibrationTargetResult> {
  const fixtureRoot = path.join(input.snifferRoot, input.fixture.root)
  const reportDir = path.join(input.runDir, input.fixture.id)
  await mkdir(reportDir, { recursive: true })
  const server = await startStaticServer(fixtureRoot)
  try {
    const url = `${server.url}/${input.fixture.hash}`
    const sourceGraph = await discoverSource(fixtureRoot)
    const runtimeDomSnapshot = await inspectUrl({ url, reportDir, waitMs: 250 })
    const crawlGraph = crawlGraphFromSnapshot(runtimeDomSnapshot, url, input.fixture.hash)
    const appIntent = buildDeterministicIntent(sourceGraph)
    const productIntent = await synthesizeProductIntent({
      sourceGraph,
      crawlGraph,
      appIntent,
      runtimeWorkflowVerifications: [],
      appUrl: url,
      mode: 'deterministic'
    })
    const appProfile = augmentAppProfileWithProductIntent(inferAppProfile({ sourceGraph, crawlGraph }), productIntent.productIntent)
    const runtimeAppModel = buildRuntimeAppModel({ snapshot: runtimeDomSnapshot, sourceGraph, appProfile })
    const productExperience = await runProductExperienceCritic({
      mode: input.criticMode,
      provider: input.provider,
      sourceGraph,
      crawlGraph,
      appProfile,
      appSubtype: input.fixture.appSubtype,
      productIntent: productIntent.productIntent,
      runtimeDomSnapshot,
      runtimeAppModel,
      scenarioRuns: [],
      reportDir,
      projectId: 'product-calibration'
    })
    const runtimeDomQualityIssues = analyzeRuntimeDomQuality(runtimeDomSnapshot)
    const detectedFindings = [
      ...productExperienceFindings(productExperience),
      ...runtimeDomQualityFindings(runtimeDomQualityIssues)
    ]
    const missingFindings = input.fixture.expectedFindings.filter((expected) => !detectedFindings.some((detected) => matchesExpected(expected, detected)))
    const unexpectedFindings = input.fixture.expectedFindings.length === 0 ? detectedFindings : []
    return {
      fixture: input.fixture.id,
      name: input.fixture.name,
      url,
      status: missingFindings.length === 0 && unexpectedFindings.length === 0 ? 'passed' : 'failed',
      criticMode: input.criticMode,
      llmUsed: productExperience.llmScreensReviewed > 0,
      expectedFindings: input.fixture.expectedFindings,
      detectedFindings,
      missingFindings,
      unexpectedFindings,
      screenshotPath: runtimeDomSnapshot.screenshotPath,
      productExperienceStatus: productExperience.status
    }
  } finally {
    await new Promise<void>((resolve) => server.server.close(() => resolve()))
  }
}

function fixture(id: string, name: string, hash: string, appSubtype: AppSubtype | undefined, expectedFindings: ProductExperienceCalibrationExpectedFinding[]): ProductExperienceCalibrationFixture {
  return { id, name, root: path.join('fixtures', 'product-experience-bad', id), hash, appSubtype, expectedFindings }
}

async function startStaticServer(root: string): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    void (async () => {
      const parsed = new URL(req.url ?? '/', 'http://127.0.0.1')
      const pathname = decodeURIComponent(parsed.pathname)
      const candidate = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
      const file = safeJoin(root, candidate) ?? path.join(root, 'index.html')
      const resolved = await fileOrIndex(file, root)
      if (!resolved) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Not found')
        return
      }
      res.writeHead(200, { 'Content-Type': contentType(resolved) })
      res.end(await readFile(resolved))
    })().catch((error) => {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(error instanceof Error ? error.message : String(error))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not start fixture server')
  return { server, url: `http://127.0.0.1:${address.port}` }
}

async function fileOrIndex(file: string, root: string): Promise<string | undefined> {
  try {
    const info = await stat(file)
    if (info.isFile()) return file
    if (info.isDirectory()) {
      const index = path.join(file, 'index.html')
      if ((await stat(index)).isFile()) return index
    }
  } catch {
    return safeJoin(root, 'index.html')
  }
  return undefined
}

function safeJoin(root: string, relative: string): string | undefined {
  const resolved = path.resolve(root, relative)
  return resolved.startsWith(path.resolve(root)) ? resolved : undefined
}

function contentType(file: string): string {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8'
  if (file.endsWith('.css')) return 'text/css; charset=utf-8'
  if (file.endsWith('.js')) return 'application/javascript; charset=utf-8'
  if (file.endsWith('.json')) return 'application/json; charset=utf-8'
  return 'application/octet-stream'
}

function crawlGraphFromSnapshot(snapshot: RuntimeDomSnapshot, url: string, hashRoute: string): CrawlGraph {
  const visible = snapshot.controls
    .filter((control) => ['button', 'link', 'tab', 'input', 'form', 'dialog'].includes(control.kind))
    .map((control): VisibleElement => ({
      kind: control.kind as VisibleElement['kind'],
      text: control.visibleText,
      name: control.accessibleName,
      href: control.href,
      type: control.type,
      selectorHint: control.selectorHint
    }))
  const state: CrawlState = {
    id: 'state-1',
    sequenceNumber: 1,
    url,
    hashRoute,
    title: snapshot.title,
    hash: 'calibration-state',
    stateHash: 'calibration-state',
    inferredScreenName: screenNameFromHash(hashRoute),
    screenshotPath: snapshot.screenshotPath,
    primaryVisibleText: snapshot.visibleTextBlocks,
    visible
  }
  return {
    startUrl: url,
    title: snapshot.title,
    finalUrl: url,
    states: [state],
    actions: [],
    consoleErrors: [],
    networkFailures: [],
    screenshots: snapshot.screenshotPath ? [snapshot.screenshotPath] : [],
    generatedAt: new Date().toISOString()
  }
}

function screenNameFromHash(hash: string): string {
  return ({
    '#timeline': 'Run Timeline',
    '#raw-json': 'Raw JSON',
    '#graph': 'Graph Explorer',
    '#plan-runs': 'Plan Runs',
    '#screenshots': 'Screenshots',
    '#issues': 'Issues',
    '#summary': 'Summary'
  }[hash] ?? hash.replace(/^#/, '')) || 'Calibration screen'
}

function productExperienceFindings(result: ProductExperienceResult): ProductExperienceCalibrationDetectedFinding[] {
  return result.decisions.flatMap((decision) =>
    decision.findings
      .filter((finding) => finding.should_report)
      .map((finding) => ({
        source: 'product_experience' as const,
        type: finding.type,
        title: finding.title,
        screen: finding.reviewed_screen ?? decision.screen_name,
        severity: finding.severity,
        evidence: finding.evidence
      }))
  )
}

function runtimeDomQualityFindings(issues: Issue[]): ProductExperienceCalibrationDetectedFinding[] {
  return issues.map((issue) => ({
    source: 'runtime_dom_quality' as const,
    type: issue.type,
    title: issue.title,
    severity: issue.severity,
    evidence: issue.evidence
  }))
}

function matchesExpected(expected: ProductExperienceCalibrationExpectedFinding, detected: ProductExperienceCalibrationDetectedFinding): boolean {
  return detected.type === expected.type && detected.title.toLowerCase().includes(expected.titleIncludes.toLowerCase())
}

function renderCalibrationMarkdown(result: ProductExperienceCalibrationResult): string {
  const lines = [
    '# Product Experience Calibration',
    '',
    `Generated: ${result.generatedAt}`,
    `Status: ${result.status.toUpperCase()}`,
    `Critic mode: ${result.criticMode}`,
    `LLM used: ${result.llmUsed ? 'yes' : 'no'}`,
    ''
  ]
  for (const target of result.targets) {
    lines.push(
      `## ${target.status.toUpperCase()} ${target.name}`,
      '',
      `- Fixture: ${target.fixture}`,
      `- URL: ${target.url}`,
      `- Product Experience Critic status: ${target.productExperienceStatus}`,
      `- LLM used: ${target.llmUsed ? 'yes' : 'no'}`,
      target.screenshotPath ? `- Screenshot: ${target.screenshotPath}` : '- Screenshot: none',
      '',
      'Expected findings:',
      ...target.expectedFindings.map((finding) => `- ${finding.type}: ${finding.titleIncludes}`),
      '',
      'Detected findings:',
      ...(target.detectedFindings.length ? target.detectedFindings.map((finding) => `- ${finding.source} · ${finding.type}: ${finding.title}`) : ['- none']),
      '',
      'Missing findings:',
      ...(target.missingFindings.length ? target.missingFindings.map((finding) => `- ${finding.type}: ${finding.titleIncludes}`) : ['- none']),
      '',
      'Unexpected findings:',
      ...(target.unexpectedFindings.length ? target.unexpectedFindings.map((finding) => `- ${finding.source} · ${finding.type}: ${finding.title}`) : ['- none']),
      ''
    )
  }
  return `${lines.join('\n')}\n`
}
