import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import type { CrawlGraph, Issue, SourceGraph } from '../types.js'

export interface DomUxElement {
  tag: string
  role?: string
  text: string
  ariaLabel?: string
  title?: string
  id?: string
  type?: string
  placeholder?: string
  disabled: boolean
  className: string
  width: number
  height: number
  scrollWidth: number
  clientWidth: number
  hasLabel: boolean
}

export async function runUxHeuristicAudit(input: {
  url: string
  reportDir: string
  sourceGraph: SourceGraph
  crawlGraph: CrawlGraph
}): Promise<{ uxIssues: Issue[]; accessibilityIssues: Issue[] }> {
  const screenshotsDir = path.join(input.reportDir, 'screenshots', 'ux')
  await mkdir(screenshotsDir, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  try {
    await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    await page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => undefined)
    const screenshotPath = path.join(screenshotsDir, 'overview.png')
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined)
    const snapshot = await page.evaluate(`(() => {
      const text = (el) => (el.textContent || '').replace(/\\s+/g, ' ').trim();
      const labelFor = (el) => {
        const id = el.getAttribute('id');
        if (id && document.querySelector('label[for="' + CSS.escape(id) + '"]')) return true;
        if (el.closest('label')) return true;
        if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return true;
        return false;
      };
      const elements = Array.from(document.querySelectorAll('button,a,input,textarea,select,[role],table,pre,code,.card,[class*="card"],[class*="panel"],[class*="section"]')).map((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || undefined,
          text: text(el),
          ariaLabel: el.getAttribute('aria-label') || undefined,
          title: el.getAttribute('title') || undefined,
          id: el.getAttribute('id') || undefined,
          type: el.getAttribute('type') || undefined,
          placeholder: el.getAttribute('placeholder') || undefined,
          disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'),
          className: typeof el.className === 'string' ? el.className : '',
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          hasLabel: labelFor(el),
          visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
        };
      }).filter((item) => item.visible);
      const ids = Array.from(document.querySelectorAll('[id]')).map((el) => el.id).filter(Boolean);
      return { elements, ids, bodyText: text(document.body).slice(0, 12000) };
    })()`) as { elements: DomUxElement[]; ids: string[]; bodyText: string }

    return analyzeUxSnapshot({ ...snapshot, sourceGraph: input.sourceGraph, screenshotPath })
  } finally {
    await browser.close()
  }
}

export function analyzeUxSnapshot(input: {
  elements: DomUxElement[]
  ids: string[]
  bodyText: string
  sourceGraph: SourceGraph
  screenshotPath: string
}): { uxIssues: Issue[]; accessibilityIssues: Issue[] } {
  const accessibilityIssues = groupIssues([
    ...buttonNameIssues(input.elements, input.screenshotPath),
    ...formLabelIssues(input.elements, input.screenshotPath),
    ...duplicateIdIssues(input.ids, input.screenshotPath),
    ...dialogLabelIssues(input.elements, input.screenshotPath),
    ...copyAccessibilityIssues(input.elements, input.bodyText, input.screenshotPath)
  ])
  const uxIssues = groupIssues([
    ...duplicateWorkspaceIssues(input.bodyText, input.screenshotPath),
    ...textJamIssues(input.elements, input.bodyText, input.screenshotPath),
    ...overflowIssues(input.elements, input.screenshotPath),
    ...longPathIssues(input.elements, input.screenshotPath),
    ...verticalClutterIssues(input.elements, input.screenshotPath),
    ...emptyStateIssues(input.elements, input.bodyText, input.screenshotPath),
    ...loadingStateIssues(input.sourceGraph, input.bodyText, input.screenshotPath),
    ...primaryActionIssues(input.elements, input.screenshotPath),
    ...disabledControlIssues(input.elements, input.screenshotPath),
    ...planOutputIssues(input.elements, input.bodyText, input.screenshotPath)
  ])
  return { uxIssues, accessibilityIssues }
}

export function groupIssues(issues: Issue[]): Issue[] {
  const grouped = new Map<string, Issue>()
  for (const issue of issues) {
    const key = `${issue.type}:${normalizeTitle(issue.title)}`
    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, issue)
    } else {
      existing.evidence = [...new Set([...existing.evidence, ...issue.evidence])].slice(0, 12)
      existing.screenshotPath ||= issue.screenshotPath
      existing.severity = strongerSeverity(existing.severity, issue.severity)
    }
  }
  return [...grouped.values()]
}

function buttonNameIssues(elements: DomUxElement[], screenshotPath: string): Issue[] {
  return elements
    .filter((el) => (el.tag === 'button' || el.role === 'button') && accessibleName(el).length === 0)
    .map((el) => issue('medium', 'accessibility_issue', 'Button has no accessible name', 'A visible button does not expose text, aria-label, title, or a usable accessible name.', [`button: ${describe(el)}`], screenshotPath, 'Add visible text or aria-label to every icon-only button so screen reader and keyboard users understand the action.'))
    .concat(elements
      .filter((el) => (el.tag === 'button' || el.role === 'button') && /^\+$/.test(accessibleName(el)) && !el.ariaLabel)
      .map((el) => issue('medium', 'accessibility_issue', 'Plus-only button needs an accessible label', 'A button is labeled only with "+", which does not explain what action it performs.', [`button text: ${accessibleName(el)}`], screenshotPath, 'Replace plus-only buttons with descriptive accessible names such as "Create workspace" or "Add repo", while keeping the visual icon if desired.')))
}

function formLabelIssues(elements: DomUxElement[], screenshotPath: string): Issue[] {
  return elements
    .filter((el) => ['input', 'textarea', 'select'].includes(el.tag) && !['hidden', 'submit', 'button'].includes(el.type ?? '') && !el.hasLabel)
    .map((el) => issue('medium', 'accessibility_issue', 'Form control is missing an accessible label', 'An input, select, or textarea has no associated label or aria label.', [`${el.tag}: ${describe(el)}`], screenshotPath, 'Add explicit labels or aria-labels to form controls, especially repo target, path, workspace, and prompt inputs.'))
}

function duplicateIdIssues(ids: string[], screenshotPath: string): Issue[] {
  const counts = countBy(ids)
  return Object.entries(counts)
    .filter(([, count]) => count > 1)
    .map(([id, count]) => issue('medium', 'accessibility_issue', 'Duplicate DOM id', 'Duplicate IDs make label and focus behavior unreliable.', [`id="${id}" appears ${count} times`], screenshotPath, 'Ensure generated IDs are unique across repeated rows/cards and labels point to the correct control.'))
}

function dialogLabelIssues(elements: DomUxElement[], screenshotPath: string): Issue[] {
  return elements
    .filter((el) => (el.tag === 'dialog' || el.role === 'dialog') && accessibleName(el).length === 0 && !/modal|dialog/i.test(el.text))
    .map((el) => issue('medium', 'accessibility_issue', 'Dialog is missing an accessible label', 'A dialog/modal is visible without aria-label or aria-labelledby.', [`dialog: ${describe(el)}`], screenshotPath, 'Give every modal/dialog a visible heading and connect it with aria-labelledby, or provide aria-label.'))
}

function copyAccessibilityIssues(elements: DomUxElement[], bodyText: string, screenshotPath: string): Issue[] {
  if (!/handoff|raw json|prompt/i.test(bodyText)) return []
  const copyButtons = elements.filter((el) => (el.tag === 'button' || el.role === 'button') && /copy/i.test(accessibleName(el)))
  if (copyButtons.length > 0) return []
  return [issue('low', 'accessibility_issue', 'Generated text lacks an accessible copy action', 'Handoff/raw JSON style output appears present but no accessible Copy button was found.', ['DOM mentions handoff/raw JSON/prompt but no copy button by accessible name'], screenshotPath, 'Add accessible Copy buttons for generated handoff prompts and raw JSON panels.')]
}

function duplicateWorkspaceIssues(bodyText: string, screenshotPath: string): Issue[] {
  const workspaceish = [...bodyText.matchAll(/\b([A-Z][A-Za-z0-9_-]*(?:\s+[A-Z][A-Za-z0-9_-]*){0,2})\s+(?:local|workspace)\b/g)].map((match) => match[1])
  const repeated = Object.entries(countBy(workspaceish)).filter(([, count]) => count > 1)
  if (repeated.length === 0) return []
  return [issue('low', 'usability_issue', 'Workspace names appear duplicated without disambiguation', 'The workspace list appears to repeat names without enough metadata to distinguish them quickly.', repeated.slice(0, 5).map(([name, count]) => `${name}: ${count} appearances`), screenshotPath, 'Improve workspace list/card presentation with distinct metadata, active state, and separated created/updated dates.')]
}

function textJamIssues(elements: DomUxElement[], bodyText: string, screenshotPath: string): Issue[] {
  const jamPattern = /[A-Za-z)](?:local|workspace|repo)?\d{1,2}\/\d{1,2}\/\d{2,4}|[a-z]{3,}\d{1,2}\/\d{1,2}\/\d{2,4}/i
  const evidence = elements.map((el) => el.text).filter((text) => jamPattern.test(text)).slice(0, 5)
  if (evidence.length === 0 && jamPattern.test(bodyText)) evidence.push(bodyText.match(jamPattern)?.[0] ?? 'jammed date text')
  if (evidence.length === 0) return []
  return [issue('medium', 'layout_issue', 'Text appears jammed together', 'Adjacent labels/metadata appear concatenated without spacing or visual separation.', evidence, screenshotPath, 'Separate names, badges, and dates into distinct elements with spacing, muted metadata styles, and responsive wrapping/truncation.')]
}

function overflowIssues(elements: DomUxElement[], screenshotPath: string): Issue[] {
  const overflow = elements
    .filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 8 && !['pre', 'code'].includes(el.tag))
    .slice(0, 8)
  if (overflow.length === 0) return []
  return [issue('medium', 'layout_issue', 'Content overflows horizontally', 'One or more visible UI elements have horizontal overflow that can hide content or force page scrolling.', overflow.map((el) => `${describe(el)} scrollWidth=${el.scrollWidth} clientWidth=${el.clientWidth}`), screenshotPath, 'Add wrapping/truncation rules for long paths, tables, cards, and status text; avoid page-level horizontal overflow.')]
}

function longPathIssues(elements: DomUxElement[], screenshotPath: string): Issue[] {
  const pathTexts = elements.map((el) => el.text).filter((text) => /\/Users\/|[A-Za-z]:\\|https?:\/\//.test(text) && text.length > 80).slice(0, 5)
  if (pathTexts.length === 0) return []
  return [issue('low', 'layout_issue', 'Long paths are hard to scan', 'Long local paths or URLs appear as dense text and may not wrap or truncate gracefully.', pathTexts, screenshotPath, 'Render long paths with middle truncation, copy affordances, and tooltips/full text where useful.')]
}

function verticalClutterIssues(elements: DomUxElement[], screenshotPath: string): Issue[] {
  const sections = elements.filter((el) => /section|panel|card/i.test(`${el.tag} ${el.className}`) && el.height > 80)
  if (sections.length < 8) return []
  return [issue('low', 'visual_clutter', 'Many large vertical sections compete on one screen', 'The screen shows many large stacked panels, which can make primary workflows hard to scan.', [`large sections/panels visible: ${sections.length}`], screenshotPath, 'Group secondary details behind tabs/collapsible sections and keep the primary workflow compact and scannable.')]
}

function emptyStateIssues(elements: DomUxElement[], bodyText: string, screenshotPath: string): Issue[] {
  const mentionsLists = /workspaces|repositories|repo targets|plan runs/i.test(bodyText)
  const hasEmptyState = /no .*yet|empty|create .*to begin|add .*to begin/i.test(bodyText)
  const hasSparseList = elements.some((el) => /table|list|grid/i.test(`${el.role ?? ''} ${el.className}`) && el.text.length < 20)
  if (!mentionsLists || hasEmptyState || !hasSparseList) return []
  return [issue('low', 'usability_issue', 'Missing helpful empty state', 'A list/table area appears sparse without clear empty-state guidance.', ['workspace/repository/plan list text found without clear empty-state copy'], screenshotPath, 'Add empty states that explain what is missing and provide the next safe action.')]
}

function loadingStateIssues(sourceGraph: SourceGraph, bodyText: string, screenshotPath: string): Issue[] {
  const hasAsyncWorkflows = sourceGraph.apiCalls.length > 0
  if (!hasAsyncWorkflows || /loading|generating|refreshing|validating|busy/i.test(bodyText)) return []
  return [issue('low', 'usability_issue', 'Async workflows lack visible loading language', 'Source discovery found API-backed workflows, but the current DOM does not expose obvious loading/busy language.', sourceGraph.apiCalls.slice(0, 5).map((call) => `${call.method ?? 'GET'} ${call.endpoint}`), screenshotPath, 'Add visible loading and error states near validation, discovery, learning, and plan generation actions.')]
}

function primaryActionIssues(elements: DomUxElement[], screenshotPath: string): Issue[] {
  const buttons = elements.filter((el) => el.tag === 'button' || el.role === 'button')
  const primary = buttons.filter((el) => /primary|cta|generate|create|add/i.test(`${el.className} ${accessibleName(el)}`))
  if (buttons.length >= 5 && primary.length === 0) {
    return [issue('low', 'usability_issue', 'Primary action is unclear', 'Several buttons are visible but none is visually or semantically identifiable as the primary next action.', buttons.slice(0, 8).map(describe), screenshotPath, 'Make the main next action visually clear and use consistent primary button styling for create/add/generate workflows.')]
  }
  return []
}

function disabledControlIssues(elements: DomUxElement[], screenshotPath: string): Issue[] {
  const disabled = elements.filter((el) => el.disabled && !el.title && !el.ariaLabel && !/select|choose|requires|disabled|unavailable|first/i.test(el.text)).slice(0, 6)
  if (disabled.length === 0) return []
  return [issue('low', 'usability_issue', 'Disabled controls lack actionable explanation', 'Disabled controls are visible without nearby or accessible guidance about how to enable them.', disabled.map(describe), screenshotPath, 'Add helper text or tooltips explaining what prerequisite enables disabled controls.')]
}

function planOutputIssues(elements: DomUxElement[], bodyText: string, screenshotPath: string): Issue[] {
  const hasPlan = /plan bundle|change set|handoff|raw json|recommended_change_set/i.test(bodyText)
  if (!hasPlan) return []
  const hasTabs = elements.some((el) => el.role === 'tab' || /tab/.test(el.className))
  const largePre = elements.some((el) => ['pre', 'code'].includes(el.tag) && el.text.length > 1500)
  const issues: Issue[] = []
  if (!hasTabs && bodyText.length > 5000) {
    issues.push(issue('medium', 'usability_issue', 'Plan output is large without obvious tabs', 'Plan output appears large but tabs/collapsible sections were not detected.', ['plan output text present; no tab role/class detected'], screenshotPath, 'Organize large plan bundles into tabs or collapsible sections for Overview, Change Set, Recipes, Validation, Handoff, and Raw JSON.'))
  }
  if (largePre && !elements.some((el) => /copy/i.test(accessibleName(el)))) {
    issues.push(issue('low', 'usability_issue', 'Raw JSON is not copyable', 'A large pre/code block is visible without an obvious Copy action.', ['large code/pre block visible'], screenshotPath, 'Add a copy button to raw JSON and generated prompt/code panels.'))
  }
  return issues
}

function issue(severity: Issue['severity'], type: Issue['type'], title: string, description: string, evidence: string[], screenshotPath: string, suggestedFixPrompt: string): Issue {
  return { severity, type, title, description, evidence, screenshotPath, suggestedFixPrompt }
}

function accessibleName(el: DomUxElement): string {
  return (el.ariaLabel || el.title || el.text || el.placeholder || '').trim()
}

function describe(el: DomUxElement): string {
  const name = accessibleName(el) || el.id || el.className || el.tag
  return `${el.tag}${el.role ? `[role=${el.role}]` : ''}: ${name.slice(0, 100)}`
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    const key = value.trim()
    if (!key) return counts
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, ' ').trim()
}

function strongerSeverity(left: Issue['severity'], right: Issue['severity']): Issue['severity'] {
  const order = { critical: 4, high: 3, medium: 2, low: 1 }
  return order[right] > order[left] ? right : left
}
