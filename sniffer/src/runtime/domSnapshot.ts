import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, type Page } from 'playwright'
import type { LocatorCandidate, RuntimeControlKind, RuntimeDomControl, RuntimeDomForm, RuntimeDomSnapshot, RuntimeDomTable } from '../types.js'
import { classifyActionSafety } from './safeActions.js'

interface RawControl {
  id: string
  kind: RuntimeControlKind
  tagName: string
  role?: string
  visibleText?: string
  accessibleName?: string
  labelText?: string
  placeholder?: string
  dataTestId?: string
  name?: string
  type?: string
  href?: string
  value?: string
  disabled: boolean
  visible: boolean
  selectorHint?: string
  boundingBox?: { x: number; y: number; width: number; height: number }
  formId?: string
}

interface RawSnapshot {
  title: string
  url: string
  htmlExcerpt: string
  domText: string
  visibleTextBlocks: string[]
  controls: RawControl[]
  forms: Array<{ id: string; name?: string; action?: string; method?: string; controlIds: string[] }>
  tables: RuntimeDomTable[]
}

export async function inspectUrl(input: {
  url: string
  reportDir: string
  waitMs?: number
}): Promise<RuntimeDomSnapshot> {
  const screenshotsDir = path.join(input.reportDir, 'screenshots')
  await mkdir(screenshotsDir, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    await page.waitForLoadState('networkidle', { timeout: input.waitMs ?? 3_000 }).catch(() => undefined)
    const screenshotPath = path.join(screenshotsDir, 'initial.png')
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined)
    return await captureRuntimeDomSnapshot(page, screenshotPath)
  } finally {
    await browser.close()
  }
}

export async function captureRuntimeDomSnapshot(page: Page, screenshotPath?: string): Promise<RuntimeDomSnapshot> {
  const raw = await page.evaluate(`(() => {
    const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const textOf = (el) => normalize(el.innerText || el.textContent || el.getAttribute('value') || '');
    const attr = (el, name) => {
      const value = el.getAttribute(name);
      return value && value.trim() ? value.trim() : undefined;
    };
    const cssEscape = (value) => {
      if (window.CSS && window.CSS.escape) return window.CSS.escape(value);
      return String(value).replace(/["\\\\#.;:[\\]>+~*^$|=\\s]/g, '\\\\$&');
    };
    const labelText = (el) => {
      if (el.labels && el.labels.length) return normalize(Array.from(el.labels).map((label) => label.innerText || label.textContent || '').join(' '));
      const id = attr(el, 'id');
      if (id) {
        const label = document.querySelector('label[for="' + cssEscape(id) + '"]');
        if (label) return normalize(label.innerText || label.textContent || '');
      }
      const wrapped = el.closest('label');
      if (wrapped) return normalize(wrapped.innerText || wrapped.textContent || '');
      const labelledBy = attr(el, 'aria-labelledby');
      if (labelledBy) {
        return normalize(labelledBy.split(/\\s+/).map((idValue) => document.getElementById(idValue)?.innerText || document.getElementById(idValue)?.textContent || '').join(' '));
      }
      return undefined;
    };
    const accessibleName = (el) => normalize(
      attr(el, 'aria-label') ||
      labelText(el) ||
      attr(el, 'alt') ||
      attr(el, 'title') ||
      attr(el, 'name') ||
      attr(el, 'placeholder') ||
      textOf(el)
    ) || undefined;
    const selectorHint = (el, index) => {
      const testId = attr(el, 'data-testid') || attr(el, 'data-test-id') || attr(el, 'data-test');
      if (testId) return '[data-testid="' + testId.replace(/"/g, '\\\\"') + '"]';
      const id = attr(el, 'id');
      if (id) return '#' + cssEscape(id);
      const name = attr(el, 'name');
      if (name) return el.tagName.toLowerCase() + '[name="' + name.replace(/"/g, '\\\\"') + '"]';
      return el.tagName.toLowerCase() + ':nth-of-type(' + Math.max(1, index + 1) + ')';
    };
    const kindOf = (el) => {
      const tag = el.tagName.toLowerCase();
      const role = attr(el, 'role');
      if (role === 'tab') return 'tab';
      if (role === 'tablist') return 'tablist';
      if (role === 'button') return 'button';
      if (tag === 'dialog' || role === 'dialog' || role === 'alertdialog') return 'dialog';
      if (/^h[1-6]$/.test(tag)) return 'heading';
      if (tag === 'a') return 'link';
      if (tag === 'button') return 'button';
      if (tag === 'input') return 'input';
      if (tag === 'select') return 'select';
      if (tag === 'textarea') return 'textarea';
      if (tag === 'form') return 'form';
      if (tag === 'table') return 'table';
      if (['main', 'nav', 'header', 'footer', 'aside', 'section'].includes(tag) || ['main', 'navigation', 'banner', 'contentinfo', 'complementary', 'region'].includes(role || '')) return 'landmark';
      return 'text';
    };
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const selector = 'a,button,input,select,textarea,form,table,[role="tab"],[role="tablist"],[role="button"],[role="dialog"],[role="alertdialog"],dialog,main,nav,header,footer,aside,section,h1,h2,h3,h4,h5,h6,[data-testid],[data-test-id],[data-test]';
    const nodes = Array.from(document.querySelectorAll(selector));
    const controls = nodes.map((el, index) => {
      const rect = el.getBoundingClientRect();
      const kind = kindOf(el);
      return {
        id: 'dom-' + (index + 1),
        kind,
        tagName: el.tagName.toLowerCase(),
        role: attr(el, 'role') || (kind === 'link' ? 'link' : kind === 'button' ? 'button' : kind === 'heading' ? 'heading' : undefined),
        visibleText: textOf(el) || undefined,
        accessibleName: accessibleName(el),
        labelText: labelText(el),
        placeholder: attr(el, 'placeholder'),
        dataTestId: attr(el, 'data-testid') || attr(el, 'data-test-id') || attr(el, 'data-test'),
        name: attr(el, 'name'),
        type: attr(el, 'type'),
        href: el.tagName.toLowerCase() === 'a' ? el.href : undefined,
        value: el.value && String(el.value).trim() ? String(el.value).trim().slice(0, 120) : undefined,
        disabled: Boolean(el.disabled || attr(el, 'aria-disabled') === 'true'),
        visible: visible(el),
        selectorHint: selectorHint(el, index),
        boundingBox: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
        formId: el.form ? attr(el.form, 'id') || undefined : undefined
      };
    }).filter((item) => item.visible);
    const byElement = new Map(nodes.map((el, index) => [el, 'dom-' + (index + 1)]));
    const forms = Array.from(document.querySelectorAll('form')).map((form, index) => ({
      id: byElement.get(form) || 'form-' + (index + 1),
      name: accessibleName(form) || attr(form, 'name'),
      action: form.action || undefined,
      method: form.method || undefined,
      controlIds: Array.from(form.elements || []).map((el) => byElement.get(el)).filter(Boolean)
    }));
    const tables = Array.from(document.querySelectorAll('table')).map((table, index) => ({
      id: byElement.get(table) || 'table-' + (index + 1),
      caption: normalize(table.querySelector('caption')?.innerText || table.querySelector('caption')?.textContent || '') || undefined,
      headers: Array.from(table.querySelectorAll('th')).map((th) => normalize(th.innerText || th.textContent || '')).filter(Boolean).slice(0, 20),
      rowCount: table.querySelectorAll('tbody tr, tr').length,
      locatorCandidates: []
    }));
    const text = normalize(document.body?.innerText || '');
    return {
      title: document.title,
      url: location.href,
      htmlExcerpt: document.documentElement.outerHTML.replace(/<script[\\s\\S]*?<\\/script>/gi, '').replace(/<style[\\s\\S]*?<\\/style>/gi, '').replace(/\\s+/g, ' ').trim().slice(0, 20000),
      domText: text.slice(0, 12000),
      visibleTextBlocks: text ? text.split(/(?<=[.!?])\\s+|\\n+/).map((item) => normalize(item)).filter(Boolean).slice(0, 40) : [],
      controls,
      forms,
      tables
    };
  })()`) as RawSnapshot

  const controls = raw.controls.map((control) => enrichControl(control))
  const byId = new Map(controls.map((control) => [control.id, control]))
  const forms: RuntimeDomForm[] = raw.forms.map((form) => {
    const formControls = form.controlIds.map((id) => byId.get(id)).filter((control): control is RuntimeDomControl => Boolean(control))
    return {
      id: form.id,
      name: form.name,
      action: form.action,
      method: form.method,
      controls: formControls,
      locatorCandidates: locatorCandidates({
        id: form.id,
        kind: 'form',
        tagName: 'form',
        visibleText: form.name,
        accessibleName: form.name,
        disabled: false,
        visible: true
      })
    }
  })
  const tables = raw.tables.map((table) => ({
    ...table,
    locatorCandidates: table.locatorCandidates?.length ? table.locatorCandidates : locatorCandidates({
      id: table.id,
      kind: 'table',
      tagName: 'table',
      visibleText: table.caption || table.headers.join(' '),
      accessibleName: table.caption || table.headers.join(' '),
      disabled: false,
      visible: true
    })
  }))
  const accessibilitySnapshot = await (page as unknown as { accessibility?: { snapshot: () => Promise<unknown> } }).accessibility?.snapshot?.().catch(() => undefined)

  return {
    url: raw.url,
    title: raw.title,
    htmlExcerpt: raw.htmlExcerpt,
    domText: raw.domText,
    accessibilitySnapshot,
    headings: controls.filter((control) => control.kind === 'heading'),
    landmarks: controls.filter((control) => control.kind === 'landmark'),
    links: controls.filter((control) => control.kind === 'link'),
    buttons: controls.filter((control) => control.kind === 'button'),
    inputs: controls.filter((control) => control.kind === 'input'),
    selects: controls.filter((control) => control.kind === 'select'),
    textareas: controls.filter((control) => control.kind === 'textarea'),
    forms,
    tables,
    tabs: controls.filter((control) => control.kind === 'tab'),
    tablists: controls.filter((control) => control.kind === 'tablist'),
    dialogs: controls.filter((control) => control.kind === 'dialog'),
    visibleTextBlocks: raw.visibleTextBlocks,
    controls,
    screenshotPath,
    capturedAt: new Date().toISOString()
  }
}

export async function writeRuntimeDomArtifacts(reportDir: string, snapshot: RuntimeDomSnapshot): Promise<void> {
  await mkdir(reportDir, { recursive: true })
  await writeFile(path.join(reportDir, 'runtime_dom_snapshot.json'), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  await writeFile(path.join(reportDir, 'runtime_dom_snapshot.html'), snapshot.htmlExcerpt, 'utf8')
}

export function locatorCandidates(raw: Pick<RawControl, 'kind'> & Partial<RawControl>): LocatorCandidate[] {
  const role = roleFor(raw)
  const candidates: LocatorCandidate[] = []
  if (role && raw.accessibleName) candidates.push({
    strategy: 'role',
    value: `${role}:${raw.accessibleName}`,
    playwright: `getByRole('${role}', { name: ${JSON.stringify(raw.accessibleName)} })`,
    confidence: 0.95,
    reason: 'accessible role and name'
  })
  if (raw.labelText) candidates.push({
    strategy: 'label',
    value: raw.labelText,
    playwright: `getByLabel(${JSON.stringify(raw.labelText)})`,
    confidence: 0.9,
    reason: 'associated label text'
  })
  if (raw.placeholder) candidates.push({
    strategy: 'placeholder',
    value: raw.placeholder,
    playwright: `getByPlaceholder(${JSON.stringify(raw.placeholder)})`,
    confidence: 0.82,
    reason: 'placeholder text'
  })
  if (raw.dataTestId) candidates.push({
    strategy: 'testid',
    value: raw.dataTestId,
    playwright: `getByTestId(${JSON.stringify(raw.dataTestId)})`,
    confidence: 0.78,
    reason: 'data-testid attribute'
  })
  if (raw.visibleText && ['button', 'link', 'tab', 'heading', 'text'].includes(raw.kind)) candidates.push({
    strategy: 'text',
    value: raw.visibleText,
    playwright: `getByText(${JSON.stringify(raw.visibleText)})`,
    confidence: 0.55,
    reason: 'visible text fallback'
  })
  if (raw.selectorHint) candidates.push({
    strategy: 'css',
    value: raw.selectorHint,
    playwright: `locator(${JSON.stringify(raw.selectorHint)})`,
    confidence: 0.35,
    reason: 'CSS selector fallback'
  })
  return dedupeCandidates(candidates).sort((left, right) => right.confidence - left.confidence)
}

function enrichControl(raw: RawControl): RuntimeDomControl {
  const label = raw.accessibleName || raw.visibleText || raw.labelText || raw.placeholder || raw.dataTestId || raw.selectorHint || raw.kind
  const safeAction = classifyActionSafety(label, actionRole(raw.kind, raw.role))
  const candidates = locatorCandidates(raw)
  return {
    ...raw,
    locatorCandidates: candidates,
    confidence: candidates[0]?.confidence ?? 0.2,
    safeAction
  }
}

function roleFor(raw: Pick<RawControl, 'kind' | 'role'>): string | undefined {
  if (raw.role && raw.role !== 'text') return raw.role
  if (raw.kind === 'link') return 'link'
  if (raw.kind === 'button') return 'button'
  if (raw.kind === 'tab') return 'tab'
  if (raw.kind === 'heading') return 'heading'
  if (raw.kind === 'dialog') return 'dialog'
  if (raw.kind === 'input' || raw.kind === 'textarea') return 'textbox'
  if (raw.kind === 'select') return 'combobox'
  if (raw.kind === 'table') return 'table'
  return undefined
}

function actionRole(kind: RuntimeControlKind, role?: string): string | undefined {
  if (role) return role
  if (kind === 'link') return 'link'
  if (kind === 'tab') return 'tab'
  if (kind === 'button') return 'button'
  if (kind === 'input' || kind === 'textarea' || kind === 'select') return 'input'
  return undefined
}

function dedupeCandidates(candidates: LocatorCandidate[]): LocatorCandidate[] {
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const key = `${candidate.strategy}:${candidate.value}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
