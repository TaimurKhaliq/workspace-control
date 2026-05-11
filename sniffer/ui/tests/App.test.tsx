import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { IssueGroupCard } from '../src/components/IssueGroupCard'
import { FixPacketViewer } from '../src/components/FixPacketViewer'
import { RepairWorkbench } from '../src/components/RepairWorkbench'
import { ReportContextStrip } from '../src/components/ReportContextStrip'
import { AgentModelView } from '../src/components/AgentModelView'
import { SnifferMascot } from '../src/components/SnifferMascot'
import { ScenariosView } from '../src/components/ScenariosView'
import { ScreenshotImage } from '../src/components/ScreenshotModal'
import { ReportTimeline } from '../src/components/ReportTimeline'
import type { AuditForm, Issue, SnifferReport } from '../src/api'

const report: SnifferReport = {
  generatedAt: '2026-04-28T12:00:00.000Z',
  issues: [{
    issue_id: 'issue-1',
    severity: 'high',
    type: 'usability_issue',
    title: 'Plan output review is hard to scan',
    description: 'Plan bundle output lacks a clear review path.',
    evidence: ['Missing raw JSON copy affordance'],
    suspected_files: ['src/App.tsx'],
    suggestedFixPrompt: 'Improve plan output review.'
  }],
  rawFindings: [],
  deferredFindings: [],
  blockedChecks: [],
  needsMoreCrawling: [],
  scenarioRuns: [{ name: 'Generate plan bundle', status: 'passed' }],
  productExperience: {
    status: 'completed',
    providerName: 'openai-compatible',
    realLlmScreensReviewed: 11,
    contexts: [{
      current_screen_name: 'Run Timeline',
      nav_label_clicked: 'Run Timeline',
      page_intent: 'Explain ordered audit phases.',
      screenshot_path: 'screenshots/state-1.png',
      dom_summary: 'Run Timeline Latest report'
    }],
    decisions: [{
      screen_name: 'Run Timeline',
      overall: { classification: 'aligned', confidence: 'high', summary: 'The screen communicates run context.' },
      findings: [],
      non_issues: [{ observation: 'Raw JSON has Copy JSON', reason_not_reported: 'candidate suppressed due to contradictory runtime evidence' }]
    }],
    evidenceRetrievalSummaries: [{
      context: { query: 'Run Timeline evidence', screenName: 'Run Timeline' },
      retrievedDocumentCount: 1,
      sourceFactCount: 1,
      runtimeFactCount: 0,
      contradictionCount: 0,
      topDocuments: [{ id: 'doc-pe-1', kind: 'workflow', text: 'Run Timeline page intent' }]
    }]
  },
  crawlGraph: {
    startUrl: 'http://127.0.0.1:5173',
    finalUrl: 'http://127.0.0.1:5173',
    consoleErrors: [],
    networkFailures: [],
    screenshots: []
  },
  sourceGraph: {
    repoPath: '/tmp/web',
    framework: 'react',
    buildTool: 'vite'
  },
  sourceInventory: {
    files: [{ path: 'src/App.tsx', extension: '.tsx', evidenceIds: ['fact-source-app'] }],
    modules: ['App'],
    frameworkSignals: [],
    packageBuildSignals: [],
    rawExtractedSymbols: [],
    rawRoutes: [],
    rawTemplates: [],
    rawHandlers: [],
    rawApiCalls: [],
    provenance: [],
    generatedAt: '2026-04-28T12:00:00.000Z',
    facts: [{
      id: 'fact-feature-request',
      kind: 'form_control',
      value: 'Feature request',
      label: 'Feature request',
      controlType: 'textarea',
      handler: 'onPromptChange',
      source: 'source_inventory',
      filePath: 'src/App.tsx',
      snippet: '<textarea aria-label="Feature request" />',
      confidence: 0.9,
      extractionMethod: 'deterministic'
    }, {
      id: 'fact-main-tsx',
      kind: 'static_asset_reference',
      value: '/src/main.tsx',
      source: 'graph_refiner',
      filePath: 'index.html',
      confidence: 0.86,
      extractionMethod: 'llm'
    }, {
      id: 'fact-noisy',
      kind: 'action_control',
      value: 'Unlabelled button',
      source: 'source_inventory',
      filePath: 'src/App.tsx',
      confidence: 0.35,
      extractionMethod: 'deterministic',
      suppressedFromSemanticGraph: true
    }]
  },
  uiIntentGraph: {
    surfaces: [{
      id: 'surface-plan-runs',
      kind: 'surface',
      label: 'Plan Runs history',
      filePath: 'src/App.tsx',
      confidence: 0.8,
      evidenceIds: ['fact-feature-request'],
      extractionMethod: 'heuristic',
      metadata: { surface_type: 'history_list' }
    }],
    workflows: [{
      id: 'workflow-plan-runs',
      kind: 'workflow',
      label: 'Browse/reopen previous plan runs',
      filePath: 'src/App.tsx',
      confidence: 0.86,
      evidenceIds: ['fact-feature-request'],
      extractionMethod: 'heuristic'
    }],
    actions: [],
    controls: [],
    forms: [],
    state: [],
    validation: [],
    apiDataDependencies: [],
    domainEntities: [],
    edges: [{ id: 'edge-plan-runs', source: 'surface-plan-runs', target: 'workflow-plan-runs', kind: 'supports', confidence: 0.8, evidenceIds: ['fact-feature-request'] }],
    confidence: 0.82,
    evidenceReferences: ['fact-feature-request'],
    inferences: [],
    generatedAt: '2026-04-28T12:00:00.000Z'
  },
  graphRefinement: {
    mode: 'llm',
    status: 'completed',
    modelReviewed: 'SourceInventory(3 facts) + UIIntentGraphDraft(1 surfaces, 1 workflows)',
    llmUsed: true,
    provider: 'openai-compatible',
    model: 'gpt-test',
    warnings: ['Noisy control found'],
    suggestions: [],
    appliedSuggestions: [{
      id: 'refine-static-asset',
      type: 'reclassify_fact',
      targetId: 'fact-main-tsx',
      fromValue: 'api_call',
      toValue: 'static_asset_reference',
      reason: 'Module script is not a backend API.',
      evidenceIds: ['fact-main-tsx'],
      confidence: 'high',
      risk: 'low',
      appliedAt: '2026-04-28T12:00:00.000Z'
    }],
    rejectedSuggestions: [{
      id: 'reject-low',
      type: 'mark_as_noise',
      targetId: 'fact-feature-request',
      reason: 'Too weak.',
      evidenceIds: ['fact-feature-request'],
      confidence: 'low',
      risk: 'low',
      rejectedReason: 'Only high-confidence graph refinements are applied.'
    }]
  },
  evidenceRetrievalSummaries: [{
    context: { query: 'Run Timeline context', screenName: 'Run Timeline' },
    retrievedDocumentCount: 2,
    sourceFactCount: 1,
    runtimeFactCount: 1,
    contradictionCount: 1,
    topDocuments: [{ id: 'doc-1', kind: 'surface', text: 'Plan Runs history' }]
  }]
}

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/status') {
      return response({
        version: '0.1.0',
        status: 'idle',
        provider: { configured: true, baseUrlConfigured: true, model: 'gpt-test', apiStyle: 'responses' },
        agent: { configured: false, name: 'manual' },
        latestReport: { path: '/tmp/latest_report.json', issues: 1, rawFindings: 0, repoPath: '/tmp/web', appUrl: 'http://127.0.0.1:5173' },
        reportDir: '/tmp/reports'
      })
    }
    if (url === '/api/projects') return response([{
      id: 'demo',
      name: 'Demo UI',
      repoPath: '/tmp/web',
      appUrl: 'http://127.0.0.1:5173',
      framework: 'react',
      buildTool: 'vite',
      workingDirectory: '/tmp/web',
      profile: { profile_type: 'dashboard_app', confidence: 'medium', evidence: [], core_entities: [], primary_user_jobs: [], expected_navigation_patterns: [], expected_workflows: [], expected_output_surfaces: [] },
      createdAt: '2026-04-28T12:00:00.000Z',
      updatedAt: '2026-04-28T12:00:00.000Z'
    }])
    if (url.startsWith('/api/reports/latest?') || url === '/api/reports/latest') return response(report)
    if (url.startsWith('/api/reports/latest/markdown')) return new Response('# Latest Report', { status: 200 })
    if (url.startsWith('/api/reports/latest/screenshots')) return response([])
    if (url.startsWith('/api/reports/latest/issues')) return response([{
      issueId: 'issue-1',
      severity: 'high',
      type: 'usability_issue',
      title: 'Plan output review is hard to scan',
      status: 'open',
      evidenceSummary: ['Missing raw JSON copy affordance'],
      suspectedFiles: ['src/App.tsx'],
      hasFixPacket: true
    }])
    if (url.startsWith('/api/reports/latest/fix-packets')) return response([])
    if (url.startsWith('/api/reports/latest/retrieve-evidence')) return response({
      context: { query: 'raw json copy' },
      intent: 'ad_hoc_evidence_query',
      retrievedDocuments: [{
        id: 'surface-raw-json',
        kind: 'surface',
        text: 'Raw JSON view with Copy JSON action',
        metadata: { filePath: 'src/App.tsx' },
        relatedEvidenceIds: ['fact-feature-request'],
        score: 14.5,
        whyRetrieved: ['token overlap: raw, json, copy']
      }],
      graphNodes: [],
      sourceFacts: [],
      runtimeFacts: [],
      screenshots: [],
      priorFindings: [],
      priorFixPackets: [],
      priorRepairAttempts: [],
      contradictions: [],
      confidenceSummary: {
        sourceFactCount: 0,
        runtimeFactCount: 0,
        sourceDocumentCount: 1,
        runtimeDocumentCount: 0,
        scenarioDocumentCount: 0,
        priorFixPacketCount: 0,
        contradictionCount: 0,
        averageConfidence: 0,
        averageScore: 14.5
      }
    })
    if (url.startsWith('/api/repairs/history')) return response([])
    if (url === '/api/audits' && init?.method === 'POST') return response({ runId: 'run-1', command: ['tsx', 'src/cli/index.ts', 'audit', '--execute-generated-scenarios'] }, 202)
    if (url === '/api/audits/run-1') return response({
      runId: 'run-1',
      status: 'running',
      phase: 'scenario execution',
      command: ['tsx', 'src/cli/index.ts', 'audit', '--execute-generated-scenarios'],
      events: [
        { type: 'phase_started', phase: 'source discovery', message: 'Resolving target.', timestamp: '2026-04-28T12:00:00.000Z' },
        { type: 'phase_started', phase: 'scenario execution', message: 'Executing generated scenarios.', timestamp: '2026-04-28T12:00:01.000Z' }
      ],
      logs: ['source discovery', 'scenario execution'],
      stdout: '',
      stderr: '',
      startedAt: '2026-04-28T12:00:00.000Z'
    })
    return response({})
  }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Sniffer UI dashboard', () => {
  it('renders the dashboard launcher and latest report summary', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Audit a running UI' })).toBeInTheDocument()
    expect((await screen.findAllByText('Plan output review is hard to scan')).length).toBeGreaterThan(0)
  })

  it('validates repo path and URL before launching a run', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/status') {
        return response({
          version: '0.1.0',
          status: 'idle',
          provider: { configured: false, baseUrlConfigured: false, model: null, apiStyle: 'auto' },
          agent: { configured: false, name: 'manual' },
          latestReport: null,
          reportDir: '/tmp/reports'
        })
      }
      if (url === '/api/projects') return response([])
      if (url.startsWith('/api/reports/latest?') || url === '/api/reports/latest') return response({ ...report, issues: [] })
      if (url.startsWith('/api/reports/latest/markdown')) return new Response('', { status: 200 })
      if (url.startsWith('/api/reports/latest/screenshots')) return response([])
      if (url.startsWith('/api/reports/latest/issues')) return response([])
      if (url.startsWith('/api/reports/latest/fix-packets')) return response([])
      if (url.startsWith('/api/repairs/history')) return response([])
      return response({})
    })
    render(<App />)
    await screen.findByRole('heading', { name: 'Audit a running UI' })
    fireEvent.click(await screen.findByRole('button', { name: 'Run Audit' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Repo path and App URL are required')
  })

  it('clicking Run Audit calls the API', async () => {
    render(<App />)
    await screen.findByDisplayValue('/tmp/web')
    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/audits', expect.objectContaining({ method: 'POST' })))
  })

  it('renders audit depth controls and defaults to deep LLM when provider is configured', async () => {
    render(<App />)

    const depth = await screen.findByLabelText('Audit depth')
    await waitFor(() => expect(depth).toHaveValue('deep'))
    expect(screen.getByLabelText('Product Experience Critic')).toHaveValue('llm')
    expect(screen.getByLabelText('Provider')).toHaveValue('openai-compatible')
  })

  it('shows a command preview with generated scenario execution', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Audit a running UI' })
    await waitFor(() => expect(screen.getByLabelText('Product Experience Critic')).toHaveValue('llm'))
    fireEvent.click(screen.getByText('Command'))

    expect(screen.getByText((content) => content.includes('--execute-generated-scenarios'))).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('--product-experience-critic llm'))).toBeInTheDocument()
  })

  it('sends deep audit options to the backend and shows running state', async () => {
    render(<App />)
    await screen.findByDisplayValue('/tmp/web')
    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))

    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([url, init]) => url === '/api/audits' && init?.method === 'POST')
      expect(call).toBeTruthy()
      const body = JSON.parse(String(call?.[1]?.body)) as AuditForm
      expect(body.auditDepth).toBe('deep')
      expect(body.executeGeneratedScenarios).toBe(true)
      expect(body.productExperienceCritic).toBe('llm')
    })
    expect((await screen.findAllByText('Starting audit')).length).toBeGreaterThan(0)
  })

  it('shows backend audit launch failures without crashing', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/status') return response({ version: '0.1.0', status: 'idle', provider: { configured: true, baseUrlConfigured: true, model: 'gpt-test', apiStyle: 'responses' }, agent: { configured: false, name: 'manual' }, latestReport: { path: '/tmp/latest_report.json', issues: 0, rawFindings: 0, repoPath: '/tmp/web', appUrl: 'http://127.0.0.1:5173' }, reportDir: '/tmp/reports' })
      if (url === '/api/projects') return response([])
      if (url.startsWith('/api/reports/latest')) return response(url.includes('screenshots') || url.includes('fix-packets') || url.includes('issues') ? [] : { ...report, issues: [] })
      if (url.startsWith('/api/repairs/history')) return response([])
      if (url === '/api/audits' && init?.method === 'POST') return response({ error: 'LLM provider is not configured. Run provider check or use fast deterministic audit.' }, 400)
      return response({})
    })
    render(<App />)
    await screen.findByRole('heading', { name: 'Audit a running UI' })
    await screen.findByDisplayValue('/tmp/web')
    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('LLM provider is not configured')
  })

  it('shows the project selector and Projects page', async () => {
    render(<App />)
    expect(await screen.findByLabelText('Selected Sniffer project')).toHaveValue('demo')
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
    expect(await screen.findByTestId('projects-view')).toBeInTheDocument()
    expect(screen.getAllByText('Demo UI').length).toBeGreaterThan(0)
  })

  it('opens the Repair Workbench from navigation', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Repair Workbench' }))
    expect(await screen.findByTestId('repair-workbench-view')).toBeInTheDocument()
    expect(screen.getAllByText('Repair Workbench').length).toBeGreaterThan(0)
  })

  it('opens the Agent Model from navigation', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Agent Model' }))
    expect(await screen.findByTestId('agent-model-view')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'How Sniffer built its understanding' })).toBeInTheDocument()
    expect(screen.getByText('Feature request')).toBeInTheDocument()
  })
})

describe('Agent Model view', () => {
  it('shows Source Inventory counts and collapsed snippets', () => {
    render(<AgentModelView report={report} projectId="demo" projectName="Demo UI" />)
    expect(screen.getByText('Deterministic facts')).toBeInTheDocument()
    expect(screen.getAllByText('Feature request').length).toBeGreaterThan(0)
    expect(screen.getByText('Raw snippet')).toBeInTheDocument()
  })

  it('shows UI Intent Graph surfaces and detail drawer', () => {
    render(<AgentModelView report={report} projectId="demo" projectName="Demo UI" />)
    fireEvent.click(screen.getByRole('tab', { name: 'UI Intent Graph' }))
    expect(screen.getByText('Semantic model')).toBeInTheDocument()
    expect(screen.getAllByText('Plan Runs history').length).toBeGreaterThan(0)
    expect(screen.getByText('Focused relationship map')).toBeInTheDocument()
  })

  it('shows applied and rejected LLM refinements', () => {
    render(<AgentModelView report={report} projectId="demo" projectName="Demo UI" />)
    fireEvent.click(screen.getByRole('tab', { name: 'LLM Refinements' }))
    expect(screen.getByText('Graph Structure Critic')).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('static_asset_reference'))).toBeInTheDocument()
    expect(screen.getByText(/Only high-confidence/)).toBeInTheDocument()
  })

  it('shows evidence retrieval and evidence packets', async () => {
    render(<AgentModelView report={report} projectId="demo" projectName="Demo UI" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Evidence Retrieval' }))
    expect(screen.getByText('Retrieved context packets')).toBeInTheDocument()
    expect(screen.getByText('Run Timeline context')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Evidence retrieval query'), { target: { value: 'raw json copy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Retrieve' }))
    expect(await screen.findByTestId('evidence-packet-result')).toBeInTheDocument()
    expect(screen.getByText('Raw JSON view with Copy JSON action')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Evidence Packets' }))
    expect(screen.getByText('Critic and repair context')).toBeInTheDocument()
    expect(screen.getAllByText('Run Timeline').length).toBeGreaterThan(0)
  })

  it('shows suppressions and handles legacy reports without new fields', () => {
    render(<AgentModelView report={report} projectId="demo" projectName="Demo UI" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Contradictions / Suppressions' }))
    expect(screen.getByText('Evidence gating decisions')).toBeInTheDocument()
    expect(screen.getByText('Unlabelled button')).toBeInTheDocument()
    cleanup()
    render(<AgentModelView report={{ ...report, sourceInventory: undefined, uiIntentGraph: undefined, graphRefinement: undefined }} />)
    expect(screen.getByTestId('agent-model-unavailable')).toBeInTheDocument()
  })
})

describe('issue and fix packet components', () => {
  it('renders compact report context for evidence pages', () => {
    render(<ReportContextStrip report={report} projectId="demo" projectName="Demo UI" />)
    expect(screen.getByLabelText('Current report context')).toBeInTheDocument()
    expect(screen.getByText('Demo UI')).toBeInTheDocument()
    expect(screen.getByText('Latest report')).toBeInTheDocument()
    expect(screen.getByText('1/1 passed')).toBeInTheDocument()
    expect(screen.getByText(/Product critic: completed/)).toBeInTheDocument()
  })

  it('renders issue severity and type chips', () => {
    const issue = report.issues[0]
    render(<IssueGroupCard issue={issue} onSelect={() => undefined} />)
    expect(screen.getAllByText('high').length).toBeGreaterThan(0)
    expect(screen.getByText('usability issue')).toBeInTheDocument()
  })

  it('shows a copy prompt button for selected fix packets', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/fix-packets/issue-1')) return new Response('# Fix Packet\n\n## Prompt\nPrompt text\n\n## Suspected Files\n- src/App.tsx\n\n## Verification\nRun tests', { status: 200 })
      return response({})
    })
    render(<FixPacketViewer report={report} packets={[{ issueId: 'issue-1', name: 'issue-1.md', relativePath: 'fix_packets/issue-1.md', kind: 'md' }]} onGenerateFixes={() => undefined} />)
    expect(await screen.findByRole('button', { name: 'Copy prompt' })).toBeInTheDocument()
    expect(await screen.findByText('Prompt')).toBeInTheDocument()
    expect((await screen.findAllByText((content) => content.includes('Prompt text'))).length).toBeGreaterThan(0)
    expect(await screen.findByText('Verification')).toBeInTheDocument()
  })

  it('runs manual repair proof and shows no changes expected', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/reports/latest/issues')) return response([{
        issueId: 'issue-1',
        severity: 'high',
        type: 'usability_issue',
        title: 'Plan output review is hard to scan',
        status: 'open',
        evidenceSummary: ['Missing raw JSON copy affordance'],
        suspectedFiles: ['src/App.tsx'],
        hasFixPacket: true
      }])
      if (url.includes('/fix-packets/issue-1?format=json')) return response({
        issueId: 'issue-1',
        markdown: '# Fix Packet\n\n## Prompt\nPrompt text',
        suspectedFiles: ['src/App.tsx'],
        prompt: 'Prompt text',
        constraints: ['No destructive actions'],
        verificationCommand: 'npm run sniffer -- verify --issue issue-1 --url http://app --report report.json',
        passConditions: [],
        path: { markdown: '/tmp/issue-1.md', json: '/tmp/issue-1.json' },
        json: {
          issue_id: 'issue-1',
          title: 'Plan output review is hard to scan',
          repo_path: '/tmp/web',
          repair_root: '/tmp',
          allowed_paths: ['src/'],
          working_directory: '/tmp',
          evidence_paths: [],
          suspected_files: ['src/App.tsx'],
          prompt: 'Prompt text',
          constraints: ['No destructive actions'],
          verification_command: 'npm run sniffer -- verify --issue issue-1 --url http://app --report report.json',
          pass_conditions: []
        }
      })
      if (url.startsWith('/api/repairs/history')) return response([])
      if (url === '/api/repairs/start' && init?.method === 'POST') return response({ repairRunId: 'repair-1', status: 'running' }, 202)
      if (url === '/api/repairs/repair-1') return response({
        repairRunId: 'repair-1',
        status: 'succeeded',
        issueId: 'issue-1',
        agent: 'manual',
        mode: 'repair-proof',
        command: ['tsx', 'src/cli/index.ts', 'repair-proof'],
        commandSummary: 'repair-proof issue-1',
        stdout: 'agent_invoked=false\nchanged_files=[]',
        stderr: '',
        stdoutTail: 'agent_invoked=false\nchanged_files=[]',
        stderrTail: '',
        logs: ['agent_invoked=false'],
        startedAt: '2026-04-28T12:00:00.000Z',
        reportPath: '/tmp/report.json',
        changedFiles: [],
        diffSummary: '',
        verification: { status: 'not_run' }
      })
      return response({})
    })
    render(<RepairWorkbench report={report} projectId="demo" form={auditForm()} onAuditQueued={() => undefined} onRefreshReport={() => undefined} status={{ version: '0.1.0', status: 'idle', provider: { configured: false, baseUrlConfigured: false, model: null, apiStyle: 'auto' }, agent: { configured: false, name: 'manual' }, latestReport: null, reportDir: '/tmp' }} />)
    expect((await screen.findAllByText('Plan output review is hard to scan')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Run repair proof/i }))
    expect(await screen.findByText(/No files changed/)).toBeInTheDocument()
  })
})

describe('scenario planning view', () => {
  it('shows generated scenarios when nothing was executed', () => {
    render(<ScenariosView report={{
      ...report,
      scenarioRuns: [],
      generatedScenarios: [{
        id: 'navigation-smoke',
        name: 'Navigation smoke test',
        profileApplicability: ['auth_app'],
        prerequisites: [],
        steps: [{ name: 'Open nav', action: 'open_primary_navigation', expectedControls: ['links'], safe: true }],
        expectedControls: ['navigation'],
        expectedOutcomes: ['routes open'],
        confidence: 'medium',
        evidence: ['runtime DOM']
      }]
    }} />)
    expect(screen.getByText('Generated Scenarios')).toBeInTheDocument()
    expect(screen.getByText('not executed')).toBeInTheDocument()
    expect(screen.getByText(/Scenarios were generated but not executed/)).toBeInTheDocument()
  })
})

describe('live run timeline', () => {
  it('shows structured phases and failed status details', () => {
    render(<ReportTimeline report={report} fixPackets={[]} run={{
      runId: 'run-1',
      status: 'failed',
      phase: 'Error',
      command: ['tsx', 'src/cli/index.ts', 'audit', '--execute-generated-scenarios'],
      events: [
        { type: 'phase_started', phase: 'source discovery', message: 'Resolving target.', timestamp: '2026-04-28T12:00:00.000Z' },
        { type: 'phase_started', phase: 'scenario execution', message: 'Executing generated scenarios.', timestamp: '2026-04-28T12:00:01.000Z' },
        { type: 'error', phase: 'Error', message: 'CLI exited with code 1', timestamp: '2026-04-28T12:00:02.000Z' }
      ],
      logs: ['source discovery', 'scenario execution', 'Process exited with code 1'],
      stdout: '',
      stderr: 'boom',
      errorSummary: 'boom',
      startedAt: '2026-04-28T12:00:00.000Z',
      exitCode: 1
    }} projectId="demo" projectName="Demo UI" />)

    expect(screen.getAllByText('source discovery').length).toBeGreaterThan(0)
    expect(screen.getAllByText('scenario execution').length).toBeGreaterThan(0)
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
  })
})

describe('mascot', () => {
  it('switches to sniffing state', () => {
    render(<SnifferMascot state="sniffing" />)
    expect(screen.getByText('Sniffing the UI')).toBeInTheDocument()
  })
})

describe('screenshots', () => {
  it('shows a placeholder when a screenshot artifact is missing', () => {
    render(<ScreenshotImage src="/api/reports/latest/artifacts/screenshots%2Fmissing.png" alt="Missing screenshot" />)
    fireEvent.error(screen.getByAltText('Missing screenshot'))
    expect(screen.getByText('Screenshot unavailable')).toBeInTheDocument()
  })
})

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function auditForm(): AuditForm {
  return {
    repoPath: '/tmp/web',
    url: 'http://app',
    productGoal: '',
    auditDepth: 'fast',
    discoveryMode: 'hybrid',
    scenario: 'all',
    executeGeneratedScenarios: true,
    criticMode: 'deterministic',
    uxCritic: 'deterministic',
    intentMode: 'deterministic',
    productExperienceCritic: 'deterministic',
    provider: 'auto',
    maxIterations: 3,
    consistencyCheck: false
  }
}
