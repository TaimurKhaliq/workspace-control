import { chromium, type Page } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type {
  ActionFrontierItem,
  CrawlAction,
  CrawlGraph,
  CrawlMode,
  CrawlState,
  FrontierStrategy,
  NetworkFailure,
  RuntimeActionCategory,
  RuntimeActionEdge,
  RuntimeGraph,
  RuntimeGraphCoverage,
  RuntimeMessage,
  RuntimeObservation,
  RuntimeStateNode,
  SkippedSafeAction,
  VisibleControlSummary,
  VisibleElement
} from '../types.js'
import { hashState } from '../graph/stateHash.js'
import { classifyActionSafety } from './safeActions.js'

const SAMPLE_PROMPT = 'Add OwnersPage (no actions yet)'
const navRouteByLabel = new Map([
  ['summary', '#summary'],
  ['projects', '#projects'],
  ['run timeline', '#timeline'],
  ['timeline', '#timeline'],
  ['scenarios', '#scenarios'],
  ['crawl path', '#crawl'],
  ['workflow evidence', '#workflows'],
  ['issues', '#issues'],
  ['fix packets', '#fix-packets'],
  ['screenshots', '#screenshots'],
  ['graph explorer', '#graph'],
  ['raw json', '#raw-json'],
  ['workspaces', '#workspaces'],
  ['repositories', '#repositories'],
  ['repos', '#repositories'],
  ['plan runs', '#prompt'],
  ['prompt', '#prompt'],
  ['learning', '#learning'],
  ['settings', '#settings']
])

export interface CrawlOptions {
  crawlMode?: CrawlMode
  maxDepth?: number
  maxActions?: number
  maxStates?: number
  maxPerRoute?: number
  maxDuplicateActions?: number
  staleIterations?: number
  timeBudgetMs?: number
  allowLongRunningActions?: boolean
  liveObserveMs?: number
  livePollMs?: number
  frontierStrategy?: FrontierStrategy
  reportDir: string
}

export interface CrawlCandidate {
  element: VisibleElement
  label: string
  actionType: 'click' | 'type'
  role: string
  target: string
  locatorUsed: string
  safeReason: string
  priority: number
  targetRoute?: string
  actionKey: string
  ineffectiveKey: string
}

export interface CrawlFrontierContext {
  attemptedActionKeys: Set<string>
  ineffectiveActionKeys: Map<string, number>
  routeVisitCounts: Map<string, number>
  maxPerRoute: number
  maxDuplicateActions: number
  allowedOrigin?: string
  allowExternalOrigins?: boolean
  crawlMode?: CrawlMode
  allowLongRunningActions?: boolean
}

export async function crawlApp(url: string, options: CrawlOptions): Promise<CrawlGraph> {
  const crawlMode = options.crawlMode ?? 'safe'
  if (crawlMode === 'deep' || crawlMode === 'live') {
    return crawlAppWithRuntimeGraph(url, { ...options, crawlMode })
  }
  const maxActions = options.maxActions ?? 36
  const maxStates = options.maxStates ?? Math.max(12, Math.min(maxActions, 24))
  const maxPerRoute = options.maxPerRoute ?? 8
  const maxDuplicateActions = options.maxDuplicateActions ?? 1
  const staleIterations = options.staleIterations ?? 5
  const screenshotsDir = path.join(options.reportDir, 'screenshots')
  await mkdir(screenshotsDir, { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage()
  page.setDefaultTimeout(5_000)
  page.setDefaultNavigationTimeout(10_000)
  const consoleErrors: RuntimeMessage[] = []
  const networkFailures: NetworkFailure[] = []
  const states: CrawlState[] = []
  const actions: CrawlAction[] = []
  const screenshots: string[] = []
  const stateByHash = new Map<string, CrawlState>()
  const attemptedActionKeys = new Set<string>()
  const ineffectiveActionKeys = new Map<string, number>()
  const routeVisitCounts = new Map<string, number>()
  const unvisitedSafeActions: SkippedSafeAction[] = []
  const routeHintsByStateHash = new Map<string, string>()
  const deadline = Date.now() + (options.timeBudgetMs ?? 30_000)

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push({ text: message.text(), location: message.location().url })
  })
  page.on('requestfailed', (request) => {
    networkFailures.push({
      url: request.url(),
      method: request.method(),
      failureText: request.failure()?.errorText ?? 'request failed'
    })
  })
  page.on('response', async (response) => {
    const request = response.request()
    if (response.ok() || !response.url().includes('/api/')) return
    let body = ''
    try {
      body = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 1000)
    } catch {
      body = ''
    }
    networkFailures.push({
      url: response.url(),
      method: request.method(),
      failureText: `HTTP ${response.status()} ${response.statusText()}`.trim(),
      statusCode: response.status(),
      responseBody: body
    })
  })

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10_000 })
    let stale = 0

    for (let actionIndex = 0; actionIndex <= maxActions && Date.now() < deadline; actionIndex += 1) {
      let captured: CrawlState
      try {
        captured = applyRouteHint(await withTimeout(captureState(page), 5_000, 'state capture timed out'), routeHintsByStateHash)
      } catch (error) {
        consoleErrors.push({ text: `Crawler state capture failed: ${errorMessage(error)}`, location: safePageUrl(page, url) })
        break
      }
      const existing = stateByHash.get(captured.hash)
      const state = existing ?? captured
      if (existing) {
        stale += 1
        existing.duplicateCount = (existing.duplicateCount ?? 1) + 1
      } else {
        stale = 0
        state.id = `state-${states.length + 1}`
        state.sequenceNumber = states.length + 1
        state.duplicateCount = 1
        states.push(state)
        stateByHash.set(state.hash, state)
        const screenshotPath = path.join(screenshotsDir, `state-${states.length}.png`)
        const capturedScreenshot = await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 5_000 }).then(() => true).catch(() => false)
        if (capturedScreenshot) {
          screenshots.push(screenshotPath)
          state.screenshotPath = screenshotPath
        }
        routeVisitCounts.set(stateRouteKey(state), (routeVisitCounts.get(stateRouteKey(state)) ?? 0) + 1)
      }
      if (stale >= staleIterations) break
      if (states.length >= maxStates) break

      const candidates = buildCrawlCandidates(captured, {
        attemptedActionKeys,
        ineffectiveActionKeys,
        routeVisitCounts,
        maxPerRoute,
        maxDuplicateActions,
        allowedOrigin: new URL(url).origin,
        crawlMode: 'safe',
        allowLongRunningActions: options.allowLongRunningActions
      })
      recordSkippedFrontier(captured, candidates.skipped, unvisitedSafeActions)
      const candidate = candidates.next
      if (!candidate) break

      const urlBefore = safePageUrl(page, url)
      const screenshotBefore = state.screenshotPath
      const sequenceNumber = actions.length + 1
      let stateHashAfter: string | undefined
      let screenshotAfter: string | undefined
      try {
        if (candidate.actionType === 'type') await typeCandidate(page, candidate.element)
        else await clickCandidate(page, candidate.element)
        await page.waitForLoadState('domcontentloaded', { timeout: 2_000 }).catch(() => undefined)
        await page.waitForTimeout(200)
        const after = applyRouteHint(await withTimeout(captureState(page), 5_000, 'state capture timed out after action'), routeHintsByStateHash)
        stateHashAfter = after.hash
        if (candidate.targetRoute && candidate.targetRoute !== routeKey(urlBefore)) {
          routeHintsByStateHash.set(after.hash, candidate.targetRoute)
          applyRouteHint(after, routeHintsByStateHash)
        }
        const screenshotAfterPath = path.join(screenshotsDir, `action-${sequenceNumber}-after.png`)
        screenshotAfter = await page.screenshot({ path: screenshotAfterPath, fullPage: true, timeout: 5_000 }).then(() => screenshotAfterPath).catch(() => undefined)
        const changedState = after.hash !== captured.hash || safePageUrl(page, url) !== urlBefore
        if (!changedState) {
          ineffectiveActionKeys.set(candidate.ineffectiveKey, (ineffectiveActionKeys.get(candidate.ineffectiveKey) ?? 0) + 1)
        }
        attemptedActionKeys.add(candidate.actionKey)
        actions.push({
          id: `action-${sequenceNumber}`,
          sequenceNumber,
          type: candidate.actionType,
          actionType: candidate.actionType,
          label: candidate.label,
          role: candidate.role,
          locatorUsed: candidate.locatorUsed,
          target: candidate.target,
          urlBefore,
          urlAfter: safePageUrl(page, url),
          stateHashBefore: captured.hash,
          stateHashAfter,
          changedState,
          safe: true,
          safeReason: candidate.safeReason,
          screenshotBefore,
          screenshotAfter,
          reason: candidate.safeReason
        })
      } catch (error) {
        attemptedActionKeys.add(candidate.actionKey)
        actions.push({
          id: `action-${sequenceNumber}`,
          sequenceNumber,
          type: 'skip',
          actionType: 'skip',
          label: candidate.label,
          role: candidate.role,
          locatorUsed: candidate.locatorUsed,
          target: candidate.target,
          urlBefore,
          stateHashBefore: captured.hash,
          safe: true,
          safeReason: candidate.safeReason,
          skipped: true,
          skippedReason: errorMessage(error),
          screenshotBefore,
          reason: errorMessage(error)
        })
        if (/target.*crash|page.*crash|browser.*closed/i.test(errorMessage(error))) {
          consoleErrors.push({ text: `Crawler action failed after page crash: ${errorMessage(error)}`, location: urlBefore })
          break
        }
      }
    }
  } catch (error) {
    consoleErrors.push({ text: `Crawler failed: ${errorMessage(error)}`, location: safePageUrl(page, url) })
  }

  annotateActionStateLinks(states, actions)

  const graph: CrawlGraph = {
    startUrl: url,
    title: await safePageTitle(page),
    finalUrl: safePageUrl(page, url),
    crawlMode: 'safe',
    states,
    actions,
    unvisitedSafeActions,
    coverage: {
      sourceRoutes: [],
      visitedRoutes: unique(states.map((state) => state.hashRoute ?? routeKey(state.url))),
      missedRoutes: [],
      workflowsDiscovered: 0,
      workflowsExercised: 0,
      scenariosPassed: 0,
      scenariosFailed: 0,
      scenariosSkipped: 0,
      safeActionsSkipped: unvisitedSafeActions
    },
    consoleErrors,
    networkFailures,
    screenshots,
    generatedAt: new Date().toISOString()
  }

  await browser.close().catch(() => undefined)
  return graph
}

async function captureAndRegisterState(page: Page, context: RuntimeGraphContext, parentActionId: string | undefined, depth: number): Promise<CrawlState> {
  const captured = applyRouteHint(await withTimeout(captureState(page), 5_000, 'state capture timed out'), context.routeHintsByStateHash)
  return registerCapturedState(page, captured, context, parentActionId, depth)
}

async function registerCapturedState(page: Page, captured: CrawlState, context: RuntimeGraphContext, parentActionId: string | undefined, depth: number): Promise<CrawlState> {
  const existing = context.stateByHash.get(captured.hash)
  if (existing) {
    existing.duplicateCount = (existing.duplicateCount ?? 1) + 1
    existing.visitCount = (existing.visitCount ?? 1) + 1
    const node = context.runtimeGraph.nodes.find((item) => item.id === existing.id)
    if (node) node.visitCount += 1
    return existing
  }
  captured.id = `state-${context.states.length + 1}`
  captured.sequenceNumber = context.states.length + 1
  captured.duplicateCount = 1
  captured.visitCount = 1
  captured.depth = depth
  captured.parentActionId = parentActionId
  captured.timestamp = captured.timestamp ?? new Date().toISOString()
  const screenshotPath = await captureScreenshot(page, context, `state-${context.states.length + 1}.png`)
  if (screenshotPath) captured.screenshotPath = screenshotPath
  context.states.push(captured)
  context.stateByHash.set(captured.hash, captured)
  context.routeVisitCounts.set(stateRouteKey(captured), (context.routeVisitCounts.get(stateRouteKey(captured)) ?? 0) + 1)
  context.runtimeGraph.nodes.push(runtimeNodeFromState(captured, parentActionId, depth))
  return captured
}

async function captureScreenshot(page: Page, context: RuntimeGraphContext, fileName: string): Promise<string | undefined> {
  const screenshotPath = path.join(context.screenshotsDir, fileName)
  const captured = await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 5_000 }).then(() => true).catch(() => false)
  if (!captured) return undefined
  if (!context.screenshots.includes(screenshotPath)) context.screenshots.push(screenshotPath)
  return screenshotPath
}

function runtimeNodeFromState(state: CrawlState, parentActionId: string | undefined, depth: number): RuntimeStateNode {
  return {
    id: state.id ?? state.hash,
    url: state.url,
    route: state.hashRoute,
    inferredScreenName: state.inferredScreenName,
    pageType: state.inferredPageType,
    domSignature: state.domSignature ?? state.hash,
    textSignature: state.textSignature ?? state.hash,
    controlSignature: state.controlSignature ?? state.hash,
    screenshotPath: state.screenshotPath,
    timestamp: state.timestamp ?? new Date().toISOString(),
    parentActionId,
    depth,
    visitCount: state.visitCount ?? 1,
    observedDuringRunId: state.observedDuringRunId
  }
}

function enqueueCandidates(state: CrawlState, parentPath: DeepFrontierItem['path'], context: RuntimeGraphContext, options: CrawlOptions & { crawlMode: 'deep' | 'live' }): DeepFrontierItem[] {
  const candidates = buildCrawlCandidatesForFrontier(state, {
    attemptedActionKeys: context.attemptedActionKeys,
    ineffectiveActionKeys: context.ineffectiveActionKeys,
    routeVisitCounts: context.routeVisitCounts,
    maxPerRoute: context.maxPerRoute,
    maxDuplicateActions: context.maxDuplicateActions,
    allowedOrigin: context.allowedOrigin,
    crawlMode: options.crawlMode,
    allowLongRunningActions: options.allowLongRunningActions
  }, context.unvisitedSafeActions)
  const pathPrefix = parentPath.length ? parentPath : []
  return candidates.map((candidate, index) => ({
    id: `frontier-${state.id}-${index}-${slug(candidate.label)}`,
    stateId: state.id ?? state.hash,
    stateHash: state.hash,
    actionKey: candidate.actionKey,
    label: candidate.label,
    locatorUsed: candidate.locatorUsed,
    actionCategory: categorizeAction(candidate.label, candidate.role),
    priority: candidate.priority,
    depth: (state.depth ?? 0) + 1,
    path: [...pathPrefix, pathStepFromCandidate(candidate)],
    candidate,
    reason: candidate.safeReason
  }))
}

function buildCrawlCandidatesForFrontier(state: CrawlState, context: CrawlFrontierContext, skippedSink: SkippedSafeAction[]): CrawlCandidate[] {
  const skipped: SkippedSafeAction[] = []
  const candidates = state.visible
    .map((element) => candidateFromElement(state, element, context, skipped))
    .filter(Boolean) as CrawlCandidate[]
  recordSkippedFrontier(state, skipped, skippedSink)
  return candidates
}

function sortFrontier(frontier: DeepFrontierItem[], strategy: FrontierStrategy): DeepFrontierItem[] {
  if (strategy === 'bfs') return frontier.sort((a, b) => a.depth - b.depth || b.priority - a.priority)
  return frontier.sort((a, b) => b.priority - a.priority || a.depth - b.depth || a.label.localeCompare(b.label))
}

function pathStepFromCandidate(candidate: CrawlCandidate) {
  return {
    label: candidate.label,
    role: candidate.role,
    actionType: candidate.actionType,
    selectorHint: candidate.element.selectorHint,
    target: candidate.target
  }
}

async function replayPath(page: Page, startUrl: string, pathSteps: DeepFrontierItem['path'], options: CrawlOptions): Promise<{ ok: boolean; reason?: string }> {
  await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 10_000 }).catch((error) => {
    throw new Error(`reload failed: ${errorMessage(error)}`)
  })
  await page.waitForLoadState('networkidle', { timeout: 1_000 }).catch(() => undefined)
  if (options.crawlMode === 'live') await installRuntimeMutationObserver(page)
  for (const step of pathSteps) {
    const element: VisibleElement = {
      kind: step.role === 'link' ? 'link' : step.role === 'tab' ? 'tab' : step.actionType === 'type' ? 'input' : 'button',
      text: step.label,
      name: step.label,
      selectorHint: step.selectorHint
    }
    try {
      if (step.actionType === 'type') await typeCandidate(page, element)
      else await clickCandidate(page, element)
      await page.waitForLoadState('domcontentloaded', { timeout: 1_500 }).catch(() => undefined)
      await page.waitForTimeout(100)
    } catch (error) {
      return { ok: false, reason: `${step.label}: ${errorMessage(error)}` }
    }
  }
  return { ok: true }
}

async function recordSkippedAction(
  item: DeepFrontierItem,
  sourceState: CrawlState,
  context: RuntimeGraphContext,
  reason: string,
  details?: { sequenceNumber: number; urlBefore: string; stateHashBefore: string; screenshotBefore?: string; actionId: string; startedAt: string }
): Promise<void> {
  const sequenceNumber = details?.sequenceNumber ?? context.actions.length + 1
  context.actions.push({
    id: details?.actionId ?? `action-${sequenceNumber}`,
    sequenceNumber,
    type: 'skip',
    actionType: 'skip',
    label: item.label,
    role: item.candidate.role,
    locatorUsed: item.locatorUsed,
    target: item.candidate.target,
    actionCategory: item.actionCategory,
    urlBefore: details?.urlBefore ?? sourceState.url,
    startedAt: details?.startedAt ?? new Date().toISOString(),
    endedAt: new Date().toISOString(),
    stateHashBefore: details?.stateHashBefore ?? sourceState.hash,
    safe: true,
    safeReason: item.candidate.safeReason,
    skipped: true,
    skippedReason: reason,
    screenshotBefore: details?.screenshotBefore ?? sourceState.screenshotPath,
    reason
  })
}

async function installRuntimeMutationObserver(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    if (window.__snifferMutationObserverInstalled) return;
    window.__snifferMutations = [];
    const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim().slice(0, 300);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target instanceof HTMLElement ? mutation.target : mutation.target?.parentElement;
        const text = normalize(target?.innerText || target?.textContent || '');
        if (!text) continue;
        window.__snifferMutations.push({
          text,
          selector: target?.getAttribute('data-testid') || target?.getAttribute('role') || target?.tagName?.toLowerCase() || 'node',
          timestamp: new Date().toISOString()
        });
      }
      window.__snifferMutations = window.__snifferMutations.slice(-80);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.__snifferMutationObserverInstalled = true;
  })()`).catch(() => undefined)
}

async function observeLiveWindow(page: Page, edge: RuntimeActionEdge, before: CrawlState, context: RuntimeGraphContext, options: CrawlOptions): Promise<RuntimeObservation[]> {
  context.liveObservationWindows += 1
  await installRuntimeMutationObserver(page)
  const observeMs = Math.max(0, options.liveObserveMs ?? 10_000)
  const pollMs = Math.max(100, options.livePollMs ?? 500)
  const deadline = Date.now() + observeMs
  const observations: RuntimeObservation[] = []
  let lastDigest = await liveDigest(page)
  let stablePolls = 0
  while (Date.now() < deadline) {
    await page.waitForTimeout(pollMs)
    const digest = await liveDigest(page)
    const kind = classifyObservation(lastDigest, digest)
    if (kind) {
      stablePolls = 0
      const screenshotPath = observations.length < 4 ? await captureScreenshot(page, context, `live-${edge.id}-${observations.length + 1}.png`) : undefined
      const observation: RuntimeObservation = {
        id: `obs-${context.runtimeGraph.observations.length + observations.length + 1}`,
        stateId: edge.fromStateId,
        actionId: edge.id,
        kind,
        text: observationText(kind, lastDigest, digest),
        selector: digest.lastMutationSelector,
        timestamp: new Date().toISOString(),
        screenshotPath
      }
      observations.push(observation)
      context.runtimeGraph.observations.push(observation)
      lastDigest = digest
    } else {
      stablePolls += 1
    }
    if (stablePolls >= 4 || terminalStatusDetected(digest.text)) break
  }
  if (observations.length === 0 && before.textSignature !== lastDigest.signature) {
    const observation: RuntimeObservation = {
      id: `obs-${context.runtimeGraph.observations.length + 1}`,
      stateId: edge.fromStateId,
      actionId: edge.id,
      kind: 'text_change',
      text: 'Visible text changed during live observation.',
      timestamp: new Date().toISOString()
    }
    observations.push(observation)
    context.runtimeGraph.observations.push(observation)
  }
  return observations
}

interface LiveDigest {
  signature: string
  text: string
  statusText: string
  logText: string
  spinnerVisible: boolean
  mutationCount: number
  lastMutationText?: string
  lastMutationSelector?: string
}

async function liveDigest(page: Page): Promise<LiveDigest> {
  const value = await page.evaluate(`(() => {
    const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const textFor = (selector) => Array.from(document.querySelectorAll(selector)).map((el) => normalize(el.textContent || '')).filter(Boolean).join(' | ').slice(0, 1200);
    const statusText = textFor('[role="status"],[role="alert"],[aria-live],.status,.alert,.error,.success,.toast,[data-testid*="status"]');
    const logText = textFor('[role="log"],pre,code,.log,[data-testid*="log"],[data-testid*="output"]');
    const text = normalize(document.body?.innerText || '').slice(0, 2200);
    const spinnerVisible = Array.from(document.querySelectorAll('[role="progressbar"],.spinner,.loading,[aria-busy="true"],[data-testid*="loading"]')).some((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });
    const mutations = window.__snifferMutations || [];
    const last = mutations[mutations.length - 1];
    return { text, statusText, logText, spinnerVisible, mutationCount: mutations.length, lastMutationText: last?.text, lastMutationSelector: last?.selector };
  })()`) as Omit<LiveDigest, 'signature'>
  return { ...value, signature: hashState(value) }
}

function classifyObservation(before: LiveDigest, after: LiveDigest): RuntimeObservation['kind'] | undefined {
  if (before.spinnerVisible !== after.spinnerVisible) return after.spinnerVisible ? 'spinner_started' : 'spinner_stopped'
  if (before.statusText !== after.statusText) return 'status_change'
  if (before.logText !== after.logText) return 'log_added'
  if (after.mutationCount > before.mutationCount) return 'dom_mutation'
  if (before.text !== after.text) {
    if (/generated|created|report|result|output|artifact|fix packet/i.test(after.text) && after.text.length > before.text.length) return 'output_generated'
    return 'text_change'
  }
  if (/succeeded|success|passed/i.test(after.statusText) && /failed|error|exception/i.test(after.logText)) return 'mismatch_detected'
  return undefined
}

function observationText(kind: RuntimeObservation['kind'], before: LiveDigest, after: LiveDigest): string {
  if (kind === 'status_change') return `Status changed: ${before.statusText || '(empty)'} -> ${after.statusText || '(empty)'}`
  if (kind === 'log_added') return `Log/output changed: ${after.logText.slice(0, 500)}`
  if (kind === 'spinner_started') return 'Loading/progress indicator appeared.'
  if (kind === 'spinner_stopped') return 'Loading/progress indicator disappeared.'
  if (kind === 'mismatch_detected') return `Status/log mismatch: status="${after.statusText}" log="${after.logText.slice(0, 300)}"`
  if (kind === 'output_generated') return `Output appeared: ${after.text.slice(0, 500)}`
  return after.lastMutationText ?? `Visible text changed: ${after.text.slice(0, 500)}`
}

function terminalStatusDetected(text: string): boolean {
  return /\b(succeeded|success|passed|failed|error|completed|complete|done|ready)\b/i.test(text)
}

function categorizeAction(label: string, role: string): RuntimeActionCategory {
  const text = label.toLowerCase()
  if (role === 'tab' || /tab|overview|details|settings/.test(text)) return 'tab'
  if (/modal|dialog|add item|add project|create workspace|add repository/.test(text)) return 'modal'
  if (/run audit|start audit|audit/.test(text)) return 'run_audit'
  if (/repair|fix packet|apply fix|codex/.test(text)) return /apply/.test(text) ? 'apply_fix' : 'repair'
  if (/verify/.test(text)) return 'verify'
  if (/refresh|reload|sync/.test(text)) return 'refresh'
  if (/generate|create|submit/.test(text)) return /submit/.test(text) ? 'submit' : 'generate'
  if (/copy|export|download/.test(text)) return 'copy'
  if (role === 'link' || /summary|projects|timeline|scenarios|crawl|workflow|issues|screenshots|graph|raw json|settings|home|next|back/.test(text)) return 'navigation'
  if (role === 'input') return 'form_input'
  return 'unknown'
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'action'
}

interface DeepFrontierItem extends ActionFrontierItem {
  candidate: CrawlCandidate
}

interface RuntimeGraphContext {
  screenshotsDir: string
  states: CrawlState[]
  actions: CrawlAction[]
  screenshots: string[]
  stateByHash: Map<string, CrawlState>
  runtimeGraph: RuntimeGraph
  attemptedActionKeys: Set<string>
  ineffectiveActionKeys: Map<string, number>
  routeVisitCounts: Map<string, number>
  unvisitedSafeActions: SkippedSafeAction[]
  routeHintsByStateHash: Map<string, string>
  longRunningSkipped: number
  longRunningExecuted: number
  liveObservationWindows: number
  maxPerRoute: number
  maxDuplicateActions: number
  maxDepth: number
  allowedOrigin: string
  startUrl: string
}

async function crawlAppWithRuntimeGraph(url: string, options: CrawlOptions & { crawlMode: 'deep' | 'live' }): Promise<CrawlGraph> {
  const maxActions = options.maxActions ?? 60
  const maxStates = options.maxStates ?? Math.max(16, Math.min(maxActions + 1, 48))
  const maxDepth = options.maxDepth ?? 4
  const screenshotsDir = path.join(options.reportDir, 'screenshots')
  await mkdir(screenshotsDir, { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage()
  page.setDefaultTimeout(5_000)
  page.setDefaultNavigationTimeout(10_000)
  const consoleErrors: RuntimeMessage[] = []
  const networkFailures: NetworkFailure[] = []
  const deadline = Date.now() + (options.timeBudgetMs ?? 60_000)
  const context: RuntimeGraphContext = {
    screenshotsDir,
    states: [],
    actions: [],
    screenshots: [],
    stateByHash: new Map(),
    runtimeGraph: { nodes: [], edges: [], observations: [], unresolvedFrontier: [] },
    attemptedActionKeys: new Set(),
    ineffectiveActionKeys: new Map(),
    routeVisitCounts: new Map(),
    unvisitedSafeActions: [],
    routeHintsByStateHash: new Map(),
    longRunningSkipped: 0,
    longRunningExecuted: 0,
    liveObservationWindows: 0,
    maxPerRoute: options.maxPerRoute ?? 10,
    maxDuplicateActions: options.maxDuplicateActions ?? 2,
    maxDepth,
    allowedOrigin: new URL(url).origin,
    startUrl: url
  }

  page.on('console', (message) => {
    if (message.type() === 'error') {
      const runtimeMessage = { text: message.text(), location: message.location().url }
      consoleErrors.push(runtimeMessage)
      const state = context.states.at(-1)
      if (state?.id) {
        context.runtimeGraph.observations.push({
          id: `obs-${context.runtimeGraph.observations.length + 1}`,
          stateId: state.id,
          kind: 'console_error',
          text: message.text(),
          context: message.location().url,
          timestamp: new Date().toISOString()
        })
      }
    }
  })
  page.on('requestfailed', (request) => {
    networkFailures.push({
      url: request.url(),
      method: request.method(),
      failureText: request.failure()?.errorText ?? 'request failed'
    })
  })
  page.on('response', async (response) => {
    const request = response.request()
    if (response.ok() || !response.url().includes('/api/')) return
    let body = ''
    try {
      body = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 1000)
    } catch {
      body = ''
    }
    networkFailures.push({
      url: response.url(),
      method: request.method(),
      failureText: `HTTP ${response.status()} ${response.statusText()}`.trim(),
      statusCode: response.status(),
      responseBody: body
    })
  })

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10_000 })
    if (options.crawlMode === 'live') await installRuntimeMutationObserver(page)
    const initial = await captureAndRegisterState(page, context, undefined, 0)
    let frontier = enqueueCandidates(initial, [], context, options)

    while (frontier.length > 0 && context.actions.length < maxActions && context.states.length < maxStates && Date.now() < deadline) {
      frontier = sortFrontier(frontier, options.frontierStrategy ?? 'priority')
      const item = frontier.shift()!
      if (item.depth > maxDepth) {
        context.unvisitedSafeActions.push({ label: item.label, reason: `max depth ${maxDepth} reached`, stateId: item.stateId, route: routeKey(item.locatorUsed) })
        continue
      }
      const sourceState = context.states.find((state) => state.id === item.stateId)
      if (!sourceState) continue
      if (context.attemptedActionKeys.has(item.actionKey)) continue
      const replayed = await replayPath(page, url, item.path.slice(0, -1), options)
      if (!replayed.ok) {
        await recordSkippedAction(item, sourceState, context, `path replay failed: ${replayed.reason}`)
        continue
      }

      const before = applyRouteHint(await withTimeout(captureState(page), 5_000, 'state capture timed out before deep action'), context.routeHintsByStateHash)
      const urlBefore = safePageUrl(page, url)
      const sequenceNumber = context.actions.length + 1
      const actionId = `action-${sequenceNumber}`
      const startedAt = new Date().toISOString()
      let edge: RuntimeActionEdge = {
        id: actionId,
        fromStateId: sourceState.id ?? item.stateId,
        actionLabel: item.label,
        actionKind: item.candidate.actionType,
        locator: item.locatorUsed,
        safe: true,
        actionCategory: item.actionCategory,
        startedAt,
        screenshotBefore: sourceState.screenshotPath
      }
      let crawlAction: CrawlAction | undefined
      try {
        if (isLongRunningToolAction(item.label)) context.longRunningExecuted += 1
        if (item.candidate.actionType === 'type') await typeCandidate(page, item.candidate.element)
        else await clickCandidate(page, item.candidate.element)
        await page.waitForLoadState('domcontentloaded', { timeout: 2_000 }).catch(() => undefined)
        await page.waitForTimeout(options.crawlMode === 'live' ? 350 : 200)

        const liveObservations = options.crawlMode === 'live'
          ? await observeLiveWindow(page, edge, before, context, options)
          : []
        const after = applyRouteHint(await withTimeout(captureState(page), 5_000, 'state capture timed out after deep action'), context.routeHintsByStateHash)
        const afterState = await registerCapturedState(page, after, context, actionId, item.depth)
        const screenshotAfterPath = await captureScreenshot(page, context, `action-${sequenceNumber}-after.png`)
        if (screenshotAfterPath && !afterState.screenshotPath) afterState.screenshotPath = screenshotAfterPath

        const changedUrl = safePageUrl(page, url) !== urlBefore
        const changedDom = after.domSignature !== before.domSignature || after.hash !== before.hash
        const changedText = after.textSignature !== before.textSignature
        const changedControls = after.controlSignature !== before.controlSignature
        const changedState = changedUrl || changedDom || changedText || changedControls
        if (!changedState) {
          context.ineffectiveActionKeys.set(item.candidate.ineffectiveKey, (context.ineffectiveActionKeys.get(item.candidate.ineffectiveKey) ?? 0) + 1)
        }
        edge = {
          ...edge,
          toStateId: afterState.id,
          endedAt: new Date().toISOString(),
          changedUrl,
          changedDom,
          changedText,
          changedControls,
          producedConsoleErrors: consoleErrors.length,
          producedNetworkFailures: networkFailures.length,
          producedRuntimeObservations: liveObservations.map((observation) => observation.id),
          screenshotAfter: screenshotAfterPath
        }
        crawlAction = {
          id: actionId,
          sequenceNumber,
          type: item.candidate.actionType,
          actionType: item.candidate.actionType,
          label: item.label,
          role: item.candidate.role,
          locatorUsed: item.locatorUsed,
          target: item.candidate.target,
          actionCategory: item.actionCategory,
          urlBefore,
          urlAfter: safePageUrl(page, url),
          startedAt,
          endedAt: edge.endedAt,
          stateHashBefore: before.hash,
          stateHashAfter: after.hash,
          changedState,
          changedUrl,
          changedDom,
          changedText,
          changedControls,
          producedConsoleErrors: edge.producedConsoleErrors,
          producedNetworkFailures: edge.producedNetworkFailures,
          producedRuntimeObservations: edge.producedRuntimeObservations,
          safe: true,
          safeReason: item.candidate.safeReason,
          screenshotBefore: edge.screenshotBefore,
          screenshotAfter: edge.screenshotAfter,
          reason: item.candidate.safeReason
        }
        context.attemptedActionKeys.add(item.actionKey)
        context.actions.push(crawlAction)
        context.runtimeGraph.edges.push(edge)
        if (context.states.length < maxStates) {
          frontier.push(...enqueueCandidates(afterState, item.path, context, options))
        }
      } catch (error) {
        context.attemptedActionKeys.add(item.actionKey)
        await recordSkippedAction(item, sourceState, context, errorMessage(error), {
          sequenceNumber,
          urlBefore,
          stateHashBefore: before.hash,
          screenshotBefore: sourceState.screenshotPath,
          actionId,
          startedAt
        })
        context.runtimeGraph.edges.push({ ...edge, endedAt: new Date().toISOString() })
      }
    }
    context.runtimeGraph.unresolvedFrontier = frontier.slice(0, 100).map((item) => {
      const { candidate: _candidate, ...serializable } = item
      return serializable
    })
  } catch (error) {
    consoleErrors.push({ text: `Deep crawler failed: ${errorMessage(error)}`, location: safePageUrl(page, url) })
  }

  annotateActionStateLinks(context.states, context.actions)
  const coverage: RuntimeGraphCoverage = {
    crawlMode: options.crawlMode,
    statesDiscovered: context.states.length,
    edgesExplored: context.runtimeGraph.edges.length,
    frontierExhausted: context.runtimeGraph.unresolvedFrontier.length === 0,
    maxDepthReached: context.runtimeGraph.unresolvedFrontier.some((item) => item.depth >= maxDepth),
    unvisitedSafeActions: context.unvisitedSafeActions.length,
    longRunningActionsSkipped: context.longRunningSkipped + context.unvisitedSafeActions.filter((item) => /long-running/.test(item.reason)).length,
    longRunningActionsExecuted: context.longRunningExecuted,
    dynamicObservationsCaptured: context.runtimeGraph.observations.length,
    liveObservationWindows: context.liveObservationWindows
  }
  const graph: CrawlGraph = {
    startUrl: url,
    title: await safePageTitle(page),
    finalUrl: safePageUrl(page, url),
    crawlMode: options.crawlMode,
    states: context.states,
    actions: context.actions,
    unvisitedSafeActions: context.unvisitedSafeActions,
    coverage: {
      sourceRoutes: [],
      visitedRoutes: unique(context.states.map((state) => state.hashRoute ?? routeKey(state.url))),
      missedRoutes: [],
      workflowsDiscovered: 0,
      workflowsExercised: 0,
      scenariosPassed: 0,
      scenariosFailed: 0,
      scenariosSkipped: 0,
      safeActionsSkipped: context.unvisitedSafeActions
    },
    runtimeGraph: context.runtimeGraph,
    runtimeObservations: context.runtimeGraph.observations,
    runtimeGraphCoverage: coverage,
    consoleErrors,
    networkFailures,
    screenshots: context.screenshots,
    generatedAt: new Date().toISOString()
  }
  await browser.close().catch(() => undefined)
  return graph
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function safePageUrl(page: Page, fallback: string): string {
  try {
    return page.url()
  } catch {
    return fallback
  }
}

async function safePageTitle(page: Page): Promise<string> {
  try {
    return await page.title()
  } catch {
    return ''
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

export async function captureState(page: Page): Promise<CrawlState> {
  const visible = await page.evaluate(`(() => {
    const textOf = (el) => {
      if (el instanceof HTMLSelectElement) {
        const selected = el.selectedOptions[0]?.textContent?.trim();
        if (selected) return selected;
      }
      const raw = el instanceof HTMLElement ? (el.innerText || el.textContent || '') : (el.textContent || '');
      const text = raw.replace(/\\s+/g, ' ').trim();
      return text || undefined;
    };
    const selectorHint = (el) => {
      const id = el.getAttribute('id');
      if (id) return '#' + id;
      const testId = el.getAttribute('data-testid');
      if (testId) return '[data-testid="' + testId + '"]';
      return el.tagName.toLowerCase();
    };
    const elements = [];
    for (const el of Array.from(document.querySelectorAll('button,a,[role="tab"],input,textarea,select,form,[role="dialog"],dialog'))) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
      const centerX = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
      const centerY = Math.min(window.innerHeight - 1, Math.max(0, rect.top + Math.min(rect.height / 2, 24)));
      const top = document.elementFromPoint(centerX, centerY);
      if (top && top !== el && !el.contains(top) && !top.contains(el)) continue;
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role');
      const kind =
        tag === 'a' ? 'link' :
        role === 'tab' ? 'tab' :
        tag === 'input' || tag === 'textarea' || tag === 'select' ? 'input' :
        tag === 'form' ? 'form' :
        role === 'dialog' || tag === 'dialog' ? 'dialog' :
        'button';
      elements.push({
        kind,
        text: textOf(el),
        name: el.getAttribute('aria-label') || el.getAttribute('name') || undefined,
        href: tag === 'a' ? el.href : undefined,
        type: el.getAttribute('type') || undefined,
        selectorHint: selectorHint(el)
      });
    }
    return elements;
  })()`) as VisibleElement[]

  const primaryVisibleText = await page.evaluate(`(() => {
    const text = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
    return text ? text.split(/(?<=[.!?])\\s+|\\n+/).map((item) => item.trim()).filter(Boolean).slice(0, 12) : [];
  })()`) as string[]
  const dynamic = await page.evaluate(`(() => {
    const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const pickText = (selector) => Array.from(document.querySelectorAll(selector))
      .map((el) => normalize(el.textContent || ''))
      .filter(Boolean)
      .slice(0, 12);
    const headings = pickText('h1,h2,h3,[role="heading"]');
    const statusText = pickText('[role="status"],[role="alert"],[role="log"],[aria-live],.status,.alert,.error,.success,.toast,.log,[data-testid*="status"],[data-testid*="log"],[data-testid*="output"]');
    const selected = Array.from(document.querySelectorAll('[aria-selected="true"],[aria-current],.active,[data-active="true"]'))
      .map((el) => normalize(el.textContent || el.getAttribute('aria-label') || el.getAttribute('data-testid') || ''))
      .filter(Boolean)
      .slice(0, 12);
    const dataTestIds = Array.from(document.querySelectorAll('[data-testid]'))
      .map((el) => String(el.getAttribute('data-testid') || '') + ':' + normalize(el.textContent || '').slice(0, 80))
      .filter(Boolean)
      .slice(0, 80);
    const bodyText = normalize(document.body?.innerText || '').slice(0, 2500);
    return { headings, statusText, selected, dataTestIds, bodyText };
  })()`) as {
    headings: string[]
    statusText: string[]
    selected: string[]
    dataTestIds: string[]
    bodyText: string
  }
  const controlSignature = hashState({
    visible: visible.map(({ kind, text, name, href, type }) => ({ kind, text, name, href, type }))
  })
  const textSignature = hashState({
    text: primaryVisibleText,
    bodyText: dynamic.bodyText,
    headings: dynamic.headings,
    statusText: dynamic.statusText,
    selected: dynamic.selected,
    dataTestIds: dynamic.dataTestIds
  })
  const hashPayload = {
    url: page.url(),
    title: await page.title(),
    controlSignature,
    textSignature
  }
  const hashRoute = routeKey(page.url())
  const inferred = inferScreen(page.url(), visible, primaryVisibleText)

  return {
    url: page.url(),
    hashRoute,
    title: await page.title(),
    hash: hashState(hashPayload),
    stateHash: hashState(hashPayload),
    domSignature: hashState(hashPayload),
    textSignature,
    controlSignature,
    timestamp: new Date().toISOString(),
    inferredScreenName: inferred.name,
    inferredPageType: inferred.pageType,
    visibleControlSummary: summarizeVisibleControls(visible),
    primaryVisibleText,
    visible
  }
}

export function buildCrawlCandidates(state: CrawlState, context: CrawlFrontierContext): { next?: CrawlCandidate; skipped: SkippedSafeAction[] } {
  const skipped: SkippedSafeAction[] = []
  const candidates = state.visible
    .map((element) => candidateFromElement(state, element, context, skipped))
    .filter(Boolean) as CrawlCandidate[]
  candidates.sort((a, b) => b.priority - a.priority || a.label.localeCompare(b.label))
  return { next: candidates[0], skipped }
}

export function selectNextCrawlCandidate(state: CrawlState, context: CrawlFrontierContext): CrawlCandidate | undefined {
  return buildCrawlCandidates(state, context).next
}

async function clickCandidate(page: Page, candidate: VisibleElement): Promise<void> {
  if (candidate.kind === 'link' && candidate.text) {
    await page.getByRole('link', { name: candidate.text }).first().click({ timeout: 2_000 })
    return
  }
  if (candidate.kind === 'button' && candidate.text) {
    await page.getByRole('button', { name: candidate.text }).first().click({ timeout: 2_000 })
    return
  }
  if (candidate.kind === 'tab' && (candidate.text || candidate.name)) {
    await page.getByRole('tab', { name: candidate.text ?? candidate.name }).first().click({ timeout: 2_000 })
    return
  }
  if (candidate.selectorHint) await page.locator(candidate.selectorHint).first().click({ timeout: 2_000 })
}

async function typeCandidate(page: Page, candidate: VisibleElement): Promise<void> {
  if (candidate.name) {
    await page.getByLabel(candidate.name).first().fill(SAMPLE_PROMPT, { timeout: 2_000 })
    return
  }
  if (candidate.selectorHint) {
    await page.locator(candidate.selectorHint).first().fill(SAMPLE_PROMPT, { timeout: 2_000 })
    return
  }
  await page.locator('textarea,input').first().fill(SAMPLE_PROMPT, { timeout: 2_000 })
}

function candidateFromElement(state: CrawlState, element: VisibleElement, context: CrawlFrontierContext, skipped: SkippedSafeAction[]): CrawlCandidate | undefined {
  const label = normalizedLabel(element)
  if (!label) return undefined
  const role = element.kind === 'link' ? 'link' : element.kind
  const wantsTyping = element.kind === 'input' && /feature request|prompt|describe/i.test(label)
  const clickable = element.kind === 'link' || element.kind === 'tab' || element.kind === 'button'
  if (!wantsTyping && !clickable) return undefined
  if (isLongRunningToolAction(label)) {
    const mode = context.crawlMode ?? 'safe'
    const allowedInMode = (mode === 'deep' || mode === 'live') && Boolean(context.allowLongRunningActions)
    const destructive = /delete|remove|destroy|drop|wipe|clear all|production/i.test(label)
    if (!allowedInMode || destructive) {
      skipped.push({
        label,
        reason: destructive
          ? 'destructive long-running action skipped'
          : `long-running tool action skipped in ${mode} mode`,
        stateId: state.id,
        route: state.hashRoute
      })
      return undefined
    }
  }
  const decision = classifyActionSafety(label, wantsTyping ? 'input' : role)
  if (!decision.safe && !wantsTyping) {
    skipped.push({ label, reason: decision.reason, stateId: state.id, route: state.hashRoute })
    return undefined
  }
  if (element.kind === 'link' && element.href && isExternalHref(element.href, context.allowedOrigin) && !context.allowExternalOrigins) {
    skipped.push({ label, reason: `external origin skipped: ${linkOrigin(element.href)}`, stateId: state.id, route: state.hashRoute })
    return undefined
  }
  const targetRoute = inferTargetRoute(element, label)
  const currentRoute = stateRouteKey(state)
  const actionKey = `${state.hash}:${role}:${label}:${element.href ?? ''}:${element.selectorHint ?? ''}:${wantsTyping ? 'type' : 'click'}`
  const ineffectiveKey = `${currentRoute}:${targetRoute ?? ''}:${role}:${label}:${element.selectorHint ?? ''}`
  if (context.attemptedActionKeys.has(actionKey)) {
    skipped.push({ label, reason: 'already attempted in this state', stateId: state.id, route: currentRoute })
    return undefined
  }
  if (targetRoute && targetRoute === currentRoute) {
    skipped.push({ label, reason: `already on route ${targetRoute}`, stateId: state.id, route: currentRoute })
    return undefined
  }
  if ((context.ineffectiveActionKeys.get(ineffectiveKey) ?? 0) >= context.maxDuplicateActions) {
    skipped.push({ label, reason: 'previous attempt did not change state', stateId: state.id, route: currentRoute })
    return undefined
  }
  if (targetRoute && (context.routeVisitCounts.get(targetRoute) ?? 0) >= context.maxPerRoute) {
    skipped.push({ label, reason: `route budget reached for ${targetRoute}`, stateId: state.id, route: currentRoute })
    return undefined
  }
  const locatorUsed = element.selectorHint ?? roleLocator(role, label)
  const visitedTargetCount = targetRoute ? context.routeVisitCounts.get(targetRoute) ?? 0 : 0
  return {
    element,
    label,
    actionType: wantsTyping ? 'type' : 'click',
    role,
    target: element.selectorHint ?? element.href ?? label,
    locatorUsed,
    safeReason: wantsTyping ? 'temporary sample prompt entry is safe' : decision.reason,
    targetRoute,
    actionKey,
    ineffectiveKey,
    priority: actionPriority(label, role, currentRoute, targetRoute, wantsTyping, element, state.visible.some((control) => control.kind === 'dialog')) - visitedTargetCount * 120
  }
}

function isLongRunningToolAction(label: string): boolean {
  return /run audit|run consistency check|generate fix packets|open latest report|apply fix|repair loop|verify issue/i.test(label)
}

function actionPriority(label: string, role: string, currentRoute: string, targetRoute: string | undefined, wantsTyping: boolean, element: VisibleElement, dialogOpen: boolean): number {
  const text = label.toLowerCase()
  let score = 0
  if (/cancel|close|×|esc/.test(text)) score += 90
  if (targetRoute && targetRoute !== currentRoute) score += 100
  if (targetRoute && targetRoute === currentRoute) score -= 80
  if (/summary|projects|run timeline|scenarios|crawl path|workflow evidence|issues|fix packets|screenshots|graph explorer|raw json|repositories|workspaces|plan runs|learning|settings/.test(text)) score += 70
  if (/add repo|add repository|new workspace|create workspace|view details/.test(text)) score += 60
  if (wantsTyping) score += 55
  if (/generate.*plan|generate plan bundle/.test(text)) score += 50
  if (/overview|change set|recipes|graph evidence|validation|handoff|raw json/.test(text)) score += 45
  if (/copy/.test(text)) score += 25
  if (dialogOpen && !/cancel|close|×/.test(text)) score -= 40
  if (role === 'tab') score += 35
  if (element.kind === 'link') score += 20
  return score
}

function normalizedLabel(element: VisibleElement): string {
  return (element.text ?? element.name ?? element.href ?? element.selectorHint ?? element.kind).replace(/\s+/g, ' ').trim()
}

function inferTargetRoute(element: VisibleElement, label: string): string | undefined {
  if (element.href) return routeKey(element.href)
  const normalized = label.toLowerCase().replace(/\s+/g, ' ').trim()
  return navRouteByLabel.get(normalized)
}

function isExternalHref(href: string, allowedOrigin?: string): boolean {
  if (!allowedOrigin) return false
  try {
    const target = new URL(href)
    return target.origin !== allowedOrigin
  } catch {
    return false
  }
}

function linkOrigin(href: string): string {
  try {
    return new URL(href).origin
  } catch {
    return href
  }
}

function routeKey(value: string): string {
  try {
    const url = new URL(value)
    if (url.hash) return url.hash
    return url.pathname || '/'
  } catch {
    return value
  }
}

function stateRouteKey(state: CrawlState): string {
  const route = state.hashRoute ?? routeKey(state.url)
  if (route && route !== '/') return route
  const screen = (state.inferredScreenName ?? '').toLowerCase()
  if (/workspace/.test(screen)) return '#workspaces'
  if (/repo/.test(screen)) return '#repositories'
  if (/learning/.test(screen)) return '#learning'
  if (/settings/.test(screen)) return '#settings'
  if (/plan|prompt|handoff|raw json|change set/.test(screen)) return '#prompt'
  return route || '/'
}

function applyRouteHint(state: CrawlState, hints: Map<string, string>): CrawlState {
  const hintedRoute = hints.get(state.hash)
  if (!hintedRoute || (state.hashRoute && state.hashRoute !== '/')) return state
  state.hashRoute = hintedRoute
  if (!/dialog|handoff|raw json|plan bundle/i.test(state.inferredScreenName ?? '')) {
    const inferred = inferScreenFromRoute(hintedRoute)
    state.inferredScreenName = inferred.name
    state.inferredPageType = inferred.pageType
  }
  return state
}

function inferScreenFromRoute(route: string): { name: string; pageType: string } {
  if (route === '#workspaces') return { name: 'Workspaces', pageType: 'workspace_management' }
  if (route === '#repositories') return { name: 'Repositories', pageType: 'repo_management' }
  if (route === '#learning') return { name: 'Learning', pageType: 'learning' }
  if (route === '#settings') return { name: 'Settings', pageType: 'settings' }
  if (route === '#prompt') return { name: 'Prompt composer / Plan Runs', pageType: 'planning' }
  if (route === '#summary') return { name: 'Summary', pageType: 'dashboard_summary' }
  if (route === '#projects') return { name: 'Projects', pageType: 'project_registry' }
  if (route === '#timeline') return { name: 'Run Timeline', pageType: 'report_timeline' }
  if (route === '#scenarios') return { name: 'Scenarios', pageType: 'scenario_report' }
  if (route === '#crawl') return { name: 'Crawl Path', pageType: 'crawl_report' }
  if (route === '#workflows') return { name: 'Workflow Evidence', pageType: 'workflow_report' }
  if (route === '#issues') return { name: 'Issues', pageType: 'issue_report' }
  if (route === '#fix-packets') return { name: 'Fix Packets', pageType: 'fix_packet_report' }
  if (route === '#screenshots') return { name: 'Screenshots', pageType: 'screenshot_gallery' }
  if (route === '#graph') return { name: 'Graph Explorer', pageType: 'graph_report' }
  if (route === '#raw-json') return { name: 'Raw JSON', pageType: 'raw_json_report' }
  return { name: route.replace(/^#/, '') || 'Runtime screen', pageType: 'unknown' }
}

function roleLocator(role: string, label: string): string {
  if (role === 'tab') return `getByRole(tab, ${label})`
  if (role === 'link') return `getByRole(link, ${label})`
  if (role === 'button') return `getByRole(button, ${label})`
  return label
}

function recordSkippedFrontier(state: CrawlState, skipped: SkippedSafeAction[], sink: SkippedSafeAction[]): void {
  const seen = new Set(sink.map((item) => `${item.stateId}:${item.label}:${item.reason}`))
  for (const item of skipped) {
    const key = `${item.stateId ?? state.id}:${item.label}:${item.reason}`
    if (!seen.has(key)) {
      sink.push({ ...item, stateId: item.stateId ?? state.id, route: item.route ?? state.hashRoute })
      seen.add(key)
    }
  }
}

function annotateActionStateLinks(states: CrawlState[], actions: CrawlAction[]): void {
  for (const action of actions) {
    const from = states.find((state) => state.hash === action.stateHashBefore)
    const to = states.find((state) => state.hash === action.stateHashAfter)
    if (from) {
      from.outgoingActions = unique([...(from.outgoingActions ?? []), action.id ?? action.label])
    }
    if (to) {
      to.incomingAction = action.id ?? action.label
      if (action.screenshotAfter && !to.screenshotPath) to.screenshotPath = action.screenshotAfter
    }
  }
}

export function inferScreen(url: string, visible: VisibleElement[], primaryVisibleText: string[]): { name: string; pageType: string } {
  const route = routeKey(url)
  const text = `${primaryVisibleText.join(' ')} ${visible.map((item) => `${item.text ?? ''} ${item.name ?? ''}`).join(' ')}`.toLowerCase()
  const dialogText = visible
    .filter((item) => item.kind === 'dialog')
    .map((item) => `${item.text ?? ''} ${item.name ?? ''}`)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  const hasDialog = Boolean(dialogText)
  if (hasDialog) {
    if (/create workspace/.test(dialogText) && /workspace name/.test(dialogText)) return { name: 'Create workspace dialog', pageType: 'dialog' }
    if (/new workspace/.test(dialogText) && /workspace name/.test(dialogText)) return { name: 'Create workspace dialog', pageType: 'dialog' }
    if (/add repository/.test(dialogText) && /target id|path or url|source type|locator/.test(dialogText)) return { name: 'Add repository dialog', pageType: 'dialog' }
    if (/workspace name/.test(dialogText) && !/target id|path or url|source type|locator/.test(dialogText)) return { name: 'Create workspace dialog', pageType: 'dialog' }
    if (/target id|path or url|source type|locator/.test(dialogText) && !/workspace name/.test(dialogText)) return { name: 'Add repository dialog', pageType: 'dialog' }
  }
  if (/handoff prompt|copy prompt/.test(text)) return { name: 'Handoff tab', pageType: 'plan_output' }
  if (/raw json|schema_version|recommended_change_set/.test(text)) return { name: 'Raw JSON tab', pageType: 'plan_output' }
  if (/overview|change set|graph evidence|validation/.test(text) && /plan|bundle|handoff/.test(text)) return { name: 'Plan Bundle result', pageType: 'plan_output' }
  if (route === '#workspaces') return { name: 'Workspaces', pageType: 'workspace_management' }
  if (route === '#repositories') return { name: 'Repositories', pageType: 'repo_management' }
  if (route === '#learning') return { name: 'Learning', pageType: 'learning' }
  if (route === '#settings') return { name: 'Settings', pageType: 'settings' }
  if (route === '#prompt' || ((route === '/' || route === '') && /feature request|generate plan|plan bundle|handoff prompt|workspace control/.test(text))) {
    return { name: 'Prompt composer / Plan Runs', pageType: 'planning' }
  }
  if (route === '/' || route === '') return { name: 'Home', pageType: 'home' }
  return { name: formatRouteName(route), pageType: 'runtime_screen' }
}

function formatRouteName(route: string): string {
  const cleaned = route.replace(/^#/, '').replace(/[?#].*$/, '').replace(/^\/+|\/+$/g, '')
  if (!cleaned) return 'Runtime screen'
  const parts = cleaned.split('/').filter(Boolean)
  const last = parts.at(-1) ?? cleaned
  return last
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function summarizeVisibleControls(visible: VisibleElement[]): VisibleControlSummary {
  return {
    links: summarizeKind(visible, 'link'),
    buttons: summarizeKind(visible, 'button'),
    tabs: summarizeKind(visible, 'tab'),
    inputs: summarizeKind(visible, 'input'),
    forms: summarizeKind(visible, 'form'),
    dialogs: summarizeKind(visible, 'dialog')
  }
}

function summarizeKind(visible: VisibleElement[], kind: VisibleElement['kind']) {
  const controls = visible.filter((item) => item.kind === kind)
  return {
    count: controls.length,
    topLabels: controls.map(normalizedLabel).filter(Boolean).slice(0, 8)
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
