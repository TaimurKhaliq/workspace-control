import { chromium, type Page } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { CrawlAction, CrawlGraph, CrawlState, NetworkFailure, RuntimeMessage, SkippedSafeAction, VisibleControlSummary, VisibleElement } from '../types.js'
import { hashState } from '../graph/stateHash.js'
import { classifyActionSafety } from './safeActions.js'

const SAMPLE_PROMPT = 'Add OwnersPage (no actions yet)'
const navRouteByLabel = new Map([
  ['workspaces', '#workspaces'],
  ['repositories', '#repositories'],
  ['repos', '#repositories'],
  ['plan runs', '#prompt'],
  ['prompt', '#prompt'],
  ['learning', '#learning'],
  ['settings', '#settings']
])

export interface CrawlOptions {
  maxDepth?: number
  maxActions?: number
  maxStates?: number
  maxPerRoute?: number
  maxDuplicateActions?: number
  staleIterations?: number
  timeBudgetMs?: number
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
}

export async function crawlApp(url: string, options: CrawlOptions): Promise<CrawlGraph> {
  const maxActions = options.maxActions ?? 36
  const maxStates = options.maxStates ?? Math.max(12, Math.min(maxActions, 24))
  const maxPerRoute = options.maxPerRoute ?? 8
  const maxDuplicateActions = options.maxDuplicateActions ?? 1
  const staleIterations = options.staleIterations ?? 5
  const screenshotsDir = path.join(options.reportDir, 'screenshots')
  await mkdir(screenshotsDir, { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage()
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

  await page.goto(url, { waitUntil: 'domcontentloaded' })
  let stale = 0

  for (let actionIndex = 0; actionIndex <= maxActions && Date.now() < deadline; actionIndex += 1) {
    const captured = applyRouteHint(await captureState(page), routeHintsByStateHash)
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
      await page.screenshot({ path: screenshotPath, fullPage: true })
      screenshots.push(screenshotPath)
      state.screenshotPath = screenshotPath
      routeVisitCounts.set(stateRouteKey(state), (routeVisitCounts.get(stateRouteKey(state)) ?? 0) + 1)
    }
    if (stale >= staleIterations) break
    if (states.length >= maxStates) break

    const candidates = buildCrawlCandidates(captured, {
      attemptedActionKeys,
      ineffectiveActionKeys,
      routeVisitCounts,
      maxPerRoute,
      maxDuplicateActions
    })
    recordSkippedFrontier(captured, candidates.skipped, unvisitedSafeActions)
    const candidate = candidates.next
    if (!candidate) break

    const urlBefore = page.url()
    const screenshotBefore = state.screenshotPath
    const sequenceNumber = actions.length + 1
    let stateHashAfter: string | undefined
    let screenshotAfter: string | undefined
    try {
      if (candidate.actionType === 'type') await typeCandidate(page, candidate.element)
      else await clickCandidate(page, candidate.element)
      await page.waitForLoadState('domcontentloaded', { timeout: 2_000 }).catch(() => undefined)
      await page.waitForTimeout(200)
      const after = applyRouteHint(await captureState(page), routeHintsByStateHash)
      stateHashAfter = after.hash
      if (candidate.targetRoute && candidate.targetRoute !== routeKey(urlBefore)) {
        routeHintsByStateHash.set(after.hash, candidate.targetRoute)
        applyRouteHint(after, routeHintsByStateHash)
      }
      const screenshotAfterPath = path.join(screenshotsDir, `action-${sequenceNumber}-after.png`)
      await page.screenshot({ path: screenshotAfterPath, fullPage: true }).catch(() => undefined)
      screenshotAfter = screenshotAfterPath
      const changedState = after.hash !== captured.hash || page.url() !== urlBefore
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
        urlAfter: page.url(),
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
        skippedReason: error instanceof Error ? error.message : 'action failed',
        screenshotBefore,
        reason: error instanceof Error ? error.message : 'action failed'
      })
    }
  }

  annotateActionStateLinks(states, actions)

  const graph: CrawlGraph = {
    startUrl: url,
    title: await page.title(),
    finalUrl: page.url(),
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

  await browser.close()
  return graph
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

  const hashPayload = {
    url: page.url(),
    title: await page.title(),
    visible: visible.map(({ kind, text, name, href, type }) => ({ kind, text, name, href, type }))
  }
  const primaryVisibleText = await page.evaluate(`(() => {
    const text = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
    return text ? text.split(/(?<=[.!?])\\s+|\\n+/).map((item) => item.trim()).filter(Boolean).slice(0, 12) : [];
  })()`) as string[]
  const hashRoute = routeKey(page.url())
  const inferred = inferScreen(page.url(), visible, primaryVisibleText)

  return {
    url: page.url(),
    hashRoute,
    title: await page.title(),
    hash: hashState(hashPayload),
    stateHash: hashState(hashPayload),
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
  const decision = classifyActionSafety(label, wantsTyping ? 'input' : role)
  if (!decision.safe && !wantsTyping) {
    skipped.push({ label, reason: decision.reason, stateId: state.id, route: state.hashRoute })
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

function actionPriority(label: string, role: string, currentRoute: string, targetRoute: string | undefined, wantsTyping: boolean, element: VisibleElement, dialogOpen: boolean): number {
  const text = label.toLowerCase()
  let score = 0
  if (/cancel|close|×|esc/.test(text)) score += 90
  if (targetRoute && targetRoute !== currentRoute) score += 100
  if (targetRoute && targetRoute === currentRoute) score -= 80
  if (/repositories|workspaces|plan runs|learning|settings/.test(text)) score += 70
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

function inferScreen(url: string, visible: VisibleElement[], primaryVisibleText: string[]): { name: string; pageType: string } {
  const route = routeKey(url)
  const text = `${primaryVisibleText.join(' ')} ${visible.map((item) => `${item.text ?? ''} ${item.name ?? ''}`).join(' ')}`.toLowerCase()
  const hasDialog = visible.some((item) => item.kind === 'dialog')
  if (hasDialog && /add repository|target id|path or url|source type/.test(text)) return { name: 'Add repository dialog', pageType: 'dialog' }
  if (hasDialog && /new workspace|create workspace|workspace name/.test(text)) return { name: 'New workspace dialog', pageType: 'dialog' }
  if (/handoff prompt|copy prompt/.test(text)) return { name: 'Handoff tab', pageType: 'plan_output' }
  if (/raw json|schema_version|recommended_change_set/.test(text)) return { name: 'Raw JSON tab', pageType: 'plan_output' }
  if (/overview|change set|graph evidence|validation/.test(text) && /plan|bundle|handoff/.test(text)) return { name: 'Plan Bundle result', pageType: 'plan_output' }
  if (route === '#workspaces') return { name: 'Workspaces', pageType: 'workspace_management' }
  if (route === '#repositories') return { name: 'Repositories', pageType: 'repo_management' }
  if (route === '#learning') return { name: 'Learning', pageType: 'learning' }
  if (route === '#settings') return { name: 'Settings', pageType: 'settings' }
  if (route === '#prompt' || route === '/' || route === '') return { name: 'Prompt composer / Plan Runs', pageType: 'planning' }
  return { name: route.replace(/^#/, '') || 'Runtime screen', pageType: 'unknown' }
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
