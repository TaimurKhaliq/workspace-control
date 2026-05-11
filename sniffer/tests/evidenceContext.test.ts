import { describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { discoverSource } from '../src/discovery/sourceDiscovery.js'
import { retrieveEvidence } from '../src/evidence/retrieval.js'
import { runProductExperienceCritic } from '../src/critic/productExperienceCritic.js'
import { generateFixPackets } from '../src/repair/fixPackets.js'
import { renderMarkdown } from '../src/reporting/reportWriter.js'
import type { CrawlGraph, ProductExperienceContext, ProductExperienceDecision, SnifferReport, SourceGraph } from '../src/types.js'
import type { LlmProvider } from '../src/llm/provider.js'

describe('agent context evidence layers', () => {
  it('stores deterministic SourceInventory facts with provenance', async () => {
    const graph = await discoverSource(await planRunRepo())

    expect(graph.sourceInventory?.facts.some((fact) =>
      fact.kind === 'api_call' &&
      fact.value.includes('/api/workspaces/${workspaceId}/plan-runs') &&
      fact.filePath === 'src/api.ts' &&
      fact.extractionMethod === 'deterministic'
    )).toBe(true)
    expect(graph.sourceInventory?.provenance.some((fact) => fact.filePath === 'src/App.tsx')).toBe(true)
  })

  it('creates UIIntentGraph workflows and inferences from source facts', async () => {
    const graph = await discoverSource(await planRunRepo())

    expect(graph.uiIntentGraph?.surfaces.some((node) => node.label.includes('Plan Runs'))).toBe(true)
    expect(graph.uiIntentGraph?.workflows.some((node) => /plan runs/i.test(node.label))).toBe(true)
    expect(graph.uiIntentGraph?.inferences.some((inference) =>
      /plan runs/i.test(inference.claim) &&
      inference.basedOn.length > 0
    )).toBe(true)
  })

  it('retrieves plan-run workflow evidence from a semantic query', async () => {
    const graph = await discoverSource(await planRunRepo())
    const packet = retrieveEvidence('reopen previous plan run', {
      sourceGraph: graph,
      workflowName: 'Browse/reopen previous plan runs',
      maxResults: 8
    })

    expect(packet.retrievedDocuments.some((doc) => /reopen|plan runs|plan-runs/i.test(doc.text))).toBe(true)
    expect(packet.graphNodes.some((node) => /plan runs|reopen/i.test(node.label))).toBe(true)
    expect(packet.confidenceSummary.sourceFactCount).toBeGreaterThan(0)
  })

  it('filters retrieval by screen and workflow', async () => {
    const graph = await discoverSource(await planRunRepo())
    const packet = retrieveEvidence('list history', {
      sourceGraph: graph,
      screenName: 'Plan Runs',
      workflowName: 'Browse/reopen previous plan runs',
      kinds: ['workflow', 'surface'],
      maxResults: 5
    })

    expect(packet.retrievedDocuments.length).toBeGreaterThan(0)
    expect(packet.retrievedDocuments.every((doc) => ['workflow', 'surface'].includes(doc.kind))).toBe(true)
  })

  it('passes retrieved evidence into Product Experience Critic contexts', async () => {
    const graph = await discoverSource(await planRunRepo())
    const result = await runProductExperienceCritic({
      mode: 'deterministic',
      sourceGraph: graph,
      crawlGraph: crawlGraph(),
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    const planRuns = result.contexts.find((context) => context.current_screen_name === 'Plan Runs')
    expect(planRuns?.evidence_packet?.retrievedDocuments.length).toBeGreaterThan(0)
    expect(planRuns?.evidence_retrieval_summary?.retrievedDocumentCount).toBeGreaterThan(0)
  })

  it('includes retrieved evidence in generated fix packets', async () => {
    const dir = await tempDir()
    const graph = await discoverSource(await planRunRepo())
    const reportPath = path.join(dir, 'latest_report.json')
    await writeFile(reportPath, JSON.stringify(report(graph), null, 2))

    const packets = await generateFixPackets(reportPath)

    expect(packets[0].evidence_packet?.retrievedDocuments.length).toBeGreaterThan(0)
    expect(packets[0].prompt).toContain('Retrieved evidence packet')
  })

  it('suppresses missing-control findings when retrieved evidence contradicts them', async () => {
    const graph = await discoverSource(await rawJsonRepo())
    const provider: LlmProvider = {
      name: 'test-provider',
      isConfigured: () => true,
      metadata: () => ({ name: 'test-provider', realProvider: true, visionSupported: false }),
      async inferIntent() {
        throw new Error('not used')
      },
      async critiqueProductExperience(context: ProductExperienceContext): Promise<ProductExperienceDecision> {
        return {
          screen_name: context.current_screen_name,
          nav_label: context.nav_label_clicked,
          workflow_intent: context.workflow_intent,
          llm_used: true,
          real_llm_used: true,
          llm_request_status: 'success',
          vision_used: false,
          scenario_screenshot_used: context.scenario_screenshot_used,
          context_sufficiency: context.context_sufficiency,
          context_sufficiency_score: context.context_sufficiency_score,
          context_warnings: context.context_warnings,
          overall: { classification: 'major_gap', confidence: 'high', summary: 'Raw JSON lacks copy.' },
          findings: [{
            title: 'Missing copy action control for Raw JSON screen',
            type: 'actionability_gap',
            severity: 'medium',
            rubric_ids: ['actionability'],
            expected: 'Raw JSON should have a Copy JSON button.',
            observed: 'No copy control was visible.',
            evidence: ['missing Copy JSON'],
            why_it_matters: 'Users need to copy raw report data.',
            suggested_fix: 'Add Copy JSON.',
            should_report: true
          }],
          non_issues: []
        }
      }
    }

    const result = await runProductExperienceCritic({
      mode: 'llm',
      provider,
      sourceGraph: graph,
      crawlGraph: {
        ...crawlGraph(['Raw JSON Latest report payload Copy JSON']),
        states: [{
          url: 'http://localhost/#raw-json',
          title: 'Sniffer',
          hash: 'raw',
          hashRoute: '#raw-json',
          inferredScreenName: 'Raw JSON',
          primaryVisibleText: ['Raw JSON', 'Latest report payload', 'Copy JSON'],
          visible: [{ kind: 'button', text: 'Copy JSON' }]
        }]
      },
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    expect(result.issues.some((issue) => /Missing copy action/.test(issue.title))).toBe(false)
    expect(result.decisions.some((decision) => decision.non_issues.some((item) => item.reason_not_reported.includes('candidate suppressed due to contradictory runtime evidence')))).toBe(true)
  })
})

describe('Source Inventory normalization quality', () => {
  it('extracts a clean JSX input label and handler from onChange', async () => {
    const graph = await discoverSource(await sourceInventoryQualityRepo())
    const control = graph.sourceInventory?.facts.find((fact) =>
      fact.kind === 'form_control' &&
      fact.label === 'Workspace name'
    )

    expect(control).toMatchObject({
      controlType: 'input',
      handler: 'onNameChange',
      testId: 'workspace-name-input',
      extractionMethod: 'deterministic'
    })
    expect(control?.value).toBe('Workspace name')
    expect(control?.value).not.toContain('event.target')
  })

  it('extracts textarea label, control type, handler, and aria-describedby', async () => {
    const graph = await discoverSource(await sourceInventoryQualityRepo())
    const control = graph.sourceInventory?.facts.find((fact) =>
      fact.kind === 'form_control' &&
      fact.label === 'Feature request'
    )

    expect(control).toMatchObject({
      controlType: 'textarea',
      handler: 'onPromptChange',
      ariaDescribedBy: 'feature-help'
    })
    expect(control?.value).toBe('Feature request')
    expect(control?.value).not.toContain('rows={3}')
  })

  it('extracts select label, control type, handler, and options', async () => {
    const graph = await discoverSource(await sourceInventoryQualityRepo())
    const control = graph.sourceInventory?.facts.find((fact) =>
      fact.kind === 'form_control' &&
      fact.label === 'Source type'
    )

    expect(control).toMatchObject({
      controlType: 'select',
      handler: 'onSourceTypeChange',
      options: ['Local path', 'GitHub URL']
    })
  })

  it('extracts buttons as action controls with labels and handlers', async () => {
    const graph = await discoverSource(await sourceInventoryQualityRepo())
    const action = graph.sourceInventory?.facts.find((fact) =>
      fact.kind === 'action_control' &&
      fact.label === 'Generate Plan Bundle'
    )

    expect(action).toMatchObject({
      controlType: 'button',
      handler: 'onGeneratePlan',
      safeActionHint: true
    })
  })

  it('classifies static module scripts separately from API calls', async () => {
    const graph = await discoverSource(await sourceInventoryQualityRepo())
    const facts = graph.sourceInventory?.facts ?? []

    expect(facts.some((fact) => fact.kind === 'static_asset_reference' && fact.value === '/src/main.tsx')).toBe(true)
    expect(facts.some((fact) => fact.kind === 'api_call' && fact.value.includes('/src/main.tsx'))).toBe(false)
    expect(facts.some((fact) => fact.kind === 'api_call' && fact.value.includes('/api/workspaces'))).toBe(true)
  })

  it('connects UI Intent Graph controls to evidence fact ids', async () => {
    const graph = await discoverSource(await sourceInventoryQualityRepo())
    const evidenceIds = new Set((graph.sourceInventory?.facts ?? []).map((fact) => fact.id))
    const control = graph.uiIntentGraph?.controls.find((node) => node.label === 'Workspace name')

    expect(control?.evidenceIds.length).toBeGreaterThan(0)
    expect(control?.evidenceIds.every((id) => evidenceIds.has(id))).toBe(true)
  })

  it('renders a compact inventory summary without raw JSX fragments', async () => {
    const graph = await discoverSource(await sourceInventoryQualityRepo())
    const markdown = renderMarkdown(report(graph))

    expect(markdown).toContain('## Source Inventory Summary')
    expect(markdown).toContain('## UI Intent Graph Summary')
    expect(markdown).toContain('Evidence coverage:')
    expect(markdown).not.toContain('Workspace name onNameChange(event.target.value)} autoFocus')
    expect(markdown).not.toContain('Feature request onPromptChange(event.target.value)} rows={3}')
  })
})

async function planRunRepo(): Promise<string> {
  const repo = await tempDir()
  await writeFile(path.join(repo, 'package.json'), JSON.stringify({
    name: 'plan-run-ui',
    scripts: { dev: 'vite' },
    dependencies: { react: '^18.0.0', vite: '^5.0.0' }
  }))
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
            <span data-testid="plan-run-target">petclinic-react</span>
            <span data-testid="plan-run-created-at">May 9</span>
            <span data-testid="plan-run-status">completed</span>
            <button data-testid="reopen-plan-run-button" onClick={onReopenPlanRun}>Reopen</button>
          </article>
        </section>
      </main>
    }
  `)
  return repo
}

async function rawJsonRepo(): Promise<string> {
  const repo = await tempDir()
  await writeFile(path.join(repo, 'package.json'), JSON.stringify({
    name: 'raw-json-ui',
    scripts: { dev: 'vite' },
    dependencies: { react: '^18.0.0', vite: '^5.0.0' }
  }))
  await mkdir(path.join(repo, 'src'), { recursive: true })
  await writeFile(path.join(repo, 'src', 'App.tsx'), `
    export function App() {
      return <main><button>Raw JSON</button><section><h1>Raw JSON</h1><button>Copy JSON</button><pre>{"ok":true}</pre></section></main>
    }
  `)
  return repo
}

async function sourceInventoryQualityRepo(): Promise<string> {
  const repo = await tempDir()
  await writeFile(path.join(repo, 'package.json'), JSON.stringify({
    name: 'source-inventory-quality',
    scripts: { dev: 'vite' },
    dependencies: { react: '^18.0.0', vite: '^5.0.0' }
  }))
  await writeFile(path.join(repo, 'index.html'), '<div id="root"></div><script type="module" src="/src/main.tsx"></script>')
  await mkdir(path.join(repo, 'src'), { recursive: true })
  await writeFile(path.join(repo, 'src', 'api.ts'), `
    export function listWorkspaces() {
      return fetch('/api/workspaces')
    }
  `)
  await writeFile(path.join(repo, 'src', 'App.tsx'), `
    export function App() {
      function onNameChange(value: string) {}
      function onPromptChange(value: string) {}
      function onSourceTypeChange(value: string) {}
      function onGeneratePlan() {}
      return <main>
        <label>
          Workspace name
          <input data-testid="workspace-name-input" onChange={(event) => onNameChange(event.target.value)} autoFocus />
        </label>
        <label htmlFor="feature-request">Feature request</label>
        <textarea id="feature-request" aria-describedby="feature-help" onChange={(event) => onPromptChange(event.target.value)} rows={3} />
        <label>
          Source type
          <select onChange={(event) => onSourceTypeChange(event.target.value)}>
            <option>Local path</option>
            <option>GitHub URL</option>
          </select>
        </label>
        <button onClick={onGeneratePlan}>Generate Plan Bundle</button>
      </main>
    }
  `)
  return repo
}

function crawlGraph(text: string[] = ['Plan Runs', 'Add OwnersPage', 'Reopen']): CrawlGraph {
  return {
    startUrl: 'http://localhost',
    title: 'Demo',
    finalUrl: 'http://localhost/#plan-runs',
    states: [{
      url: 'http://localhost/#plan-runs',
      title: 'Demo',
      hash: 'plan-runs',
      hashRoute: '#plan-runs',
      inferredScreenName: 'Plan Runs',
      primaryVisibleText: text,
      visible: [{ kind: 'button', text: 'Reopen' }]
    }],
    actions: [],
    consoleErrors: [],
    networkFailures: [],
    screenshots: [],
    generatedAt: ''
  }
}

function report(sourceGraph: SourceGraph): SnifferReport {
  return {
    sourceGraph,
    sourceInventory: sourceGraph.sourceInventory,
    uiIntentGraph: sourceGraph.uiIntentGraph,
    crawlGraph: crawlGraph(),
    appIntent: { summary: '', likelyWorkflows: [], sourceSignals: [], llmUsed: false },
    runtimeSurfaceMatches: [],
    runtimeWorkflowVerifications: [],
    criticDecisions: [],
    deferredFindings: [],
    blockedChecks: [],
    needsMoreCrawling: [],
    issues: [{
      issue_id: 'reopen-ambiguous',
      severity: 'medium',
      type: 'locator_quality_issue',
      title: 'Repeated Reopen buttons have ambiguous accessible names',
      description: 'Repeated Reopen buttons make plan run history hard to test.',
      evidence: ['button_name: Reopen', 'plan-run-item'],
      suggestedFixPrompt: 'Give each Reopen button a unique accessible name.'
    }],
    generatedAt: ''
  }
}

async function tempDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), `sniffer-evidence-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  return dir
}
