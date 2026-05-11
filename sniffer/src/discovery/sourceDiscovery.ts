import { existsSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { ApiCall, EvidenceFact, SourceFileSummary, SourceForm, SourceGraph, SourceInventory, SourceRoute, SourceScope, SourceScopeRoot, SourceScopeSummary, SourceWorkflow, StateActionHints } from '../types.js'
import { mergeAdapterResults, runDiscoveryAdapters } from './adapters/registry.js'
import type { DiscoveryContext, SourceFileContent } from './adapters/types.js'
import { buildSourceInventory, buildUIIntentGraph } from '../evidence/contextModel.js'
import { isApiPrefixReference, normalizeEndpointReference } from './adapters/common.js'

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
  'reports',
  'playwright-report'
])
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.html', '.vue', '.svelte', '.astro', '.hbs', '.ejs', '.py'])

export interface SourceDiscoveryOptions {
  includeTestSources?: boolean
  includeFixtures?: boolean
}

export async function discoverSource(repoPath: string, options: SourceDiscoveryOptions = {}): Promise<SourceGraph> {
  const absoluteRepo = path.resolve(repoPath)
  const rootPackageJson = await readPackageJson(absoluteRepo)
  const scopeModel = await buildSourceScopeModel(absoluteRepo, rootPackageJson, options)
  const packageJson = scopeModel.primaryPackageJson ?? rootPackageJson
  const files = await listSourceFiles(absoluteRepo, options, scopeModel)
  const rootDependencies = {
    ...asRecord(rootPackageJson.dependencies),
    ...asRecord(rootPackageJson.devDependencies)
  }
  const dependencies = {
    ...asRecord(packageJson.dependencies),
    ...asRecord(packageJson.devDependencies)
  }

  const fileContents = await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')] as const))
  const inventory = fileContents.map(([file, content]) => ({
    file,
    relative: path.relative(absoluteRepo, file).split(path.sep).join('/'),
    content,
    sourceScope: scopeForPath(path.relative(absoluteRepo, file).split(path.sep).join('/'), scopeModel.summary)
  }))
  scopeModel.summary.scannedFileCountsByScope = inventory.reduce<Record<SourceScope, number>>((counts, file) => {
    counts[file.sourceScope ?? 'unknown'] = (counts[file.sourceScope ?? 'unknown'] ?? 0) + 1
    return counts
  }, emptyScopeCounts())
  const semanticInventory = inventory.filter((file) =>
    file.sourceScope === 'primary_ui_source' ||
    (options.includeFixtures && file.sourceScope === 'fixture') ||
    (options.includeTestSources && file.sourceScope === 'test')
  )
  const context: DiscoveryContext = {
    repoPath: absoluteRepo,
    packageJson,
    dependencies,
    files: semanticInventory
  }
  const adapterResults = runDiscoveryAdapters(context)
  const support = discoverSupportCode(absoluteRepo, inventory)
  const semanticFileContents = semanticInventory.map((file) => [file.file, file.content] as const)
  const base: Omit<SourceGraph, 'generatedAt'> = {
    repoPath: absoluteRepo,
    rootPackageName: typeof rootPackageJson.name === 'string' ? rootPackageJson.name : undefined,
    rootFramework: detectFramework(rootDependencies, files),
    rootBuildTool: detectBuildTool(rootDependencies, rootPackageJson),
    uiPackageName: typeof packageJson.name === 'string' ? packageJson.name : undefined,
    uiFramework: detectFramework(dependencies, semanticInventory.map((file) => file.file)),
    uiBuildTool: detectBuildTool(dependencies, packageJson),
    sourceScopeSummary: scopeModel.summary,
    packageName: typeof packageJson.name === 'string' ? packageJson.name : undefined,
    framework: detectFramework(dependencies, semanticInventory.map((file) => file.file)),
    buildTool: detectBuildTool(dependencies, packageJson),
    routes: discoverRoutes(absoluteRepo, semanticFileContents, scopeModel.summary),
    pages: semanticInventory.map((file) => file.file).filter(isLikelyPage).map((file) => summarizeFile(absoluteRepo, file, scopeModel.summary)),
    components: semanticInventory.map((file) => file.file).filter(isLikelyComponent).map((file) => summarizeFile(absoluteRepo, file, scopeModel.summary)),
    forms: discoverForms(absoluteRepo, semanticFileContents, scopeModel.summary),
    uiSurfaces: [],
    sourceWorkflows: [],
    apiCalls: support.apiCalls,
    stateActions: support.stateActions,
    packageScripts: asRecord(packageJson.scripts)
  }
  let merged = normalizeSourceGraph(mergeAdapterResults({ base, results: adapterResults, generatedAt: new Date().toISOString() }))
  let sourceInventory = buildSourceInventory({ repoPath: absoluteRepo, packageJson, files: inventory, sourceGraph: merged })
  merged = { ...merged, forms: normalizedCompatibilityForms(merged, sourceInventory) }
  sourceInventory = buildSourceInventory({ repoPath: absoluteRepo, packageJson, files: inventory, sourceGraph: merged })
  const uiIntentGraph = buildUIIntentGraph({ ...merged, sourceInventory }, sourceInventory)
  return { ...merged, sourceInventory, uiIntentGraph }
}

async function readPackageJson(repoPath: string): Promise<Record<string, unknown>> {
  const packagePath = path.join(repoPath, 'package.json')
  return JSON.parse(await readFile(packagePath, 'utf8')) as Record<string, unknown>
}

async function readOptionalPackageJson(repoPath: string): Promise<Record<string, unknown> | undefined> {
  try {
    return await readPackageJson(repoPath)
  } catch {
    return undefined
  }
}

async function listSourceFiles(repoPath: string, options: SourceDiscoveryOptions, scopeModel: SourceScopeModel): Promise<string[]> {
  const out: string[] = []
  const excluded = new Set(scopeModel.summary.excludedPaths)

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir)) {
      if (ignoredDirs.has(entry)) continue
      const full = path.join(dir, entry)
      const relative = path.relative(repoPath, full).split(path.sep).join('/')
      if (excluded.has(relative) || [...excluded].some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`))) continue
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
  return /(^|\/)(tests?|__tests__)\/|\.test\.|\.spec\.|(?:^|\/)testSetup\.(?:ts|tsx|js|jsx)$/i.test(normalized)
}

function isConfigSourceFile(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join('/')
  return /(?:^|\/)(?:vite|vitest|webpack|rollup|playwright|jest|eslint|prettier|tsconfig|tailwind|postcss)\.config\.(?:ts|tsx|js|mjs|cjs)$/.test(normalized) ||
    /(?:^|\/)(?:tsconfig|package-lock|pnpm-lock|yarn.lock|package)\.json$/.test(normalized)
}

interface SourceScopeModel {
  primaryPackageJson?: Record<string, unknown>
  summary: SourceScopeSummary
}

async function buildSourceScopeModel(repoPath: string, rootPackageJson: Record<string, unknown>, options: SourceDiscoveryOptions): Promise<SourceScopeModel> {
  const candidateRoots = await discoverNestedPackageRoots(repoPath)
  const rootDeps = dependenciesOf(rootPackageJson)
  const rootFramework = detectFramework(rootDeps, [])
  const rootBuildTool = detectBuildTool(rootDeps, rootPackageJson)
  const uiCandidates = candidateRoots
    .filter((candidate) => candidate.path !== '.')
    .filter((candidate) => candidate.framework !== 'unknown' || candidate.buildTool !== 'unknown' || /(^|\/)(ui|web|app|client|frontend)$/.test(candidate.path))
    .sort((a, b) => scoreUiRoot(b) - scoreUiRoot(a))
  const primaryRoot = uiCandidates[0] ?? {
    path: '.',
    packageJson: rootPackageJson,
    framework: rootFramework,
    buildTool: rootBuildTool,
    packageName: typeof rootPackageJson.name === 'string' ? rootPackageJson.name : undefined,
    reason: 'root package'
  }
  const excludedPaths = [
    'reports',
    'node_modules',
    'dist',
    'coverage',
    'playwright-report'
  ]
  if (!options.includeFixtures) excludedPaths.push('fixtures')
  if (!options.includeTestSources) excludedPaths.push('tests', '__tests__')
  const summary: SourceScopeSummary = {
    primaryUiRoots: [{
      path: primaryRoot.path,
      scope: 'primary_ui_source',
      reason: primaryRoot.reason,
      framework: primaryRoot.framework,
      buildTool: primaryRoot.buildTool,
      packageName: primaryRoot.packageName
    }],
    supportRoots: [
      rootExists(repoPath, 'server') ? { path: 'server', scope: 'api_server_support', reason: 'server support directory' } : undefined,
      rootExists(repoPath, 'src') && primaryRoot.path !== '.' && primaryRoot.path !== 'src' ? { path: 'src', scope: 'agent_engine', reason: 'engine source directory' } : undefined
    ].filter(Boolean) as SourceScopeRoot[],
    fixtureRoots: [
      rootExists(repoPath, 'fixtures') ? { path: 'fixtures', scope: 'fixture', reason: 'fixture directory' } : undefined
    ].filter(Boolean) as SourceScopeRoot[],
    excludedPaths,
    scannedFileCountsByScope: emptyScopeCounts(),
    rootFramework,
    rootBuildTool,
    uiFramework: primaryRoot.framework,
    uiBuildTool: primaryRoot.buildTool
  }
  return { primaryPackageJson: primaryRoot.packageJson, summary }
}

async function discoverNestedPackageRoots(repoPath: string): Promise<Array<{ path: string; packageJson: Record<string, unknown>; framework: string; buildTool: string; packageName?: string; reason: string }>> {
  const roots: Array<{ path: string; packageJson: Record<string, unknown>; framework: string; buildTool: string; packageName?: string; reason: string }> = []
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 3) return
    for (const entry of await readdir(dir)) {
      if (ignoredDirs.has(entry) || entry === 'reports' || entry === 'fixtures' || entry === 'tests' || entry === '__tests__') continue
      const full = path.join(dir, entry)
      const info = await stat(full)
      if (!info.isDirectory()) continue
      const packageJson = await readOptionalPackageJson(full)
      if (packageJson) {
        const deps = dependenciesOf(packageJson)
        roots.push({
          path: path.relative(repoPath, full).split(path.sep).join('/') || '.',
          packageJson,
          framework: detectFramework(deps, []),
          buildTool: detectBuildTool(deps, packageJson),
          packageName: typeof packageJson.name === 'string' ? packageJson.name : undefined,
          reason: 'nested package.json'
        })
        continue
      }
      await walk(full, depth + 1)
    }
  }
  await walk(repoPath, 0)
  return roots
}

function dependenciesOf(packageJson: Record<string, unknown>): Record<string, string> {
  return {
    ...asRecord(packageJson.dependencies),
    ...asRecord(packageJson.devDependencies)
  }
}

function scoreUiRoot(candidate: { path: string; framework: string; buildTool: string; packageName?: string }): number {
  let score = 0
  if (candidate.framework !== 'unknown') score += 20
  if (candidate.buildTool !== 'unknown') score += 10
  if (/^ui$|\/ui$/.test(candidate.path)) score += 30
  if (/^web$|\/web$/.test(candidate.path)) score += 22
  if (/client|frontend|dashboard/i.test(`${candidate.path} ${candidate.packageName ?? ''}`)) score += 12
  if (/fixture|demo|sample/i.test(candidate.path)) score -= 40
  return score
}

function rootExists(repoPath: string, relative: string): boolean {
  try {
    const resolved = path.resolve(repoPath, relative)
    return resolved.startsWith(repoPath) && existsSync(resolved)
  } catch {
    return false
  }
}

function scopeForPath(relativePath: string, summary: SourceScopeSummary): SourceScope {
  const normalized = relativePath.split(path.sep).join('/')
  if (isConfigSourceFile(normalized)) return 'config'
  if (isTestSourceFile(normalized)) return 'test'
  if (/^(?:fixtures?|examples?|samples?)(?:\/|$)/i.test(normalized)) return 'fixture'
  if (/^(?:reports|node_modules|dist|coverage|playwright-report)(?:\/|$)/i.test(normalized)) return 'config'
  if (summary.primaryUiRoots.some((root) => pathInRoot(normalized, root.path))) return 'primary_ui_source'
  if (/^server(?:\/|$)/.test(normalized)) return 'api_server_support'
  if (/^src(?:\/|$)/.test(normalized)) return 'agent_engine'
  if (/^(?:package\.json|tsconfig|vite\.config|playwright\.config|vitest\.config|README|AGENTS)/i.test(normalized)) return 'config'
  return 'unknown'
}

function pathInRoot(relativePath: string, root: string): boolean {
  if (root === '.' || root === '') return true
  return relativePath === root || relativePath.startsWith(`${root}/`)
}

function emptyScopeCounts(): Record<SourceScope, number> {
  return {
    primary_ui_source: 0,
    api_server_support: 0,
    agent_engine: 0,
    fixture: 0,
    test: 0,
    config: 0,
    unknown: 0
  }
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

function discoverRoutes(repoPath: string, files: readonly (readonly [string, string])[], scopeSummary?: SourceScopeSummary): SourceRoute[] {
  const routes = new Map<string, SourceRoute>()

  for (const [file, content] of files) {
    const relative = path.relative(repoPath, file)
    const normalized = relative.split(path.sep).join('/')

    const nextRoute = nextFilesystemRoute(normalized)
    const sourceScope = scopeSummary ? scopeForPath(normalized, scopeSummary) : undefined
    if (nextRoute) routes.set(`${nextRoute}:${file}`, { path: nextRoute, file: relative, source: 'filesystem', sourceScope })

    const pageRoute = pageFilesystemRoute(normalized)
    if (pageRoute) routes.set(`${pageRoute}:${file}`, { path: pageRoute, file: relative, source: 'filesystem', sourceScope })

    for (const route of regexMatches(content, /path=["']([^"']+)["']/g)) {
      routes.set(`${route}:${file}`, { path: route, file: relative, source: 'router', sourceScope })
    }
    for (const route of regexMatches(content, /(?:href|to|routerLink)=["'](\/[^"']*)["']/g)) {
      routes.set(`${route}:${file}`, { path: route, file: relative, source: 'link', sourceScope })
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

function discoverForms(repoPath: string, files: readonly (readonly [string, string])[], scopeSummary?: SourceScopeSummary): SourceForm[] {
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
        sourceScope: scopeSummary ? scopeForPath(path.relative(repoPath, file).split(path.sep).join('/'), scopeSummary) : undefined,
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
  if (isConfigSourceFile(normalized) || isTestSourceFile(normalized)) return false
  return /\/(pages|app)\//.test(normalized) || /(?:Page|Screen|Route)\.(tsx|jsx|vue|svelte)$/.test(file)
}

function isLikelyComponent(file: string): boolean {
  const normalized = file.split(path.sep).join('/')
  if (isConfigSourceFile(normalized) || isTestSourceFile(normalized)) return false
  return /\/components\//.test(normalized) || /\.component\.(ts|html)$/.test(normalized) || /[A-Z][A-Za-z0-9]+\.(tsx|jsx|vue|svelte)$/.test(path.basename(file))
}

function summarizeFile(repoPath: string, file: string, scopeSummary?: SourceScopeSummary): SourceFileSummary {
  const relative = path.relative(repoPath, file)
  return {
    file: relative,
    name: path.basename(file, path.extname(file)),
    sourceScope: scopeSummary ? scopeForPath(relative.split(path.sep).join('/'), scopeSummary) : undefined
  }
}

function regexMatches(value: string, regex: RegExp): string[] {
  return [...value.matchAll(regex)].map((match) => match[1]).filter(Boolean)
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))]
}

function discoverSupportCode(repoPath: string, files: SourceFileContent[]): { apiCalls: ApiCall[]; stateActions: StateActionHints[] } {
  const supportFiles = files.filter((file) => file.sourceScope === 'api_server_support' || file.sourceScope === 'agent_engine')
  return {
    apiCalls: supportFiles.flatMap((file) => discoverSupportApiCalls(file)),
    stateActions: supportFiles.flatMap((file) => discoverSupportStateActions(repoPath, file))
  }
}

function discoverSupportApiCalls(file: SourceFileContent): ApiCall[] {
  const endpoints = [
    ...regexMatches(file.content, /(?:fetch|request)\(["'`]([^"'`]*\/api\/[^"'`]+)["'`]/gi),
    ...regexMatches(file.content, /pathname\s*(?:===|==)\s*["'`]([^"'`]*\/api\/[^"'`]+)["'`]/gi),
    ...regexMatches(file.content, /pathname\.startsWith\(["'`]([^"'`]*\/api\/[^"'`]+)["'`]\)/gi)
  ]
  const routeMatches = [
    ...file.content.matchAll(/@(?:router|app)\.(get|post|put|patch|delete)\(["'`]([^"'`]+)["'`]/gi),
    ...file.content.matchAll(/req\.method\s*===\s*["'`](GET|POST|PUT|PATCH|DELETE)["'`]\s*&&\s*parsed\.pathname\s*(?:===|==)\s*["'`]([^"'`]*\/api\/[^"'`]+)["'`]/gi),
    ...file.content.matchAll(/req\.method\s*===\s*["'`](GET|POST|PUT|PATCH|DELETE)["'`]\s*&&\s*parsed\.pathname\.startsWith\(["'`]([^"'`]*\/api\/[^"'`]+)["'`]\)/gi)
  ]
  const calls: ApiCall[] = routeMatches.map((match) => ({
    method: match[1]?.toUpperCase(),
    endpoint: normalizeEndpointReference(match[2]),
    sourceFile: file.relative,
    sourceScope: file.sourceScope,
    discoveredBy: ['source-scope-support'],
    confidence: 0.72,
    evidence: [match[0]]
  }))
  for (const endpoint of endpoints.map(normalizeEndpointReference).filter((endpoint) => /^\/api\/.+/.test(endpoint) && !isApiPrefixReference(endpoint))) {
    if (!calls.some((call) => call.endpoint === endpoint)) {
      calls.push({
        endpoint,
        sourceFile: file.relative,
        sourceScope: file.sourceScope,
        discoveredBy: ['source-scope-support'],
        confidence: 0.55,
        evidence: [endpoint]
      })
    }
  }
  return calls
}

function discoverSupportStateActions(repoPath: string, file: SourceFileContent): StateActionHints[] {
  const handlers = unique([
    ...regexMatches(file.content, /\basync\s+function\s+([A-Za-z0-9_]+)/g),
    ...regexMatches(file.content, /\bfunction\s+([A-Za-z0-9_]+)/g),
    ...regexMatches(file.content, /\bexport\s+function\s+([A-Za-z0-9_]+)/g)
  ]).slice(0, 40)
  if (!handlers.length) return []
  return [{
    file: path.relative(repoPath, file.file),
    sourceScope: file.sourceScope,
    stateVariables: [],
    handlerNames: handlers,
    submitHandlers: [],
    loadingStateVariables: [],
    errorStateVariables: [],
    discoveredBy: ['source-scope-support'],
    confidence: 0.45,
    evidence: handlers.slice(0, 10)
  }]
}

function normalizeSourceGraph(graph: SourceGraph): SourceGraph {
  const withApis = {
    ...graph,
    apiCalls: normalizeApiCalls(graph.apiCalls)
  }
  return isSnifferDashboardSource(withApis)
    ? {
        ...withApis,
        sourceWorkflows: normalizeSnifferDashboardWorkflows(withApis),
        apiCalls: withApis.apiCalls.map((call) => ({ ...call, likelyWorkflow: snifferDashboardWorkflowForApi(call) ?? call.likelyWorkflow }))
      }
    : withApis
}

function normalizeApiCalls(calls: ApiCall[]): ApiCall[] {
  const byKey = new Map<string, ApiCall>()
  for (const call of calls) {
    const endpoint = normalizeEndpointReference(call.endpoint)
    if (isApiPrefixReference(endpoint) || !isConcreteApiEndpoint(endpoint)) continue
    const normalized = { ...call, endpoint }
    const key = `${normalized.sourceFile}:${normalized.functionName ?? ''}:${normalized.method ?? ''}:${normalized.endpoint}`
    if (!byKey.has(key)) byKey.set(key, normalized)
  }
  return [...byKey.values()].sort((a, b) => a.sourceFile.localeCompare(b.sourceFile) || a.endpoint.localeCompare(b.endpoint))
}

function isConcreteApiEndpoint(endpoint: string): boolean {
  if (/^https?:\/\//.test(endpoint)) {
    try {
      return new URL(endpoint).pathname.startsWith('/api/')
    } catch {
      return false
    }
  }
  return endpoint.startsWith('/api/')
}

function normalizedCompatibilityForms(graph: SourceGraph, inventory: SourceInventory): SourceForm[] {
  const controlsByFile = new Map<string, EvidenceFact[]>()
  for (const fact of inventory.facts) {
    if (fact.kind !== 'form_control' || !fact.filePath || !isSemanticUiScope(fact.sourceScope, graph)) continue
    const controls = controlsByFile.get(fact.filePath) ?? []
    controls.push(fact)
    controlsByFile.set(fact.filePath, controls)
  }
  return graph.forms.map((form) => {
    const normalizedInputs = unique((controlsByFile.get(form.file) ?? [])
      .map((fact) => fact.label ?? fact.value)
      .filter((value) => value && !rawJsxFragment(value)))
    return {
      ...form,
      inputs: normalizedInputs.length ? normalizedInputs : unique(form.inputs.map(cleanInputLabel).filter(Boolean))
    }
  })
}

function isSemanticUiScope(sourceScope: SourceScope | undefined, graph: SourceGraph): boolean {
  if (!sourceScope) return true
  if (sourceScope === 'primary_ui_source') return true
  return sourceScope === 'fixture' && !(graph.sourceScopeSummary?.excludedPaths ?? []).includes('fixtures')
}

function cleanInputLabel(value: string): string {
  return value
    .replace(/\{[\s\S]*?\}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+on[A-Z]\w+\([^)]*\).*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function rawJsxFragment(value: string): boolean {
  return /event\.target|=>|aria-describedby=|rows=\{|placeholder=|onChange\(/.test(value)
}

function isSnifferDashboardSource(graph: SourceGraph): boolean {
  const text = [
    graph.packageName,
    graph.uiPackageName,
    graph.repoPath,
    ...graph.uiSurfaces.flatMap((surface) => [surface.surface_type, surface.display_name, ...surface.evidence, ...surface.relatedButtons, ...surface.relatedInputs]),
    ...graph.sourceWorkflows.flatMap((workflow) => [workflow.name, ...workflow.evidence, ...workflow.likelyUserActions]),
    ...graph.components.flatMap((component) => [component.file, component.name]),
    ...graph.apiCalls.flatMap((call) => [call.endpoint, call.functionName ?? ''])
  ].join('\n')
  return /sniffer-ui|Sniffer Dashboard|Run Timeline|Crawl Path|Workflow Evidence|Fix Packets|Repair Workbench|Agent Model|Graph Explorer/i.test(text)
}

function normalizeSnifferDashboardWorkflows(graph: SourceGraph): SourceWorkflow[] {
  const mapped = graph.sourceWorkflows.map((workflow) => {
    if (workflow.name === 'Generate plan bundle') return dashboardWorkflow(workflow, 'Run Sniffer audit', ['Configure audit target', 'Run audit', 'Watch run status'])
    if (workflow.name === 'View plan bundle tabs') return dashboardWorkflow(workflow, 'Inspect report sections', ['Open report section navigation', 'Inspect timeline, scenarios, crawl path, issues, and evidence'])
    if (workflow.name === 'Copy handoff prompt') return dashboardWorkflow(workflow, 'Copy repair/fix prompts', ['Open Issues or Fix Packets', 'Copy repair prompt'])
    if (workflow.name === 'Inspect raw JSON') return dashboardWorkflow(workflow, 'Inspect raw report payload', ['Open Raw JSON', 'Inspect raw report payload', 'Copy JSON'])
    if (workflow.name === 'Browse/reopen previous plan runs') return dashboardWorkflow(workflow, 'Inspect previous audit reports', ['Open latest report', 'Review run metadata', 'Navigate report evidence'])
    return workflow
  })

  const text = [
    ...graph.uiSurfaces.flatMap((surface) => [surface.display_name, surface.surface_type, ...surface.evidence, ...surface.relatedButtons]),
    ...graph.sourceWorkflows.flatMap((workflow) => [workflow.name, ...workflow.evidence, ...workflow.likelyUserActions]),
    ...graph.forms.flatMap((form) => [form.name, ...form.inputs]),
    ...graph.stateActions.flatMap((state) => [...state.handlerNames, ...state.submitHandlers]),
    ...graph.apiCalls.flatMap((call) => [call.endpoint, call.functionName ?? ''])
  ].join('\n')
  return dedupeWorkflows([
    ...mapped,
    dashboardWorkflowFromEvidence('Run Sniffer audit', text, /run audit|\/api\/audits|startAudit|audit launcher/i, ['Configure audit target', 'Run audit', 'Watch run status']),
    dashboardWorkflowFromEvidence('Inspect report sections', text, /run timeline|crawl path|workflow evidence|issues|screenshots|graph explorer|reports\/latest/i, ['Open report section navigation', 'Inspect timeline, scenarios, crawl path, issues, and evidence']),
    dashboardWorkflowFromEvidence('Inspect raw report payload', text, /raw json|raw report|json view/i, ['Open Raw JSON', 'Inspect raw report payload', 'Copy JSON']),
    dashboardWorkflowFromEvidence('Copy repair/fix prompts', text, /copy (?:fix|repair|prompt)|clipboard|copy prompt/i, ['Open Issues or Fix Packets', 'Copy repair prompt']),
    dashboardWorkflowFromEvidence('Inspect fix packets', text, /fix packets|fix-packets|repair packet/i, ['Open Fix Packets', 'Inspect packet details', 'Copy prompt']),
    dashboardWorkflowFromEvidence('Use repair workbench', text, /repair workbench|\/api\/repairs|startRepair|repair-proof/i, ['Open Repair Workbench', 'Select issue', 'Run manual proof or Codex repair']),
    dashboardWorkflowFromEvidence('Review agent model', text, /agent model|source[- ]inventory|ui[- ]intent[- ]graph|evidence[- ]packet|graph[- ]refinement/i, ['Open Agent Model', 'Review source facts, UI intent graph, LLM refinements, and suppressions'])
  ].filter(Boolean) as SourceWorkflow[])
}

function dashboardWorkflow(workflow: SourceWorkflow, name: string, actions: string[]): SourceWorkflow {
  return {
    ...workflow,
    name,
    likelyUserActions: actions,
    evidence: workflow.evidence.map((item) => item
      .replace(/plan bundle/gi, 'report')
      .replace(/handoff prompt/gi, 'repair prompt')
      .replace(/handoff/gi, 'fix packet')
      .replace(/Plan Bundle/g, 'Report'))
  }
}

function dashboardWorkflowFromEvidence(name: string, text: string, matcher: RegExp, actions: string[]): SourceWorkflow | undefined {
  if (!matcher.test(text)) return undefined
  return {
    name,
    sourceFiles: ['ui/src/App.tsx'],
    evidence: (text.match(matcher)?.slice(0, 1) ?? [name]).map((item) => `${item}`),
    likelyUserActions: actions,
    confidence: 0.7,
    sourceScope: 'primary_ui_source',
    discoveredBy: ['source-normalizer'],
    framework: 'react'
  }
}

function dedupeWorkflows(workflows: SourceWorkflow[]): SourceWorkflow[] {
  const byName = new Map<string, SourceWorkflow>()
  for (const workflow of workflows) {
    const existing = byName.get(workflow.name)
    if (!existing) {
      byName.set(workflow.name, workflow)
      continue
    }
    byName.set(workflow.name, {
      ...existing,
      sourceFiles: unique([...existing.sourceFiles, ...workflow.sourceFiles]).sort(),
      evidence: unique([...existing.evidence, ...workflow.evidence]).slice(0, 20),
      likelyUserActions: unique([...existing.likelyUserActions, ...workflow.likelyUserActions]).slice(0, 16),
      confidence: Math.max(existing.confidence, workflow.confidence),
      discoveredBy: unique([...(existing.discoveredBy ?? []), ...(workflow.discoveredBy ?? [])]),
      sourceScope: existing.sourceScope ?? workflow.sourceScope
    })
  }
  return [...byName.values()]
}

function snifferDashboardWorkflowForApi(call: ApiCall): string | undefined {
  const text = `${call.endpoint} ${call.functionName ?? ''}`.toLowerCase()
  if (/\/api\/repairs|repair/.test(text)) return 'Use repair workbench'
  if (/fix-packets|generate-fixes/.test(text)) return 'Inspect fix packets'
  if (/source-inventory|ui-intent-graph|graph-refinements|evidence-packets|suppressions|evidence-retrieval/.test(text)) return 'Review agent model'
  if (/screenshots|artifacts/.test(text)) return 'Inspect report evidence'
  if (/reports\/latest|markdown|issues/.test(text)) return 'Inspect report sections'
  if (/audits/.test(text)) return 'Run Sniffer audit'
  return undefined
}

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => typeof entry === 'string')
      .map(([key, entry]) => [key, entry as string])
  )
}
