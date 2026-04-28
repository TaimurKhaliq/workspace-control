import { describe, expect, it } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { buildDeterministicProductIntent, buildProductIntentFindings, synthesizeProductIntent } from '../src/heuristics/productIntent.js'
import { MockLlmProvider } from '../src/llm/mockProvider.js'
import { generateFixPackets } from '../src/repair/fixPackets.js'
import type { CrawlGraph, Issue, ProductIntentModel, SnifferReport, SourceGraph } from '../src/types.js'

describe('product intent synthesis', () => {
  it('infers workspace-control product intent from source graph signals', () => {
    const model = buildDeterministicProductIntent({
      sourceGraph: workspaceControlGraph(),
      crawlGraph: crawl(['Workspaces', 'Repositories', 'Plan Runs', 'Generate Plan Bundle']),
      appIntent: { summary: 'React app', likelyWorkflows: [], sourceSignals: [], llmUsed: false }
    })

    expect(model.app_category).toBe('planning_control_panel')
    expect(model.core_entities.map((item) => item.name)).toEqual(expect.arrayContaining([
      'workspace',
      'repo target',
      'feature request',
      'plan run',
      'plan bundle',
      'handoff prompt'
    ]))
    expect(model.primary_user_jobs.map((item) => item.name)).toContain('browse/reopen previous plan runs')
  })

  it('uses the mock LLM product model without external calls', async () => {
    const result = await synthesizeProductIntent({
      sourceGraph: workspaceControlGraph(),
      crawlGraph: crawl(['Plan Runs', 'Generate Plan Bundle']),
      appIntent: { summary: 'React app', likelyWorkflows: [], sourceSignals: [], llmUsed: false },
      runtimeWorkflowVerifications: [],
      appUrl: 'http://127.0.0.1:5173',
      mode: 'llm',
      provider: new MockLlmProvider()
    })

    expect(result.productIntent.llmUsed).toBe(true)
    expect(result.productIntent.product_summary).toContain('Mock LLM product synthesis')
  })

  it('keeps common-pattern-only findings as suggestions', () => {
    const findings = buildProductIntentFindings({
      sourceGraph: unknownGraph(),
      crawlGraph: crawl([]),
      productGoal: undefined
    }, planningModelWithCommonOnly())

    const commonOnly = findings.find((finding) => finding.common_pattern_only)
    expect(commonOnly?.should_report).toBe(false)
  })

  it('reports source-supported plan run evidence as a product-intent gap', async () => {
    const result = await synthesizeProductIntent({
      sourceGraph: workspaceControlGraph(),
      crawlGraph: crawl(['Plan Runs', 'Generate Plan Bundle']),
      appIntent: { summary: 'React app', likelyWorkflows: [], sourceSignals: [], llmUsed: false },
      runtimeWorkflowVerifications: [],
      appUrl: 'http://127.0.0.1:5173',
      mode: 'deterministic'
    })

    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]).toMatchObject({
      type: 'product_intent_gap',
      title: 'Plan run history is not usable for repeated prompt workflows'
    })
  })

  it('does not report plan-run gap when source exposes list, metadata, and reopen controls', async () => {
    const graph = workspaceControlGraph()
    graph.uiSurfaces.push(surface('plan_bundle_view', 'Plan runs history', [
      'PlanRunsPanel',
      'planRuns',
      'plan-runs-list',
      'reopen-plan-run-button',
      'plan-run-prompt',
      'plan-run-target',
      'plan-run-created-at',
      'plan-run-status'
    ]))
    graph.apiCalls.push(
      { method: 'GET', endpoint: '/api/workspaces/${workspaceId}/plan-runs', sourceFile: 'src/api.ts', functionName: 'listPlanRuns', likelyWorkflow: 'Browse plan runs' },
      { method: 'GET', endpoint: '/api/plan-bundles/${runId}', sourceFile: 'src/api.ts', functionName: 'getPlanRun', likelyWorkflow: 'Reopen plan run' }
    )

    const result = await synthesizeProductIntent({
      sourceGraph: graph,
      crawlGraph: crawl(['Plan Runs', 'Generate Plan Bundle']),
      appIntent: { summary: 'React app', likelyWorkflows: [], sourceSignals: [], llmUsed: false },
      runtimeWorkflowVerifications: [],
      appUrl: 'http://127.0.0.1:5173',
      mode: 'deterministic',
      productGoal: 'Users run many feature prompts and browse previous plan runs.'
    })

    const planRunFinding = result.productIntentFindings.find((finding) => finding.finding_id === 'product-intent-plan-run-history')
    expect(planRunFinding?.should_report).toBe(false)
    expect(result.issues.map((issue) => issue.title)).not.toContain('Plan run history is not usable for repeated prompt workflows')
  })

  it('strengthens plan-run gap confidence with user product goal', async () => {
    const result = await synthesizeProductIntent({
      sourceGraph: workspaceControlGraph(),
      crawlGraph: crawl(['Plan Runs', 'Generate Plan Bundle']),
      appIntent: { summary: 'React app', likelyWorkflows: [], sourceSignals: [], llmUsed: false },
      runtimeWorkflowVerifications: [],
      appUrl: 'http://127.0.0.1:5173',
      mode: 'deterministic',
      productGoal: 'Users run many feature prompts and browse previous plan runs.'
    })

    const planRunFinding = result.productIntentFindings.find((finding) => finding.finding_id === 'product-intent-plan-run-history')
    expect(planRunFinding?.confidence).toBe('high')
    expect(planRunFinding?.user_support).toBe(true)
  })

  it('generates a fix packet for a reportable product-intent gap', async () => {
    const dir = path.join(os.tmpdir(), `sniffer-product-intent-${randomUUID()}`)
    await mkdir(dir, { recursive: true })
    const reportPath = path.join(dir, 'latest_report.json')
    const issue: Issue = {
      issue_id: 'product-gap-1',
      severity: 'medium',
      type: 'product_intent_gap',
      title: 'Plan run history is not usable for repeated prompt workflows',
      description: 'Plan Runs exists but no browseable run history was detected.',
      evidence: ['source: Plan Runs', 'source: plan-bundles', 'runtime: Plan Runs'],
      suggestedFixPrompt: 'Improve plan run browsing in the UI.'
    }
    await writeFile(reportPath, JSON.stringify(report([issue]), null, 2))

    const packets = await generateFixPackets(reportPath)

    expect(packets).toHaveLength(1)
    expect(packets[0].title).toBe('Plan run history is not usable for repeated prompt workflows')
    expect(packets[0].prompt).toContain('Improve plan run browsing')
    await expect(readFile(path.join(dir, 'fix_packets', 'product-gap-1.md'), 'utf8')).resolves.toContain('Plan run history')
  })
})

function workspaceControlGraph(): SourceGraph {
  return {
    repoPath: '/tmp/workspace-control/web',
    packageName: 'workspace-control-web',
    framework: 'react',
    buildTool: 'vite',
    routes: [],
    pages: [],
    components: [{ file: 'src/App.tsx', name: 'App' }],
    forms: [],
    uiSurfaces: [
      surface('app_shell', 'App shell', ['StackPilot Control Plane', 'Plan Runs']),
      surface('prompt_composer', 'Prompt composer', ['featureRequest', 'Feature request']),
      surface('plan_bundle_view', 'Plan bundle renderer', ['planBundle', 'Overview', 'Change Set', 'Raw JSON']),
      surface('handoff_prompt_panel', 'Handoff prompt copy area', ['handoff_prompts', 'Copy prompt'])
    ],
    sourceWorkflows: [
      workflow('Create/select workspace', ['Workspace', 'New workspace']),
      workflow('Generate plan bundle', ['generatePlanBundle', 'featureRequest']),
      workflow('View plan bundle tabs', ['Overview', 'Change Set', 'Raw JSON']),
      workflow('Copy handoff prompt', ['handoff_prompts', 'Copy prompt'])
    ],
    apiCalls: [
      { method: 'POST', endpoint: '/api/workspaces/${workspaceId}/plan-bundles', sourceFile: 'src/api.ts', functionName: 'generatePlanBundle', likelyWorkflow: 'Generate plan bundle' }
    ],
    stateActions: [{
      file: 'src/App.tsx',
      stateVariables: ['workspaceName', 'selectedTargetId', 'featureRequest', 'planBundle', 'runId'],
      handlerNames: ['onGeneratePlan'],
      submitHandlers: ['onGeneratePlan'],
      loadingStateVariables: ['busy'],
      errorStateVariables: ['error']
    }],
    packageScripts: {},
    generatedAt: ''
  }
}

function unknownGraph(): SourceGraph {
  return {
    ...workspaceControlGraph(),
    uiSurfaces: [],
    sourceWorkflows: [],
    apiCalls: [],
    stateActions: [],
    packageName: 'unknown'
  }
}

function crawl(labels: string[]): CrawlGraph {
  return {
    startUrl: 'http://127.0.0.1:5173',
    title: 'StackPilot',
    finalUrl: 'http://127.0.0.1:5173',
    states: [{
      url: 'http://127.0.0.1:5173',
      title: 'StackPilot',
      hash: 'state',
      visible: labels.map((label) => ({ kind: 'button' as const, text: label, name: label }))
    }],
    actions: [],
    consoleErrors: [],
    networkFailures: [],
    screenshots: ['/tmp/screen.png'],
    generatedAt: ''
  }
}

function surface(surface_type: SourceGraph['uiSurfaces'][number]['surface_type'], display_name: string, evidence: string[]): SourceGraph['uiSurfaces'][number] {
  return {
    file: 'src/App.tsx',
    surface_type,
    display_name,
    evidence,
    relatedButtons: [],
    relatedInputs: [],
    confidence: 0.9
  }
}

function workflow(name: string, evidence: string[]): SourceGraph['sourceWorkflows'][number] {
  return {
    name,
    sourceFiles: ['src/App.tsx', 'src/api.ts'],
    evidence,
    likelyUserActions: [],
    confidence: 0.9
  }
}

function planningModelWithCommonOnly(): ProductIntentModel {
  return {
    app_category: 'planning_control_panel',
    product_summary: 'Planning tool.',
    primary_user_jobs: [],
    core_entities: [],
    expected_workflows: [],
    expected_navigation_model: [],
    expected_persistence_model: [],
    expected_output_review_model: [],
    confidence: 'low',
    evidence: [],
    assumptions: [],
    risks_of_hallucination: ['common patterns are suggestions only']
  }
}

function report(issues: Issue[]): SnifferReport {
  return {
    sourceGraph: workspaceControlGraph(),
    crawlGraph: crawl(['Plan Runs']),
    appIntent: { summary: 'React app', likelyWorkflows: [], sourceSignals: [], llmUsed: false },
    productIntent: planningModelWithCommonOnly(),
    productIntentFindings: [],
    runtimeSurfaceMatches: [],
    runtimeWorkflowVerifications: [],
    criticDecisions: [],
    deferredFindings: [],
    blockedChecks: [],
    needsMoreCrawling: [],
    rawFindings: issues,
    issues,
    generatedAt: ''
  }
}
