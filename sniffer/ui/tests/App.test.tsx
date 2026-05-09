import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { IssueGroupCard } from '../src/components/IssueGroupCard'
import { FixPacketViewer } from '../src/components/FixPacketViewer'
import { RepairWorkbench } from '../src/components/RepairWorkbench'
import { ReportContextStrip } from '../src/components/ReportContextStrip'
import { SnifferMascot } from '../src/components/SnifferMascot'
import { ScenariosView } from '../src/components/ScenariosView'
import { ScreenshotImage } from '../src/components/ScreenshotModal'
import type { Issue, SnifferReport } from '../src/api'

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
  productExperience: { status: 'completed', providerName: 'openai-compatible', realLlmScreensReviewed: 11 },
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
  }
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
    if (url.startsWith('/api/repairs/history')) return response([])
    if (url === '/api/audits' && init?.method === 'POST') return response({ runId: 'run-1' }, 202)
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
    render(<RepairWorkbench report={report} projectId="demo" form={{ repoPath: '/tmp/web', url: 'http://app', productGoal: '', discoveryMode: 'hybrid', scenario: 'all', criticMode: 'deterministic', uxCritic: 'deterministic', intentMode: 'deterministic', provider: 'auto', maxIterations: 3, consistencyCheck: false }} onAuditQueued={() => undefined} onRefreshReport={() => undefined} status={{ version: '0.1.0', status: 'idle', provider: { configured: false, baseUrlConfigured: false, model: null, apiStyle: 'auto' }, agent: { configured: false, name: 'manual' }, latestReport: null, reportDir: '/tmp' }} />)
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
