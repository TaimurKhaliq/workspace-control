import { chromium, type Page } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { CrawlAction, CrawlGraph, CrawlState, NetworkFailure, RuntimeMessage, VisibleElement } from '../types.js'
import { hashState } from '../graph/stateHash.js'
import { classifyActionSafety } from './safeActions.js'

export interface CrawlOptions {
  maxDepth?: number
  maxActions?: number
  staleIterations?: number
  timeBudgetMs?: number
  reportDir: string
}

export async function crawlApp(url: string, options: CrawlOptions): Promise<CrawlGraph> {
  const maxActions = options.maxActions ?? 20
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
  const seenHashes = new Set<string>()
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

  await page.goto(url, { waitUntil: 'domcontentloaded' })
  let stale = 0

  for (let actionIndex = 0; actionIndex <= maxActions && Date.now() < deadline; actionIndex += 1) {
    const state = await captureState(page)
    if (seenHashes.has(state.hash)) {
      stale += 1
    } else {
      stale = 0
      seenHashes.add(state.hash)
      states.push(state)
      const screenshotPath = path.join(screenshotsDir, `state-${states.length}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: true })
      screenshots.push(screenshotPath)
    }
    if (stale >= staleIterations) break

    const candidate = state.visible.find((element) => {
      const decision = classifyActionSafety(element.text ?? element.name ?? '', element.kind === 'link' ? 'link' : element.kind)
      return decision.safe && (element.kind === 'link' || element.kind === 'tab' || element.kind === 'button')
    })
    if (!candidate) break

    const label = candidate.text ?? candidate.name ?? candidate.selectorHint ?? candidate.kind
    const safety = classifyActionSafety(label, candidate.kind === 'link' ? 'link' : candidate.kind)
    const urlBefore = page.url()
    if (!safety.safe) {
      actions.push({ type: 'skip', label, target: candidate.selectorHint ?? label, urlBefore, safe: false, reason: safety.reason })
      continue
    }

    try {
      await clickCandidate(page, candidate)
      await page.waitForLoadState('domcontentloaded', { timeout: 2_000 }).catch(() => undefined)
      actions.push({ type: 'click', label, target: candidate.selectorHint ?? label, urlBefore, urlAfter: page.url(), safe: true, reason: safety.reason })
    } catch (error) {
      actions.push({ type: 'skip', label, target: candidate.selectorHint ?? label, urlBefore, safe: true, reason: error instanceof Error ? error.message : 'click failed' })
      break
    }
  }

  const graph: CrawlGraph = {
    startUrl: url,
    title: await page.title(),
    finalUrl: page.url(),
    states,
    actions,
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
      const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
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

  return {
    url: page.url(),
    title: await page.title(),
    hash: hashState(hashPayload),
    visible
  }
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
