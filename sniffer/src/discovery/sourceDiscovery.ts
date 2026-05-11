import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { SourceFileSummary, SourceForm, SourceGraph, SourceRoute } from '../types.js'
import { mergeAdapterResults, runDiscoveryAdapters } from './adapters/registry.js'
import type { DiscoveryContext } from './adapters/types.js'
import { buildSourceInventory, buildUIIntentGraph } from '../evidence/contextModel.js'

const ignoredDirs = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.angular',
  '.cache',
  '.turbo',
  '.vite',
  '.svelte-kit',
  'coverage',
  'reports'
])
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.html', '.vue', '.svelte', '.astro', '.hbs', '.ejs'])

export interface SourceDiscoveryOptions {
  includeTestSources?: boolean
}

export async function discoverSource(repoPath: string, options: SourceDiscoveryOptions = {}): Promise<SourceGraph> {
  const absoluteRepo = path.resolve(repoPath)
  const packageJson = await readPackageJson(absoluteRepo)
  const files = await listSourceFiles(absoluteRepo, options)
  const dependencies = {
    ...asRecord(packageJson.dependencies),
    ...asRecord(packageJson.devDependencies)
  }

  const fileContents = await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')] as const))
  const inventory = fileContents.map(([file, content]) => ({
    file,
    relative: path.relative(absoluteRepo, file).split(path.sep).join('/'),
    content
  }))
  const context: DiscoveryContext = {
    repoPath: absoluteRepo,
    packageJson,
    dependencies,
    files: inventory
  }
  const adapterResults = runDiscoveryAdapters(context)
  const base: Omit<SourceGraph, 'generatedAt'> = {
    repoPath: absoluteRepo,
    packageName: typeof packageJson.name === 'string' ? packageJson.name : undefined,
    framework: detectFramework(dependencies, files),
    buildTool: detectBuildTool(dependencies, packageJson),
    routes: discoverRoutes(absoluteRepo, fileContents),
    pages: files.filter(isLikelyPage).map((file) => summarizeFile(absoluteRepo, file)),
    components: files.filter(isLikelyComponent).map((file) => summarizeFile(absoluteRepo, file)),
    forms: discoverForms(absoluteRepo, fileContents),
    uiSurfaces: [],
    sourceWorkflows: [],
    apiCalls: [],
    stateActions: [],
    packageScripts: asRecord(packageJson.scripts)
  }
  const merged = mergeAdapterResults({ base, results: adapterResults, generatedAt: new Date().toISOString() })
  const sourceInventory = buildSourceInventory({ repoPath: absoluteRepo, packageJson, files: inventory, sourceGraph: merged })
  const uiIntentGraph = buildUIIntentGraph({ ...merged, sourceInventory }, sourceInventory)
  return { ...merged, sourceInventory, uiIntentGraph }
}

async function readPackageJson(repoPath: string): Promise<Record<string, unknown>> {
  const packagePath = path.join(repoPath, 'package.json')
  return JSON.parse(await readFile(packagePath, 'utf8')) as Record<string, unknown>
}

async function listSourceFiles(repoPath: string, options: SourceDiscoveryOptions): Promise<string[]> {
  const out: string[] = []

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir)) {
      if (ignoredDirs.has(entry)) continue
      const full = path.join(dir, entry)
      const info = await stat(full)
      if (info.isDirectory()) {
        await walk(full)
      } else if (sourceExtensions.has(path.extname(entry)) && (options.includeTestSources || !isTestSourceFile(path.relative(repoPath, full)))) {
        out.push(full)
      }
    }
  }

  await walk(repoPath)
  return out.sort()
}

function isTestSourceFile(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join('/')
  return /(^|\/)(tests?|__tests__)\/|\.test\.|\.spec\./i.test(normalized)
}

function detectFramework(dependencies: Record<string, string>, files: string[]): string {
  if (dependencies['@angular/core']) return 'angular'
  if (dependencies.next || files.some(isNextAppRouterFile)) return 'next'
  if (dependencies.vue) return 'vue'
  if (dependencies.svelte || dependencies['@sveltejs/kit']) return 'svelte'
  if (dependencies.react) return 'react'
  return 'unknown'
}

function detectBuildTool(dependencies: Record<string, string>, packageJson: Record<string, unknown>): string {
  const scripts = asRecord(packageJson.scripts)
  const scriptText = Object.values(scripts).join(' ')
  if (dependencies['@angular/cli'] || scripts.ng || /\bng\s+(?:serve|build|test)\b/.test(scriptText)) return 'angular-cli'
  if (dependencies.next || /\bnext\b/.test(scriptText)) return 'next'
  if (dependencies.vite || /\bvite(?:\s|$)/.test(scriptText)) return 'vite'
  if (dependencies.webpack || /\bwebpack\b/.test(scriptText)) return 'webpack'
  if (dependencies.parcel || /\bparcel\b/.test(scriptText)) return 'parcel'
  return 'unknown'
}

function isNextAppRouterFile(file: string): boolean {
  if (/[\\/]src[\\/]app[\\/]/.test(file)) return false
  return /[\\/]app[\\/](?:page|layout|route)\.(?:tsx|ts|jsx|js)$/.test(file)
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
    for (const route of regexMatches(content, /(?:href|to|routerLink)=["'](\/[^"']*)["']/g)) {
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
    return [...content.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/gi)].map((match, index) => {
      const body = match[1]
      const inputs = [
        ...regexMatches(body, /\b(?:name|aria-label|placeholder|formControlName)=["']([^"']+)["']/gi),
        ...tagText(body, 'label'),
        ...tagText(body, 'button')
      ]
      return {
        file: path.relative(repoPath, file),
        name: index === 0 ? path.basename(file, path.extname(file)) : `${path.basename(file, path.extname(file))} ${index + 1}`,
        inputs: [...new Set(inputs.filter(Boolean))]
      }
    })
  })
}

function tagText(content: string, tag: string): string[] {
  return regexMatches(content, new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))
    .map((value) => value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((value) => /[A-Za-z]/.test(value))
}

function isLikelyPage(file: string): boolean {
  const normalized = file.split(path.sep).join('/')
  return /\/(pages|app)\//.test(normalized) || /(?:Page|Screen|Route)\.(tsx|jsx|vue|svelte)$/.test(file)
}

function isLikelyComponent(file: string): boolean {
  const normalized = file.split(path.sep).join('/')
  return /\/(components|ui)\//.test(normalized) || /\.component\.(ts|html)$/.test(normalized) || /[A-Z][A-Za-z0-9]+\.(tsx|jsx|vue|svelte)$/.test(path.basename(file))
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
