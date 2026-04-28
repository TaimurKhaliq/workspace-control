import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { IssueGroupCard } from '../src/components/IssueGroupCard'
import { FixPacketViewer } from '../src/components/FixPacketViewer'
import { SnifferMascot } from '../src/components/SnifferMascot'
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
    if (url === '/api/reports/latest') return response(report)
    if (url === '/api/reports/latest/markdown') return new Response('# Latest Report', { status: 200 })
    if (url === '/api/reports/latest/screenshots') return response([])
    if (url === '/api/reports/latest/fix-packets') return response([])
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
      if (url === '/api/reports/latest') return response({ ...report, issues: [] })
      if (url === '/api/reports/latest/markdown') return new Response('', { status: 200 })
      if (url === '/api/reports/latest/screenshots') return response([])
      if (url === '/api/reports/latest/fix-packets') return response([])
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
})

describe('issue and fix packet components', () => {
  it('renders issue severity and type chips', () => {
    const issue = report.issues[0]
    render(<IssueGroupCard issue={issue} onSelect={() => undefined} />)
    expect(screen.getAllByText('high').length).toBeGreaterThan(0)
    expect(screen.getByText('usability issue')).toBeInTheDocument()
  })

  it('shows a copy prompt button for selected fix packets', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/fix-packets/issue-1')) return new Response('# Fix Packet\\nPrompt text', { status: 200 })
      return response({})
    })
    render(<FixPacketViewer report={report} packets={[{ issueId: 'issue-1', name: 'issue-1.md', relativePath: 'fix_packets/issue-1.md', kind: 'md' }]} onGenerateFixes={() => undefined} />)
    expect(await screen.findByRole('button', { name: 'Copy prompt' })).toBeInTheDocument()
    expect(await screen.findByText((content) => content.includes('# Fix Packet'))).toBeInTheDocument()
  })
})

describe('mascot', () => {
  it('switches to sniffing state', () => {
    render(<SnifferMascot state="sniffing" />)
    expect(screen.getByText('Sniffing the UI')).toBeInTheDocument()
  })
})

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
