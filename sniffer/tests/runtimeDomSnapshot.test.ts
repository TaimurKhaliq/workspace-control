import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { captureRuntimeDomSnapshot, locatorCandidates } from '../src/runtime/domSnapshot.js'
import { buildRuntimeAppModel, buildRuntimeIntentContext } from '../src/runtime/runtimeAppModel.js'
import { deterministicLocatorRepair, resolveLocatorCandidate } from '../src/runtime/locatorRepair.js'
import { MockLlmProvider } from '../src/llm/mockProvider.js'

let browser: Browser
let page: Page

beforeAll(async () => {
  browser = await chromium.launch()
  page = await browser.newPage()
})

afterAll(async () => {
  await browser.close()
})

describe('runtime DOM snapshot', () => {
  it('extracts headings, buttons, forms, inputs, tabs, tables, and locators from a CRUD page', async () => {
    await page.setContent(crudHtml())

    const snapshot = await captureRuntimeDomSnapshot(page)

    expect(snapshot.headings.map(label)).toContain('Articles')
    expect(snapshot.buttons.map(label)).toEqual(expect.arrayContaining(['Add Article', 'Delete']))
    expect(snapshot.forms).toHaveLength(1)
    expect(snapshot.inputs.map(label)).toContain('Title')
    expect(snapshot.tables[0].headers).toEqual(expect.arrayContaining(['Title', 'Author']))
    expect(snapshot.tabs.map(label)).toContain('Drafts')
    expect(snapshot.buttons.find((button) => label(button) === 'Add Article')?.locatorCandidates[0].strategy).toBe('role')
    expect(snapshot.inputs.find((input) => label(input) === 'Title')?.locatorCandidates.map((candidate) => candidate.strategy).slice(0, 2)).toEqual(['role', 'label'])
  })

  it('prefers role, label, placeholder, test id, text, then CSS locator candidates', () => {
    const candidates = locatorCandidates({
      kind: 'button',
      tagName: 'button',
      role: 'button',
      accessibleName: 'Save draft',
      labelText: 'Title',
      placeholder: 'Search articles',
      dataTestId: 'save-draft',
      visibleText: 'Save draft',
      selectorHint: '#save'
    })

    expect(candidates.map((candidate) => candidate.strategy)).toEqual(['role', 'label', 'placeholder', 'testid', 'text', 'css'])
  })

  it('builds a runtime app model with workflows and safe/unsafe action plan', async () => {
    await page.setContent(crudHtml())
    const snapshot = await captureRuntimeDomSnapshot(page)

    const model = buildRuntimeAppModel({ snapshot })

    expect(model.inferred_app_type).toBe('crud_app')
    expect(model.workflows.map((workflow) => workflow.name)).toEqual(expect.arrayContaining(['Navigation smoke test', 'Forms discoverability', 'Table/list scan', 'Tab switching']))
    expect(model.actions.some((action) => action.target === 'Delete' && !action.safe)).toBe(true)
    expect(model.actions.some((action) => action.target === 'Add Article' && action.safe)).toBe(true)
  })

  it('lets the mock LLM infer runtime workflows from the compact context', async () => {
    await page.setContent(loginHtml())
    const snapshot = await captureRuntimeDomSnapshot(page)
    const provider = new MockLlmProvider()

    const intent = await provider.inferRuntimeIntent!(buildRuntimeIntentContext({ snapshot }))

    expect(intent.workflows.length).toBeGreaterThan(0)
    expect(intent.safe_next_actions.every((action) => action.safe)).toBe(true)
  })

  it('repairs a locator by trying alternate candidates from the current DOM', async () => {
    await page.setContent('<main><button data-testid="open-settings">Settings</button></main>')
    const snapshot = await captureRuntimeDomSnapshot(page)
    const candidates = deterministicLocatorRepair({ intendedTarget: 'Settings', snapshot })

    const result = await resolveLocatorCandidate(page, candidates)

    expect(result.status).toBe('resolved')
    expect(result.locator?.strategy).toBe('role')
  })
})

function label(control: { accessibleName?: string; visibleText?: string; labelText?: string; placeholder?: string; dataTestId?: string }) {
  return control.accessibleName ?? control.visibleText ?? control.labelText ?? control.placeholder ?? control.dataTestId
}

function crudHtml(): string {
  return `
    <main>
      <nav aria-label="Primary"><a href="/articles">Articles</a><a href="/settings">Settings</a></nav>
      <h1>Articles</h1>
      <button>Add Article</button>
      <button>Delete</button>
      <form aria-label="Article form">
        <label for="title">Title</label><input id="title" placeholder="Article title" />
        <label for="body">Body</label><textarea id="body"></textarea>
      </form>
      <div role="tablist" aria-label="Article filters">
        <button role="tab">Published</button>
        <button role="tab">Drafts</button>
      </div>
      <table><thead><tr><th>Title</th><th>Author</th></tr></thead><tbody><tr><td>Hello</td><td>T</td></tr></tbody></table>
    </main>
  `
}

function loginHtml(): string {
  return `
    <main>
      <h1>Sign in</h1>
      <form>
        <label>Email <input name="email" type="email" /></label>
        <label>Password <input name="password" type="password" /></label>
        <button>Sign in</button>
      </form>
    </main>
  `
}
