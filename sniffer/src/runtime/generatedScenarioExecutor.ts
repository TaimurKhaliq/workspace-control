import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium, type Page } from 'playwright'
import type { GeneratedScenario, ScenarioAssertionResult, ScenarioRun } from '../types.js'
import { captureRuntimeDomSnapshot } from './domSnapshot.js'

export async function executeGeneratedScenarios(input: {
  url: string
  reportDir: string
  scenarios: GeneratedScenario[]
}): Promise<ScenarioRun[]> {
  if (input.scenarios.length === 0) return []
  const screenshotsDir = path.join(input.reportDir, 'screenshots', 'generated-scenarios')
  await mkdir(screenshotsDir, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => undefined)
    const runs: ScenarioRun[] = []
    for (const scenario of input.scenarios) {
      const run = await executeScenario(page, scenario, screenshotsDir)
      runs.push(run)
      await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => undefined)
    }
    return runs
  } finally {
    await browser.close()
  }
}

async function executeScenario(page: Page, scenario: GeneratedScenario, screenshotsDir: string): Promise<ScenarioRun> {
  const stepsAttempted = scenario.steps.map((step) => step.name)
  const screenshots: string[] = []
  const assertions: ScenarioAssertionResult[] = []
  const shot = async (name: string): Promise<string | undefined> => {
    const file = path.join(screenshotsDir, `${scenario.id}-${name}.png`)
    await page.screenshot({ path: file, fullPage: true }).catch(() => undefined)
    screenshots.push(file)
    return file
  }
  const initialShot = await shot('initial')
  const snapshot = await captureRuntimeDomSnapshot(page, initialShot)

  if (scenario.id === 'navigation-smoke') {
    assertions.push(...await navigationAssertions(page, snapshot, shot))
  } else if (scenario.id === 'forms-discoverability') {
    assertions.push(formAssertion(snapshot, initialShot))
  } else if (scenario.id === 'accessibility-labels') {
    assertions.push(accessibilityAssertion(snapshot, initialShot))
  } else if (scenario.id === 'overflow-readability') {
    assertions.push(await overflowAssertion(page, initialShot))
  } else if (scenario.id === 'auth-form-discoverability') {
    assertions.push(authAssertion(snapshot, initialShot))
  } else if (scenario.id.includes('table') || scenario.id.includes('list') || scenario.id === 'crud-list-create-detail') {
    assertions.push(tableListAssertion(snapshot, initialShot))
  } else {
    assertions.push({
      label: 'Scenario planned',
      status: 'blocked',
      evidence: [`No deterministic executor is available for generated scenario ${scenario.id}.`],
      screenshotPath: initialShot
    })
  }

  const failed = assertions.some((assertion) => assertion.status === 'failed')
  const blocked = !failed && assertions.some((assertion) => assertion.status === 'blocked')
  return {
    slug: scenario.id,
    name: scenario.name,
    status: failed ? 'failed' : blocked ? 'blocked' : 'passed',
    prerequisites: scenario.prerequisites,
    stepsAttempted,
    screenshots,
    assertions,
    issues: []
  }
}

async function navigationAssertions(page: Page, snapshot: Awaited<ReturnType<typeof captureRuntimeDomSnapshot>>, shot: (name: string) => Promise<string | undefined>): Promise<ScenarioAssertionResult[]> {
  const sameOrigin = new URL(snapshot.url).origin
  const links = snapshot.links
    .filter((link) => link.href)
    .filter((link) => {
      try {
        return new URL(link.href!).origin === sameOrigin
      } catch {
        return false
      }
    })
    .slice(0, 4)
  if (links.length === 0) {
    return [{ label: 'Safe navigation links visible', status: 'blocked', evidence: ['No same-origin navigation links found.'], screenshotPath: snapshot.screenshotPath }]
  }
  const evidence: string[] = []
  for (const link of links) {
    const locator = link.locatorCandidates[0]
    const before = page.url()
    try {
      if (locator?.strategy === 'role' && (link.accessibleName || link.visibleText)) {
        await page.getByRole('link', { name: link.accessibleName ?? link.visibleText }).first().click({ timeout: 2_000 })
      } else {
        await page.locator(link.selectorHint ?? 'a').first().click({ timeout: 2_000 })
      }
      await page.waitForLoadState('domcontentloaded', { timeout: 2_000 }).catch(() => undefined)
      await page.waitForTimeout(100)
      evidence.push(`${labelOf(link)}: ${before} -> ${page.url()}`)
      await shot(`nav-${evidence.length}`)
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 2_000 }).catch(() => undefined)
    } catch (error) {
      evidence.push(`${labelOf(link)} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return [{
    label: 'Safe navigation links can be opened',
    status: evidence.some((item) => /->/.test(item)) ? 'passed' : 'failed',
    evidence,
    screenshotPath: snapshot.screenshotPath
  }]
}

function formAssertion(snapshot: Awaited<ReturnType<typeof captureRuntimeDomSnapshot>>, screenshotPath?: string): ScenarioAssertionResult {
  const controls = [...snapshot.inputs, ...snapshot.selects, ...snapshot.textareas]
  const labelled = controls.filter((control) => labelOf(control))
  return {
    label: 'Forms and controls are discoverable',
    status: snapshot.forms.length || controls.length ? 'passed' : 'blocked',
    evidence: [
      `forms:${snapshot.forms.length}`,
      `controls:${controls.length}`,
      `labelled:${labelled.length}`,
      ...labelled.slice(0, 8).map(labelOf)
    ],
    screenshotPath
  }
}

function accessibilityAssertion(snapshot: Awaited<ReturnType<typeof captureRuntimeDomSnapshot>>, screenshotPath?: string): ScenarioAssertionResult {
  const controls = [...snapshot.buttons, ...snapshot.inputs, ...snapshot.selects, ...snapshot.textareas].filter((control) => !control.disabled)
  const unnamed = controls.filter((control) => !labelOf(control))
  return {
    label: 'Visible controls have accessible names',
    status: unnamed.length === 0 ? 'passed' : 'failed',
    evidence: unnamed.length === 0 ? [`checked:${controls.length}`] : unnamed.slice(0, 10).map((control) => `${control.kind}:${control.selectorHint ?? control.id}`),
    screenshotPath
  }
}

async function overflowAssertion(page: Page, screenshotPath?: string): Promise<ScenarioAssertionResult> {
  const overflow = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
    overflowing: document.body.scrollWidth > window.innerWidth + 2
  }))
  return {
    label: 'No page-level horizontal overflow',
    status: overflow.overflowing ? 'failed' : 'passed',
    evidence: [`bodyScrollWidth:${overflow.bodyScrollWidth}`, `viewportWidth:${overflow.viewportWidth}`],
    screenshotPath
  }
}

function authAssertion(snapshot: Awaited<ReturnType<typeof captureRuntimeDomSnapshot>>, screenshotPath?: string): ScenarioAssertionResult {
  const labels = [...snapshot.inputs, ...snapshot.buttons].map(labelOf).join(' ').toLowerCase()
  const hasIdentity = /email|username|user/.test(labels)
  const hasPassword = snapshot.inputs.some((input) => input.type === 'password' || /password/i.test(labelOf(input)))
  const hasSubmit = snapshot.buttons.some((button) => /sign in|log in|login|submit|register/i.test(labelOf(button)))
  return {
    label: 'Login form controls are discoverable',
    status: hasIdentity && hasPassword && hasSubmit ? 'passed' : 'failed',
    evidence: [`identity:${hasIdentity}`, `password:${hasPassword}`, `submit:${hasSubmit}`, labels.slice(0, 240)],
    screenshotPath
  }
}

function tableListAssertion(snapshot: Awaited<ReturnType<typeof captureRuntimeDomSnapshot>>, screenshotPath?: string): ScenarioAssertionResult {
  const hasListText = /article|feed|list|table|row|card/.test(snapshot.domText.toLowerCase())
  return {
    label: 'List/table/card content is visible',
    status: snapshot.tables.length > 0 || hasListText ? 'passed' : 'blocked',
    evidence: [`tables:${snapshot.tables.length}`, `listText:${hasListText}`, ...snapshot.visibleTextBlocks.slice(0, 6)],
    screenshotPath
  }
}

function labelOf(control: { accessibleName?: string; visibleText?: string; labelText?: string; placeholder?: string; dataTestId?: string; href?: string; id?: string }): string {
  return (control.accessibleName ?? control.visibleText ?? control.labelText ?? control.placeholder ?? control.dataTestId ?? control.href ?? control.id ?? '').replace(/\s+/g, ' ').trim()
}
