import { describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { discoverSource } from '../src/discovery/sourceDiscovery.js'

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
    expect(graph.forms[0].inputs).toEqual(expect.arrayContaining(['Email', 'email', 'Password', 'password']))
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
    expect(graph.forms[0].inputs).toEqual(expect.arrayContaining(['Search', 'q', 'Search reports']))
    expect(graph.sourceWorkflows.map((workflow) => workflow.name)).toEqual(expect.arrayContaining(['Submit form', 'Navigation route', 'Table/list scan', 'Search/filter']))
  })
})

async function tempRepo(): Promise<string> {
  const repo = path.join(os.tmpdir(), `sniffer-test-${randomUUID()}`)
  await mkdir(repo, { recursive: true })
  return repo
}
