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
})

async function tempRepo(): Promise<string> {
  const repo = path.join(os.tmpdir(), `sniffer-test-${randomUUID()}`)
  await mkdir(repo, { recursive: true })
  return repo
}
