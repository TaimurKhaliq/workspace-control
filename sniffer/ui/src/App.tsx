import { useEffect, useMemo, useState } from 'react'
import {
  generateFixPackets,
  getFixPackets,
  getLatestReport,
  getRun,
  getScreenshots,
  getStatus,
  startAudit,
  verifyIssue,
  type AuditForm,
  type FixPacketItem,
  type Issue,
  type RunRecord,
  type ScreenshotItem,
  type ServerStatus,
  type SnifferReport
} from './api'
import { AppShell, type Screen } from './components/AppShell'
import { IssueSummary } from './components/IssueSummary'
import { ScreenshotGallery } from './components/ScreenshotGallery'
import { FixPacketViewer } from './components/FixPacketViewer'
import { SettingsPanel } from './components/SettingsPanel'
import { DiscoveryGraph } from './components/DiscoveryGraph'
import { SummaryPage } from './components/SummaryPage'
import { ReportTimeline } from './components/ReportTimeline'
import { ScenariosView } from './components/ScenariosView'
import { CrawlPathView } from './components/CrawlPathView'
import { WorkflowEvidenceView } from './components/WorkflowEvidenceView'
import { RawJsonView } from './components/RawJsonView'
import type { MascotState } from './components/SnifferMascot'

const emptyForm: AuditForm = {
  repoPath: '',
  url: '',
  productGoal: '',
  scenario: 'all',
  criticMode: 'deterministic',
  uxCritic: 'deterministic',
  intentMode: 'deterministic',
  provider: 'auto',
  maxIterations: 3,
  consistencyCheck: true
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('summary')
  const [status, setStatus] = useState<ServerStatus>()
  const [report, setReport] = useState<SnifferReport | null>(null)
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([])
  const [fixPackets, setFixPackets] = useState<FixPacketItem[]>([])
  const [run, setRun] = useState<RunRecord | null>(null)
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)
  const [form, setForm] = useState<AuditForm>(() => {
    const saved = window.localStorage.getItem('sniffer.ui.form')
    return saved ? { ...emptyForm, ...JSON.parse(saved) as Partial<AuditForm> } : emptyForm
  })
  const [error, setError] = useState('')

  useEffect(() => {
    void refreshAll()
  }, [])

  useEffect(() => {
    window.localStorage.setItem('sniffer.ui.form', JSON.stringify(form))
  }, [form])

  useEffect(() => {
    if (!status?.latestReport) return
    setForm((current) => ({
      ...current,
      repoPath: current.repoPath || String(status.latestReport?.repoPath ?? ''),
      url: current.url || String(status.latestReport?.appUrl ?? '')
    }))
  }, [status])

  useEffect(() => {
    if (!run || run.status !== 'running') return
    const timer = window.setInterval(() => {
      void getRun(run.runId)
        .then((next) => {
          setRun(next)
          if (next.status === 'success') void refreshAll()
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
    }, 1200)
    return () => window.clearInterval(timer)
  }, [run])

  const mascotState: MascotState = useMemo(() => {
    if (run?.status === 'running') return 'sniffing'
    if (run?.status === 'error') return 'error'
    if (run?.status === 'success') return 'success'
    return 'idle'
  }, [run])

  async function refreshAll() {
    await Promise.all([
      getStatus().then(setStatus).catch(() => undefined),
      getLatestReport().then((next) => {
        setReport(next)
        setSelectedIssue((current) => current ?? next.issues?.[0] ?? null)
      }).catch(() => undefined),
      getScreenshots().then(setScreenshots).catch(() => setScreenshots([])),
      getFixPackets().then(setFixPackets).catch(() => setFixPackets([]))
    ])
  }

  async function runAudit(overrides: Partial<AuditForm> = {}) {
    const payload = { ...form, ...overrides }
    if (!payload.repoPath.trim() || !payload.url.trim()) {
      setError('Repo path and App URL are required.')
      return
    }
    setError('')
    const response = await startAudit(payload).catch((err) => {
      setError(err instanceof Error ? err.message : String(err))
      return undefined
    })
    if (response) {
      setRun({ runId: response.runId, status: 'running', phase: 'Starting audit', logs: ['Audit queued'], stdout: '', stderr: '', startedAt: new Date().toISOString() })
      setScreen('timeline')
    }
  }

  async function generateFixes() {
    setError('')
    const response = await generateFixPackets().catch((err) => {
      setError(err instanceof Error ? err.message : String(err))
      return undefined
    })
    if (response) {
      setRun({ runId: response.runId, status: 'running', phase: 'Generating fix packets', logs: ['Fix packet generation queued'], stdout: '', stderr: '', startedAt: new Date().toISOString() })
      setScreen('fixes')
    }
  }

  async function runVerification(issue: Issue) {
    if (!issue.issue_id) {
      setError('This issue has no issue_id to verify.')
      return
    }
    if (!form.url.trim()) {
      setError('App URL is required for verification.')
      return
    }
    const response = await verifyIssue(issue.issue_id, form.url).catch((err) => {
      setError(err instanceof Error ? err.message : String(err))
      return undefined
    })
    if (response) {
      setRun({ runId: response.runId, status: 'running', phase: 'Running verification', logs: ['Verification queued'], stdout: '', stderr: '', startedAt: new Date().toISOString() })
      setScreen('timeline')
    }
  }

  function copyFixPrompt(issue: Issue) {
    const text = issue.fix_prompt || issue.suggestedFixPrompt || `${issue.title}\n\n${issue.description}`
    void navigator.clipboard?.writeText(text)
  }

  return (
    <AppShell screen={screen} onScreenChange={setScreen} status={status} run={run}>
      {screen === 'summary' && (
        <SummaryPage
          report={report}
          fixPackets={fixPackets}
          screenshots={screenshots}
          status={status}
          form={form}
          mascotState={mascotState}
          error={error}
          onFormChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          onRunAudit={() => void runAudit()}
          onRunConsistency={() => void runAudit({ scenario: 'off', consistencyCheck: true })}
          onGenerateFixes={() => void generateFixes()}
          onOpenReport={() => setScreen('timeline')}
          onSelectIssue={(issue) => {
            setSelectedIssue(issue)
            setScreen('issues')
          }}
        />
      )}
      {screen === 'timeline' && <ReportTimeline report={report} fixPackets={fixPackets} run={run} />}
      {screen === 'scenarios' && <ScenariosView report={report} />}
      {screen === 'crawl' && <CrawlPathView report={report} />}
      {screen === 'workflows' && <WorkflowEvidenceView report={report} />}
      {screen === 'graph' && <DiscoveryGraph report={report} fixPackets={fixPackets} screenshots={screenshots} />}
      {screen === 'issues' && <IssueSummary report={report} selectedIssue={selectedIssue} onSelectIssue={setSelectedIssue} onCopyFixPrompt={copyFixPrompt} onVerifyIssue={(issue) => void runVerification(issue)} />}
      {screen === 'fixes' && <FixPacketViewer report={report} packets={fixPackets} onGenerateFixes={() => void generateFixes()} />}
      {screen === 'screenshots' && <ScreenshotGallery screenshots={screenshots} />}
      {screen === 'raw' && <RawJsonView report={report} />}
      {screen === 'settings' && <SettingsPanel status={status} />}
    </AppShell>
  )
}
