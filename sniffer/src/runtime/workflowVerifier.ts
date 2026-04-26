import { chromium, type Locator, type Page } from 'playwright'
import type {
  RuntimeControlCheck,
  RuntimeWorkflowIssue,
  RuntimeWorkflowVerification,
  SourceGraph,
  SourceWorkflow
} from '../types.js'

export interface VerifyRuntimeIntentOptions {
  url: string
  sourceGraph: SourceGraph
  timeoutMs?: number
}

export async function verifyRuntimeIntent(options: VerifyRuntimeIntentOptions): Promise<RuntimeWorkflowVerification[]> {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs ?? 15_000 })
    await page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => undefined)
    const verifications: RuntimeWorkflowVerification[] = []
    for (const workflow of options.sourceGraph.sourceWorkflows) {
      verifications.push(await verifyWorkflow(page, workflow))
      await page.keyboard.press('Escape').catch(() => undefined)
    }
    return verifications
  } finally {
    await browser.close()
  }
}

export function buildWorkflowStatus(controls: RuntimeControlCheck[]): RuntimeWorkflowVerification['status'] {
  const applicable = controls.filter((control) => control.status !== 'not_applicable')
  if (applicable.length === 0) return 'unknown'
  const found = applicable.filter((control) => control.status === 'found').length
  if (found === applicable.length) return 'verified'
  if (found > 0) return 'partial'
  return 'missing'
}

export function workflowIssues(workflowName: string, controls: RuntimeControlCheck[]): RuntimeWorkflowIssue[] {
  return controls
    .filter((control) => control.status === 'missing')
    .map((control) => ({
      type: /input|textarea|selector|preview|warning|name/i.test(control.label) ? 'missing_form_control' : 'missing_ui_surface',
      title: `Missing runtime control for ${workflowName}`,
      description: `${control.label} was expected from source-discovered workflow "${workflowName}" but was not found in the runtime DOM.`,
      evidence: [control.missingReason ?? control.label]
    }))
}

async function verifyWorkflow(page: Page, workflow: SourceWorkflow): Promise<RuntimeWorkflowVerification> {
  const attemptedInteractions: string[] = []
  let controls: RuntimeControlCheck[]

  switch (workflow.name) {
    case 'Create/select workspace':
      controls = await verifyCreateWorkspace(page, attemptedInteractions)
      break
    case 'Add repo':
      controls = await verifyAddRepo(page, attemptedInteractions)
      break
    case 'Validate repo path':
      controls = await verifyValidateRepoPath(page, attemptedInteractions)
      break
    case 'Refresh discovery':
      controls = await verifyRefreshDiscovery(page)
      break
    case 'Refresh learning':
      controls = await verifyRefreshLearning(page)
      break
    case 'Generate plan bundle':
      controls = await verifyGeneratePlan(page, attemptedInteractions)
      break
    case 'View plan bundle tabs':
      controls = await verifyPlanTabs(page, attemptedInteractions)
      break
    case 'Copy handoff prompt':
      controls = await verifyHandoffPrompt(page, attemptedInteractions)
      break
    case 'Inspect raw JSON':
      controls = await verifyRawJson(page, attemptedInteractions)
      break
    default:
      controls = await verifyGenericWorkflow(page, workflow)
      break
  }

  return {
    name: workflow.name,
    sourceFiles: workflow.sourceFiles,
    status: buildWorkflowStatus(controls),
    evidence: controls.flatMap((control) => control.matchedEvidence),
    controls,
    attemptedInteractions,
    issues: workflowIssues(workflow.name, controls)
  }
}

async function verifyCreateWorkspace(page: Page, attempted: string[]): Promise<RuntimeControlCheck[]> {
  const controls: RuntimeControlCheck[] = []
  controls.push(await checkAny(page, 'workspace selector/list or empty state', [
    byRole(page, 'combobox', /workspace/i),
    page.getByText(/workspaces/i),
    page.getByText(/create a workspace to begin/i)
  ]))
  const newWorkspace = await checkAny(page, 'New workspace/Create workspace button', [
    byRole(page, 'button', /new workspace/i),
    byRole(page, 'button', /create workspace/i),
    byRole(page, 'button', /add workspace/i)
  ])
  controls.push(newWorkspace)
  if (newWorkspace.status === 'found') {
    await clickFirstVisible(page, [byRole(page, 'button', /new workspace/i), byRole(page, 'button', /create workspace/i), byRole(page, 'button', /add workspace/i)], attempted, 'open workspace form')
    controls.push(await checkAny(page, 'Workspace name input', [
      page.getByLabel(/workspace name/i),
      byRole(page, 'textbox', /workspace/i),
      page.locator('input').filter({ hasText: /workspace/i })
    ]))
  } else {
    controls.push(missing('Workspace name input', 'workspace form could not be opened'))
  }
  await closeTransientUi(page, attempted)
  return controls
}

async function verifyAddRepo(page: Page, attempted: string[]): Promise<RuntimeControlCheck[]> {
  const controls: RuntimeControlCheck[] = []
  const addRepo = await checkAny(page, 'Add repo/Add repository button', [
    byRole(page, 'button', /add repo/i),
    byRole(page, 'button', /add repository/i)
  ])
  controls.push(addRepo)
  if (addRepo.status === 'found') {
    await clickFirstVisible(page, [byRole(page, 'button', /add repo/i), byRole(page, 'button', /add repository/i)], attempted, 'open add repo form')
    controls.push(await checkAny(page, 'Target id input', [page.getByLabel(/target id/i), byRole(page, 'textbox', /target/i)]))
    controls.push(await checkAny(page, 'Source type selector/input', [page.getByLabel(/source type/i), byRole(page, 'combobox', /source type/i), page.getByText(/local path|git url/i)]))
    controls.push(await checkAny(page, 'Path or URL input', [page.getByLabel(/path or url/i), page.getByPlaceholder(/path|url/i), byRole(page, 'textbox', /path|url|locator/i)]))
    controls.push(await checkAny(page, 'validation preview or warning area', [page.getByText(/validation|detected|warning|suggested root|browser folder picker/i)]))
  } else {
    controls.push(missing('Target id input', 'add repo form could not be opened'))
    controls.push(missing('Source type selector/input', 'add repo form could not be opened'))
    controls.push(missing('Path or URL input', 'add repo form could not be opened'))
    controls.push(missing('validation preview or warning area', 'add repo form could not be opened'))
  }
  await closeTransientUi(page, attempted)
  return controls
}

async function verifyValidateRepoPath(page: Page, attempted: string[]): Promise<RuntimeControlCheck[]> {
  const controls: RuntimeControlCheck[] = []
  const addRepo = await checkAny(page, 'Add repo/Add repository button', [
    byRole(page, 'button', /add repo/i),
    byRole(page, 'button', /add repository/i)
  ])
  controls.push(addRepo)
  if (addRepo.status === 'found') {
    await clickFirstVisible(page, [byRole(page, 'button', /add repo/i), byRole(page, 'button', /add repository/i)], attempted, 'open add repo form for validation')
    controls.push(await checkAny(page, 'repo locator input', [page.getByLabel(/path or url/i), page.getByPlaceholder(/path|url/i), byRole(page, 'textbox', /path|url|locator/i)]))
    controls.push(await checkAny(page, 'validation preview or warning area', [page.getByText(/validation|detected|warning|suggested root|browser folder picker/i)]))
  } else {
    controls.push(missing('repo locator input', 'add repo form could not be opened'))
    controls.push(missing('validation preview or warning area', 'add repo form could not be opened'))
  }
  await closeTransientUi(page, attempted)
  return controls
}

async function verifyRefreshDiscovery(page: Page): Promise<RuntimeControlCheck[]> {
  return [
    await checkAny(page, 'repository list or empty state', [page.getByText(/discovery targets|no repo targets|repository/i)]),
    await checkAny(page, 'Discover button or add repo prerequisite', [byRole(page, 'button', /discover/i), byRole(page, 'button', /add repo|add repository/i)]),
    await checkAny(page, 'discovery status surface', [page.getByText(/status|discovered|not registered|pending/i)])
  ]
}

async function verifyRefreshLearning(page: Page): Promise<RuntimeControlCheck[]> {
  return [
    await checkAny(page, 'repository list or empty state', [page.getByText(/discovery targets|no repo targets|repository/i)]),
    await checkAny(page, 'Refresh learning button or add repo prerequisite', [byRole(page, 'button', /refresh learning/i), byRole(page, 'button', /add repo|add repository/i)]),
    await checkAny(page, 'learning/recipe status surface', [page.getByText(/learning|recipes|learned recipes/i)])
  ]
}

async function verifyGeneratePlan(page: Page, attempted: string[]): Promise<RuntimeControlCheck[]> {
  return [
    await checkAny(page, 'feature request textarea/input', [page.getByLabel(/feature request|prompt/i), page.getByPlaceholder(/feature|prompt|describe/i), byRole(page, 'textbox', /feature|prompt/i)]),
    await checkAny(page, 'target repo selector', [page.getByLabel(/target|repo/i), byRole(page, 'combobox', /target|repo/i), page.getByText(/target selected|selected target|repository/i)]),
    await checkAny(page, 'Generate Plan button', [byRole(page, 'button', /generate.*plan|generate plan bundle/i)]),
    await checkAny(page, 'loading state after click if possible', [page.getByText(/generating plan bundle|loading|busy|ready/i)])
  ]
}

async function verifyPlanTabs(page: Page, attempted: string[]): Promise<RuntimeControlCheck[]> {
  const expected = [
    ['Overview tab/button', /overview/i],
    ['Change Set tab/button', /change set|changes/i],
    ['Recipes tab/button', /recipes/i],
    ['Graph Evidence tab/button', /graph evidence|graph/i],
    ['Validation tab/button', /validation/i],
    ['Handoff tab/button', /handoff/i],
    ['Raw JSON tab/button', /raw json|json/i]
  ] as const

  const controls: RuntimeControlCheck[] = []
  for (const [label, pattern] of expected) {
    const check = await checkAny(page, label, [byRole(page, 'tab', pattern), byRole(page, 'button', pattern), page.getByText(pattern)])
    controls.push(check)
    if (check.status === 'found' && /tab|button/.test(label.toLowerCase())) {
      await clickFirstVisible(page, [byRole(page, 'tab', pattern), byRole(page, 'button', pattern)], attempted, `open ${label}`)
    }
  }
  return controls
}

async function verifyHandoffPrompt(page: Page, attempted: string[]): Promise<RuntimeControlCheck[]> {
  const handoff = byRole(page, 'tab', /handoff/i)
  if (await isVisible(handoff)) {
    await handoff.first().click({ timeout: 1_000 }).catch(() => undefined)
    attempted.push('open handoff tab')
  }
  return [
    await checkAny(page, 'handoff prompt text area/panel', [page.getByText(/handoff|prompt/i), byRole(page, 'textbox', /handoff|prompt/i), page.locator('pre, textarea, code')]),
    await checkAny(page, 'Copy prompt button', [byRole(page, 'button', /copy prompt|copy/i)])
  ]
}

async function verifyRawJson(page: Page, attempted: string[]): Promise<RuntimeControlCheck[]> {
  const jsonTab = byRole(page, 'tab', /raw json|json/i)
  const jsonButton = byRole(page, 'button', /raw json|json/i)
  if (await isVisible(jsonTab)) {
    await jsonTab.first().click({ timeout: 1_000 }).catch(() => undefined)
    attempted.push('open raw JSON tab')
  } else if (await isVisible(jsonButton)) {
    await jsonButton.first().click({ timeout: 1_000 }).catch(() => undefined)
    attempted.push('open raw JSON button')
  }
  return [
    await checkAny(page, 'Raw JSON tab/button', [jsonTab, jsonButton, page.getByText(/raw json|json/i)]),
    await checkAny(page, 'raw JSON payload panel', [page.locator('pre, code'), page.getByText(/schema_version|recommended_change_set|plan_bundle/i)])
  ]
}

async function verifyGenericWorkflow(page: Page, workflow: SourceWorkflow): Promise<RuntimeControlCheck[]> {
  const checks = workflow.likelyUserActions.slice(0, 3).map((action) => checkAny(page, action, [page.getByText(new RegExp(escapeRegex(action.split(' ')[0] ?? action), 'i'))]))
  return Promise.all(checks)
}

function byRole(page: Page, role: Parameters<Page['getByRole']>[0], name: RegExp): Locator {
  return page.getByRole(role, { name })
}

async function checkAny(page: Page, label: string, locators: Locator[]): Promise<RuntimeControlCheck> {
  const matches: string[] = []
  for (const locator of locators) {
    if (await isVisible(locator)) {
      const text = await evidenceFor(locator)
      matches.push(text || label)
      break
    }
  }
  return matches.length > 0 ? { label, status: 'found', matchedEvidence: matches } : missing(label, 'no matching accessible locator or visible text found')
}

function missing(label: string, missingReason: string): RuntimeControlCheck {
  return { label, status: 'missing', matchedEvidence: [], missingReason }
}

async function clickFirstVisible(page: Page, locators: Locator[], attempted: string[], label: string): Promise<void> {
  for (const locator of locators) {
    if (await isVisible(locator)) {
      await locator.first().click({ timeout: 1_500 }).catch(() => undefined)
      attempted.push(label)
      await page.waitForTimeout(150)
      return
    }
  }
}

async function closeTransientUi(page: Page, attempted: string[]): Promise<void> {
  const close = byRole(page, 'button', /close|cancel/i)
  if (await isVisible(close)) {
    await close.first().click({ timeout: 1_000 }).catch(() => undefined)
    attempted.push('close transient UI')
    return
  }
  await page.keyboard.press('Escape').catch(() => undefined)
}

async function isVisible(locator: Locator): Promise<boolean> {
  return locator.first().isVisible({ timeout: 500 }).catch(() => false)
}

async function evidenceFor(locator: Locator): Promise<string> {
  const first = locator.first()
  const text = await first.textContent({ timeout: 500 }).catch(() => null)
  if (text?.trim()) return text.replace(/\s+/g, ' ').trim().slice(0, 160)
  const aria = await first.getAttribute('aria-label', { timeout: 500 }).catch(() => null)
  if (aria?.trim()) return aria.trim()
  const placeholder = await first.getAttribute('placeholder', { timeout: 500 }).catch(() => null)
  if (placeholder?.trim()) return placeholder.trim()
  return ''
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
