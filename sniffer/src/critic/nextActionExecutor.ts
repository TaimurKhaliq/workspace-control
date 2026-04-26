import { chromium, type Page } from 'playwright'
import type { NextSafeAction, WorkflowCriticDecision } from '../types.js'
import { classifyActionSafety } from '../runtime/safeActions.js'

export async function executeNextSafeActions(input: {
  url: string
  decisions: WorkflowCriticDecision[]
  maxIterations: number
}): Promise<string[]> {
  const actions = input.decisions
    .map((decision) => decision.next_safe_action)
    .filter(Boolean) as NextSafeAction[]
  const uniqueActions = [...new Set(actions)].slice(0, input.maxIterations)
  if (uniqueActions.length === 0) return []

  const browser = await chromium.launch()
  const page = await browser.newPage()
  const executed: string[] = []
  try {
    await page.goto(input.url, { waitUntil: 'domcontentloaded' })
    for (const action of uniqueActions) {
      if (!isSafeNextAction(action)) continue
      const didRun = await executeAction(page, action)
      if (didRun) executed.push(action)
    }
  } finally {
    await browser.close()
  }
  return executed
}

export function isSafeNextAction(action: NextSafeAction): boolean {
  return classifyActionSafety(action, 'button').safe
}

async function executeAction(page: Page, action: NextSafeAction): Promise<boolean> {
  switch (action) {
    case 'navigate_to_repositories':
      return clickByRoleOrText(page, /repositories/i)
    case 'navigate_to_plan_runs':
      return clickByRoleOrText(page, /plan runs|prompt/i)
    case 'open_add_repo_modal':
      return clickButton(page, /add repo|add repository/i)
    case 'open_workspace_modal':
      return clickButton(page, /new workspace|create workspace/i)
    case 'select_first_workspace':
      return selectFirstOption(page, /workspace/i)
    case 'select_first_repo_target':
      return selectFirstOption(page, /target|repo/i)
    case 'generate_plan_bundle_with_sample_prompt':
      await fillFirstTextbox(page, /feature|prompt|request/i, 'Sniffer verification sample prompt')
      return clickButton(page, /generate.*plan|generate plan bundle/i)
    case 'open_plan_tab':
      return clickByRoleOrText(page, /overview|changes|handoff|json/i)
    case 'copy_handoff_prompt':
      return clickButton(page, /copy prompt|copy/i)
    default:
      return false
  }
}

async function clickByRoleOrText(page: Page, name: RegExp): Promise<boolean> {
  const link = page.getByRole('link', { name }).first()
  if (await link.isVisible({ timeout: 500 }).catch(() => false)) {
    await link.click({ timeout: 1_000 }).catch(() => undefined)
    return true
  }
  const button = page.getByRole('button', { name }).first()
  if (await button.isVisible({ timeout: 500 }).catch(() => false)) {
    await button.click({ timeout: 1_000 }).catch(() => undefined)
    return true
  }
  const text = page.getByText(name).first()
  if (await text.isVisible({ timeout: 500 }).catch(() => false)) {
    await text.click({ timeout: 1_000 }).catch(() => undefined)
    return true
  }
  return false
}

async function clickButton(page: Page, name: RegExp): Promise<boolean> {
  const button = page.getByRole('button', { name }).first()
  if (!(await button.isVisible({ timeout: 500 }).catch(() => false))) return false
  await button.click({ timeout: 1_000 }).catch(() => undefined)
  return true
}

async function selectFirstOption(page: Page, name: RegExp): Promise<boolean> {
  const select = page.getByRole('combobox', { name }).first()
  if (!(await select.isVisible({ timeout: 500 }).catch(() => false))) return false
  const values = await select.locator('option').evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value).filter(Boolean)
  ).catch(() => [])
  const first = values[0]
  if (!first) return false
  await select.selectOption(first).catch(() => undefined)
  return true
}

async function fillFirstTextbox(page: Page, name: RegExp, value: string): Promise<boolean> {
  const textbox = page.getByRole('textbox', { name }).first()
  if (await textbox.isVisible({ timeout: 500 }).catch(() => false)) {
    await textbox.fill(value, { timeout: 1_000 }).catch(() => undefined)
    return true
  }
  const textarea = page.locator('textarea').first()
  if (await textarea.isVisible({ timeout: 500 }).catch(() => false)) {
    await textarea.fill(value, { timeout: 1_000 }).catch(() => undefined)
    return true
  }
  return false
}
