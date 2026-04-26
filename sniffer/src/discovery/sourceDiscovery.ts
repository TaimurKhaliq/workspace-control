import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { SourceFileSummary, SourceForm, SourceGraph, SourceRoute } from '../types.js'
import { discoverReactUi } from './reactUiDiscovery.js'

const ignoredDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'reports'])
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'])

export async function discoverSource(repoPath: string): Promise<SourceGraph> {
  const absoluteRepo = path.resolve(repoPath)
  const packageJson = await readPackageJson(absoluteRepo)
  const files = await listSourceFiles(absoluteRepo)
  const dependencies = {
    ...asRecord(packageJson.dependencies),
    ...asRecord(packageJson.devDependencies)
  }

  const pages = files.filter(isLikelyPage).map((file) => summarizeFile(absoluteRepo, file))
  const components = files.filter(isLikelyComponent).map((file) => summarizeFile(absoluteRepo, file))
  const fileContents = await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')] as const))
  const reactUi = discoverReactUi(absoluteRepo, fileContents)

  return {
    repoPath: absoluteRepo,
    packageName: typeof packageJson.name === 'string' ? packageJson.name : undefined,
    framework: detectFramework(dependencies, files),
    buildTool: detectBuildTool(dependencies, packageJson),
    routes: discoverRoutes(absoluteRepo, fileContents),
    pages,
    components,
    forms: discoverForms(absoluteRepo, fileContents),
    uiSurfaces: reactUi.uiSurfaces,
    sourceWorkflows: reactUi.sourceWorkflows,
    apiCalls: reactUi.apiCalls,
    stateActions: reactUi.stateActions,
    packageScripts: asRecord(packageJson.scripts),
    generatedAt: new Date().toISOString()
  }
}

async function readPackageJson(repoPath: string): Promise<Record<string, unknown>> {
  const packagePath = path.join(repoPath, 'package.json')
  return JSON.parse(await readFile(packagePath, 'utf8')) as Record<string, unknown>
}

async function listSourceFiles(repoPath: string): Promise<string[]> {
  const out: string[] = []

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir)) {
      if (ignoredDirs.has(entry)) continue
      const full = path.join(dir, entry)
      const info = await stat(full)
      if (info.isDirectory()) {
        await walk(full)
      } else if (sourceExtensions.has(path.extname(entry))) {
        out.push(full)
      }
    }
  }

  await walk(repoPath)
  return out.sort()
}

function detectFramework(dependencies: Record<string, string>, files: string[]): string {
  if (dependencies.next || files.some((file) => file.includes(`${path.sep}app${path.sep}`))) return 'next'
  if (dependencies['@angular/core']) return 'angular'
  if (dependencies.vue) return 'vue'
  if (dependencies.svelte || dependencies['@sveltejs/kit']) return 'svelte'
  if (dependencies.react) return 'react'
  return 'unknown'
}

function detectBuildTool(dependencies: Record<string, string>, packageJson: Record<string, unknown>): string {
  const scripts = asRecord(packageJson.scripts)
  const scriptText = Object.values(scripts).join(' ')
  if (dependencies.vite || scriptText.includes('vite')) return 'vite'
  if (dependencies.next || scriptText.includes('next')) return 'next'
  if (dependencies.webpack || scriptText.includes('webpack')) return 'webpack'
  if (dependencies.parcel || scriptText.includes('parcel')) return 'parcel'
  return 'unknown'
}

function discoverRoutes(repoPath: string, files: readonly (readonly [string, string])[]): SourceRoute[] {
  const routes = new Map<string, SourceRoute>()

  for (const [file, content] of files) {
    const relative = path.relative(repoPath, file)
    const normalized = relative.split(path.sep).join('/')

    const nextRoute = nextFilesystemRoute(normalized)
    if (nextRoute) routes.set(`${nextRoute}:${file}`, { path: nextRoute, file: relative, source: 'filesystem' })

    const pageRoute = pageFilesystemRoute(normalized)
    if (pageRoute) routes.set(`${pageRoute}:${file}`, { path: pageRoute, file: relative, source: 'filesystem' })

    for (const route of regexMatches(content, /path=["']([^"']+)["']/g)) {
      routes.set(`${route}:${file}`, { path: route, file: relative, source: 'router' })
    }
    for (const route of regexMatches(content, /(?:href|to)=["'](\/[^"']*)["']/g)) {
      routes.set(`${route}:${file}`, { path: route, file: relative, source: 'link' })
    }
  }

  return [...routes.values()].sort((a, b) => a.path.localeCompare(b.path))
}

function nextFilesystemRoute(normalized: string): string | undefined {
  const match = normalized.match(/^app\/(.+)\/page\.(tsx|ts|jsx|js)$/)
  if (!match) return undefined
  const route = match[1].replace(/\([^)]*\)\//g, '').replace(/\/?\[[^/]+\]/g, (segment) => `:${segment.replace(/[\[\]/]/g, '')}`)
  return route === 'page' || route === '' ? '/' : `/${route}`
}

function pageFilesystemRoute(normalized: string): string | undefined {
  const match = normalized.match(/^pages\/(.+)\.(tsx|ts|jsx|js)$/)
  if (!match || match[1].startsWith('_')) return undefined
  const route = match[1].replace(/index$/, '').replace(/\[[^/]+\]/g, (segment) => `:${segment.replace(/[\[\]]/g, '')}`)
  return route === '' ? '/' : `/${route.replace(/\/$/, '')}`
}

function discoverForms(repoPath: string, files: readonly (readonly [string, string])[]): SourceForm[] {
  return files.flatMap(([file, content]) => {
    if (!/<form[\s>]/i.test(content)) return []
    const inputs = [
      ...regexMatches(content, /<(?:input|textarea|select)[^>]+(?:name|aria-label|placeholder)=["']([^"']+)["']/gi)
    ]
    return [{
      file: path.relative(repoPath, file),
      name: path.basename(file, path.extname(file)),
      inputs: [...new Set(inputs)]
    }]
  })
}

function isLikelyPage(file: string): boolean {
  const normalized = file.split(path.sep).join('/')
  return /\/(pages|app)\//.test(normalized) || /(?:Page|Screen|Route)\.(tsx|jsx|vue|svelte)$/.test(file)
}

function isLikelyComponent(file: string): boolean {
  const normalized = file.split(path.sep).join('/')
  return /\/(components|ui)\//.test(normalized) || /[A-Z][A-Za-z0-9]+\.(tsx|jsx|vue|svelte)$/.test(path.basename(file))
}

function summarizeFile(repoPath: string, file: string): SourceFileSummary {
  return {
    file: path.relative(repoPath, file),
    name: path.basename(file, path.extname(file))
  }
}

function regexMatches(value: string, regex: RegExp): string[] {
  return [...value.matchAll(regex)].map((match) => match[1]).filter(Boolean)
}

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => typeof entry === 'string')
      .map(([key, entry]) => [key, entry as string])
  )
}
