import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium, type Locator, type Page } from 'playwright'
import type { Issue, ScenarioDefinition, ScenarioRun, ScenarioSlug, ScenarioStep } from '../types.js'

const SAMPLE_PROMPT = 'Add OwnersPage (no actions yet)'

export function builtInScenarios(): ScenarioDefinition[] {
  return [
    scenario('create-select-workspace', 'Create/select workspace', [], [
      step('Find workspace list', 'inspect_workspace_list', ['workspace selector/list or empty state']),
      step('Open workspace creation', 'open_workspace_modal', ['New workspace/Create workspace button', 'Workspace name input'])
    ], 'Workspace selection or creation is discoverable.', ['workspace selector/list or empty state', 'New workspace/Create workspace button']),
    scenario('add-repo-target', 'Add repo target', ['workspace selected or visible empty state'], [
      step('Open add repo form', 'open_add_repo_modal', ['Add repo/Add repository button', 'Target id input', 'Path or URL input', 'Source type selector/input'])
    ], 'Repo target form is discoverable without destructive submission.', ['Target id input', 'Path or URL input']),
    scenario('validate-local-repo-path', 'Validate local repo path', ['add repo form available'], [
      step('Open add repo form for validation', 'open_add_repo_modal', ['validation preview or warning area', 'Path or URL input'])
    ], 'Local repo path validation gives visible guidance.', ['validation preview or warning area']),
    scenario('refresh-discovery', 'Refresh discovery', ['repo target exists or add repo prerequisite visible'], [
      step('Select first repo target', 'select_first_repo_target', ['repository list or empty state']),
      step('Find discover action', 'inspect_refresh_discovery', ['Discover button or add repo prerequisite', 'discovery status surface'])
    ], 'Discovery refresh is reachable for a repo target.', ['Discover button or add repo prerequisite']),
    scenario('refresh-learning', 'Refresh learning', ['repo target exists or add repo prerequisite visible'], [
      step('Select first repo target', 'select_first_repo_target', ['repository list or empty state']),
      step('Find learning action', 'inspect_refresh_learning', ['Refresh learning button or add repo prerequisite', 'learning/recipe status surface'])
    ], 'Learning refresh is reachable for a repo target.', ['Refresh learning button or add repo prerequisite']),
    scenario('generate-plan-bundle', 'Generate plan bundle', ['workspace and repo target selected'], [
      step('Select first workspace', 'select_first_workspace', ['workspace selector/list or empty state']),
      step('Select first repo target', 'select_first_repo_target', ['target repo selector']),
      step('Enter sample prompt', 'enter_sample_prompt', ['feature request textarea/input']),
      step('Generate plan bundle', 'click_generate_plan', ['Generate Plan button', 'plan output or visible error'])
    ], 'A safe sample prompt can generate a visible plan or controlled error.', ['feature request textarea/input', 'Generate Plan button']),
    scenario('review-plan-output', 'Review plan bundle tabs', ['plan bundle generated'], [
      step('Open plan tabs', 'open_plan_tabs', ['Overview', 'Change Set', 'Recipes', 'Graph Evidence', 'Validation', 'Handoff', 'Raw JSON'])
    ], 'Generated plan output is organized into reviewable tabs.', ['Overview', 'Change Set', 'Handoff', 'Raw JSON']),
    scenario('copy-handoff-prompt', 'Copy handoff prompt', ['handoff prompt exists'], [
      step('Open handoff tab', 'open_handoff_tab', ['handoff prompt text area/panel']),
      step('Find copy prompt', 'inspect_copy_prompt', ['Copy prompt button'])
    ], 'The generated handoff prompt is readable and copyable.', ['Copy prompt button']),
    scenario('inspect-raw-json', 'Inspect raw JSON', ['plan bundle generated'], [
      step('Open raw JSON tab', 'open_raw_json_tab', ['Raw JSON tab/button', 'raw JSON payload panel'])
    ], 'Raw JSON is available for inspection.', ['Raw JSON tab/button', 'raw JSON payload panel']),
    scenario('semantic-enrichment-toggle', 'Use semantic enrichment toggle', [], [
      step('Find semantic toggle', 'inspect_semantic_toggle', ['semantic enrichment toggle or indicator'])
    ], 'Semantic enrichment mode is discoverable and clearly labeled.', ['semantic enrichment toggle or indicator'])
  ]
}

export async function runScenarios(input: {
  url: string
  reportDir: string
  scenario: ScenarioSlug
  maxIterations?: number
}): Promise<ScenarioRun[]> {
  const selected = selectScenarios(input.scenario)
  if (selected.length === 0) return []

  const screenshotsDir = path.join(input.reportDir, 'screenshots', 'scenarios')
  await mkdir(screenshotsDir, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    await page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => undefined)
    const runs: ScenarioRun[] = []
    for (const definition of selected.slice(0, input.maxIterations ?? selected.length)) {
      runs.push(await runScenario(page, definition, screenshotsDir))
      await page.keyboard.press('Escape').catch(() => undefined)
    }
    return runs
  } finally {
    await browser.close()
  }
}

export function scenarioIssues(runs: ScenarioRun[]): Issue[] {
  return runs.flatMap((run) => run.issues)
}

function selectScenarios(slug: ScenarioSlug): ScenarioDefinition[] {
  const all = builtInScenarios()
  if (slug === 'all') return all
  const alias = slug === 'review-plan-output' ? 'review-plan-output' : slug
  return all.filter((scenario) => scenario.slug === alias)
}

async function runScenario(page: Page, definition: ScenarioDefinition, screenshotsDir: string): Promise<ScenarioRun> {
  const stepsAttempted: string[] = []
  const screenshots: string[] = []
  const assertions = definition.assertions.map((label) => ({ label, status: 'blocked' as const, evidence: [] as string[] }))

  for (const currentStep of definition.steps) {
    stepsAttempted.push(currentStep.name)
    if (currentStep.safe) await executeStep(page, currentStep)
    await page.waitForTimeout(250)
    const screenshotPath = path.join(screenshotsDir, `${definition.slug}-${screenshots.length + 1}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined)
    screenshots.push(screenshotPath)
  }

  const checked = []
  for (const assertion of assertions) {
    const result = await checkScenarioAssertion(page, assertion.label)
    checked.push({ ...assertion, ...result, screenshotPath: screenshots.at(-1) })
  }

  const issues = checked
    .filter((assertion) => assertion.status === 'failed')
    .map((assertion) => scenarioIssue(definition, assertion.label, assertion.evidence, assertion.screenshotPath))
  return {
    slug: definition.slug,
    name: definition.name,
    status: issues.length > 0 ? 'failed' : 'passed',
    prerequisites: definition.prerequisites,
    stepsAttempted,
    screenshots,
    assertions: checked,
    issues
  }
}

async function executeStep(page: Page, step: ScenarioStep): Promise<void> {
  switch (step.action) {
    case 'open_workspace_modal':
      await clickFirst(page, [button(page, /new workspace|create workspace|add workspace/i)])
      break
    case 'open_add_repo_modal':
      await clickFirst(page, [button(page, /add repo|add repository/i)])
      break
    case 'select_first_workspace':
      await clickFirst(page, [button(page, /workspace/i), page.getByRole('link', { name: /workspace/i })])
      break
    case 'select_first_repo_target':
      await clickFirst(page, [button(page, /view details|select|repo|petclinic|target/i), page.getByText(/petclinic|repository target/i)])
      break
    case 'enter_sample_prompt':
      await fillFirst(page, [page.getByLabel(/feature request|prompt/i), page.getByPlaceholder(/feature|prompt|describe/i), page.getByRole('textbox', { name: /feature|prompt/i }), page.locator('textarea').first()], SAMPLE_PROMPT)
      break
    case 'click_generate_plan':
      await clickFirst(page, [button(page, /generate.*plan|generate plan bundle/i)])
      await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => undefined)
      break
    case 'open_plan_tabs':
      for (const label of [/overview/i, /change set|changes/i, /recipes/i, /graph evidence|graph/i, /validation/i, /handoff/i, /raw json|json/i]) {
        await clickFirst(page, [page.getByRole('tab', { name: label }), button(page, label)])
      }
      break
    case 'open_handoff_tab':
      await clickFirst(page, [page.getByRole('tab', { name: /handoff/i }), button(page, /handoff/i)])
      break
    case 'open_raw_json_tab':
      await clickFirst(page, [page.getByRole('tab', { name: /raw json|json/i }), button(page, /raw json|json/i)])
      break
  }
}

async function checkScenarioAssertion(page: Page, label: string): Promise<{ status: 'passed' | 'failed'; evidence: string[] }> {
  const locator = assertionLocator(page, label)
  if (await isVisible(locator)) {
    return { status: 'passed', evidence: [await evidenceFor(locator) || label] }
  }
  return { status: 'failed', evidence: [`Missing expected scenario control/result: ${label}`] }
}

function assertionLocator(page: Page, label: string): Locator {
  if (/workspace selector|workspace list|empty state/i.test(label)) return page.getByText(/workspace|create a workspace|select workspace/i)
  if (/new workspace|create workspace/i.test(label)) return button(page, /new workspace|create workspace|add workspace/i)
  if (/target id/i.test(label)) return page.getByLabel(/target id/i).or(page.getByRole('textbox', { name: /target/i }))
  if (/path or url/i.test(label)) return page.getByLabel(/path or url/i).or(page.getByPlaceholder(/path|url/i))
  if (/source type/i.test(label)) return page.getByLabel(/source type/i).or(page.getByText(/local path|git url/i))
  if (/validation preview/i.test(label)) return page.getByText(/validation|detected|warning|suggested root|browser folder picker/i)
  if (/discover/i.test(label)) return button(page, /discover|add repo|add repository/i)
  if (/learning/i.test(label)) return button(page, /refresh learning|add repo|add repository/i).or(page.getByText(/learning|recipes/i))
  if (/feature request/i.test(label)) return page.getByLabel(/feature request|prompt/i).or(page.getByPlaceholder(/feature|prompt|describe/i)).or(page.locator('textarea').first())
  if (/target repo selector/i.test(label)) return page.getByLabel(/target|repo/i).or(page.getByText(/target selected|selected target|repository/i))
  if (/generate plan/i.test(label)) return button(page, /generate.*plan|generate plan bundle/i)
  if (/plan output/i.test(label)) return page.getByText(/overview|change set|handoff|raw json|error|failed/i)
  if (/copy prompt/i.test(label)) return button(page, /copy prompt|copy/i)
  if (/raw json payload/i.test(label)) return page.locator('pre, code').or(page.getByText(/schema_version|recommended_change_set|plan_bundle/i))
  if (/semantic/i.test(label)) return page.getByText(/semantic/i)
  return page.getByText(new RegExp(escapeRegex(label), 'i'))
}

function scenarioIssue(definition: ScenarioDefinition, assertion: string, evidence: string[], screenshotPath?: string): Issue {
  return {
    severity: /generate|target id|path|copy|raw json/i.test(assertion) ? 'medium' : 'low',
    type: 'workflow_confusion',
    title: `Scenario failed: ${definition.name}`,
    description: `The "${definition.name}" scenario did not expose expected UI evidence for "${assertion}".`,
    evidence: [...evidence, `scenario: ${definition.slug}`, `expected result: ${definition.expectedResult}`],
    screenshotPath,
    suggestedFixPrompt: `Improve the "${definition.name}" workflow so users can find and complete "${assertion}". Preserve safe behavior and add accessible labels for the expected controls.`
  }
}

function scenario(slug: Exclude<ScenarioSlug, 'all'>, name: string, prerequisites: string[], steps: ScenarioStep[], expectedResult: string, assertions: string[]): ScenarioDefinition {
  return { slug, name, prerequisites, steps, expectedResult, assertions }
}

function step(name: string, action: string, expectedControls: string[], safe = true): ScenarioStep {
  return { name, action, expectedControls, safe }
}

function button(page: Page, name: RegExp): Locator {
  return page.getByRole('button', { name })
}

async function clickFirst(page: Page, locators: Locator[]): Promise<void> {
  for (const locator of locators) {
    if (await isVisible(locator)) {
      await locator.first().click({ timeout: 1_500 }).catch(() => undefined)
      await page.waitForTimeout(200)
      return
    }
  }
}

async function fillFirst(page: Page, locators: Locator[], value: string): Promise<void> {
  for (const locator of locators) {
    if (await isVisible(locator)) {
      await locator.first().fill(value, { timeout: 1_500 }).catch(() => undefined)
      return
    }
  }
}

async function isVisible(locator: Locator): Promise<boolean> {
  return locator.first().isVisible({ timeout: 500 }).catch(() => false)
}

async function evidenceFor(locator: Locator): Promise<string> {
  const first = locator.first()
  const text = await first.textContent({ timeout: 500 }).catch(() => null)
  if (text?.trim()) return text.replace(/\s+/g, ' ').trim().slice(0, 160)
  const aria = await first.getAttribute('aria-label', { timeout: 500 }).catch(() => null)
  return aria?.trim() ?? ''
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
