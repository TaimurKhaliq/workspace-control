import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FixPacketItem, SnifferReport } from '../src/api'
import { buildSnifferGraph } from '../src/graph/graphBuilder'
import { DiscoveryGraph, filterGraph, GraphNodeDetailPanel } from '../src/components/DiscoveryGraph'

vi.mock('@xyflow/react', () => ({
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  ReactFlow: () => null
}))

afterEach(() => cleanup())

describe('buildSnifferGraph', () => {
  it('creates nodes for UI surfaces', () => {
    const graph = buildSnifferGraph({ report: fixtureReport(), fixPackets: [], screenshots: [] })
    expect(graph.nodes.some((node) => node.type === 'ui_surface' && node.label === 'Prompt composer')).toBe(true)
    expect(graph.nodes.some((node) => node.type === 'source_file' && node.sourceFile === 'src/App.tsx')).toBe(true)
  })

  it('creates workflow/API edges', () => {
    const graph = buildSnifferGraph({ report: fixtureReport(), fixPackets: [], screenshots: [] })
    expect(graph.nodes.some((node) => node.type === 'api_call' && node.label.includes('/api/plan-bundles'))).toBe(true)
    expect(graph.edges.some((edge) => edge.type === 'calls_api' && edge.target.startsWith('api:'))).toBe(true)
  })

  it('creates issue and fix packet nodes', () => {
    const graph = buildSnifferGraph({ report: fixtureReport(), fixPackets: fixturePackets(), screenshots: [] })
    expect(graph.nodes.some((node) => node.type === 'issue' && node.label === 'Generate plan fails')).toBe(true)
    expect(graph.nodes.some((node) => node.type === 'fix_packet' && node.fixPacketIds.includes('issue-1'))).toBe(true)
    expect(graph.edges.some((edge) => edge.type === 'generated_fix_packet')).toBe(true)
  })

  it('connects critic decisions to issues', () => {
    const graph = buildSnifferGraph({ report: fixtureReport(), fixPackets: [], screenshots: [] })
    expect(graph.nodes.some((node) => node.type === 'critic_decision' && node.label === 'real_bug')).toBe(true)
    expect(graph.edges.some((edge) => edge.type === 'classified_by')).toBe(true)
  })

  it('filters by issue severity', () => {
    const graph = buildSnifferGraph({ report: fixtureReport(), fixPackets: [], screenshots: [] })
    const filtered = filterGraph(graph, {
      search: '',
      nodeType: 'issue',
      severity: 'high',
      status: 'all',
      workflow: 'all',
      sourceFile: 'all',
      processedOnly: false
    })
    expect(filtered.nodes).toHaveLength(1)
    expect(filtered.nodes[0].label).toBe('Generate plan fails')
  })

  it('labels runtime state nodes with sequence and inferred screen name', () => {
    const graph = buildSnifferGraph({ report: fixtureReport(), fixPackets: [], screenshots: [] })
    expect(graph.nodes.some((node) => node.type === 'runtime_state' && node.label === '1 · Prompt composer / Plan Runs')).toBe(true)
  })
})

describe('GraphNodeDetailPanel', () => {
  it('renders selected node metadata', () => {
    const graph = buildSnifferGraph({ report: fixtureReport(), fixPackets: [], screenshots: [] })
    const node = graph.nodes.find((item) => item.type === 'ui_surface')!
    render(<GraphNodeDetailPanel node={node} />)
    expect(screen.getByTestId('graph-node-detail-panel')).toBeInTheDocument()
    expect(screen.getByText('Prompt composer')).toBeInTheDocument()
    expect(screen.getByText('src/App.tsx')).toBeInTheDocument()
  })

  it('shows useful runtime state metadata in the node detail panel', () => {
    const graph = buildSnifferGraph({ report: fixtureReport(), fixPackets: [], screenshots: [] })
    const node = graph.nodes.find((item) => item.type === 'runtime_state')!
    render(<GraphNodeDetailPanel node={node} />)
    expect(screen.getByText('Visible controls')).toBeInTheDocument()
    expect(screen.getByText('Prompt composer / Plan Runs')).toBeInTheDocument()
    expect(screen.getAllByText('#prompt').length).toBeGreaterThan(0)
  })

  it('renders screenshot links when present', () => {
    const graph = buildSnifferGraph({
      report: fixtureReport(),
      fixPackets: [],
      screenshots: [{ name: 'state-1.png', group: 'states', relativePath: 'screenshots/state-1.png', url: '/api/reports/latest/artifacts/screenshots%2Fstate-1.png' }]
    })
    const node = graph.nodes.find((item) => item.type === 'screenshot')!
    render(<GraphNodeDetailPanel node={node} />)
    expect(screen.getByRole('img', { name: /screenshot evidence/i })).toHaveAttribute('src', '/api/reports/latest/artifacts/screenshots%2Fstate-1.png')
  })
})

describe('DiscoveryGraph', () => {
  it('defaults to Crawl Path graph mode', () => {
    render(<DiscoveryGraph report={fixtureReport()} fixPackets={[]} screenshots={[]} />)
    expect(screen.getByLabelText('Graph mode')).toHaveValue('crawl')
  })
})

function fixturePackets(): FixPacketItem[] {
  return [{ issueId: 'issue-1', name: 'issue-1.md', relativePath: 'fix_packets/issue-1.md', kind: 'md' }]
}

function fixtureReport(): SnifferReport {
  return {
    generatedAt: '2026-04-28T12:00:00.000Z',
    sourceGraph: {
      repoPath: '/tmp/web',
      framework: 'react',
      buildTool: 'vite',
      uiSurfaces: [{
        file: 'src/App.tsx',
        surface_type: 'prompt_composer',
        display_name: 'Prompt composer',
        evidence: ['Feature request', 'Generate Plan'],
        relatedButtons: ['Generate Plan'],
        relatedInputs: ['Feature request'],
        confidence: 0.9
      }],
      sourceWorkflows: [{
        name: 'Generate plan bundle',
        sourceFiles: ['src/App.tsx'],
        evidence: ['Generate Plan', 'Feature request'],
        likelyUserActions: ['type prompt', 'click generate'],
        confidence: 0.88
      }],
      apiCalls: [{
        method: 'POST',
        endpoint: '/api/plan-bundles',
        sourceFile: 'src/api.ts',
        functionName: 'generatePlanBundle',
        likelyWorkflow: 'Generate plan bundle'
      }],
      stateActions: [{
        file: 'src/App.tsx',
        stateVariables: ['planBundle'],
        handlerNames: ['onGeneratePlan'],
        submitHandlers: ['onGeneratePlan'],
        loadingStateVariables: ['busy'],
        errorStateVariables: ['error']
      }]
    },
    crawlGraph: {
      startUrl: 'http://127.0.0.1:5173',
      finalUrl: 'http://127.0.0.1:5173',
      states: [{
        id: 'state-1',
        sequenceNumber: 1,
        url: 'http://127.0.0.1:5173',
        hashRoute: '#prompt',
        title: 'Demo',
        hash: 'state-a',
        stateHash: 'state-a',
        inferredScreenName: 'Prompt composer / Plan Runs',
        inferredPageType: 'planning',
        screenshotPath: '/tmp/reports/sniffer/latest/screenshots/state-1.png',
        visibleControlSummary: {
          links: { count: 0, topLabels: [] },
          buttons: { count: 1, topLabels: ['Generate Plan'] },
          tabs: { count: 0, topLabels: [] },
          inputs: { count: 0, topLabels: [] },
          forms: { count: 0, topLabels: [] },
          dialogs: { count: 0, topLabels: [] }
        },
        matchedSourceWorkflows: ['Generate plan bundle'],
        matchedUiSurfaces: ['Prompt composer'],
        issuesOnState: ['issue-1'],
        visible: [{ kind: 'button', text: 'Generate Plan' }]
      }],
      actions: [{ id: 'action-1', sequenceNumber: 1, type: 'click', actionType: 'click', label: 'Generate Plan', target: 'button', urlBefore: 'http://127.0.0.1:5173', urlAfter: 'http://127.0.0.1:5173', stateHashBefore: 'state-a', stateHashAfter: 'state-a', changedState: false, safe: true, safeReason: 'button is allowed' }],
      coverage: {
        sourceRoutes: ['#prompt'],
        visitedRoutes: ['#prompt'],
        missedRoutes: [],
        workflowsDiscovered: 1,
        workflowsExercised: 1,
        scenariosPassed: 0,
        scenariosFailed: 1,
        scenariosSkipped: 0,
        safeActionsSkipped: []
      },
      consoleErrors: [],
      networkFailures: [],
      screenshots: ['/tmp/reports/sniffer/latest/screenshots/state-1.png']
    },
    scenarioRuns: [{ name: 'Generate plan bundle', status: 'failed', screenshots: ['/tmp/reports/sniffer/latest/screenshots/scenarios/generate.png'] }],
    criticDecisions: [{
      finding_id: 'issue-1',
      classification: 'real_bug',
      confidence: 0.91,
      reasoning_summary: 'Generate plan failed after a safe click.',
      evidence: ['POST /api/plan-bundles 500'],
      should_report: true,
      should_generate_fix_packet: true
    }],
    issues: [{
      issue_id: 'issue-1',
      severity: 'high',
      type: 'api_error',
      title: 'Generate plan fails',
      description: 'The plan bundle endpoint returned 500.',
      evidence: ['POST /api/plan-bundles 500'],
      suspected_files: ['src/api.ts'],
      screenshotPath: '/tmp/reports/sniffer/latest/screenshots/state-1.png',
      suggestedFixPrompt: 'Fix the plan bundle endpoint.'
    }],
    rawFindings: [],
    deferredFindings: [],
    blockedChecks: [],
    needsMoreCrawling: []
  }
}
