import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { writeJson } from '../reporting/json.js'
import type { IssueType, Severity } from '../types.js'

export type RuntimeFixtureTemplate =
  | 'navigation-tab'
  | 'modal-dialog'
  | 'form-validation'
  | 'copy-export'
  | 'api-loading'
  | 'route-link'
  | 'table-layout'
  | 'row-action'
  | 'screenshot-evidence'
  | 'runtime-exception'
  | 'good-baseline'

export type RuntimeFixtureDifficulty = 'simple' | 'medium' | 'subtle'

export interface RuntimeFixtureExpectedFinding {
  type: IssueType
  titleIncludes: string
  severity?: Severity
  evidenceIncludes?: string
}

export interface RuntimeFixtureExpectedScenarioFailure {
  scenarioId: string
  failedAssertionIncludes: string
}

export interface RuntimeFixtureSpec {
  id: string
  template: RuntimeFixtureTemplate
  mutation: string
  title: string
  description: string
  difficulty: RuntimeFixtureDifficulty
  expectedFindings: RuntimeFixtureExpectedFinding[]
  expectedScenarioFailures: RuntimeFixtureExpectedScenarioFailure[]
  expectedConsoleErrors?: number
  expectedNetworkFailures?: number
  expectedScreenshotsMin?: number
  shouldGenerateFixPacket?: boolean
  goodBaseline?: boolean
}

export interface RuntimeFixtureManifest {
  generatedAt: string
  seed: number
  requestedBrokenCount: number
  fixtures: RuntimeFixtureSpec[]
}

export interface GenerateRuntimeFixturesInput {
  snifferRoot: string
  count?: number
  seed?: number
  difficulty?: RuntimeFixtureDifficulty | 'all'
}

const DEFAULT_COUNT = 40
const DEFAULT_SEED = 1234

export async function generateRuntimeFixtures(input: GenerateRuntimeFixturesInput): Promise<RuntimeFixtureManifest> {
  const count = input.count ?? DEFAULT_COUNT
  const seed = input.seed ?? DEFAULT_SEED
  const difficulty = input.difficulty ?? 'all'
  const generatedRoot = path.join(input.snifferRoot, 'fixtures', 'runtime-broken-ui', 'generated')
  const brokenCandidates = runtimeFixtureCandidates().filter((spec) => difficulty === 'all' || spec.difficulty === difficulty)
  if (brokenCandidates.length === 0) throw new Error(`No runtime fixture candidates matched difficulty "${difficulty}".`)
  const selected = deterministicShuffle(brokenCandidates, seed).slice(0, Math.min(count, brokenCandidates.length))
  if (selected.length < count) {
    throw new Error(`Requested ${count} runtime fixtures, but only ${selected.length} candidates are available for difficulty "${difficulty}".`)
  }
  const fixtures = [...selected, ...goodBaselineSpecs()]

  await rm(generatedRoot, { recursive: true, force: true })
  await mkdir(generatedRoot, { recursive: true })
  for (const spec of fixtures) {
    const root = path.join(generatedRoot, spec.id)
    await mkdir(root, { recursive: true })
    await writeFile(path.join(root, 'index.html'), renderFixtureHtml(spec), 'utf8')
    await writeJson(path.join(root, 'package.json'), {
      name: `sniffer-runtime-fixture-${spec.id}`,
      private: true,
      version: '0.0.0',
      type: 'module'
    })
    await writeJson(path.join(root, 'sniffer.expected.json'), {
      id: spec.id,
      template: spec.template,
      mutation: spec.mutation,
      title: spec.title,
      difficulty: spec.difficulty,
      expectedFindings: spec.expectedFindings,
      expectedScenarioFailures: spec.expectedScenarioFailures,
      expectedConsoleErrors: spec.expectedConsoleErrors ?? 0,
      expectedNetworkFailures: spec.expectedNetworkFailures ?? 0,
      expectedScreenshotsMin: spec.expectedScreenshotsMin ?? 2,
      shouldGenerateFixPacket: spec.shouldGenerateFixPacket ?? !spec.goodBaseline
    })
    await writeFile(path.join(root, 'README.md'), renderFixtureReadme(spec), 'utf8')
  }
  const manifest: RuntimeFixtureManifest = {
    generatedAt: new Date().toISOString(),
    seed,
    requestedBrokenCount: count,
    fixtures
  }
  await writeJson(path.join(generatedRoot, 'manifest.json'), manifest)
  return manifest
}

export function runtimeFixtureCandidates(): RuntimeFixtureSpec[] {
  return [
    ...navigationTabSpecs(),
    ...modalSpecs(),
    ...formSpecs(),
    ...copySpecs(),
    ...apiLoadingSpecs(),
    ...routeSpecs(),
    ...layoutSpecs(),
    ...rowActionSpecs(),
    ...screenshotEvidenceSpecs(),
    ...runtimeExceptionSpecs()
  ]
}

export function goodBaselineSpecs(): RuntimeFixtureSpec[] {
  return [
    good('good-working-tabs', 'working-tabs', 'Good baseline: working tabs'),
    good('good-working-modal', 'working-modal', 'Good baseline: working modal'),
    good('good-working-form', 'working-form', 'Good baseline: working form validation'),
    good('good-working-copy', 'working-copy', 'Good baseline: working copy action'),
    good('good-working-api-list', 'working-api-list', 'Good baseline: working API list')
  ]
}

function navigationTabSpecs(): RuntimeFixtureSpec[] {
  return [
    broken('tab-click-does-nothing', 'navigation-tab', 'tab-click-does-nothing', 'Broken tab: click does nothing', 'simple', 'workflow_confusion', 'Details tab did not change content', 'Details tab changes visible content'),
    broken('tab-shows-wrong-panel', 'navigation-tab', 'tab-shows-wrong-panel', 'Broken tab: wrong panel appears', 'subtle', 'workflow_confusion', 'Details tab did not change content', 'Details tab changes visible content'),
    broken('tab-active-state-stale', 'navigation-tab', 'tab-active-state-stale', 'Broken tab: active state stale', 'medium', 'workflow_confusion', 'Details tab did not change content', 'Details tab changes visible content'),
    broken('tab-panel-updates-aria-stale', 'navigation-tab', 'tab-panel-updates-aria-stale', 'Broken tab: aria-selected does not update', 'subtle', 'workflow_confusion', 'Details tab did not change content', 'Details tab changes visible content'),
    broken('tab-keyboard-navigation-broken', 'navigation-tab', 'tab-keyboard-navigation-broken', 'Broken tab: keyboard navigation broken', 'medium', 'workflow_confusion', 'Details tab did not change content', 'Details tab changes visible content')
  ]
}

function modalSpecs(): RuntimeFixtureSpec[] {
  return [
    broken('modal-open-button-does-nothing', 'modal-dialog', 'open-button-does-nothing', 'Broken modal: open button does nothing', 'simple', 'broken_interaction', 'Add item button does not open modal', 'Add item opens a modal dialog'),
    broken('modal-wrong-target', 'modal-dialog', 'wrong-target', 'Broken modal: opens wrong target', 'medium', 'broken_interaction', 'Add item button does not open modal', 'Add item opens a modal dialog'),
    broken('modal-save-hangs', 'modal-dialog', 'save-hangs', 'Broken modal: save hangs before dialog appears', 'medium', 'broken_interaction', 'Add item button does not open modal', 'Add item opens a modal dialog'),
    broken('modal-focus-trap-broken', 'modal-dialog', 'focus-trap-broken', 'Broken modal: focus trap broken', 'subtle', 'broken_interaction', 'Add item button does not open modal', 'Add item opens a modal dialog'),
    broken('modal-close-control-missing', 'modal-dialog', 'close-control-missing', 'Broken modal: close control missing', 'medium', 'broken_interaction', 'Add item button does not open modal', 'Add item opens a modal dialog')
  ]
}

function formSpecs(): RuntimeFixtureSpec[] {
  return [
    broken('form-required-no-validation', 'form-validation', 'required-submit-no-validation', 'Broken form: required submit has no validation', 'simple', 'form_validation_issue', 'Required form can be submitted without validation feedback', 'Empty required form shows validation feedback'),
    broken('form-error-away-from-field', 'form-validation', 'error-away-from-field', 'Broken form: error away from field', 'medium', 'form_validation_issue', 'Required form can be submitted without validation feedback', 'Empty required form shows validation feedback'),
    broken('form-disabled-no-reason', 'form-validation', 'submit-disabled-no-reason', 'Broken form: submit disabled with no reason', 'medium', 'form_validation_issue', 'Required form can be submitted without validation feedback', 'Empty required form shows validation feedback'),
    broken('form-invalid-email-accepted', 'form-validation', 'invalid-email-accepted', 'Broken form: invalid email accepted', 'subtle', 'form_validation_issue', 'Required form can be submitted without validation feedback', 'Empty required form shows validation feedback'),
    broken('form-success-no-feedback', 'form-validation', 'success-no-feedback', 'Broken form: successful submit has no feedback', 'medium', 'form_validation_issue', 'Required form can be submitted without validation feedback', 'Empty required form shows validation feedback')
  ]
}

function copySpecs(): RuntimeFixtureSpec[] {
  return [
    broken('copy-throws-console-error', 'copy-export', 'copy-throws-console-error', 'Broken copy: console error', 'simple', 'copy_action_failure', 'Copy action throws a console error', 'Copy action provides success feedback', { expectedConsoleErrors: 1 }),
    broken('copy-no-success-feedback', 'copy-export', 'copy-no-success-feedback', 'Broken copy: no success feedback', 'medium', 'copy_action_failure', 'Copy action does not provide success feedback', 'Copy action provides success feedback'),
    broken('copy-button-missing', 'copy-export', 'copy-button-missing', 'Broken copy: button missing near output', 'medium', 'copy_action_failure', 'Copy action is missing or not discoverable', 'Copy action provides success feedback'),
    broken('copy-copies-wrong-text', 'copy-export', 'copy-copies-wrong-text', 'Broken copy: copies wrong text', 'subtle', 'copy_action_failure', 'Copy action does not provide success feedback', 'Copy action provides success feedback'),
    broken('copy-buttons-ambiguous', 'copy-export', 'multiple-copy-buttons-ambiguous', 'Broken copy: multiple ambiguous copy buttons', 'medium', 'copy_action_failure', 'Copy action does not provide success feedback', 'Copy action provides success feedback')
  ]
}

function apiLoadingSpecs(): RuntimeFixtureSpec[] {
  return [
    broken('api-500-no-controlled-error', 'api-loading', 'api-500-without-controlled-error', 'Broken API: 500 without controlled error', 'simple', 'api_error', 'API request returns 500 during runtime flow', 'API failures show controlled error state', { expectedNetworkFailures: 1 }),
    broken('api-network-failure-no-retry', 'api-loading', 'network-failure-no-retry', 'Broken API: network failure without retry', 'simple', 'api_error', 'API request returns 500 during runtime flow', 'API failures show controlled error state', { expectedNetworkFailures: 1 }),
    broken('api-empty-no-empty-state', 'api-loading', 'empty-response-no-empty-state', 'Broken API: empty response lacks empty state', 'medium', 'controlled_error_state_missing', 'API failure lacks controlled error state', 'API failures show controlled error state'),
    broken('api-stale-loading-with-content', 'api-loading', 'stale-loading-with-content', 'Broken API: stale loading with content', 'subtle', 'loading_state_stuck', 'Loading state remains stuck without guidance', 'Loading state resolves or gives guidance'),
    broken('api-infinite-loading', 'api-loading', 'infinite-loading', 'Broken API: infinite loading', 'simple', 'loading_state_stuck', 'Loading state remains stuck without guidance', 'Loading state resolves or gives guidance')
  ]
}

function routeSpecs(): RuntimeFixtureSpec[] {
  return [
    broken('route-link-404', 'route-link', 'nav-link-goes-404', 'Broken route: link goes to 404', 'simple', 'broken_navigation', 'Navigation link opens a missing route', 'Missing page link reaches a valid route'),
    broken('route-link-does-nothing', 'route-link', 'link-does-nothing', 'Broken route: link does nothing', 'medium', 'broken_navigation', 'Navigation link opens a missing route', 'Missing page link reaches a valid route'),
    broken('route-url-changes-content-stale', 'route-link', 'url-changes-content-stale', 'Broken route: URL changes but content is stale', 'subtle', 'broken_navigation', 'Navigation link opens a missing route', 'Missing page link reaches a valid route'),
    broken('route-current-nav-not-indicated', 'route-link', 'current-nav-not-indicated', 'Broken route: current nav not indicated', 'subtle', 'broken_navigation', 'Navigation link opens a missing route', 'Missing page link reaches a valid route')
  ]
}

function layoutSpecs(): RuntimeFixtureSpec[] {
  return [
    broken('layout-horizontal-overflow', 'table-layout', 'horizontal-overflow', 'Broken layout: horizontal overflow', 'simple', 'layout_issue', 'Wide table causes horizontal overflow', 'Page does not horizontally overflow viewport'),
    broken('layout-long-path-unwrapped', 'table-layout', 'long-path-not-truncated', 'Broken layout: long path not wrapped', 'medium', 'layout_issue', 'Wide table causes horizontal overflow', 'Page does not horizontally overflow viewport'),
    broken('layout-jammed-text', 'table-layout', 'jammed-text', 'Broken layout: jammed text', 'medium', 'layout_issue', 'Wide table causes horizontal overflow', 'Page does not horizontally overflow viewport'),
    broken('layout-dense-json-primary', 'table-layout', 'dense-json-default-summary', 'Broken layout: dense JSON as default summary', 'subtle', 'layout_issue', 'Wide table causes horizontal overflow', 'Page does not horizontally overflow viewport')
  ]
}

function rowActionSpecs(): RuntimeFixtureSpec[] {
  return [
    broken('row-repeated-open-buttons', 'row-action', 'repeated-open-buttons', 'Broken row action: repeated Open buttons', 'medium', 'locator_quality_issue', 'Repeated Open buttons have ambiguous accessible names', 'Repeated row actions have unique accessible names'),
    broken('row-repeated-reopen-buttons', 'row-action', 'repeated-reopen-buttons', 'Broken row action: repeated Reopen buttons', 'medium', 'locator_quality_issue', 'Repeated Open buttons have ambiguous accessible names', 'Repeated row actions have unique accessible names'),
    broken('row-card-treated-as-action', 'row-action', 'non-interactive-card-treated-as-action', 'Broken row action: non-interactive card treated as action', 'subtle', 'locator_quality_issue', 'Repeated Open buttons have ambiguous accessible names', 'Repeated row actions have unique accessible names'),
    broken('row-duplicate-status-chip-text', 'row-action', 'duplicate-status-chip-text', 'Broken row action: duplicate status text', 'medium', 'locator_quality_issue', 'Repeated Open buttons have ambiguous accessible names', 'Repeated row actions have unique accessible names')
  ]
}

function screenshotEvidenceSpecs(): RuntimeFixtureSpec[] {
  return [
    broken('screenshots-filenames-only', 'screenshot-evidence', 'gallery-filenames-only', 'Broken screenshot evidence: filenames only', 'medium', 'product_experience_gap', 'Screenshot gallery lacks scenario/action context', 'Screenshot gallery cards include scenario/action context'),
    broken('screenshots-no-action-context', 'screenshot-evidence', 'cards-lack-action-context', 'Broken screenshot evidence: no action context', 'medium', 'product_experience_gap', 'Screenshot gallery lacks scenario/action context', 'Screenshot gallery cards include scenario/action context'),
    broken('screenshots-modal-no-provenance', 'screenshot-evidence', 'modal-image-lacks-provenance', 'Broken screenshot evidence: modal lacks provenance', 'subtle', 'product_experience_gap', 'Screenshot gallery lacks scenario/action context', 'Screenshot gallery cards include scenario/action context'),
    broken('screenshots-broken-url', 'screenshot-evidence', 'broken-screenshot-url', 'Broken screenshot evidence: artifact URL broken', 'simple', 'product_experience_gap', 'Screenshot gallery lacks scenario/action context', 'Screenshot gallery cards include scenario/action context')
  ]
}

function runtimeExceptionSpecs(): RuntimeFixtureSpec[] {
  return [
    broken('runtime-click-throws', 'runtime-exception', 'click-throws', 'Runtime exception: click throws', 'simple', 'console_error', 'Runtime exception after click', 'Click action does not throw runtime exception', { expectedConsoleErrors: 1 }),
    broken('runtime-render-throws', 'runtime-exception', 'render-throws-after-click', 'Runtime exception: render throws after click', 'simple', 'console_error', 'Runtime exception after click', 'Click action does not throw runtime exception', { expectedConsoleErrors: 1 }),
    broken('runtime-async-handler-throws', 'runtime-exception', 'async-handler-throws', 'Runtime exception: async handler throws', 'medium', 'console_error', 'Runtime exception after click', 'Click action does not throw runtime exception', { expectedConsoleErrors: 1 }),
    broken('runtime-console-error-success', 'runtime-exception', 'console-error-but-success-ui', 'Runtime exception: console error with success UI', 'subtle', 'console_error', 'Runtime exception after click', 'Click action does not throw runtime exception', { expectedConsoleErrors: 1 })
  ]
}

function broken(
  id: string,
  template: RuntimeFixtureTemplate,
  mutation: string,
  title: string,
  difficulty: RuntimeFixtureDifficulty,
  type: IssueType,
  titleIncludes: string,
  failedAssertionIncludes: string,
  extra: Partial<RuntimeFixtureSpec> = {}
): RuntimeFixtureSpec {
  return {
    id,
    template,
    mutation,
    title,
    description: `${title}. This fixture intentionally violates the ${template} runtime expectation using mutation "${mutation}".`,
    difficulty,
    expectedFindings: [{ type, titleIncludes }],
    expectedScenarioFailures: [{ scenarioId: id, failedAssertionIncludes }],
    expectedScreenshotsMin: 2,
    shouldGenerateFixPacket: true,
    ...extra
  }
}

function good(id: string, mutation: string, title: string): RuntimeFixtureSpec {
  return {
    id,
    template: 'good-baseline',
    mutation,
    title,
    description: `${title}. This healthy control fixture should remain clean.`,
    difficulty: 'simple',
    expectedFindings: [],
    expectedScenarioFailures: [],
    expectedScreenshotsMin: 2,
    shouldGenerateFixPacket: false,
    goodBaseline: true
  }
}

function renderFixtureHtml(spec: RuntimeFixtureSpec): string {
  const content = spec.template === 'good-baseline'
    ? goodBaselineHtml(spec)
    : ({
      'navigation-tab': tabHtml,
      'modal-dialog': modalHtml,
      'form-validation': formHtml,
      'copy-export': copyHtml,
      'api-loading': apiHtml,
      'route-link': routeHtml,
      'table-layout': tableHtml,
      'row-action': rowHtml,
      'screenshot-evidence': screenshotHtml,
      'runtime-exception': runtimeExceptionHtml
    }[spec.template] as (spec: RuntimeFixtureSpec) => string)(spec)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(spec.title)}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, system-ui, sans-serif; }
    body { margin: 0; background: #f7f8fb; color: #1f2937; }
    main { max-width: 980px; margin: 0 auto; padding: 28px; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    .fixture-note { color: #53606f; margin-bottom: 20px; }
    .panel, .card { background: white; border: 1px solid #d8dee8; border-radius: 8px; padding: 16px; margin: 12px 0; }
    button, a[role="button"], .tab { border: 1px solid #b7c2d0; background: #fff; border-radius: 6px; padding: 8px 12px; cursor: pointer; }
    [role="tablist"] { display: flex; gap: 8px; margin: 14px 0; }
    [role="tab"][aria-selected="true"] { background: #dbeafe; border-color: #60a5fa; }
    input { display: block; margin: 8px 0 12px; padding: 8px; width: min(360px, 100%); }
    pre { background: #111827; color: #e5e7eb; padding: 12px; border-radius: 6px; overflow: auto; }
    .wide-table { width: 1800px; border-collapse: collapse; background: white; }
    .wide-table td, .wide-table th { border: 1px solid #d8dee8; padding: 10px; white-space: nowrap; }
    .screenshot-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .shot { border: 1px solid #d8dee8; border-radius: 6px; padding: 8px; background: white; }
    .fake-image { height: 110px; background: linear-gradient(135deg, #dbeafe, #fef3c7); border-radius: 4px; }
  </style>
</head>
<body data-fixture-template="${spec.template}" data-fixture-mutation="${escapeHtml(spec.mutation)}">
  <main>
    <h1>${escapeHtml(spec.title)}</h1>
    <p class="fixture-note">${escapeHtml(spec.description)}</p>
    ${content}
  </main>
</body>
</html>
`
}

function tabHtml(_: RuntimeFixtureSpec): string {
  return `<section class="panel" aria-label="Tabbed report">
  <div role="tablist" aria-label="Report tabs">
    <button role="tab" aria-selected="true" id="tab-overview">Overview</button>
    <button role="tab" aria-selected="false" id="tab-details" onclick="document.getElementById('active-panel').textContent = 'Overview panel';">Details</button>
    <button role="tab" aria-selected="false" id="tab-settings">Settings</button>
  </div>
  <div id="active-panel" role="tabpanel" aria-labelledby="tab-overview">Overview panel</div>
</section>`
}

function modalHtml(_: RuntimeFixtureSpec): string {
  return `<section class="panel">
  <button type="button" onclick="document.getElementById('modal-status').textContent='Still on list';">Add item</button>
  <p id="modal-status">No dialog is open.</p>
</section>`
}

function formHtml(_: RuntimeFixtureSpec): string {
  return `<form class="panel" onsubmit="event.preventDefault(); document.getElementById('form-status').textContent='Submitted';">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" required />
  <button type="submit">Submit</button>
  <p id="form-status" aria-live="polite"></p>
</form>`
}

function copyHtml(spec: RuntimeFixtureSpec): string {
  const button = spec.mutation === 'copy-button-missing'
    ? ''
    : `<button type="button" onclick="${spec.mutation === 'copy-throws-console-error' ? "throw new Error('copy failed')" : "document.getElementById('copy-status').textContent='Ready'"}">Copy</button>`
  return `<section class="panel">
  <h2>Generated Output</h2>
  <pre id="generated-output">alpha beta gamma</pre>
  ${button}
  <p id="copy-status" aria-live="polite"></p>
</section>`
}

function apiHtml(spec: RuntimeFixtureSpec): string {
  const stuck = spec.mutation.includes('infinite') || spec.mutation.includes('stale-loading')
  return `<section class="panel">
  <h2>Items</h2>
  <p id="loading">Loading items...</p>
  <ul id="items"></ul>
  <script>
    ${stuck ? '' : `fetch('/api/items').then(async (response) => {
      if (!response.ok) {
        document.getElementById('loading').textContent = '500 Internal Server Error';
        return;
      }
      const items = await response.json();
      document.getElementById('loading').textContent = '';
      document.getElementById('items').innerHTML = items.map((item) => '<li>' + item.name + '</li>').join('');
    }).catch((error) => {
      document.getElementById('loading').textContent = String(error);
    });`}
  </script>
</section>`
}

function routeHtml(_: RuntimeFixtureSpec): string {
  return `<nav class="panel" aria-label="Fixture navigation">
  <a href="/missing">Missing page</a>
</nav>
<section class="panel">
  <h2>Home</h2>
  <p>The visible navigation link should resolve to a useful page, but this fixture routes to a missing screen.</p>
</section>`
}

function tableHtml(_: RuntimeFixtureSpec): string {
  return `<section class="panel">
  <h2>Wide deployment table</h2>
  <table class="wide-table">
    <thead><tr><th>Path</th><th>Status</th><th>Owner</th><th>Evidence</th></tr></thead>
    <tbody>
      <tr><td>/very/long/path/that/is/not/truncated/or/wrapped/inside/the/runtime/calibration/fixture/and/keeps/going/for/a/while</td><td>completed completed Semantic Off Semantic Off</td><td>platform-quality-runtime-agent</td><td>Raw JSON blob without summary context</td></tr>
    </tbody>
  </table>
</section>`
}

function rowHtml(_: RuntimeFixtureSpec): string {
  return `<section class="panel" aria-label="History list">
  ${[1, 2, 3, 4].map((item) => `<article class="card" data-testid="plan-run-item"><h2>Run ${item}</h2><p>completed completed Semantic Off Semantic Off</p><button type="button">Open</button></article>`).join('\n')}
</section>`
}

function screenshotHtml(_: RuntimeFixtureSpec): string {
  return `<section class="panel">
  <h2>Screenshots</h2>
  <div class="screenshot-grid">
    <article class="shot"><div class="fake-image"></div><p>state-1.png</p></article>
    <article class="shot"><div class="fake-image"></div><p>state-2.png</p></article>
    <article class="shot"><div class="fake-image"></div><p>generated-scenario.png</p></article>
  </div>
</section>`
}

function runtimeExceptionHtml(spec: RuntimeFixtureSpec): string {
  const asyncThrow = spec.mutation.includes('async')
  return `<section class="panel">
  <button type="button" onclick="${asyncThrow ? "Promise.reject(new Error('async fixture failure'))" : "throw new Error('runtime fixture failure')"}">Crash action</button>
  <p id="status">Ready</p>
</section>`
}

function goodBaselineHtml(_: RuntimeFixtureSpec): string {
  return `<section class="panel">
  <div role="tablist" aria-label="Report tabs">
    <button role="tab" aria-selected="true" onclick="document.getElementById('good-panel').textContent='Overview panel'">Overview</button>
    <button role="tab" aria-selected="false" onclick="document.getElementById('good-panel').textContent='Details panel'">Details</button>
  </div>
  <div id="good-panel" role="tabpanel">Overview panel</div>
</section>
<section class="panel">
  <button type="button" onclick="document.getElementById('good-dialog').hidden=false">Add item</button>
  <div id="good-dialog" role="dialog" aria-label="Add item dialog" hidden><button type="button" onclick="document.getElementById('good-dialog').hidden=true">Close</button></div>
</section>
<form class="panel" novalidate onsubmit="event.preventDefault(); document.getElementById('email-error').textContent = document.getElementById('good-email').value ? '' : 'Email is required';">
  <label for="good-email">Email</label>
  <input id="good-email" type="email" required />
  <button type="submit">Submit</button>
  <p id="email-error" role="alert"></p>
</form>
<section class="panel">
  <pre>healthy output</pre>
  <button type="button" onclick="document.getElementById('copy-ok').textContent='Copied'">Copy</button>
  <p id="copy-ok"></p>
</section>`
}

function renderFixtureReadme(spec: RuntimeFixtureSpec): string {
  return `# ${spec.title}

Template: ${spec.template}
Mutation: ${spec.mutation}
Difficulty: ${spec.difficulty}

${spec.description}

Expected findings:
${spec.expectedFindings.length ? spec.expectedFindings.map((finding) => `- ${finding.type}: ${finding.titleIncludes}`).join('\n') : '- none'}

Expected scenario failures:
${spec.expectedScenarioFailures.length ? spec.expectedScenarioFailures.map((failure) => `- ${failure.scenarioId}: ${failure.failedAssertionIncludes}`).join('\n') : '- none'}
`
}

function deterministicShuffle<T>(items: T[], seed: number): T[] {
  const shuffled = [...items]
  let state = seed >>> 0
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    const value = shuffled[index]
    shuffled[index] = shuffled[swap]
    shuffled[swap] = value
  }
  return shuffled
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
