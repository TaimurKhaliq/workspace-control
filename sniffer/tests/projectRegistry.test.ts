import { describe, expect, it } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { getProject, initProject, listProjects, normalizeAppUrl, projectRegistryPath, removeProject } from '../src/projects/registry.js'

describe('project registry', () => {
  it('adds, lists, inspects, and removes registered projects', async () => {
    const baseDir = await tempDir('sniffer-registry')
    const repo = await reactViteRepo()

    const project = await initProject({
      id: 'workspace-control',
      name: 'Workspace Control',
      repoPath: repo,
      appUrl: 'http://127.0.0.1:5173'
    }, baseDir)

    expect(project.id).toBe('workspace-control')
    expect(project.framework).toBe('react')
    expect(project.buildTool).toBe('vite')
    expect(project.devCommand).toBe('npm run dev')
    expect(project.buildCommand).toBe('npm run build')
    expect(project.testCommand).toBe('npm run test')
    expect(project.profile.profile_type).toBe('planning_control_panel')
    expect(await getProject('workspace-control', baseDir)).toMatchObject({ name: 'Workspace Control' })
    expect(await listProjects(baseDir)).toHaveLength(1)

    const registry = JSON.parse(await readFile(projectRegistryPath(baseDir), 'utf8')) as { projects: unknown[] }
    expect(registry.projects).toHaveLength(1)

    expect(await removeProject('workspace-control', baseDir)).toBe(true)
    expect(await listProjects(baseDir)).toHaveLength(0)
  })

  it('normalizes common localhost URL shorthand', () => {
    expect(normalizeAppUrl('http:localhost:4200')).toBe('http://localhost:4200')
    expect(normalizeAppUrl('localhost:4200')).toBe('http://localhost:4200')
  })
})

async function reactViteRepo(): Promise<string> {
  const repo = await tempDir('sniffer-react-vite')
  await writeFile(path.join(repo, 'package.json'), JSON.stringify({
    name: 'demo-control-panel',
    scripts: { dev: 'vite', build: 'vite build', test: 'vitest run' },
    dependencies: { react: '^18.0.0', vite: '^5.0.0' }
  }))
  await mkdir(path.join(repo, 'src'), { recursive: true })
  await writeFile(path.join(repo, 'src', 'App.tsx'), `
    export default function App() {
      return <main>
        <h1>Workspace Control</h1>
        <button>New workspace</button>
        <button>Add repository</button>
        <textarea aria-label="Feature request" />
        <button>Generate Plan Bundle</button>
        <button>Copy handoff prompt</button>
      </main>
    }
  `)
  return repo
}

async function tempDir(prefix: string): Promise<string> {
  const dir = path.join(os.tmpdir(), `${prefix}-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  return dir
}
