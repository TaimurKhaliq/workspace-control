import { describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { discoverSource } from '../src/discovery/sourceDiscovery.js'
import { applyGraphRefinements, runGraphStructureRefiner } from '../src/evidence/graphRefiner.js'
import { buildUIIntentGraph } from '../src/evidence/contextModel.js'
import { renderMarkdown } from '../src/reporting/reportWriter.js'
import type { AppIntent, CrawlGraph, GraphRefinementSuggestion, SnifferReport, SourceGraph, UiSurface } from '../src/types.js'
import type { LlmProvider } from '../src/llm/provider.js'

describe('Graph Structure Critic/refiner', () => {
  it('applies high-confidence static asset reclassification without deleting the raw fact', async () => {
    const graph = await graphWithMisclassifiedAsset()
    const apiFact = graph.sourceInventory?.facts.find((fact) => fact.kind === 'api_call' && fact.value === 'GET /src/main.tsx')
    expect(apiFact).toBeTruthy()

    const result = applyGraphRefinements(graph, [{
      id: 'asset-reclassify',
      type: 'reclassify_fact',
      targetId: apiFact!.id,
      fromValue: 'api_call',
      toValue: 'static_asset_reference',
      reason: 'Module script is not a backend API call.',
      evidenceIds: [apiFact!.id],
      confidence: 'high',
      risk: 'low'
    }])

    const facts = result.sourceGraph.sourceInventory?.facts ?? []
    const original = facts.find((fact) => fact.id === apiFact!.id)
    expect(original?.suppressedFromSemanticGraph).toBe(true)
    expect(facts.some((fact) => fact.kind === 'static_asset_reference' && fact.value === '/src/main.tsx' && fact.refinedFromFactId === apiFact!.id)).toBe(true)
    expect(result.sourceGraph.uiIntentGraph?.apiDataDependencies.some((node) => /src\/main\.tsx/.test(node.label))).toBe(false)
    expect(result.appliedSuggestions).toHaveLength(1)
  })

  it('applies raw JSX control normalization as a refined fact', async () => {
    const graph = await graphWithMisclassifiedAsset()
    const rawFact = graph.sourceInventory!.facts[0]
    graph.sourceInventory!.facts.push({
      ...rawFact,
      id: 'fact-raw-workspace-name',
      kind: 'form_control',
      value: 'Workspace name onNameChange(event.target.value)} autoFocus />',
      source: 'source_inventory',
      filePath: 'src/App.tsx',
      confidence: 0.5,
      extractionMethod: 'deterministic'
    })

    const result = applyGraphRefinements(graph, [{
      id: 'normalize-workspace-name',
      type: 'normalize_control',
      targetId: 'fact-raw-workspace-name',
      fromValue: 'Workspace name onNameChange(event.target.value)} autoFocus />',
      toValue: JSON.stringify({ kind: 'form_control', label: 'Workspace name', controlType: 'input', handler: 'onNameChange' }),
      reason: 'The raw JSX fragment contains a clean label and handler.',
      evidenceIds: ['fact-raw-workspace-name'],
      confidence: 'high',
      risk: 'low'
    }])

    const refined = result.sourceGraph.sourceInventory?.facts.find((fact) => fact.refinedFromFactId === 'fact-raw-workspace-name')
    expect(refined).toMatchObject({
      kind: 'form_control',
      value: 'Workspace name',
      label: 'Workspace name',
      controlType: 'input',
      handler: 'onNameChange',
      extractionMethod: 'llm'
    })
    expect(result.sourceGraph.sourceInventory?.facts.find((fact) => fact.id === 'fact-raw-workspace-name')?.suppressedFromSemanticGraph).toBe(true)
  })

  it('rejects unsupported deletion-like suggestions and keeps facts intact', async () => {
    const graph = await graphWithMisclassifiedAsset()
    const target = graph.sourceInventory!.facts[0]
    const before = graph.sourceInventory!.facts.length

    const result = applyGraphRefinements(graph, [{
      id: 'delete-fact',
      type: 'delete_fact',
      targetId: target.id,
      reason: 'Unsupported destructive operation.',
      evidenceIds: [target.id],
      confidence: 'high',
      risk: 'low'
    } as unknown as GraphRefinementSuggestion])

    expect(result.rejectedSuggestions[0].rejectedReason).toMatch(/Unsupported suggestion type/)
    expect(result.sourceGraph.sourceInventory?.facts.length).toBe(before)
    expect(result.sourceGraph.sourceInventory?.facts.some((fact) => fact.id === target.id)).toBe(true)
  })

  it('rejects low-confidence suggestions', async () => {
    const graph = await graphWithMisclassifiedAsset()
    const target = graph.sourceInventory!.facts[0]

    const result = applyGraphRefinements(graph, [{
      id: 'low-confidence',
      type: 'mark_as_noise',
      targetId: target.id,
      reason: 'Not confident enough.',
      evidenceIds: [target.id],
      confidence: 'medium',
      risk: 'low'
    }])

    expect(result.appliedSuggestions).toHaveLength(0)
    expect(result.rejectedSuggestions[0].rejectedReason).toMatch(/Only high-confidence/)
  })

  it('rejects suggestions with missing targets', async () => {
    const graph = await graphWithMisclassifiedAsset()
    const evidenceId = graph.sourceInventory!.facts[0].id

    const result = applyGraphRefinements(graph, [{
      id: 'missing-target',
      type: 'mark_as_noise',
      targetId: 'missing-node',
      reason: 'Target is not in the graph.',
      evidenceIds: [evidenceId],
      confidence: 'high',
      risk: 'low'
    }])

    expect(result.appliedSuggestions).toHaveLength(0)
    expect(result.rejectedSuggestions[0].rejectedReason).toMatch(/targetId does not exist/)
  })

  it('reclassifies Plan Runs history surface to history_list', async () => {
    const graph = await planRunGraphWithUnknownSurface()
    const surface = graph.uiIntentGraph!.surfaces.find((node) => node.label === 'Plan Runs history')
    expect(surface).toBeTruthy()

    const result = applyGraphRefinements(graph, [{
      id: 'plan-runs-history-list',
      type: 'reclassify_surface',
      targetId: surface!.id,
      fromValue: 'unknown_ui_section',
      toValue: 'history_list',
      reason: 'plan-run-item, onReopenPlanRun, and plan-runs endpoint indicate a history list.',
      evidenceIds: [surface!.evidenceIds[0]],
      confidence: 'high',
      risk: 'low'
    }])

    expect(result.sourceGraph.uiSurfaces.find((item) => item.display_name === 'Plan Runs history')?.surface_type).toBe('history_list')
    expect(result.appliedSuggestions).toHaveLength(1)
  })

  it('runs the LLM graph critic provider and records applied/rejected suggestions', async () => {
    const graph = await graphWithMisclassifiedAsset()
    const apiFact = graph.sourceInventory!.facts.find((fact) => fact.kind === 'api_call' && fact.value === 'GET /src/main.tsx')!
    const provider = providerReturning([{
      id: 'asset-reclassify-provider',
      type: 'reclassify_fact',
      targetId: apiFact.id,
      fromValue: 'api_call',
      toValue: 'static_asset_reference',
      reason: 'Static module path.',
      evidenceIds: [apiFact.id],
      confidence: 'high',
      risk: 'low'
    }, {
      id: 'weak-suggestion',
      type: 'mark_as_noise',
      targetId: apiFact.id,
      reason: 'Weak suggestion.',
      evidenceIds: [apiFact.id],
      confidence: 'low',
      risk: 'low'
    }])

    const result = await runGraphStructureRefiner({ sourceGraph: graph, mode: 'llm', provider })

    expect(result.refinement.llmUsed).toBe(true)
    expect(result.refinement.appliedSuggestions).toHaveLength(1)
    expect(result.refinement.rejectedSuggestions).toHaveLength(1)
  })

  it('renders applied and rejected refinements in the report', async () => {
    const graph = await graphWithMisclassifiedAsset()
    const apiFact = graph.sourceInventory!.facts.find((fact) => fact.kind === 'api_call' && fact.value === 'GET /src/main.tsx')!
    const applied = applyGraphRefinements(graph, [{
      id: 'asset-reclassify-report',
      type: 'reclassify_fact',
      targetId: apiFact.id,
      fromValue: 'api_call',
      toValue: 'static_asset_reference',
      reason: 'Module script is not a backend API.',
      evidenceIds: [apiFact.id],
      confidence: 'high',
      risk: 'low'
    }, {
      id: 'weak-report',
      type: 'mark_as_noise',
      targetId: apiFact.id,
      reason: 'Weak suggestion.',
      evidenceIds: [apiFact.id],
      confidence: 'low',
      risk: 'low'
    }])
    const sourceGraph = {
      ...applied.sourceGraph,
      graphRefinement: {
        mode: 'llm' as const,
        status: 'completed' as const,
        modelReviewed: 'test',
        llmUsed: true,
        provider: 'test-provider',
        model: 'test-model',
        suggestions: [],
        appliedSuggestions: applied.appliedSuggestions,
        rejectedSuggestions: applied.rejectedSuggestions,
        warnings: []
      }
    }

    const markdown = renderMarkdown(report(sourceGraph))
    expect(markdown).toContain('## Graph Structure Critic')
    expect(markdown).toContain('Applied suggestions: 1')
    expect(markdown).toContain('Rejected suggestions: 1')
    expect(markdown).toContain('static_asset_reference')
  })
})

async function graphWithMisclassifiedAsset(): Promise<SourceGraph> {
  const graph = await discoverSource(await sourceRepo())
  const sourceFileFact = graph.sourceInventory!.facts.find((fact) => fact.kind === 'source_file' && fact.filePath === 'index.html')!
  graph.sourceInventory!.facts.push({
    id: 'fact-api-main-tsx',
    kind: 'api_call',
    value: 'GET /src/main.tsx',
    source: 'test',
    filePath: 'index.html',
    confidence: 0.7,
    extractionMethod: 'deterministic'
  })
  graph.sourceInventory!.rawApiCalls.push(graph.sourceInventory!.facts.at(-1)!)
  graph.sourceInventory!.facts.push({
    ...sourceFileFact,
    id: 'fact-surface-plan-runs',
    kind: 'ui_surface_label',
    value: 'Plan Runs history',
    filePath: 'src/App.tsx'
  })
  graph.apiCalls.push({
    method: 'GET',
    endpoint: '/src/main.tsx',
    sourceFile: 'index.html',
    confidence: 0.7,
    evidence: ['script src="/src/main.tsx"']
  })
  graph.uiIntentGraph = buildUIIntentGraph(graph, graph.sourceInventory!)
  return graph
}

async function planRunGraphWithUnknownSurface(): Promise<SourceGraph> {
  const graph = await discoverSource(await sourceRepo())
  const existing = graph.uiSurfaces.find((surface) => surface.display_name === 'Plan Runs history')
  if (existing) {
    existing.surface_type = 'unknown_ui_section'
  } else {
    graph.uiSurfaces.push({
      file: 'src/App.tsx',
      surface_type: 'unknown_ui_section',
      display_name: 'Plan Runs history',
      evidence: ['Plan Runs', 'plan-run-item', 'onReopenPlanRun'],
      relatedButtons: ['Reopen'],
      relatedInputs: [],
      confidence: 0.55,
      discoveredBy: ['test']
    } satisfies UiSurface)
  }
  graph.sourceInventory!.facts.push({
    id: 'fact-plan-runs-history',
    kind: 'ui_surface_label',
    value: 'Plan Runs history',
    source: 'test',
    filePath: 'src/App.tsx',
    confidence: 0.8,
    extractionMethod: 'deterministic'
  })
  graph.uiIntentGraph = buildUIIntentGraph(graph, graph.sourceInventory!)
  return graph
}

function providerReturning(suggestions: GraphRefinementSuggestion[]): LlmProvider {
  return {
    name: 'test-provider',
    isConfigured: () => true,
    metadata: () => ({ name: 'test-provider', model: 'test-model', realProvider: true, visionSupported: false }),
    inferIntent: async (input: { sourceGraph: SourceGraph; deterministicIntent: AppIntent }) => input.deterministicIntent,
    critiqueGraphStructure: async () => ({ suggestions, warnings: ['test warning'] })
  }
}

async function sourceRepo(): Promise<string> {
  const repo = await tempDir()
  await writeFile(path.join(repo, 'package.json'), JSON.stringify({
    name: 'graph-refiner-fixture',
    scripts: { dev: 'vite' },
    dependencies: { react: '^18.0.0', vite: '^5.0.0' }
  }))
  await writeFile(path.join(repo, 'index.html'), '<div id="root"></div><script type="module" src="/src/main.tsx"></script>')
  await mkdir(path.join(repo, 'src'), { recursive: true })
  await writeFile(path.join(repo, 'src', 'api.ts'), `
    export function listPlanRuns(workspaceId: string) {
      return fetch(\`/api/workspaces/\${workspaceId}/plan-runs\`)
    }
  `)
  await writeFile(path.join(repo, 'src', 'App.tsx'), `
    export function App() {
      function onReopenPlanRun() {}
      return <main>
        <h1>Plan Runs</h1>
        <section data-testid="plan-runs-list">
          <article data-testid="plan-run-item">
            <span data-testid="plan-run-prompt">Add OwnersPage</span>
            <button data-testid="reopen-plan-run-button" onClick={onReopenPlanRun}>Reopen</button>
          </article>
        </section>
      </main>
    }
  `)
  return repo
}

function report(sourceGraph: SourceGraph): SnifferReport {
  return {
    sourceGraph,
    sourceInventory: sourceGraph.sourceInventory,
    uiIntentGraph: sourceGraph.uiIntentGraph,
    crawlGraph: crawlGraph(),
    appIntent: { summary: 'Test app', likelyWorkflows: [], sourceSignals: [], llmUsed: false },
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

function crawlGraph(): CrawlGraph {
  return {
    startUrl: 'http://localhost',
    title: 'Demo',
    finalUrl: 'http://localhost',
    states: [],
    actions: [],
    consoleErrors: [],
    networkFailures: [],
    screenshots: [],
    generatedAt: ''
  }
}

async function tempDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), `sniffer-graph-refiner-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  return dir
}
