import type { ApiCall, DiscoveryAdapterSummary, SourceFileSummary, SourceForm, SourceGraph, SourceRoute, SourceWorkflow, StateActionHints, UiSurface } from '../../types.js'
import type { DiscoveryAdapter, DiscoveryContext, FrameworkDiscoveryResult } from './types.js'
import { ReactDiscoveryAdapter } from './reactAdapter.js'
import { AngularDiscoveryAdapter } from './angularAdapter.js'
import { HtmlTemplateDiscoveryAdapter } from './htmlTemplateAdapter.js'

export function discoveryAdapters(): DiscoveryAdapter[] {
  return [
    new ReactDiscoveryAdapter(),
    new AngularDiscoveryAdapter(),
    new HtmlTemplateDiscoveryAdapter()
  ]
}

export function runDiscoveryAdapters(context: DiscoveryContext): FrameworkDiscoveryResult[] {
  const adapters = discoveryAdapters()
  return adapters
    .map((adapter) => ({ adapter, detection: adapter.detect(context) }))
    .filter(({ adapter, detection }) => detection.confidence > 0 || adapter.id === 'html-template')
    .filter(({ detection, adapter }) => adapter.id !== 'html-template' || detection.confidence > 0)
    .map(({ adapter }) => adapter.discover(context))
    .filter((result) => result.confidence > 0)
}

export function mergeAdapterResults(input: {
  base: Omit<SourceGraph, 'generatedAt'>
  results: FrameworkDiscoveryResult[]
  generatedAt: string
}): SourceGraph {
  const adapterSummaries: DiscoveryAdapterSummary[] = input.results.map((result) => ({
    adapterId: result.adapterId,
    framework: result.framework,
    confidence: result.confidence,
    evidence: result.evidence,
    warnings: result.warnings
  }))
  return {
    ...input.base,
    routes: mergeRoutes([...input.base.routes, ...input.results.flatMap((result) => result.routes)]),
    pages: mergeFiles([...input.base.pages, ...input.results.flatMap((result) => result.pages)]),
    components: mergeFiles([...input.base.components, ...input.results.flatMap((result) => result.components)]),
    forms: mergeForms([...input.base.forms, ...input.results.flatMap((result) => result.forms)]),
    uiSurfaces: mergeSurfaces([...input.base.uiSurfaces, ...input.results.flatMap((result) => result.uiSurfaces)]),
    sourceWorkflows: mergeWorkflows([...input.base.sourceWorkflows, ...input.results.flatMap((result) => result.sourceWorkflows)]),
    apiCalls: mergeApiCalls([...input.base.apiCalls, ...input.results.flatMap((result) => result.apiCalls)]),
    stateActions: mergeStateActions([...input.base.stateActions, ...input.results.flatMap((result) => result.stateActions)]),
    discoveryAdapters: adapterSummaries,
    workflowDiscoverySummary: {
      source_workflows_count: mergeWorkflows([...input.base.sourceWorkflows, ...input.results.flatMap((result) => result.sourceWorkflows)]).length
    },
    generatedAt: input.generatedAt
  }
}

function mergeRoutes(items: SourceRoute[]): SourceRoute[] {
  const byKey = new Map<string, SourceRoute>()
  for (const item of items) {
    const key = `${item.path}:${item.file}:${item.source}`
    const existing = byKey.get(key)
    byKey.set(key, existing ? mergeMeta(existing, item) : item)
  }
  return [...byKey.values()].sort((a, b) => a.path.localeCompare(b.path) || a.file.localeCompare(b.file))
}

function mergeFiles(items: SourceFileSummary[]): SourceFileSummary[] {
  const byKey = new Map<string, SourceFileSummary>()
  for (const item of items) {
    const key = `${item.file}:${item.name}`
    const existing = byKey.get(key)
    byKey.set(key, existing ? mergeMeta(existing, item) : item)
  }
  return [...byKey.values()].sort((a, b) => a.file.localeCompare(b.file))
}

function mergeForms(items: SourceForm[]): SourceForm[] {
  const byKey = new Map<string, SourceForm>()
  for (const item of items) {
    const key = `${item.file}:${item.name}`
    const existing = byKey.get(key)
    if (!existing) byKey.set(key, item)
    else byKey.set(key, { ...mergeMeta(existing, item), inputs: unique([...existing.inputs, ...item.inputs]) })
  }
  return [...byKey.values()].sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name))
}

function mergeSurfaces(items: UiSurface[]): UiSurface[] {
  const byKey = new Map<string, UiSurface>()
  for (const item of items.sort((a, b) => b.confidence - a.confidence)) {
    const key = `${item.file}:${item.surface_type}:${item.display_name}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, item)
      continue
    }
    byKey.set(key, {
      ...mergeMeta(existing, item),
      evidence: unique([...existing.evidence, ...item.evidence]).slice(0, 20),
      relatedButtons: unique([...existing.relatedButtons, ...item.relatedButtons]).slice(0, 16),
      relatedInputs: unique([...existing.relatedInputs, ...item.relatedInputs]).slice(0, 16),
      confidence: Math.max(existing.confidence, item.confidence)
    })
  }
  return [...byKey.values()].sort((a, b) => a.file.localeCompare(b.file) || b.confidence - a.confidence)
}

function mergeWorkflows(items: SourceWorkflow[]): SourceWorkflow[] {
  const byKey = new Map<string, SourceWorkflow>()
  for (const item of items.sort((a, b) => b.confidence - a.confidence)) {
    const key = item.name
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, item)
      continue
    }
    byKey.set(key, {
      ...mergeMeta(existing, item),
      sourceFiles: unique([...existing.sourceFiles, ...item.sourceFiles]).sort(),
      evidence: unique([...existing.evidence, ...item.evidence]).slice(0, 20),
      likelyUserActions: unique([...existing.likelyUserActions, ...item.likelyUserActions]).slice(0, 16),
      confidence: Math.max(existing.confidence, item.confidence)
    })
  }
  return [...byKey.values()].sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name))
}

function mergeApiCalls(items: ApiCall[]): ApiCall[] {
  const byKey = new Map<string, ApiCall>()
  for (const item of items) {
    const key = `${item.sourceFile}:${item.functionName ?? ''}:${item.method ?? ''}:${item.endpoint}`
    const existing = byKey.get(key)
    byKey.set(key, existing ? { ...mergeMeta(existing, item), evidence: unique([...(existing.evidence ?? []), ...(item.evidence ?? [])]) } : item)
  }
  return [...byKey.values()].sort((a, b) => a.sourceFile.localeCompare(b.sourceFile) || a.endpoint.localeCompare(b.endpoint))
}

function mergeStateActions(items: StateActionHints[]): StateActionHints[] {
  const byKey = new Map<string, StateActionHints>()
  for (const item of items) {
    const existing = byKey.get(item.file)
    if (!existing) {
      byKey.set(item.file, item)
      continue
    }
    byKey.set(item.file, {
      ...mergeMeta(existing, item),
      stateVariables: unique([...existing.stateVariables, ...item.stateVariables]),
      handlerNames: unique([...existing.handlerNames, ...item.handlerNames]),
      submitHandlers: unique([...existing.submitHandlers, ...item.submitHandlers]),
      loadingStateVariables: unique([...existing.loadingStateVariables, ...item.loadingStateVariables]),
      errorStateVariables: unique([...existing.errorStateVariables, ...item.errorStateVariables]),
      evidence: unique([...(existing.evidence ?? []), ...(item.evidence ?? [])])
    })
  }
  return [...byKey.values()].sort((a, b) =>
    b.stateVariables.length - a.stateVariables.length ||
    b.submitHandlers.length - a.submitHandlers.length ||
    a.file.localeCompare(b.file)
  )
}

function mergeMeta<T extends { discoveredBy?: string[]; evidence?: string[]; confidence?: number; framework?: string; sourceScope?: unknown }>(left: T, right: T): T {
  return {
    ...left,
    discoveredBy: unique([...(left.discoveredBy ?? []), ...(right.discoveredBy ?? [])]),
    evidence: unique([...(left.evidence ?? []), ...(right.evidence ?? [])]),
    confidence: Math.max(left.confidence ?? 0, right.confidence ?? 0) || undefined,
    framework: left.framework === right.framework ? left.framework : left.framework ?? right.framework,
    sourceScope: left.sourceScope ?? right.sourceScope
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))]
}
