import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { captureRuntimeDomSnapshot } from '../src/runtime/domSnapshot.js'
import { analyzeRuntimeDomQuality } from '../src/heuristics/runtimeDomQuality.js'

let browser: Browser
let page: Page

beforeAll(async () => {
  browser = await chromium.launch()
  page = await browser.newPage()
})

afterAll(async () => {
  await browser.close()
})

describe('runtime DOM quality heuristics', () => {
  it('reports duplicate Reopen button accessible names with scoped locator guidance', async () => {
    await page.setContent(planRunsHtml())
    const snapshot = await captureRuntimeDomSnapshot(page)

    const issues = analyzeRuntimeDomQuality(snapshot)
    const issue = issues.find((item) => item.title === 'Repeated Reopen buttons have ambiguous accessible names')

    expect(issue?.type).toBe('locator_quality_issue')
    expect(issue?.severity).toBe('medium')
    expect(issue?.evidence.join('\n')).toContain('getByTestId("plan-run-item").nth(0).getByRole("button", { name: "Reopen" })')
    expect(issue?.suggestedFixPrompt).toContain('unique accessible name')
  })

  it('reports repeated adjacent status/chip text inside plan-run cards', async () => {
    await page.setContent(planRunsHtml())
    const snapshot = await captureRuntimeDomSnapshot(page)

    const issues = analyzeRuntimeDomQuality(snapshot)
    const issue = issues.find((item) => item.title === 'Plan run card repeats status/chip text')

    expect(issue?.type).toBe('scanability_issue')
    expect(issue?.evidence.join('\n')).toContain('completed completed')
    expect(issue?.evidence.join('\n')).toContain('Semantic Off Semantic Off')
  })

  it('warns when visible plan-run status/chip text has a 1px bounding box', async () => {
    await page.setContent(planRunsHtml({ tinyChips: true }))
    const snapshot = await captureRuntimeDomSnapshot(page)

    const issues = analyzeRuntimeDomQuality(snapshot)
    const issue = issues.find((item) => item.title === 'Visible status/chip text has suspicious 1px bounding box')

    expect(issue?.type).toBe('visibility_issue')
    expect(issue?.severity).toBe('low')
    expect(issue?.evidence.join('\n')).toContain('box=1x1')
  })

  it('does not run plan-run checks when no plan-run items are visible', async () => {
    await page.setContent(`
      <main>
        <h1>Plan Runs</h1>
        <p>No plan runs yet</p>
        <button>Reopen</button>
        <span data-testid="plan-run-status" style="display:inline-block;width:1px;height:1px;overflow:hidden;">completed</span>
      </main>
    `)
    const snapshot = await captureRuntimeDomSnapshot(page)

    const issues = analyzeRuntimeDomQuality(snapshot)

    expect(issues).toHaveLength(0)
  })
})

function planRunsHtml(options: { tinyChips?: boolean } = {}): string {
  const chipStyle = options.tinyChips ? 'style="display:inline-block;width:1px;height:1px;overflow:hidden;"' : ''
  return `
    <main>
      <h1>Plan Runs</h1>
      <article data-testid="plan-run-item">
        <h2 data-testid="plan-run-prompt">Add OwnersPage (no actions yet)</h2>
        <span data-testid="plan-run-target">petclinic-react</span>
        <time data-testid="plan-run-created-at">May 7, 1:45 PM</time>
        <span data-testid="plan-run-status" ${chipStyle}>completed</span>
        <span data-testid="plan-run-status">completed</span>
        <span data-testid="plan-run-semantic-chip" ${chipStyle}>Semantic Off</span>
        <span data-testid="plan-run-semantic-chip">Semantic Off</span>
        <button data-testid="reopen-plan-run-button">Reopen</button>
      </article>
      <article data-testid="plan-run-item">
        <h2 data-testid="plan-run-prompt">Make owner search case insensitive</h2>
        <span data-testid="plan-run-target">petclinic-react</span>
        <time data-testid="plan-run-created-at">May 7, 1:50 PM</time>
        <span data-testid="plan-run-status">completed</span>
        <span data-testid="plan-run-status">completed</span>
        <span data-testid="plan-run-semantic-chip">Semantic Off</span>
        <span data-testid="plan-run-semantic-chip">Semantic Off</span>
        <button data-testid="reopen-plan-run-button">Reopen</button>
      </article>
    </main>
  `
}
