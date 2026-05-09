import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium, type Page } from 'playwright'
import type { GeneratedScenario, RuntimeDomSnapshot, ScenarioAssertionResult, ScenarioRun, ScenarioStepTrace } from '../types.js'
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
  page.setDefaultTimeout(3_000)
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
  const stepTraces: ScenarioStepTrace[] = []
  const assertions: ScenarioAssertionResult[] = []
  const shot = async (name: string, actionLabel = name): Promise<string | undefined> => {
    const file = path.join(screenshotsDir, `${scenario.id}-${name}.png`)
    const captured = await page.screenshot({ path: file, fullPage: true, timeout: 5_000 }).then(() => true).catch(() => false)
    if (captured) {
      screenshots.push(file)
      const snapshot = await captureRuntimeDomSnapshot(page, file).catch(() => undefined)
      if (snapshot) stepTraces.push(stepTraceFromSnapshot(scenario, name, actionLabel, snapshot, file))
      return file
    }
    const snapshot = await captureRuntimeDomSnapshot(page).catch(() => undefined)
    if (snapshot) stepTraces.push(stepTraceFromSnapshot(scenario, name, actionLabel, snapshot))
    return undefined
  }
  const initialShot = await shot('initial')
  const snapshot = await captureRuntimeDomSnapshot(page, initialShot)

  if (scenario.id === 'navigation-smoke') {
    assertions.push(...await navigationAssertions(page, snapshot, shot))
  } else if (scenario.id.startsWith('sniffer-')) {
    assertions.push(...await snifferDashboardAssertions(page, scenario, snapshot, shot))
  } else if (scenario.id === 'plan-run-history' || scenario.id === 'planning-history-reopen') {
    assertions.push(await planRunHistoryAssertion(page, snapshot, shot))
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
    stepTraces,
    assertions,
    issues: []
  }
}

async function navigationAssertions(page: Page, snapshot: Awaited<ReturnType<typeof captureRuntimeDomSnapshot>>, shot: (name: string, actionLabel?: string) => Promise<string | undefined>): Promise<ScenarioAssertionResult[]> {
  const sameOrigin = new URL(snapshot.url).origin
  const navControls = navigationControls(snapshot)
  const links = navControls
    .filter((link) => link.href)
    .filter((link) => {
      try {
        return new URL(link.href!).origin === sameOrigin
      } catch {
        return false
      }
    })
    .slice(0, 4)
  const buttons = navControls
    .filter((control) => !control.href && ['button', 'tab'].includes(control.kind) && control.safeAction.safe)
    .slice(0, 8)
  const controls = [...links, ...buttons].slice(0, 10)
  if (controls.length === 0) {
    return [{ label: 'Safe navigation controls visible', status: 'blocked', evidence: ['No same-origin navigation links or navigation buttons found.'], screenshotPath: snapshot.screenshotPath }]
  }
  const evidence: string[] = []
  for (const control of controls) {
    const locator = control.locatorCandidates[0]
    const before = page.url()
    const beforeSignature = await pageSignature(page)
    try {
      if (locator?.strategy === 'role' && (control.accessibleName || control.visibleText)) {
        const role = control.kind === 'tab' ? 'tab' : control.kind === 'button' ? 'button' : 'link'
        await page.getByRole(role, { name: control.accessibleName ?? control.visibleText }).first().click({ timeout: 2_000 })
      } else {
        await page.locator(control.selectorHint ?? (control.kind === 'button' ? 'button' : 'a')).first().click({ timeout: 2_000 })
      }
      await page.waitForLoadState('domcontentloaded', { timeout: 2_000 }).catch(() => undefined)
      await page.waitForTimeout(100)
      const afterSignature = await pageSignature(page)
      const changed = before !== page.url() || beforeSignature !== afterSignature
      evidence.push(`${labelOf(control)}: ${before} -> ${page.url()}${changed ? ' changed' : ' unchanged'}`)
      await shot(`nav-${evidence.length}`, `click ${labelOf(control)}`)
      if (control.href) await page.goBack({ waitUntil: 'domcontentloaded', timeout: 2_000 }).catch(() => undefined)
    } catch (error) {
      evidence.push(`${labelOf(control)} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return [{
    label: 'Safe navigation controls can be opened',
    status: evidence.some((item) => /changed/.test(item) || /->/.test(item)) ? 'passed' : 'failed',
    evidence,
    screenshotPath: snapshot.screenshotPath
  }]
}

async function snifferDashboardAssertions(
  page: Page,
  scenario: GeneratedScenario,
  snapshot: Awaited<ReturnType<typeof captureRuntimeDomSnapshot>>,
  shot: (name: string, actionLabel?: string) => Promise<string | undefined>
): Promise<ScenarioAssertionResult[]> {
  if (scenario.id === 'sniffer-dashboard-navigation') {
    return [await clickRequiredButtons(page, 'Dashboard sidebar sections are reachable', ['Summary', 'Projects', 'Run Timeline', 'Scenarios', 'Crawl Path', 'Workflow Evidence', 'Issues', 'Fix Packets', 'Screenshots', 'Graph Explorer', 'Raw JSON', 'Settings'], shot, 8)]
  }
  if (scenario.id === 'sniffer-project-selector') {
    const evidence: string[] = []
    const hasSelector = await visibleByRole(page, 'combobox', /selected sniffer project|project/i)
    const hasAddProject = await visibleButton(page, /add project/i)
    evidence.push(`project selector:${hasSelector}`, `add project:${hasAddProject}`)
    if (hasAddProject) {
      await page.getByRole('button', { name: /add project/i }).first().click({ timeout: 2_000 }).catch(() => undefined)
      await page.waitForTimeout(150)
      evidence.push(`dialog/control after click:${await page.getByText(/project name|repo path|app url|add project/i).first().isVisible({ timeout: 500 }).catch(() => false)}`)
      await shot('add-project', 'click Add project')
      await page.keyboard.press('Escape').catch(() => undefined)
    }
    return [{ label: 'Project selector and Add project controls are discoverable', status: hasSelector && hasAddProject ? 'passed' : 'failed', evidence, screenshotPath: snapshot.screenshotPath }]
  }
  if (scenario.id === 'sniffer-audit-launcher') {
    return [await controlsVisible(page, 'Audit launcher form controls are visible', [/repo path/i, /app url/i, /product goal/i, /run audit/i, /run consistency check/i, /generate fix packets/i, /open latest report/i], snapshot.screenshotPath)]
  }
  if (scenario.id === 'sniffer-report-sections') {
    return [await clickRequiredButtons(page, 'Report section navigation is reachable', ['Run Timeline', 'Scenarios', 'Crawl Path', 'Workflow Evidence', 'Issues'], shot, 4)]
  }
  if (scenario.id === 'sniffer-issues-fix-packets') {
    return [await clickRequiredButtons(page, 'Issues and fix packets are reachable', ['Issues', 'Fix Packets'], shot, 2)]
  }
  if (scenario.id === 'sniffer-screenshots-gallery') {
    return [await clickRequiredButtons(page, 'Screenshot gallery is reachable', ['Screenshots'], shot, 1)]
  }
  if (scenario.id === 'sniffer-graph-raw-settings') {
    return [await clickRequiredButtons(page, 'Graph, Raw JSON, and Settings are reachable', ['Graph Explorer', 'Raw JSON', 'Settings'], shot, 2)]
  }
  if (scenario.id === 'sniffer-raw-json-copy') {
    await clickNavButton(page, 'Raw JSON')
    const screenshotPath = await shot('raw-json-copy', 'click Raw JSON')
    const hasRawJson = await page.getByText(/latest report payload|raw json/i).first().isVisible({ timeout: 600 }).catch(() => false)
    const hasCopyJson = await visibleButton(page, /^copy json$/i)
    return [{
      label: 'Raw JSON copy action is visible',
      status: hasRawJson && hasCopyJson ? 'passed' : 'failed',
      evidence: [`raw_json_visible:${hasRawJson}`, `copy_json_visible:${hasCopyJson}`],
      screenshotPath
    }]
  }
  if (scenario.id === 'sniffer-fix-packet-copy') {
    await clickNavButton(page, 'Fix Packets')
    const screenshotPath = await shot('fix-packet-copy', 'click Fix Packets')
    const empty = await page.getByText(/no fix packets|generate fix packets/i).first().isVisible({ timeout: 600 }).catch(() => false)
    const hasCopy = await visibleButton(page, /copy prompt|copy fix prompt|copy repair prompt/i)
    return [{
      label: 'Fix packet copy action is visible when a packet exists',
      status: hasCopy ? 'passed' : empty ? 'blocked' : 'failed',
      evidence: [`copy_prompt_visible:${hasCopy}`, `empty_or_generate_state:${empty}`],
      screenshotPath
    }]
  }
  if (scenario.id === 'sniffer-issues-copy-fix-prompt') {
    await clickNavButton(page, 'Issues')
    const screenshotPath = await shot('issues-copy-fix-prompt', 'click Issues')
    const empty = await page.getByText(/no triaged issues|no raw findings|no report loaded/i).first().isVisible({ timeout: 600 }).catch(() => false)
    const hasCopy = await visibleButton(page, /copy fix prompt|copy prompt/i)
    return [{
      label: 'Issue detail copy fix prompt action is visible when an issue exists',
      status: hasCopy ? 'passed' : empty ? 'blocked' : 'failed',
      evidence: [`copy_fix_prompt_visible:${hasCopy}`, `empty_issue_state:${empty}`],
      screenshotPath
    }]
  }
  return [{ label: 'Sniffer dashboard scenario planned', status: 'blocked', evidence: [`No deterministic executor for ${scenario.id}.`], screenshotPath: snapshot.screenshotPath }]
}

async function clickRequiredButtons(page: Page, label: string, names: string[], shot: (name: string, actionLabel?: string) => Promise<string | undefined>, minimum: number): Promise<ScenarioAssertionResult> {
  const evidence: string[] = []
  let passed = 0
  for (const name of names) {
    const before = await pageSignature(page)
    const locator = page.getByRole('button', { name: new RegExp(`^${escapeRegex(name)}$`, 'i') }).first()
    const visible = await locator.isVisible({ timeout: 500 }).catch(() => false)
    if (!visible) {
      evidence.push(`${name}:missing`)
      continue
    }
    await locator.click({ timeout: 2_000 }).catch((error) => evidence.push(`${name}:click failed:${error instanceof Error ? error.message : String(error)}`))
    await page.waitForTimeout(120)
    const after = await pageSignature(page)
    if (before !== after || name === 'Summary') passed += 1
    evidence.push(`${name}:${before !== after ? 'changed' : 'visible'}`)
    await shot(`sniffer-${passed}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, `click ${name}`)
  }
  return { label, status: passed >= minimum ? 'passed' : 'failed', evidence, screenshotPath: undefined }
}

async function clickNavButton(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^${escapeRegex(name)}$`, 'i') }).first().click({ timeout: 2_000 }).catch(() => undefined)
  await page.waitForTimeout(150)
}

async function controlsVisible(page: Page, label: string, patterns: RegExp[], screenshotPath?: string): Promise<ScenarioAssertionResult> {
  const evidence: string[] = []
  let found = 0
  for (const pattern of patterns) {
    const visible = await page.getByRole('button', { name: pattern }).first().isVisible({ timeout: 300 }).catch(() => false) ||
      await page.getByRole('textbox', { name: pattern }).first().isVisible({ timeout: 300 }).catch(() => false) ||
      await page.getByLabel(pattern).first().isVisible({ timeout: 300 }).catch(() => false) ||
      await page.getByText(pattern).first().isVisible({ timeout: 300 }).catch(() => false)
    if (visible) found += 1
    evidence.push(`${pattern.source}:${visible}`)
  }
  return { label, status: found === patterns.length ? 'passed' : 'failed', evidence, screenshotPath }
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

async function planRunHistoryAssertion(
  page: Page,
  snapshot: Awaited<ReturnType<typeof captureRuntimeDomSnapshot>>,
  shot: (name: string, actionLabel?: string) => Promise<string | undefined>
): Promise<ScenarioAssertionResult> {
  const evidence: string[] = []
  const itemCount = snapshot.controls.filter((control) => control.dataTestId === 'plan-run-item').length
  const promptCount = snapshot.controls.filter((control) => control.dataTestId === 'plan-run-prompt').length
  const targetCount = snapshot.controls.filter((control) => control.dataTestId === 'plan-run-target').length
  const createdCount = snapshot.controls.filter((control) => control.dataTestId === 'plan-run-created-at').length
  const statusCount = snapshot.controls.filter((control) => control.dataTestId === 'plan-run-status').length
  const reopenButtons = snapshot.buttons.filter((control) => control.dataTestId === 'reopen-plan-run-button' || /^reopen$/i.test(labelOf(control)))
  evidence.push(
    `plan_run_items:${itemCount}`,
    `prompts:${promptCount}`,
    `targets:${targetCount}`,
    `created_timestamps:${createdCount}`,
    `statuses:${statusCount}`,
    `reopen_buttons:${reopenButtons.length}`
  )
  if (itemCount === 0) {
    return {
      label: 'Plan run history list is visible',
      status: 'blocked',
      evidence: [
        'no plan runs available',
        'No plan-run-item controls found.',
        'suggested_next_safe_action: generate_plan_bundle_with_sample_prompt'
      ],
      screenshotPath: snapshot.screenshotPath
    }
  }
  const hasMetadata = promptCount > 0 && targetCount > 0 && createdCount > 0 && statusCount > 0
  if (reopenButtons.length > 0) {
    const before = await pageSignature(page)
    await page.getByTestId('reopen-plan-run-button').first().click({ timeout: 2_000 }).catch((error) => evidence.push(`reopen_click_failed:${error instanceof Error ? error.message : String(error)}`))
    await page.waitForTimeout(150)
    const after = await pageSignature(page)
    evidence.push(`reopen_click_safe:${before !== after ? 'changed_state' : 'no_visible_change'}`)
    await shot('plan-run-reopen', 'click first Reopen plan run')
  }
  return {
    label: 'Plan runs expose metadata and safe reopen actions',
    status: hasMetadata && reopenButtons.length > 0 ? 'passed' : 'failed',
    evidence,
    screenshotPath: snapshot.screenshotPath
  }
}

function navigationControls(snapshot: Awaited<ReturnType<typeof captureRuntimeDomSnapshot>>) {
  const landmarkNavText = snapshot.landmarks
    .filter((item) => item.role === 'navigation' || item.tagName === 'nav' || item.tagName === 'aside')
    .map(labelOf)
    .join(' ')
  const candidates = [...snapshot.links, ...snapshot.buttons, ...snapshot.tabs]
  if (!landmarkNavText) return candidates.filter((control) => /home|summary|dashboard|projects|timeline|scenarios|crawl|workflow|issues|fix packets|screenshots|graph|raw json|settings|reports|users|articles|login|sign in/i.test(labelOf(control)))
  const inLandmark = candidates.filter((control) => {
    const label = labelOf(control)
    return label && landmarkNavText.includes(label)
  })
  if (inLandmark.length > 0) return inLandmark
  return candidates.filter((control) => /home|summary|dashboard|projects|timeline|scenarios|crawl|workflow|issues|fix packets|screenshots|graph|raw json|settings|reports|users|articles|login|sign in/i.test(labelOf(control)))
}

async function pageSignature(page: Page): Promise<string> {
  return page.evaluate(() => [
    location.href,
    document.querySelector('main')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) ?? '',
    document.body?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) ?? ''
  ].join('|')).catch(() => page.url())
}

async function visibleButton(page: Page, name: RegExp): Promise<boolean> {
  return page.getByRole('button', { name }).first().isVisible({ timeout: 500 }).catch(() => false)
}

async function visibleByRole(page: Page, role: Parameters<Page['getByRole']>[0], name: RegExp): Promise<boolean> {
  return page.getByRole(role, { name }).first().isVisible({ timeout: 500 }).catch(() => false)
}

function labelOf(control: { accessibleName?: string; visibleText?: string; labelText?: string; placeholder?: string; dataTestId?: string; href?: string; id?: string }): string {
  return (control.accessibleName ?? control.visibleText ?? control.labelText ?? control.placeholder ?? control.dataTestId ?? control.href ?? control.id ?? '').replace(/\s+/g, ' ').trim()
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stepTraceFromSnapshot(
  scenario: GeneratedScenario,
  stepName: string,
  actionLabel: string,
  snapshot: RuntimeDomSnapshot,
  screenshotPath?: string
): ScenarioStepTrace {
  return {
    scenarioName: scenario.name,
    scenarioSlug: scenario.id,
    stepName,
    actionLabel,
    url: snapshot.url,
    screenName: screenNameFromUrl(snapshot.url),
    navLabel: navLabelFromUrl(snapshot.url),
    screenshotPath,
    domSummary: snapshot.visibleTextBlocks.slice(0, 16),
    headings: snapshot.headings.map(labelOf).filter(Boolean).slice(0, 8),
    visibleControls: snapshot.controls.map(labelOf).filter(Boolean).slice(0, 40),
    activeNavState: navLabelFromUrl(snapshot.url)
  }
}

function screenNameFromUrl(url: string): string {
  const label = navLabelFromUrl(url)
  return label || 'Runtime screen'
}

function navLabelFromUrl(url: string): string | undefined {
  try {
    const hash = new URL(url).hash
    return ({
      '#summary': 'Summary',
      '#projects': 'Projects',
      '#timeline': 'Run Timeline',
      '#scenarios': 'Scenarios',
      '#crawl': 'Crawl Path',
      '#workflows': 'Workflow Evidence',
      '#issues': 'Issues',
      '#fix-packets': 'Fix Packets',
      '#screenshots': 'Screenshots',
      '#graph': 'Graph Explorer',
      '#raw-json': 'Raw JSON',
      '#settings': 'Settings'
    } as Record<string, string>)[hash]
  } catch {
    return undefined
  }
}
