import { describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { discoverSource } from '../src/discovery/sourceDiscovery.js'
import { renderMarkdown } from '../src/reporting/reportWriter.js'
import type { SnifferReport, SourceGraph } from '../src/types.js'

describe('discoverSource', () => {
  it('detects framework, routes, components, and forms', async () => {
    const repo = await tempRepo()
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({
      name: 'demo',
      scripts: { dev: 'vite' },
      dependencies: { react: '^18.0.0', vite: '^5.0.0' }
    }))
    await mkdir(path.join(repo, 'src', 'components'), { recursive: true })
    await mkdir(path.join(repo, 'pages'), { recursive: true })
    await writeFile(path.join(repo, 'pages', 'settings.tsx'), 'export default function Settings(){ return <form><input name="email" /></form> }')
    await writeFile(path.join(repo, 'src', 'components', 'Nav.tsx'), '<a href="/settings">Settings</a>')

    const graph = await discoverSource(repo)

    expect(graph.framework).toBe('react')
    expect(graph.buildTool).toBe('vite')
    expect(graph.routes.map((route) => route.path)).toContain('/settings')
    expect(graph.components.map((component) => component.name)).toContain('Nav')
    expect(graph.forms[0].inputs).toContain('email')
  })

  it('excludes test source workflows by default but can include them explicitly', async () => {
    const repo = await tempRepo()
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({
      name: 'test-source-filter',
      scripts: { dev: 'vite' },
      dependencies: { react: '^18.0.0', vite: '^5.0.0' }
    }))
    await mkdir(path.join(repo, 'src'), { recursive: true })
    await mkdir(path.join(repo, 'tests'), { recursive: true })
    await writeFile(path.join(repo, 'src', 'App.tsx'), 'export default function App(){ return <button>Home</button> }')
    await writeFile(path.join(repo, 'tests', 'App.test.tsx'), 'export function Fixture(){ return <button>Generate Plan Bundle</button> }')

    const defaultGraph = await discoverSource(repo)
    const testGraph = await discoverSource(repo, { includeTestSources: true })

    expect(defaultGraph.sourceWorkflows.map((workflow) => workflow.name)).not.toContain('Generate plan bundle')
    expect(defaultGraph.components.map((component) => component.file)).not.toContain('tests/App.test.tsx')
    expect(testGraph.sourceWorkflows.map((workflow) => workflow.name)).toContain('Generate plan bundle')
  })

  it('scopes monorepo source discovery to the primary UI root by default', async () => {
    const repo = await monorepoRepo()

    const graph = await discoverSource(repo)

    expect(graph.rootFramework).toBe('unknown')
    expect(graph.framework).toBe('react')
    expect(graph.uiFramework).toBe('react')
    expect(graph.buildTool).toBe('vite')
    expect(graph.packageName).toBe('sniffer-ui')
    expect(graph.sourceScopeSummary?.primaryUiRoots[0]?.path).toBe('ui')
    expect(graph.sourceScopeSummary?.supportRoots.map((root) => root.path)).toEqual(expect.arrayContaining(['server', 'src']))
    expect(graph.sourceScopeSummary?.scannedFileCountsByScope.primary_ui_source).toBeGreaterThan(0)
    expect(graph.sourceScopeSummary?.scannedFileCountsByScope.fixture).toBe(0)

    expect(graph.uiSurfaces.map((surface) => surface.display_name)).toContain('Sniffer Dashboard')
    expect(graph.uiSurfaces.map((surface) => surface.display_name)).not.toContain('Fixture Marketing')
    expect(graph.routes.map((route) => route.path)).not.toContain('/fixture')
    expect(graph.uiIntentGraph?.surfaces.every((node) => node.sourceScope === 'primary_ui_source')).toBe(true)
    expect(graph.uiIntentGraph?.actions.some((node) => node.filePath?.startsWith('src/cli'))).toBe(false)

    expect(graph.apiCalls.some((call) => call.endpoint === '/api/reports/latest' && call.sourceFile === 'server/app.py' && call.sourceScope === 'api_server_support')).toBe(true)
    expect(graph.apiCalls.some((call) => call.sourceFile.startsWith('server/') && call.sourceScope === 'primary_ui_source')).toBe(false)
    expect(graph.sourceInventory?.facts.some((fact) => fact.filePath === 'ui/src/App.tsx' && fact.sourceScope === 'primary_ui_source')).toBe(true)
    expect(graph.sourceInventory?.facts.some((fact) => fact.filePath === 'fixtures/static-html/index.html')).toBe(false)
    expect(graph.components.map((component) => component.file)).not.toEqual(expect.arrayContaining([
      'ui/src/testSetup.ts',
      'ui/vite.config.ts',
      'ui/vitest.config.ts'
    ]))

    const markdown = renderMarkdown(report(graph))
    expect(markdown).toContain('## Source Scope Summary')
    expect(markdown).toContain('Primary UI roots: ui')
  })

  it('keeps config and test support files out of UI components', async () => {
    const repo = await monorepoRepo()

    const graph = await discoverSource(repo, { includeTestSources: true })

    expect(graph.sourceInventory?.files.find((file) => file.path === 'ui/src/testSetup.ts')?.sourceScope).toBe('test')
    expect(graph.sourceInventory?.files.find((file) => file.path === 'ui/vite.config.ts')?.sourceScope).toBe('config')
    expect(graph.sourceInventory?.files.find((file) => file.path === 'ui/vitest.config.ts')?.sourceScope).toBe('config')
    expect(graph.components.map((component) => component.file)).not.toEqual(expect.arrayContaining([
      'ui/src/testSetup.ts',
      'ui/vite.config.ts',
      'ui/vitest.config.ts'
    ]))
  })

  it('generates compatibility forms from normalized control facts', async () => {
    const repo = await monorepoRepo()

    const graph = await discoverSource(repo)
    const launcherForm = graph.forms.find((form) => form.inputs.includes('Repo path'))

    expect(launcherForm?.inputs).toEqual(expect.arrayContaining(['Repo path', 'App URL', 'Product goal']))
    expect(launcherForm?.inputs.some((input) => /event\.target|placeholder=|aria-describedby=|onChange/.test(input))).toBe(false)
    expect(graph.sourceInventory?.facts.some((fact) => fact.kind === 'form_control' && fact.label === 'Repo path' && fact.rawText?.includes('event.target.value'))).toBe(true)
  })

  it('uses Sniffer dashboard workflow language instead of workspace-control terminology', async () => {
    const repo = await monorepoRepo()

    const graph = await discoverSource(repo)
    const workflowNames = graph.sourceWorkflows.map((workflow) => workflow.name)

    expect(workflowNames).not.toContain('View plan bundle tabs')
    expect(workflowNames).not.toContain('Copy handoff prompt')
    expect(workflowNames).toEqual(expect.arrayContaining([
      'Run Sniffer audit',
      'Inspect report sections',
      'Inspect raw report payload',
      'Inspect fix packets',
      'Use repair workbench',
      'Review agent model',
      'Copy repair/fix prompts'
    ]))
  })

  it('normalizes malformed template literal API paths and suppresses broad API prefixes', async () => {
    const repo = await monorepoRepo()

    const graph = await discoverSource(repo)
    const endpoints = graph.apiCalls.map((call) => call.endpoint)

    expect(endpoints).toContain('/api/repairs/history')
    expect(endpoints.some((endpoint) => endpoint.includes('${query'))).toBe(false)
    expect(endpoints).not.toContain('/api/')
    expect(endpoints).not.toContain('/api')
  })

  it('can include fixture surfaces when explicitly requested', async () => {
    const repo = await monorepoRepo()

    const graph = await discoverSource(repo, { includeFixtures: true })

    expect(graph.sourceScopeSummary?.excludedPaths).not.toContain('fixtures')
    expect(graph.sourceScopeSummary?.scannedFileCountsByScope.fixture).toBeGreaterThan(0)
    expect(graph.uiSurfaces.map((surface) => surface.display_name)).toContain('Fixture Marketing')
    expect(graph.routes.map((route) => route.path)).toContain('/fixture')
    expect(graph.sourceInventory?.facts.some((fact) => fact.filePath === 'fixtures/static-html/index.html' && fact.sourceScope === 'fixture')).toBe(true)
  })

  it('discovers intra-file React UI surfaces, workflows, controls, and API calls', async () => {
    const repo = await tempRepo()
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({
      name: 'single-file-app',
      scripts: { dev: 'vite' },
      dependencies: { react: '^18.0.0', vite: '^5.0.0' }
    }))
    await mkdir(path.join(repo, 'src'), { recursive: true })
    await writeFile(path.join(repo, 'src', 'api.ts'), `
      async function request(path: string, options?: RequestInit) { return fetch(path, options) }
      export function createWorkspace(name: string) { return request('/api/workspaces', { method: 'POST', body: JSON.stringify({ name }) }) }
      export function addRepo(workspaceId: string) { return request(\`/api/workspaces/\${workspaceId}/repos\`, { method: 'POST' }) }
      export function validateRepoTarget() { return request('/api/repos/validate-target', { method: 'POST' }) }
      export function generatePlanBundle(workspaceId: string) { return request(\`/api/workspaces/\${workspaceId}/plan-bundles\`, { method: 'POST' }) }
    `)
    await writeFile(path.join(repo, 'src', 'App.tsx'), `
      import { useState, FormEvent } from 'react'
      import { addRepo, createWorkspace, generatePlanBundle, validateRepoTarget } from './api'
      export default function App() {
        const [workspaceName, setWorkspaceName] = useState('')
        const [repoTargetId, setRepoTargetId] = useState('')
        const [featureRequest, setFeatureRequest] = useState('')
        const [busy, setBusy] = useState('')
        const [error, setError] = useState('')
        async function onCreateWorkspace(event: FormEvent) { event.preventDefault(); await createWorkspace(workspaceName) }
        async function onAddRepo(event: FormEvent) { event.preventDefault(); await validateRepoTarget(); await addRepo('workspace') }
        async function onGeneratePlan(event: FormEvent) { event.preventDefault(); await generatePlanBundle('workspace') }
        return <main className="app-shell">
          <h1>StackPilot Control Plane</h1>
          <section>
            <h2>Workspaces</h2>
            <label>Workspace <select aria-label="Workspace"><option>Select workspace</option></select></label>
            <button onClick={onCreateWorkspace}>New workspace</button>
          </section>
          <form onSubmit={onAddRepo}>
            <h2>Discovery targets</h2>
            <label>Repository target id <input placeholder="petclinic-react" value={repoTargetId} /></label>
            <button>Add repo</button>
          </form>
          <form onSubmit={onGeneratePlan}>
            <h2>Prompt composer</h2>
            <textarea placeholder="Describe the feature request" value={featureRequest} />
            <button>Generate Plan Bundle</button>
          </form>
          <div role="tablist" aria-label="Plan Bundle">
            <button role="tab">Overview</button>
            <button role="tab">Changes</button>
            <button role="tab">Handoff</button>
            <button role="tab">JSON</button>
          </div>
          <button aria-label="Copy handoff prompt">Copy</button>
        </main>
      }
    `)

    const graph = await discoverSource(repo)

    expect(graph.uiSurfaces.map((surface) => surface.surface_type)).toEqual(expect.arrayContaining([
      'app_shell',
      'workspace_selector',
      'repo_list',
      'add_repo_form',
      'prompt_composer',
      'generate_plan_action',
      'plan_bundle_view',
      'copy_action'
    ]))
    expect(graph.uiSurfaces.flatMap((surface) => surface.relatedButtons)).toEqual(expect.arrayContaining(['New workspace', 'Add repo', 'Generate Plan Bundle', 'Copy']))
    expect(graph.uiSurfaces.flatMap((surface) => surface.relatedInputs)).toEqual(expect.arrayContaining(['Workspace Select workspace', 'Describe the feature request']))
    expect(graph.sourceWorkflows.map((workflow) => workflow.name)).toEqual(expect.arrayContaining([
      'Create/select workspace',
      'Add repo',
      'Validate repo path',
      'Generate plan bundle',
      'View plan bundle tabs',
      'Copy handoff prompt'
    ]))
    expect(graph.apiCalls.map((call) => call.endpoint)).toEqual(expect.arrayContaining([
      '/api/workspaces',
      '/api/repos/validate-target'
    ]))
    expect(graph.stateActions[0].stateVariables).toEqual(expect.arrayContaining(['workspaceName', 'repoTargetId', 'featureRequest', 'busy', 'error']))
    expect(graph.stateActions[0].submitHandlers).toEqual(expect.arrayContaining(['onCreateWorkspace', 'onAddRepo', 'onGeneratePlan']))
  })

  it('detects Angular apps without mistaking src/app for Next app router', async () => {
    const repo = await tempRepo()
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({
      name: 'angular-realworld',
      scripts: { start: 'ng serve', build: 'ng build', test: 'vitest' },
      dependencies: { '@angular/core': '^19.0.0', '@angular/router': '^19.0.0' },
      devDependencies: { '@angular/cli': '^19.0.0', vitest: '^2.0.0' }
    }))
    await mkdir(path.join(repo, 'src', 'app'), { recursive: true })
    await writeFile(path.join(repo, 'src', 'app', 'app.component.ts'), 'export class AppComponent {}')

    const graph = await discoverSource(repo)

    expect(graph.framework).toBe('angular')
    expect(graph.buildTool).toBe('angular-cli')
    expect(graph.discoveryAdapters?.map((adapter) => adapter.adapterId)).toContain('angular')
  })

  it('ignores generated framework cache directories', async () => {
    const repo = await tempRepo()
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({
      name: 'cache-noise',
      scripts: { start: 'ng serve' },
      dependencies: { '@angular/core': '^19.0.0' },
      devDependencies: { '@angular/cli': '^19.0.0' }
    }))
    await mkdir(path.join(repo, 'src', 'app'), { recursive: true })
    await mkdir(path.join(repo, '.angular', 'cache', 'vite', 'deps'), { recursive: true })
    await writeFile(path.join(repo, 'src', 'app', 'app.component.ts'), 'export class AppComponent {}')
    await writeFile(path.join(repo, '.angular', 'cache', 'vite', 'deps', 'generated.js'), '<form><input name="generated-noise" /></form>')

    const graph = await discoverSource(repo)

    expect(graph.forms.flatMap((form) => form.inputs)).not.toContain('generated-noise')
  })

  it('extracts Angular templates, routes, services, and workflows', async () => {
    const repo = await tempRepo()
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({
      name: 'angular-realworld',
      scripts: { start: 'ng serve' },
      dependencies: { '@angular/core': '^19.0.0', '@angular/router': '^19.0.0', '@angular/common': '^19.0.0' },
      devDependencies: { '@angular/cli': '^19.0.0' }
    }))
    await writeFile(path.join(repo, 'angular.json'), '{}')
    await mkdir(path.join(repo, 'src', 'app', 'auth'), { recursive: true })
    await writeFile(path.join(repo, 'src', 'app', 'app.routes.ts'), `
      import { Routes } from '@angular/router'
      export const routes: Routes = [
        { path: '', redirectTo: 'articles' },
        { path: 'login', component: LoginComponent },
        { path: 'articles', component: ArticleListComponent }
      ]
    `)
    await writeFile(path.join(repo, 'src', 'app', 'auth', 'login.component.ts'), `
      import { Component } from '@angular/core'
      @Component({ selector: 'app-login', templateUrl: './login.component.html' })
      export class LoginComponent {
        isLoading = false
        errorMessage = ''
        login() {}
      }
    `)
    await writeFile(path.join(repo, 'src', 'app', 'auth', 'login.component.html'), `
      <h1>Sign in</h1>
      <form (ngSubmit)="login()">
        <label>Email <input formControlName="email" placeholder="Email" /></label>
        <label>Password <input type="password" formControlName="password" /></label>
        <button type="submit">Sign in</button>
      </form>
      <a routerLink="/articles">Articles</a>
    `)
    await writeFile(path.join(repo, 'src', 'app', 'article.service.ts'), `
      import { HttpClient } from '@angular/common/http'
      export class ArticleService {
        constructor(private http: HttpClient) {}
        listArticles() { return this.http.get('/api/articles') }
        publishArticle(body: unknown) { return this.http.post('/api/articles', body) }
      }
    `)

    const graph = await discoverSource(repo)

    expect(graph.routes.map((route) => route.path)).toEqual(expect.arrayContaining(['/login', '/articles']))
    expect(graph.forms[0].inputs).toEqual(expect.arrayContaining(['Email', 'Password']))
    expect(graph.forms[0].inputs).not.toEqual(expect.arrayContaining(['Email <input formControlName=', 'Password <input type=']))
    expect(graph.uiSurfaces.map((surface) => surface.display_name)).toContain('Sign in')
    expect(graph.sourceWorkflows.map((workflow) => workflow.name)).toEqual(expect.arrayContaining(['Login form', 'Submit form', 'Navigation route', 'Table/list scan', 'Create/edit entity']))
    expect(graph.apiCalls.map((call) => `${call.method} ${call.endpoint}`)).toEqual(expect.arrayContaining(['GET /api/articles', 'POST /api/articles']))
    expect(graph.stateActions[0].handlerNames).toContain('login')
  })

  it('uses HTML template fallback for generic repos', async () => {
    const repo = await tempRepo()
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'plain-html', scripts: {}, dependencies: {} }))
    await mkdir(path.join(repo, 'templates'), { recursive: true })
    await writeFile(path.join(repo, 'templates', 'dashboard.html'), `
      <h1>Reports</h1>
      <form action="/search"><label>Search <input name="q" placeholder="Search reports" /></label><button>Search</button></form>
      <a href="/reports">Reports</a>
      <table><tr><th>Name</th></tr><tr><td>Q1</td></tr></table>
    `)

    const graph = await discoverSource(repo)

    expect(graph.discoveryAdapters?.map((adapter) => adapter.adapterId)).toContain('html-template')
    expect(graph.uiSurfaces.map((surface) => surface.display_name)).toContain('Reports')
    expect(graph.forms[0].inputs).toEqual(expect.arrayContaining(['Search']))
    expect(graph.forms[0].inputs.some((input) => /<input|placeholder=|name=/.test(input))).toBe(false)
    expect(graph.sourceWorkflows.map((workflow) => workflow.name)).toEqual(expect.arrayContaining(['Submit form', 'Navigation route', 'Table/list scan', 'Search/filter']))
  })
})

async function tempRepo(): Promise<string> {
  const repo = path.join(os.tmpdir(), `sniffer-test-${randomUUID()}`)
  await mkdir(repo, { recursive: true })
  return repo
}

async function monorepoRepo(): Promise<string> {
  const repo = await tempRepo()
  await writeFile(path.join(repo, 'package.json'), JSON.stringify({
    name: 'sniffer-engine',
    scripts: { sniffer: 'tsx src/cli/index.ts' },
    dependencies: {}
  }))
  await mkdir(path.join(repo, 'ui', 'src'), { recursive: true })
  await writeFile(path.join(repo, 'ui', 'package.json'), JSON.stringify({
    name: 'sniffer-ui',
    scripts: { dev: 'vite', build: 'vite build' },
    dependencies: { '@vitejs/plugin-react': '^5.0.0', react: '^18.0.0', vite: '^5.0.0' }
  }))
  await writeFile(path.join(repo, 'ui', 'index.html'), '<script type="module" src="/src/main.tsx"></script>')
  await writeFile(path.join(repo, 'ui', 'src', 'App.tsx'), `
    export function App() {
      function onRunAudit() {}
      function onLauncherChange(value: unknown) { return value }
      return <main>
        <h1>Sniffer Dashboard</h1>
        <nav aria-label="Sniffer report sections">
          <button>Summary</button>
          <button>Run Timeline</button>
          <button>Scenarios</button>
          <button>Crawl Path</button>
          <button>Workflow Evidence</button>
          <button>Issues</button>
          <button>Fix Packets</button>
          <button>Screenshots</button>
          <button>Graph Explorer</button>
          <button>Raw JSON</button>
          <button>Settings</button>
          <button>Repair Workbench</button>
          <button>Agent Model</button>
        </nav>
        <form aria-label="Audit launcher">
          <label>Repo path <input value="" onChange={(event) => onLauncherChange({ repoPath: event.target.value })} placeholder="/path/to/repo" /></label>
          <label>App URL <input value="" onChange={(event) => onLauncherChange({ url: event.target.value })} placeholder="http://localhost:5173" /></label>
          <label>Product goal <textarea value="" onChange={(event) => onLauncherChange({ productGoal: event.target.value })} rows={3} aria-describedby="product-goal-help" /></label>
        </form>
        <button onClick={onRunAudit}>Run Audit</button>
        <button>Run Consistency Check</button>
        <button>Generate Fix Packets</button>
        <button>Open Latest Report</button>
        <button aria-label="Copy fix prompt">Copy prompt</button>
      </main>
    }
  `)
  await writeFile(path.join(repo, 'ui', 'src', 'api.ts'), `
    async function request(path: string, options?: RequestInit) { return fetch(path, options) }
    export function latestReport() { return request('/api/reports/latest') }
    export function startAudit() { return request('/api/audits', { method: 'POST' }) }
    export function fixPackets() { return request('/api/reports/latest/fix-packets') }
    export function sourceInventory() { return request('/api/reports/latest/source-inventory') }
    export function uiIntentGraph() { return request('/api/reports/latest/ui-intent-graph') }
    export function repairHistory(query: string) { return request(\`/api/repairs/history\${query ? \`?\${query}\` : ''}\`) }
    export function startRepair(issueId: string) { return request('/api/repairs/start', { method: 'POST', body: JSON.stringify({ issueId }) }) }
    export function helperPrefix(path: string) { return path.startsWith('/api/') ? path : \`/api/\${path}\` }
  `)
  await writeFile(path.join(repo, 'ui', 'src', 'testSetup.ts'), 'export function setupTests() { return true }')
  await writeFile(path.join(repo, 'ui', 'vite.config.ts'), 'export default {}')
  await writeFile(path.join(repo, 'ui', 'vitest.config.ts'), 'export default {}')
  await mkdir(path.join(repo, 'server'), { recursive: true })
  await writeFile(path.join(repo, 'server', 'app.py'), `
    from fastapi import FastAPI
    app = FastAPI()
    @app.get("/api/reports/latest")
    def latest_report():
      return {}
  `)
  await mkdir(path.join(repo, 'src', 'cli'), { recursive: true })
  await writeFile(path.join(repo, 'src', 'cli', 'index.ts'), `
    export function runAudit() { return 'internal engine action' }
    export function deleteReport() { return 'not a UI action' }
  `)
  await mkdir(path.join(repo, 'fixtures', 'static-html'), { recursive: true })
  await writeFile(path.join(repo, 'fixtures', 'static-html', 'index.html'), `
    <h1>Fixture Marketing</h1>
    <a href="/fixture">Fixture route</a>
  `)
  await mkdir(path.join(repo, 'tests'), { recursive: true })
  await writeFile(path.join(repo, 'tests', 'App.test.tsx'), '<button>Fixture Test Button</button>')
  return repo
}

function report(sourceGraph: SourceGraph): SnifferReport {
  return {
    sourceGraph,
    sourceInventory: sourceGraph.sourceInventory,
    uiIntentGraph: sourceGraph.uiIntentGraph,
    crawlGraph: { startUrl: '', title: '', finalUrl: '', states: [], actions: [], consoleErrors: [], networkFailures: [], screenshots: [], generatedAt: '' },
    appIntent: { summary: '', likelyWorkflows: [], sourceSignals: [], llmUsed: false },
    runtimeSurfaceMatches: [],
    runtimeWorkflowVerifications: [],
    criticDecisions: [],
    deferredFindings: [],
    blockedChecks: [],
    needsMoreCrawling: [],
    issues: [],
    generatedAt: ''
  }
}
