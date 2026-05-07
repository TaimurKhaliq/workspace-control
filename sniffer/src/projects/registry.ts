import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { discoverSource } from '../discovery/sourceDiscovery.js'
import { inferAppProfile } from '../profile/appProfile.js'
import { projectLatestReportDir, safeProjectId } from '../reporting/paths.js'
import type { AppProfile, ProjectRegistryFile, SnifferProject, SourceGraph } from '../types.js'

export interface ProjectInput {
  id?: string
  name: string
  repoPath: string
  appUrl: string
  devCommand?: string
  buildCommand?: string
  testCommand?: string
  productGoal?: string
}

export function projectRegistryPath(baseDir = process.cwd()): string {
  return path.join(baseDir, '.sniffer', 'projects.json')
}

export async function loadProjectRegistry(baseDir = process.cwd()): Promise<ProjectRegistryFile> {
  const file = projectRegistryPath(baseDir)
  if (!await exists(file)) return emptyRegistry()
  const parsed = JSON.parse(await readFile(file, 'utf8')) as Partial<ProjectRegistryFile>
  return {
    version: 1,
    projects: Array.isArray(parsed.projects) ? parsed.projects as SnifferProject[] : [],
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString()
  }
}

export async function saveProjectRegistry(registry: ProjectRegistryFile, baseDir = process.cwd()): Promise<void> {
  const file = projectRegistryPath(baseDir)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify({ ...registry, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
}

export async function listProjects(baseDir = process.cwd()): Promise<SnifferProject[]> {
  return (await loadProjectRegistry(baseDir)).projects
}

export async function getProject(id: string, baseDir = process.cwd()): Promise<SnifferProject | undefined> {
  const normalized = safeProjectId(id)
  return (await listProjects(baseDir)).find((project) => project.id === normalized)
}

export async function removeProject(id: string, baseDir = process.cwd()): Promise<boolean> {
  const registry = await loadProjectRegistry(baseDir)
  const normalized = safeProjectId(id)
  const next = registry.projects.filter((project) => project.id !== normalized)
  if (next.length === registry.projects.length) return false
  await saveProjectRegistry({ ...registry, projects: next }, baseDir)
  return true
}

export async function upsertProject(project: SnifferProject, baseDir = process.cwd()): Promise<SnifferProject> {
  const registry = await loadProjectRegistry(baseDir)
  const now = new Date().toISOString()
  const normalized: SnifferProject = {
    ...project,
    id: safeProjectId(project.id),
    repoPath: path.resolve(project.repoPath),
    appUrl: normalizeAppUrl(project.appUrl),
    workingDirectory: path.resolve(project.workingDirectory || project.repoPath),
    env: project.env ?? {},
    createdAt: project.createdAt || now,
    updatedAt: now
  }
  const existing = registry.projects.findIndex((candidate) => candidate.id === normalized.id)
  const projects = existing >= 0
    ? registry.projects.map((candidate, index) => index === existing ? { ...normalized, createdAt: candidate.createdAt } : candidate)
    : [...registry.projects, normalized]
  await saveProjectRegistry({ ...registry, projects }, baseDir)
  return existing >= 0 ? { ...normalized, createdAt: registry.projects[existing].createdAt } : normalized
}

export async function initProject(input: ProjectInput, baseDir = process.cwd()): Promise<SnifferProject> {
  const repoPath = path.resolve(input.repoPath)
  const sourceGraph = await discoverSource(repoPath)
  const profile = inferAppProfile({ sourceGraph, productGoal: input.productGoal })
  return upsertProject(createProjectFromSource(input, sourceGraph, profile, baseDir), baseDir)
}

export function createProjectFromSource(input: ProjectInput, sourceGraph: SourceGraph, profile: AppProfile, baseDir = process.cwd()): SnifferProject {
  const id = safeProjectId(input.id || input.name || sourceGraph.packageName || path.basename(input.repoPath))
  const commands = inferProjectCommands(sourceGraph)
  const now = new Date().toISOString()
  return {
    id,
    name: input.name || sourceGraph.packageName || id,
    repoPath: path.resolve(input.repoPath),
    appUrl: normalizeAppUrl(input.appUrl),
    framework: sourceGraph.framework,
    buildTool: sourceGraph.buildTool,
    packageName: sourceGraph.packageName,
    workingDirectory: path.resolve(input.repoPath),
    devCommand: input.devCommand || commands.devCommand,
    buildCommand: input.buildCommand || commands.buildCommand,
    testCommand: input.testCommand || commands.testCommand,
    env: {},
    profile,
    createdAt: now,
    updatedAt: now,
    discoveryMode: 'hybrid',
    inferredAppProfile: profile,
    latestReportPath: path.join(projectLatestReportDir(id, baseDir), 'latest_report.json')
  }
}

export function normalizeAppUrl(value: string): string {
  const trimmed = value.trim()
  if (/^https?:\/\/.+/i.test(trimmed)) return trimmed
  if (/^http:(?!\/\/)/i.test(trimmed)) return trimmed.replace(/^http:/i, 'http://')
  if (/^https:(?!\/\/)/i.test(trimmed)) return trimmed.replace(/^https:/i, 'https://')
  if (/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/.*)?$/i.test(trimmed)) return `http://${trimmed}`
  return trimmed
}

export function inferProjectCommands(sourceGraph: SourceGraph): { devCommand?: string; buildCommand?: string; testCommand?: string } {
  const scripts = sourceGraph.packageScripts ?? {}
  const scriptCommand = (name: string) => scripts[name] ? `npm run ${name}` : undefined
  const devName = ['dev', 'start', 'serve'].find((name) => scripts[name])
    ?? Object.entries(scripts).find(([, command]) => /\bvite\b|next dev|ng serve|svelte|webpack serve/.test(command))?.[0]
  return {
    devCommand: devName ? `npm run ${devName}` : undefined,
    buildCommand: scriptCommand('build'),
    testCommand: scriptCommand('test')
  }
}

function emptyRegistry(): ProjectRegistryFile {
  return { version: 1, projects: [], updatedAt: new Date().toISOString() }
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(() => true).catch(() => false)
}
