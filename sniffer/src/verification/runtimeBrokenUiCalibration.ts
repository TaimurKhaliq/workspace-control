import { createServer, type Server } from 'node:http'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, type Page } from 'playwright'
import { generateRuntimeFixtures, type RuntimeFixtureDifficulty, type RuntimeFixtureManifest, type RuntimeFixtureSpec, type RuntimeFixtureTemplate } from '../calibration/runtimeFixtureGenerator.js'
import { discoverSource } from '../discovery/sourceDiscovery.js'
import { buildDeterministicIntent } from '../heuristics/intent.js'
import { triageIssues } from '../heuristics/issueTriage.js'
import { inferAppProfile } from '../profile/appProfile.js'
import { generateFixPackets } from '../repair/fixPackets.js'
import { writeAuditReports } from '../reporting/reportWriter.js'
import { writeJson } from '../reporting/json.js'
import { inspectUrl, captureRuntimeDomSnapshot } from '../runtime/domSnapshot.js'
import { buildRuntimeAppModel } from '../runtime/runtimeAppModel.js'
import { runProductExperienceCritic } from '../critic/productExperienceCritic.js'
import type {
  AppProfile,
  CrawlAction,
  CrawlGraph,
  CrawlState,
  GeneratedScenario,
  Issue,
  IssueType,
  NetworkFailure,
  ProductExperienceCriticMode,
  RuntimeDomSnapshot,
  RuntimeMessage,
  ScenarioAssertionResult,
  ScenarioRun,
  Severity,
  SnifferReport,
  SourceGraph,
  VisibleElement
} from '../types.js'
import { createLlmProvider } from '../llm/factory.js'

export interface RuntimeCalibrationExpectedFinding {
  type: IssueType
  titleIncludes: string
  severity?: Severity
}

export interface RuntimeCalibrationExpectedScenarioFailure {
  scenarioId: string
  failedAssertionIncludes: string
}

export interface RuntimeCalibrationOracle {
  id: string
  template?: RuntimeFixtureTemplate
  mutation?: string
  title?: string
  difficulty?: RuntimeFixtureDifficulty
  expectedFindings: RuntimeCalibrationExpectedFinding[]
  expectedScenarioFailures?: RuntimeCalibrationExpectedScenarioFailure[]
  expectedConsoleErrors?: number
  expectedNetworkFailures?: number
  expectedScreenshotsMin?: number
  shouldGenerateFixPacket?: boolean
}

interface RuntimeCalibrationFixture {
  id: string
  name: string
  root: string
  template?: RuntimeFixtureTemplate
  mutation?: string
  difficulty?: RuntimeFixtureDifficulty
  generated?: boolean
}

export interface RuntimeCalibrationDetectedFinding {
  type: IssueType
  title: string
  severity: Severity
  source: 'raw_finding' | 'triaged_issue'
  evidence: string[]
}

export interface RuntimeCalibrationDetectedScenarioFailure {
  scenarioId: string
  assertion: string
  evidence: string[]
}

export interface RuntimeCalibrationTargetResult {
  fixture: string
  name: string
  template?: RuntimeFixtureTemplate
  mutation?: string
  difficulty?: RuntimeFixtureDifficulty
  url: string
  status: 'passed' | 'failed'
  expectedFindings: RuntimeCalibrationExpectedFinding[]
  expectedScenarioFailures: RuntimeCalibrationExpectedScenarioFailure[]
  detectedFindings: RuntimeCalibrationDetectedFinding[]
  detectedScenarioFailures: RuntimeCalibrationDetectedScenarioFailure[]
  missedExpectedFindings: RuntimeCalibrationExpectedFinding[]
  missedScenarioFailures: RuntimeCalibrationExpectedScenarioFailure[]
  unexpectedFindings: RuntimeCalibrationDetectedFinding[]
  unexpectedScenarioFailures: RuntimeCalibrationDetectedScenarioFailure[]
  scenarioRuns: number
  failedAssertions: number
  consoleErrors: number
  networkFailures: number
  screenshots: string[]
  fixPackets: number
  reportPath: string
  screenshotPath?: string
}

export interface RuntimeBrokenUiCalibrationResult {
  generatedAt: string
  status: 'passed' | 'failed'
  fixturesCount: number
  passedFixtures: number
  failedFixtures: number
  criticMode: string
  provider?: string
  generatedFixtures?: {
    count: number
    seed: number
    manifestPath: string
  }
  targets: RuntimeCalibrationTargetResult[]
  reportJsonPath: string
  reportMarkdownPath: string
}

const FIXTURES: RuntimeCalibrationFixture[] = [
  fixture('broken-navigation-tab', 'Broken navigation tab'),
  fixture('modal-button-does-nothing', 'Modal button does nothing'),
  fixture('form-submit-no-validation', 'Form submit has no validation'),
  fixture('copy-button-broken', 'Copy button broken'),
  fixture('api-500', 'API 500 without controlled error state'),
  fixture('infinite-loading', 'Infinite loading'),
  fixture('route-404-broken-link', 'Route 404 / broken link'),
  fixture('horizontal-overflow-table', 'Horizontal overflow table'),
  fixture('ambiguous-repeated-row-action', 'Ambiguous repeated row action'),
  fixture('runtime-exception-after-click', 'Runtime exception after click'),
  fixture('good-baseline', 'Good runtime baseline')
]

async function ensureGeneratedFixtures(input: {
  snifferRoot: string
  fixtureIds?: string[]
  count?: number
  seed?: number
  difficulty?: RuntimeFixtureDifficulty | 'all'
}): Promise<{ fixtures: RuntimeCalibrationFixture[]; manifest?: RuntimeFixtureManifest; manifestPath: string }> {
  const manifestPath = path.join(input.snifferRoot, 'fixtures', 'runtime-broken-ui', 'generated', 'manifest.json')
  const staticIds = new Set(FIXTURES.map((item) => item.id))
  const needsGenerated = !input.fixtureIds?.length ||
    input.count !== undefined ||
    input.seed !== undefined ||
    input.difficulty !== undefined ||
    Boolean(input.fixtureIds?.some((id) => !staticIds.has(id)))
  let manifest: RuntimeFixtureManifest | undefined
  if (needsGenerated) {
    manifest = await generateRuntimeFixtures({
      snifferRoot: input.snifferRoot,
      count: input.count ?? 40,
      seed: input.seed ?? 1234,
      difficulty: input.difficulty ?? 'all'
    })
  } else {
    manifest = await readGeneratedManifest(manifestPath).catch(() => undefined)
  }
  return {
    fixtures: manifest ? manifest.fixtures.map(fixtureFromSpec) : [],
    manifest,
    manifestPath
  }
}

async function readGeneratedManifest(manifestPath: string): Promise<RuntimeFixtureManifest> {
  return JSON.parse(await readFile(manifestPath, 'utf8')) as RuntimeFixtureManifest
}

function fixtureFromSpec(spec: RuntimeFixtureSpec): RuntimeCalibrationFixture {
  return {
    id: spec.id,
    name: spec.title,
    root: path.join('fixtures', 'runtime-broken-ui', 'generated', spec.id),
    template: spec.template,
    mutation: spec.mutation,
    difficulty: spec.difficulty,
    generated: true
  }
}

export async function runRuntimeBrokenUiCalibration(input: {
  snifferRoot: string
  fixtureIds?: string[]
  criticMode?: string
  provider?: string
  includeProductCritic?: boolean
  count?: number
  seed?: number
  difficulty?: RuntimeFixtureDifficulty | 'all'
  stopOnFailure?: boolean
  parallel?: number
}): Promise<RuntimeBrokenUiCalibrationResult> {
  const generatedAt = new Date().toISOString()
  const reportRoot = path.join(input.snifferRoot, 'reports', 'sniffer', 'runtime_calibration')
  const runDir = path.join(reportRoot, 'runs', generatedAt.replace(/[:.]/g, '-'))
  const latestDir = path.join(reportRoot, 'latest')
  await mkdir(runDir, { recursive: true })
  await mkdir(latestDir, { recursive: true })
  const generated = await ensureGeneratedFixtures(input)
  const allFixtures = [...FIXTURES, ...generated.fixtures]
  const selectedPool = !input.fixtureIds?.length && generated.manifest ? generated.fixtures : allFixtures
  const selected = selectedPool.filter((item) => !input.fixtureIds?.length || input.fixtureIds.includes(item.id))
  if (selected.length === 0) throw new Error(`No runtime calibration fixtures matched${input.fixtureIds?.length ? `: ${input.fixtureIds.join(', ')}` : '.'}`)

  const runOne = async (item: RuntimeCalibrationFixture) => await runRuntimeFixture({
      fixture: item,
      snifferRoot: input.snifferRoot,
      runDir,
      criticMode: input.criticMode ?? 'deterministic',
      providerName: input.provider,
      includeProductCritic: Boolean(input.includeProductCritic)
    })
  const targets: RuntimeCalibrationTargetResult[] = []
  const parallel = Math.max(1, Math.min(input.parallel ?? 1, selected.length))
  if (parallel === 1 || input.stopOnFailure) {
    for (const item of selected) {
      const target = await runOne(item)
      targets.push(target)
      if (input.stopOnFailure && target.status === 'failed') break
    }
  } else {
    const results = new Array<RuntimeCalibrationTargetResult>(selected.length)
    let nextIndex = 0
    const workers = Array.from({ length: parallel }, async () => {
      while (nextIndex < selected.length) {
        const current = nextIndex
        nextIndex += 1
        results[current] = await runOne(selected[current])
      }
    })
    await Promise.all(workers)
    targets.push(...results.filter(Boolean))
  }
  const result: RuntimeBrokenUiCalibrationResult = {
    generatedAt,
    status: targets.every((target) => target.status === 'passed') ? 'passed' : 'failed',
    fixturesCount: targets.length,
    passedFixtures: targets.filter((target) => target.status === 'passed').length,
    failedFixtures: targets.filter((target) => target.status === 'failed').length,
    criticMode: input.criticMode ?? 'deterministic',
    provider: input.provider,
    generatedFixtures: generated.manifest
      ? {
        count: generated.manifest.requestedBrokenCount,
        seed: generated.manifest.seed,
        manifestPath: generated.manifestPath
      }
      : undefined,
    targets,
    reportJsonPath: path.join(latestDir, 'latest_runtime_calibration.json'),
    reportMarkdownPath: path.join(latestDir, 'latest_runtime_calibration.md')
  }
  await writeRuntimeCalibrationReports(result, runDir, latestDir)
  return result
}

async function runRuntimeFixture(input: {
  fixture: RuntimeCalibrationFixture
  snifferRoot: string
  runDir: string
  criticMode: string
  providerName?: string
  includeProductCritic: boolean
}): Promise<RuntimeCalibrationTargetResult> {
  const fixtureRoot = path.join(input.snifferRoot, input.fixture.root)
    const oracle = await loadOracle(fixtureRoot, input.fixture.id)
  const reportDir = path.join(input.runDir, input.fixture.id)
  await mkdir(reportDir, { recursive: true })
    const behavior = fixtureBehavior(input.fixture.id, oracle)
    const server = await startRuntimeFixtureServer(fixtureRoot, input.fixture.id, behavior)
  try {
    const url = server.url
    const sourceGraph = await discoverSource(fixtureRoot, { includeFixtures: true })
    const runtimeDomSnapshot = await inspectUrl({ url, reportDir, waitMs: behavior.template === 'api-loading' || input.fixture.id === 'infinite-loading' ? 700 : 250 })
    const run = await runFixtureChecks({ fixtureId: input.fixture.id, behavior, url, reportDir, initialSnapshot: runtimeDomSnapshot })
    const crawlGraph = buildCalibrationCrawlGraph({ url, snapshot: runtimeDomSnapshot, run })
    const appIntent = buildDeterministicIntent(sourceGraph)
    const appProfile = inferAppProfile({ sourceGraph, crawlGraph })
    const runtimeAppModel = buildRuntimeAppModel({ snapshot: runtimeDomSnapshot, sourceGraph, appProfile })
    const productExperience = input.includeProductCritic
      ? await runProductExperienceCritic({
        mode: input.criticMode as ProductExperienceCriticMode,
        provider: createLlmProvider(input.providerName ?? 'auto'),
        sourceGraph,
        crawlGraph,
        appProfile,
        runtimeDomSnapshot,
        runtimeAppModel,
        scenarioRuns: run.scenarioRuns,
        reportDir,
        projectId: 'runtime-calibration'
      })
      : undefined
    const rawFindings = [...run.issues, ...(productExperience?.issues ?? [])]
    const triaged = ensureCalibrationTriageCoverage(
      rawFindings,
      triageIssues({ rawFindings, sourceGraph, workflowVerifications: [] })
    )
    const report = await writeRuntimeFixtureAuditReport({
      reportDir,
      sourceGraph,
      crawlGraph,
      appProfile,
      runtimeDomSnapshot,
      runtimeAppModel,
      scenarioRuns: run.scenarioRuns,
      generatedScenarios: generatedScenariosFor(input.fixture.id, behavior),
      rawFindings,
      issues: triaged,
      productExperience
    })
    const packets = await generateFixPackets(path.join(reportDir, 'latest_report.json')).catch(() => [])
    const detectedFindings = detectedFindingsFrom(rawFindings, report.issues)
    const detectedScenarioFailures = detectedScenarioFailuresFrom(run.scenarioRuns)
    const missedExpectedFindings = oracle.expectedFindings.filter((expected) => !detectedFindings.some((finding) => matchesExpectedFinding(expected, finding)))
    const expectedScenarioFailures = oracle.expectedScenarioFailures ?? []
    const missedScenarioFailures = expectedScenarioFailures.filter((expected) => !detectedScenarioFailures.some((failure) => matchesExpectedScenarioFailure(expected, failure)))
    const unexpectedFindings = oracle.expectedFindings.length === 0 && expectedScenarioFailures.length === 0
      ? detectedFindings
      : []
    const unexpectedScenarioFailures = oracle.expectedFindings.length === 0 && expectedScenarioFailures.length === 0
      ? detectedScenarioFailures
      : []
    return {
      fixture: input.fixture.id,
      name: input.fixture.name,
      template: behavior.template,
      mutation: behavior.mutation,
      difficulty: behavior.difficulty,
      url,
      status: missedExpectedFindings.length === 0 && missedScenarioFailures.length === 0 && unexpectedFindings.length === 0 && unexpectedScenarioFailures.length === 0 ? 'passed' : 'failed',
      expectedFindings: oracle.expectedFindings,
      expectedScenarioFailures,
      detectedFindings,
      detectedScenarioFailures,
      missedExpectedFindings,
      missedScenarioFailures,
      unexpectedFindings,
      unexpectedScenarioFailures,
      scenarioRuns: run.scenarioRuns.length,
      failedAssertions: detectedScenarioFailures.length,
      consoleErrors: crawlGraph.consoleErrors.length,
      networkFailures: crawlGraph.networkFailures.length,
      screenshots: crawlGraph.screenshots,
      fixPackets: packets.length,
      reportPath: path.join(reportDir, 'latest_report.json'),
      screenshotPath: crawlGraph.screenshots[0]
    }
  } finally {
    await new Promise<void>((resolve) => server.server.close(() => resolve()))
  }
}

async function writeRuntimeFixtureAuditReport(input: {
  reportDir: string
  sourceGraph: SourceGraph
  crawlGraph: CrawlGraph
  appProfile: AppProfile
  runtimeDomSnapshot: RuntimeDomSnapshot
  runtimeAppModel: ReturnType<typeof buildRuntimeAppModel>
  generatedScenarios: GeneratedScenario[]
  scenarioRuns: ScenarioRun[]
  rawFindings: Issue[]
  issues: Issue[]
  productExperience?: Awaited<ReturnType<typeof runProductExperienceCritic>>
}): Promise<SnifferReport> {
  return await writeAuditReports(input.reportDir, {
    sourceGraph: input.sourceGraph,
    crawlGraph: input.crawlGraph,
    appIntent: buildDeterministicIntent(input.sourceGraph),
    appProfile: input.appProfile,
    discoveryMode: 'hybrid',
    runtimeDomSnapshot: input.runtimeDomSnapshot,
    runtimeAppModel: input.runtimeAppModel,
    generatedScenarios: input.generatedScenarios,
    scenarioRuns: input.scenarioRuns,
    runtimeWorkflowVerifications: [],
    productExperience: input.productExperience,
    rawFindings: input.rawFindings,
    issues: input.issues,
    criticDecisions: [],
    uxCriticFindings: []
  })
}

interface FixtureCheckRun {
  scenarioRuns: ScenarioRun[]
  issues: Issue[]
  consoleErrors: RuntimeMessage[]
  networkFailures: NetworkFailure[]
  screenshots: string[]
  states: CrawlState[]
  actions: CrawlAction[]
}

interface RuntimeFixtureBehavior {
  template: RuntimeFixtureTemplate
  mutation: string
  difficulty?: RuntimeFixtureDifficulty
}

async function runFixtureChecks(input: {
  fixtureId: string
  behavior: RuntimeFixtureBehavior
  url: string
  reportDir: string
  initialSnapshot: RuntimeDomSnapshot
}): Promise<FixtureCheckRun> {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } })
  page.setDefaultTimeout(2_000)
  const consoleErrors: RuntimeMessage[] = []
  const networkFailures: NetworkFailure[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push({ text: message.text(), location: page.url() })
  })
  page.on('pageerror', (error) => consoleErrors.push({ text: error.message, location: page.url() }))
  page.on('response', async (response) => {
    if (response.status() >= 400) {
      networkFailures.push({
        url: response.url(),
        method: response.request().method(),
        failureText: String(response.status()),
        statusCode: response.status(),
        responseBody: await response.text().catch(() => undefined)
      })
    }
  })
  const screenshotsDir = path.join(input.reportDir, 'screenshots', 'runtime-calibration')
  await mkdir(screenshotsDir, { recursive: true })
  const screenshots: string[] = [input.initialSnapshot.screenshotPath].filter(Boolean) as string[]
  const states: CrawlState[] = [stateFromSnapshot(input.initialSnapshot, 1)]
  const actions: CrawlAction[] = []
  const issues: Issue[] = []
  const assertions: ScenarioAssertionResult[] = []
  const stepsAttempted: string[] = []
  try {
    await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 10_000 })
    await page.waitForLoadState('networkidle', { timeout: 1_000 }).catch(() => undefined)
    const context = {
      page,
      fixtureId: input.fixtureId,
      behavior: input.behavior,
      url: input.url,
      screenshotsDir,
      screenshots,
      states,
      actions,
      issues,
      assertions,
      stepsAttempted,
      consoleErrors,
      networkFailures
    }
    await runFixtureCheck(context)
    if (consoleErrors.length > 0 && (input.behavior.template === 'copy-export' || input.behavior.template === 'runtime-exception' || ['copy-button-broken', 'runtime-exception-after-click'].includes(input.fixtureId))) {
      const screenshotPath = screenshots.at(-1)
      issues.push(issue({
        type: input.behavior.template === 'copy-export' || input.fixtureId === 'copy-button-broken' ? 'copy_action_failure' : 'console_error',
        title: input.behavior.template === 'copy-export' || input.fixtureId === 'copy-button-broken' ? 'Copy action throws a console error' : 'Runtime exception after click',
        description: 'A user interaction produced a browser console/runtime error.',
        evidence: consoleErrors.map((error) => error.text),
        screenshotPath,
        severity: 'high'
      }))
    }
    const status = assertions.some((assertion) => assertion.status === 'failed') ? 'failed' : assertions.some((assertion) => assertion.status === 'blocked') ? 'blocked' : 'passed'
    return {
      scenarioRuns: [{
        slug: input.fixtureId,
        name: scenarioNameFor(input.fixtureId),
        status,
        prerequisites: [],
        stepsAttempted,
        screenshots,
        assertions,
        issues
      }],
      issues,
      consoleErrors,
      networkFailures,
      screenshots,
      states,
      actions
    }
  } finally {
    await browser.close()
  }
}

interface FixtureCheckContext {
  page: Page
  fixtureId: string
  behavior: RuntimeFixtureBehavior
  url: string
  screenshotsDir: string
  screenshots: string[]
  states: CrawlState[]
  actions: CrawlAction[]
  issues: Issue[]
  consoleErrors: RuntimeMessage[]
  networkFailures: NetworkFailure[]
  assertions: ScenarioAssertionResult[]
  stepsAttempted: string[]
}

async function runFixtureCheck(ctx: FixtureCheckContext): Promise<void> {
  if (ctx.behavior.template === 'navigation-tab' || ctx.fixtureId === 'broken-navigation-tab') return checkBrokenTab(ctx)
  if (ctx.behavior.template === 'modal-dialog' || ctx.fixtureId === 'modal-button-does-nothing') return checkModalButton(ctx)
  if (ctx.behavior.template === 'form-validation' || ctx.fixtureId === 'form-submit-no-validation') return checkFormValidation(ctx)
  if (ctx.behavior.template === 'copy-export' || ctx.fixtureId === 'copy-button-broken') return checkCopyButton(ctx)
  if ((ctx.behavior.template === 'api-loading' && (ctx.behavior.mutation.includes('infinite') || ctx.behavior.mutation.includes('stale-loading'))) || ctx.fixtureId === 'infinite-loading') return checkInfiniteLoading(ctx)
  if (ctx.behavior.template === 'api-loading' || ctx.fixtureId === 'api-500') return checkApi500(ctx)
  if (ctx.behavior.template === 'route-link' || ctx.fixtureId === 'route-404-broken-link') return checkBrokenLink(ctx)
  if (ctx.behavior.template === 'table-layout' || ctx.fixtureId === 'horizontal-overflow-table') return checkOverflow(ctx)
  if (ctx.behavior.template === 'row-action' || ctx.fixtureId === 'ambiguous-repeated-row-action') return checkRepeatedRows(ctx)
  if (ctx.behavior.template === 'screenshot-evidence') return checkScreenshotEvidence(ctx)
  if (ctx.behavior.template === 'runtime-exception' || ctx.fixtureId === 'runtime-exception-after-click') return checkRuntimeException(ctx)
  return checkGoodBaseline(ctx)
}

async function checkBrokenTab(ctx: FixtureCheckContext): Promise<void> {
  ctx.stepsAttempted.push('Click Details tab')
  const before = await pageSignature(ctx.page)
  await ctx.page.getByRole('tab', { name: /details/i }).click()
  await ctx.page.waitForTimeout(150)
  const after = await pageSignature(ctx.page)
  const detailsVisible = await ctx.page.getByText(/details panel/i).isVisible().catch(() => false)
  const screenshotPath = await captureStep(ctx, 'details-tab', 'click Details')
  const failed = before === after || !detailsVisible
  ctx.actions.push(action('click Details', ctx.url, ctx.page.url(), !failed, screenshotPath))
  ctx.assertions.push({
    label: 'Details tab changes visible content',
    status: failed ? 'failed' : 'passed',
    evidence: [`before_signature:${before.slice(0, 80)}`, `after_signature:${after.slice(0, 80)}`, `details_visible:${detailsVisible}`],
    screenshotPath
  })
  if (failed) ctx.issues.push(issue({
    type: 'workflow_confusion',
    title: 'Details tab did not change content',
    description: 'Clicking the Details tab did not reveal the expected Details panel.',
    evidence: ['clicked Details', 'visible panel did not change'],
    screenshotPath
  }))
}

async function checkModalButton(ctx: FixtureCheckContext): Promise<void> {
  ctx.stepsAttempted.push('Click Add item')
  await ctx.page.getByRole('button', { name: /add item/i }).click()
  await ctx.page.waitForTimeout(150)
  const dialogVisible = await ctx.page.getByRole('dialog').isVisible().catch(() => false)
  const screenshotPath = await captureStep(ctx, 'add-item', 'click Add item')
  ctx.actions.push(action('click Add item', ctx.url, ctx.page.url(), dialogVisible, screenshotPath))
  ctx.assertions.push({ label: 'Add item opens a modal dialog', status: dialogVisible ? 'passed' : 'failed', evidence: [`dialog_visible:${dialogVisible}`], screenshotPath })
  if (!dialogVisible) ctx.issues.push(issue({
    type: 'broken_interaction',
    title: 'Add item button does not open modal',
    description: 'The Add item control appears actionable but clicking it does not open the expected dialog.',
    evidence: ['Add item clicked', 'no dialog visible'],
    screenshotPath
  }))
}

async function checkFormValidation(ctx: FixtureCheckContext): Promise<void> {
  ctx.stepsAttempted.push('Submit empty form')
  await ctx.page.getByRole('button', { name: /submit/i }).click()
  await ctx.page.waitForTimeout(150)
  const feedback = await ctx.page.getByText(/required|invalid|enter|error/i).isVisible().catch(() => false)
  const disabled = await ctx.page.getByRole('button', { name: /submit/i }).isDisabled().catch(() => false)
  const screenshotPath = await captureStep(ctx, 'empty-submit', 'click Submit')
  ctx.actions.push(action('click Submit', ctx.url, ctx.page.url(), feedback || disabled, screenshotPath))
  ctx.assertions.push({ label: 'Empty required form shows validation feedback', status: feedback || disabled ? 'passed' : 'failed', evidence: [`validation_feedback:${feedback}`, `submit_disabled:${disabled}`], screenshotPath })
  if (!feedback && !disabled) ctx.issues.push(issue({
    type: 'form_validation_issue',
    title: 'Required form can be submitted without validation feedback',
    description: 'Submitting an empty required form produces no visible validation error and no disabled state.',
    evidence: ['empty form submitted', 'no required-field feedback visible'],
    screenshotPath
  }))
}

async function checkCopyButton(ctx: FixtureCheckContext): Promise<void> {
  ctx.stepsAttempted.push('Click Copy')
  const copyButton = ctx.page.getByRole('button', { name: /^copy$/i })
  const buttonCount = await copyButton.count().catch(() => 0)
  if (buttonCount > 0) await copyButton.first().click().catch(() => undefined)
  await ctx.page.waitForTimeout(150)
  const success = await ctx.page.getByText(/copied|copy succeeded/i).isVisible().catch(() => false)
  const screenshotPath = await captureStep(ctx, 'copy', 'click Copy')
  ctx.actions.push(action('click Copy', ctx.url, ctx.page.url(), success, screenshotPath))
  ctx.assertions.push({ label: 'Copy action provides success feedback', status: success ? 'passed' : 'failed', evidence: [`copy_button_count:${buttonCount}`, `copy_success_feedback:${success}`, ...ctx.consoleErrors.map((error) => `console:${error.text}`)], screenshotPath })
  if (buttonCount === 0) ctx.issues.push(issue({
    type: 'copy_action_failure',
    title: 'Copy action is missing or not discoverable',
    description: 'Generated output is visible, but no Copy control is available near it.',
    evidence: ['generated output visible', 'copy_button_count:0'],
    screenshotPath
  }))
  else if (!success && ctx.consoleErrors.length === 0) ctx.issues.push(issue({
    type: 'copy_action_failure',
    title: 'Copy action does not provide success feedback',
    description: 'Clicking Copy did not show success feedback.',
    evidence: ['Copy clicked', 'no copied state visible'],
    screenshotPath
  }))
}

async function checkApi500(ctx: FixtureCheckContext): Promise<void> {
  ctx.stepsAttempted.push('Load API-backed list')
  await ctx.page.waitForTimeout(450)
  const controlledError = await ctx.page.getByText(/could not load|try again|temporarily unavailable/i).isVisible().catch(() => false)
  const rawFailure = await ctx.page.getByText(/500|internal server error|failed to fetch/i).isVisible().catch(() => false)
  const screenshotPath = await captureStep(ctx, 'api-500', 'load API list')
  ctx.assertions.push({ label: 'API failures show controlled error state', status: controlledError ? 'passed' : 'failed', evidence: [`controlled_error:${controlledError}`, `raw_failure:${rawFailure}`, ...ctx.networkFailures.map((failure) => `${failure.method} ${failure.url} ${failure.statusCode}`)], screenshotPath })
  if (ctx.networkFailures.some((failure) => failure.statusCode === 500)) ctx.issues.push(issue({
    type: 'api_error',
    title: 'API request returns 500 during runtime flow',
    description: 'The fixture list request returned HTTP 500.',
    evidence: ctx.networkFailures.map((failure) => `${failure.method} ${failure.url} ${failure.statusCode}: ${failure.responseBody ?? failure.failureText}`),
    screenshotPath,
    severity: 'high'
  }))
  if (!controlledError) ctx.issues.push(issue({
    type: 'controlled_error_state_missing',
    title: 'API failure lacks controlled error state',
    description: 'The UI does not present a helpful controlled error state when the API fails.',
    evidence: ['GET /api/items returned 500', `controlled_error:${controlledError}`, `raw_failure:${rawFailure}`],
    screenshotPath
  }))
}

async function checkInfiniteLoading(ctx: FixtureCheckContext): Promise<void> {
  ctx.stepsAttempted.push('Wait for loading state to resolve')
  await ctx.page.waitForTimeout(1_200)
  const loadingVisible = await ctx.page.locator('#loading, [role="status"], .spinner').filter({ hasText: /loading/i }).first().isVisible().catch(() => false)
  const guidance = await ctx.page.getByText(/try again|empty|error|timed out/i).isVisible().catch(() => false)
  const screenshotPath = await captureStep(ctx, 'infinite-loading', 'wait for loading')
  ctx.assertions.push({ label: 'Loading state resolves or gives guidance', status: loadingVisible && !guidance ? 'failed' : 'passed', evidence: [`loading_visible:${loadingVisible}`, `guidance_visible:${guidance}`], screenshotPath })
  if (loadingVisible && !guidance) ctx.issues.push(issue({
    type: 'loading_state_stuck',
    title: 'Loading state remains stuck without guidance',
    description: 'The page keeps showing a loading indicator without timeout, empty state, or error guidance.',
    evidence: ['loading still visible after wait', 'no timeout/error/empty guidance visible'],
    screenshotPath
  }))
}

async function checkBrokenLink(ctx: FixtureCheckContext): Promise<void> {
  ctx.stepsAttempted.push('Open missing route')
  await ctx.page.getByRole('link', { name: /missing page/i }).click()
  await ctx.page.waitForTimeout(250)
  const notFound = await ctx.page.getByText(/404|not found/i).isVisible().catch(() => false)
  const blank = (await ctx.page.locator('body').innerText().catch(() => '')).trim().length < 20
  const screenshotPath = await captureStep(ctx, 'missing-route', 'click Missing page')
  ctx.actions.push(action('click Missing page', ctx.url, ctx.page.url(), false, screenshotPath))
  ctx.assertions.push({ label: 'Missing page link reaches a valid route', status: notFound || blank ? 'failed' : 'passed', evidence: [`url:${ctx.page.url()}`, `not_found:${notFound}`, `blank:${blank}`], screenshotPath })
  if (notFound || blank) ctx.issues.push(issue({
    type: 'broken_navigation',
    title: 'Navigation link opens a missing route',
    description: 'A visible navigation link leads to a not-found or blank route.',
    evidence: ['clicked Missing page', `url_after:${ctx.page.url()}`, `not_found:${notFound}`, `blank:${blank}`],
    screenshotPath
  }))
}

async function checkOverflow(ctx: FixtureCheckContext): Promise<void> {
  ctx.stepsAttempted.push('Measure horizontal overflow')
  const overflow = await ctx.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth || Array.from(document.querySelectorAll('table, .table-shell, main')).some((node) => node.scrollWidth > node.clientWidth + 2))
  const metrics = await ctx.page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
  const screenshotPath = await captureStep(ctx, 'overflow', 'measure overflow')
  ctx.assertions.push({ label: 'Page does not horizontally overflow viewport', status: overflow ? 'failed' : 'passed', evidence: [`scrollWidth:${metrics.scrollWidth}`, `clientWidth:${metrics.clientWidth}`], screenshotPath })
  if (overflow) ctx.issues.push(issue({
    type: 'layout_issue',
    title: 'Wide table causes horizontal overflow',
    description: 'The page content is wider than the viewport and makes the table difficult to read.',
    evidence: [`scrollWidth:${metrics.scrollWidth}`, `clientWidth:${metrics.clientWidth}`],
    screenshotPath
  }))
}

async function checkRepeatedRows(ctx: FixtureCheckContext): Promise<void> {
  ctx.stepsAttempted.push('Inspect repeated row action names')
  const openCount = await ctx.page.getByRole('button', { name: /^open$/i }).count()
  const screenshotPath = await captureStep(ctx, 'repeated-open', 'inspect Open buttons')
  ctx.assertions.push({ label: 'Repeated row actions have unique accessible names', status: openCount > 1 ? 'failed' : 'passed', evidence: [`open_button_count:${openCount}`], screenshotPath })
  if (openCount > 1) ctx.issues.push(issue({
    type: 'locator_quality_issue',
    title: 'Repeated Open buttons have ambiguous accessible names',
    description: 'Multiple row actions expose the same accessible name, making user intent and Playwright locators ambiguous.',
    evidence: [`Repeated button name "Open" appears ${openCount} times.`, 'Prefer row-scoped locators or unique aria-label values.'],
    screenshotPath
  }))
}

async function checkScreenshotEvidence(ctx: FixtureCheckContext): Promise<void> {
  ctx.stepsAttempted.push('Inspect screenshot evidence cards')
  const cards = await ctx.page.locator('.shot').count().catch(() => 0)
  const contextText = await ctx.page.locator('.shot').evaluateAll((nodes) =>
    nodes.filter((node) => /scenario:|step:|action:|state:|url:|screen:/i.test(node.textContent ?? '')).length
  ).catch(() => 0)
  const screenshotPath = await captureStep(ctx, 'screenshot-evidence', 'inspect screenshot gallery')
  const hasContext = contextText > 0
  ctx.assertions.push({
    label: 'Screenshot gallery cards include scenario/action context',
    status: cards > 0 && !hasContext ? 'failed' : 'passed',
    evidence: [`screenshot_card_count:${cards}`, `context_label_count:${contextText}`],
    screenshotPath
  })
  if (cards > 0 && !hasContext) ctx.issues.push(issue({
    type: 'product_experience_gap',
    title: 'Screenshot gallery lacks scenario/action context',
    description: 'Screenshot evidence is shown as images or filenames without tying each image to the scenario, state, URL, or action that produced it.',
    evidence: [`screenshot_card_count:${cards}`, 'no scenario/action/state/url context visible'],
    screenshotPath
  }))
}

async function checkRuntimeException(ctx: FixtureCheckContext): Promise<void> {
  ctx.stepsAttempted.push('Click crash button')
  await ctx.page.getByRole('button', { name: /crash action/i }).click().catch(() => undefined)
  await ctx.page.waitForTimeout(150)
  const screenshotPath = await captureStep(ctx, 'runtime-exception', 'click Crash action')
  ctx.actions.push(action('click Crash action', ctx.url, ctx.page.url(), false, screenshotPath))
  ctx.assertions.push({ label: 'Click action does not throw runtime exception', status: ctx.consoleErrors.length ? 'failed' : 'passed', evidence: ctx.consoleErrors.map((error) => `console:${error.text}`), screenshotPath })
}

async function checkGoodBaseline(ctx: FixtureCheckContext): Promise<void> {
  ctx.stepsAttempted.push('Exercise healthy baseline controls')
  await ctx.page.getByRole('tab', { name: /details/i }).click()
  await ctx.page.getByRole('button', { name: /add item/i }).click()
  const dialog = await ctx.page.getByRole('dialog').isVisible().catch(() => false)
  await ctx.page.keyboard.press('Escape').catch(() => undefined)
  await ctx.page.getByRole('button', { name: /submit/i }).click()
  const validation = await ctx.page.getByText(/email is required/i).isVisible().catch(() => false)
  await ctx.page.getByRole('button', { name: /^copy$/i }).click()
  const copied = await ctx.page.getByText(/copied/i).isVisible().catch(() => false)
  const overflow = await ctx.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  const screenshotPath = await captureStep(ctx, 'good-baseline', 'exercise healthy baseline')
  const passed = dialog && validation && copied && !overflow && ctx.consoleErrors.length === 0 && ctx.networkFailures.length === 0
  ctx.assertions.push({ label: 'Good baseline interactions pass without runtime findings', status: passed ? 'passed' : 'failed', evidence: [`dialog:${dialog}`, `validation:${validation}`, `copied:${copied}`, `overflow:${overflow}`], screenshotPath })
}

async function captureStep(ctx: FixtureCheckContext, name: string, actionLabel: string): Promise<string> {
  const file = path.join(ctx.screenshotsDir, `${name}.png`)
  await ctx.page.screenshot({ path: file, fullPage: true })
  ctx.screenshots.push(file)
  const snapshot = await captureRuntimeDomSnapshot(ctx.page, file)
  ctx.states.push(stateFromSnapshot(snapshot, ctx.states.length + 1))
  return file
}

function buildCalibrationCrawlGraph(input: { url: string; snapshot: RuntimeDomSnapshot; run: FixtureCheckRun }): CrawlGraph {
  return {
    startUrl: input.url,
    title: input.snapshot.title,
    finalUrl: input.run.states.at(-1)?.url ?? input.url,
    states: input.run.states,
    actions: input.run.actions,
    consoleErrors: input.run.consoleErrors,
    networkFailures: input.run.networkFailures,
    screenshots: unique(input.run.screenshots),
    coverage: {
      sourceRoutes: [],
      visitedRoutes: unique(input.run.states.map((state) => state.hashRoute ?? new URL(state.url).pathname)),
      missedRoutes: [],
      workflowsDiscovered: 1,
      workflowsExercised: input.run.scenarioRuns.length,
      scenariosPassed: input.run.scenarioRuns.filter((run) => run.status === 'passed').length,
      scenariosFailed: input.run.scenarioRuns.filter((run) => run.status === 'failed').length,
      scenariosSkipped: input.run.scenarioRuns.filter((run) => run.status === 'blocked').length,
      safeActionsSkipped: []
    },
    generatedAt: new Date().toISOString()
  }
}

function stateFromSnapshot(snapshot: RuntimeDomSnapshot, sequenceNumber: number): CrawlState {
  return {
    id: `state-${sequenceNumber}`,
    sequenceNumber,
    url: snapshot.url,
    hashRoute: routeKey(snapshot.url),
    title: snapshot.title,
    hash: `runtime-calibration-${sequenceNumber}`,
    stateHash: `runtime-calibration-${sequenceNumber}`,
    inferredScreenName: snapshot.headings[0]?.accessibleName ?? snapshot.headings[0]?.visibleText ?? snapshot.title,
    inferredPageType: 'runtime_calibration',
    screenshotPath: snapshot.screenshotPath,
    primaryVisibleText: snapshot.visibleTextBlocks,
    visibleControlSummary: {
      links: controlSummary(snapshot.links),
      buttons: controlSummary(snapshot.buttons),
      tabs: controlSummary(snapshot.tabs),
      inputs: controlSummary([...snapshot.inputs, ...snapshot.selects, ...snapshot.textareas]),
      forms: { count: snapshot.forms.length, topLabels: snapshot.forms.map((form) => form.name ?? form.id).slice(0, 6) },
      dialogs: controlSummary(snapshot.dialogs)
    },
    visible: snapshot.controls
      .filter((control) => ['button', 'link', 'tab', 'input', 'form', 'dialog'].includes(control.kind))
      .map((control): VisibleElement => ({
        kind: control.kind as VisibleElement['kind'],
        text: control.visibleText,
        name: control.accessibleName,
        href: control.href,
        type: control.type,
        selectorHint: control.selectorHint
      }))
  }
}

function controlSummary(controls: Array<{ accessibleName?: string; visibleText?: string; labelText?: string }>) {
  return {
    count: controls.length,
    topLabels: controls.map((control) => control.accessibleName ?? control.visibleText ?? control.labelText ?? 'unlabelled').slice(0, 6)
  }
}

function action(label: string, urlBefore: string, urlAfter: string, changedState: boolean, screenshotAfter?: string): CrawlAction {
  return {
    id: `action-${slug(label)}`,
    type: 'click',
    actionType: 'click',
    label,
    target: label,
    urlBefore,
    urlAfter,
    changedState,
    safe: true,
    safeReason: 'runtime calibration fixture action',
    screenshotAfter
  }
}

function issue(input: {
  type: IssueType
  title: string
  description: string
  evidence: string[]
  screenshotPath?: string
  severity?: Severity
}): Issue {
  return {
    severity: input.severity ?? 'medium',
    type: input.type,
    title: input.title,
    description: input.description,
    evidence: input.evidence,
    screenshotPath: input.screenshotPath,
    suspected_files: ['index.html'],
    suggestedFixPrompt: `Fix the runtime UI defect: ${input.title}. Preserve the intended workflow and verify with the runtime calibration fixture.`,
    verification_steps: ['Run npm run sniffer -- audit-runtime-calibration --fixture <fixture-id>.'],
    pass_conditions: ['The expected scenario assertion passes.', 'No matching runtime finding remains.']
  }
}

function generatedScenariosFor(fixtureId: string, behavior?: RuntimeFixtureBehavior): GeneratedScenario[] {
  const name = scenarioNameFor(fixtureId, behavior)
  return [{
    id: fixtureId,
    name,
    profileApplicability: ['unknown'],
    prerequisites: [],
    steps: [{ name, action: fixtureId, expectedControls: [], safe: true }],
    expectedControls: [],
    expectedOutcomes: ['runtime behavior matches the visible user expectation'],
    destructiveRisk: 'none',
    confidence: 'high',
    evidence: ['runtime calibration oracle']
  }]
}

function scenarioNameFor(fixtureId: string, behavior?: RuntimeFixtureBehavior): string {
  if (behavior) {
    return ({
      'navigation-tab': 'Tab switching',
      'modal-dialog': 'Modal open action smoke test',
      'form-validation': 'Form validation',
      'copy-export': 'Copy action',
      'api-loading': behavior.mutation.includes('loading') ? 'Loading state timeout' : 'API error handling',
      'route-link': 'Broken link navigation',
      'table-layout': 'Overflow/readability',
      'row-action': 'Repeated row action accessibility',
      'screenshot-evidence': 'Screenshot evidence context',
      'runtime-exception': 'Runtime exception after click',
      'good-baseline': 'Good baseline smoke test'
    }[behavior.template])
  }
  return ({
    'broken-navigation-tab': 'Tab switching',
    'modal-button-does-nothing': 'Modal open action smoke test',
    'form-submit-no-validation': 'Form validation',
    'copy-button-broken': 'Copy action',
    'api-500': 'API error handling',
    'infinite-loading': 'Loading state timeout',
    'route-404-broken-link': 'Broken link navigation',
    'horizontal-overflow-table': 'Overflow/readability',
    'ambiguous-repeated-row-action': 'Repeated row action accessibility',
    'runtime-exception-after-click': 'Runtime exception after click',
    'good-baseline': 'Good baseline smoke test'
  }[fixtureId] ?? fixtureId)
}

function detectedFindingsFrom(rawFindings: Issue[], triagedIssues: Issue[]): RuntimeCalibrationDetectedFinding[] {
  return [
    ...rawFindings.map((issue) => detectedFinding(issue, 'raw_finding' as const)),
    ...triagedIssues.map((issue) => detectedFinding(issue, 'triaged_issue' as const))
  ]
}

function detectedFinding(issue: Issue, source: 'raw_finding' | 'triaged_issue'): RuntimeCalibrationDetectedFinding {
  return {
    type: issue.type,
    title: issue.title,
    severity: issue.severity,
    source,
    evidence: issue.evidence
  }
}

function detectedScenarioFailuresFrom(runs: ScenarioRun[]): RuntimeCalibrationDetectedScenarioFailure[] {
  return runs.flatMap((run) =>
    run.assertions
      .filter((assertion) => assertion.status === 'failed')
      .map((assertion) => ({
        scenarioId: run.slug,
        assertion: assertion.label,
        evidence: assertion.evidence
      }))
  )
}

function matchesExpectedFinding(expected: RuntimeCalibrationExpectedFinding, detected: RuntimeCalibrationDetectedFinding): boolean {
  return detected.type === expected.type &&
    detected.title.toLowerCase().includes(expected.titleIncludes.toLowerCase()) &&
    (!expected.severity || detected.severity === expected.severity)
}

function matchesExpectedScenarioFailure(expected: RuntimeCalibrationExpectedScenarioFailure, detected: RuntimeCalibrationDetectedScenarioFailure): boolean {
  return detected.scenarioId === expected.scenarioId &&
    detected.assertion.toLowerCase().includes(expected.failedAssertionIncludes.toLowerCase())
}

async function loadOracle(root: string, id: string): Promise<RuntimeCalibrationOracle> {
  const oracle = JSON.parse(await readFile(path.join(root, 'sniffer.expected.json'), 'utf8')) as RuntimeCalibrationOracle
  if (oracle.id !== id) throw new Error(`Oracle id mismatch for ${id}: ${oracle.id}`)
  return oracle
}

function fixtureBehavior(fixtureId: string, oracle: RuntimeCalibrationOracle): RuntimeFixtureBehavior {
  if (oracle.template) {
    return {
      template: oracle.template,
      mutation: oracle.mutation ?? fixtureId,
      difficulty: oracle.difficulty
    }
  }
  const template = ({
    'broken-navigation-tab': 'navigation-tab',
    'modal-button-does-nothing': 'modal-dialog',
    'form-submit-no-validation': 'form-validation',
    'copy-button-broken': 'copy-export',
    'api-500': 'api-loading',
    'infinite-loading': 'api-loading',
    'route-404-broken-link': 'route-link',
    'horizontal-overflow-table': 'table-layout',
    'ambiguous-repeated-row-action': 'row-action',
    'runtime-exception-after-click': 'runtime-exception',
    'good-baseline': 'good-baseline'
  }[fixtureId] ?? 'good-baseline') as RuntimeFixtureTemplate
  return {
    template,
    mutation: fixtureId,
    difficulty: undefined
  }
}

async function writeRuntimeCalibrationReports(result: RuntimeBrokenUiCalibrationResult, runDir: string, latestDir: string): Promise<void> {
  await writeJson(result.reportJsonPath, result)
  await writeFile(result.reportMarkdownPath, renderRuntimeCalibrationMarkdown(result), 'utf8')
  await writeJson(path.join(runDir, 'latest_runtime_calibration.json'), result)
  await writeFile(path.join(runDir, 'latest_runtime_calibration.md'), renderRuntimeCalibrationMarkdown(result), 'utf8')
}

function renderRuntimeCalibrationMarkdown(result: RuntimeBrokenUiCalibrationResult): string {
  const lines = [
    '# Runtime Broken UI Calibration',
    '',
    `Generated: ${result.generatedAt}`,
    `Status: ${result.status.toUpperCase()}`,
    `Fixtures: ${result.passedFixtures}/${result.fixturesCount} passed`,
    `Good baselines clean: ${result.targets.filter((target) => target.template === 'good-baseline' && target.status === 'passed').length}/${result.targets.filter((target) => target.template === 'good-baseline').length}`,
    `Missed expected findings: ${result.targets.reduce((sum, target) => sum + target.missedExpectedFindings.length + target.missedScenarioFailures.length, 0)}`,
    `Unexpected findings: ${result.targets.reduce((sum, target) => sum + target.unexpectedFindings.length + target.unexpectedScenarioFailures.length, 0)}`,
    `Critic mode: ${result.criticMode}`,
    result.generatedFixtures ? `Generated fixtures: ${result.generatedFixtures.count} broken fixtures, seed ${result.generatedFixtures.seed}` : 'Generated fixtures: not used',
    '',
    '| Fixture | Template | Mutation | Expected | Detected | Missed | Unexpected | Status |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | --- |',
    ...result.targets.map((target) => `| ${target.fixture} | ${target.template ?? 'unknown'} | ${target.mutation ?? 'unknown'} | ${target.expectedFindings.length + target.expectedScenarioFailures.length} | ${target.detectedFindings.length + target.detectedScenarioFailures.length} | ${target.missedExpectedFindings.length + target.missedScenarioFailures.length} | ${target.unexpectedFindings.length + target.unexpectedScenarioFailures.length} | ${target.status.toUpperCase()} |`),
    ''
  ]
  for (const target of result.targets) {
    lines.push(
      `## ${target.status.toUpperCase()} ${target.name}`,
      '',
      `- Fixture: ${target.fixture}`,
      `- Template: ${target.template ?? 'unknown'}`,
      `- Mutation: ${target.mutation ?? 'unknown'}`,
      target.difficulty ? `- Difficulty: ${target.difficulty}` : '- Difficulty: unknown',
      `- URL: ${target.url}`,
      `- Report: ${target.reportPath}`,
      `- Scenario runs: ${target.scenarioRuns}`,
      `- Failed assertions: ${target.failedAssertions}`,
      `- Console errors: ${target.consoleErrors}`,
      `- Network failures: ${target.networkFailures}`,
      `- Screenshots: ${target.screenshots.length}`,
      `- Fix packets: ${target.fixPackets}`,
      target.screenshotPath ? `- Primary screenshot: ${target.screenshotPath}` : '- Primary screenshot: none',
      '',
      'Expected findings:',
      ...(target.expectedFindings.length ? target.expectedFindings.map((finding) => `- ${finding.type}: ${finding.titleIncludes}`) : ['- none']),
      '',
      'Expected scenario failures:',
      ...(target.expectedScenarioFailures.length ? target.expectedScenarioFailures.map((failure) => `- ${failure.scenarioId}: ${failure.failedAssertionIncludes}`) : ['- none']),
      '',
      'Detected findings:',
      ...(target.detectedFindings.length ? target.detectedFindings.map((finding) => `- ${finding.source} · ${finding.type}: ${finding.title}`) : ['- none']),
      '',
      'Detected scenario failures:',
      ...(target.detectedScenarioFailures.length ? target.detectedScenarioFailures.map((failure) => `- ${failure.scenarioId}: ${failure.assertion}`) : ['- none']),
      '',
      'Unexpected evidence:',
      ...(target.unexpectedFindings.length || target.unexpectedScenarioFailures.length
        ? [
          ...target.unexpectedFindings.map((finding) => `- ${finding.type}: ${finding.title}`),
          ...target.unexpectedScenarioFailures.map((failure) => `- ${failure.scenarioId}: ${failure.assertion}`)
        ]
        : ['- none']),
      '',
      'Missed expected evidence:',
      ...(target.missedExpectedFindings.length || target.missedScenarioFailures.length
        ? [
          ...target.missedExpectedFindings.map((finding) => `- ${finding.type}: ${finding.titleIncludes}`),
          ...target.missedScenarioFailures.map((failure) => `- ${failure.scenarioId}: ${failure.failedAssertionIncludes}`)
        ]
        : ['- none']),
      ''
    )
  }
  return `${lines.join('\n')}\n`
}

async function startRuntimeFixtureServer(root: string, fixtureId: string, behavior?: RuntimeFixtureBehavior): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    void (async () => {
      const parsed = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (parsed.pathname === '/api/items') {
        if (fixtureId === 'api-500' || behavior?.template === 'api-loading') {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'fixture forced 500' }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify([{ id: 1, name: 'Healthy item' }]))
        return
      }
      const pathname = decodeURIComponent(parsed.pathname)
      if (pathname === '/missing' && behavior?.template === 'route-link') {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<!doctype html><title>404</title><main><h1>404 Not found</h1><p>This generated fixture intentionally links to a missing route.</p></main>')
        return
      }
      const candidate = pathname === '/' || pathname === '/missing' ? 'index.html' : pathname.replace(/^\/+/, '')
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
  if (!address || typeof address === 'string') throw new Error('Could not start runtime fixture server')
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

async function pageSignature(page: Page): Promise<string> {
  return await page.locator('body').innerText().then((text) => text.replace(/\s+/g, ' ').trim()).catch(() => '')
}

function routeKey(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hash || parsed.pathname || '/'
  } catch {
    return url
  }
}

function fixture(id: string, name: string): RuntimeCalibrationFixture {
  return { id, name, root: path.join('fixtures', 'runtime-broken-ui', id) }
}

function ensureCalibrationTriageCoverage(rawFindings: Issue[], triagedIssues: Issue[]): Issue[] {
  const covered = new Set(triagedIssues.flatMap((issue) =>
    issue.evidence
      .filter((item) => item.startsWith('raw_finding: '))
      .map((item) => item.slice('raw_finding: '.length))
  ))
  const existingTitles = new Set(triagedIssues.map((issue) => issue.title.toLowerCase()))
  const calibrationActionableTypes = new Set<IssueType>([
    'workflow_confusion',
    'broken_interaction',
    'form_validation_issue',
    'copy_action_failure',
    'controlled_error_state_missing',
    'loading_state_stuck',
    'broken_navigation',
    'layout_issue',
    'locator_quality_issue',
    'accessibility_issue',
    'api_error',
    'console_error',
    'network_error',
    'functional_bug'
  ])
  const fallbackIssues = rawFindings
    .filter((issue) => calibrationActionableTypes.has(issue.type))
    .filter((issue) => !covered.has(issue.issue_id ?? issue.title))
    .filter((issue) => !existingTitles.has(issue.title.toLowerCase()))
    .map((issue): Issue => ({
      ...issue,
      evidence: [
        `raw_finding: ${issue.issue_id ?? issue.title}`,
        ...issue.evidence
      ],
      suggestedFixPrompt: issue.suggestedFixPrompt ?? `Fix the runtime behavior for "${issue.title}" using the screenshot, DOM, console/network, and scenario evidence from this calibration report.`
    }))
  return [...triagedIssues, ...fallbackIssues]
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'action'
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}
