import { useEffect, useMemo, useState } from 'react'
import {
  addProject,
  generateFixPackets,
  getFixPackets,
  getLatestReport,
  getProjects,
  getRun,
  getScreenshots,
  getStatus,
  removeProject,
  startAudit,
  verifyIssue,
  type AuditForm,
  type FixPacketItem,
  type Issue,
  type RunRecord,
  type ScreenshotItem,
  type ServerStatus,
  type SnifferProject,
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
import { AgentModelView } from './components/AgentModelView'
import { RawJsonView } from './components/RawJsonView'
import { ProjectsView } from './components/ProjectsView'
import { RepairWorkbench } from './components/RepairWorkbench'
import type { MascotState } from './components/SnifferMascot'
import { projectIdFromReportArtifacts } from './artifacts'

const emptyForm: AuditForm = {
  repoPath: '',
  url: '',
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

export default function App() {
  const savedFormText = window.localStorage.getItem('sniffer.ui.form')
  const [screen, setScreen] = useState<Screen>('summary')
  const [status, setStatus] = useState<ServerStatus>()
  const [projects, setProjects] = useState<SnifferProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => window.localStorage.getItem('sniffer.ui.project') ?? '')
  const [report, setReport] = useState<SnifferReport | null>(null)
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([])
  const [fixPackets, setFixPackets] = useState<FixPacketItem[]>([])
  const [run, setRun] = useState<RunRecord | null>(null)
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)
  const [form, setForm] = useState<AuditForm>(() => {
    const saved = savedFormText
    return saved ? { ...emptyForm, ...JSON.parse(saved) as Partial<AuditForm> } : emptyForm
  })
  const [providerDefaultsPending, setProviderDefaultsPending] = useState(!savedFormText)
  const [error, setError] = useState('')

  useEffect(() => {
    void refreshAll()
  }, [])

  useEffect(() => {
    void refreshReportArtifacts()
  }, [selectedProjectId])

  useEffect(() => {
    window.localStorage.setItem('sniffer.ui.form', JSON.stringify(form))
  }, [form])

  useEffect(() => {
    if (selectedProjectId) window.localStorage.setItem('sniffer.ui.project', selectedProjectId)
  }, [selectedProjectId])

  useEffect(() => {
    const project = projects.find((candidate) => candidate.id === selectedProjectId)
    if (!project) return
    setForm((current) => ({
      ...current,
      projectId: project.id,
      repoPath: project.repoPath,
      url: project.appUrl,
      discoveryMode: project.discoveryMode ?? current.discoveryMode
    }))
  }, [projects, selectedProjectId])

  useEffect(() => {
    if (!status?.latestReport) return
    setForm((current) => ({
      ...current,
      repoPath: current.repoPath || String(status.latestReport?.repoPath ?? ''),
      url: current.url || String(status.latestReport?.appUrl ?? '')
    }))
  }, [status])

  useEffect(() => {
    if (!status || !providerDefaultsPending) return
    setForm((current) => ({
      ...current,
      auditDepth: status.provider.configured ? 'deep' : 'fast',
      productExperienceCritic: status.provider.configured ? 'llm' : 'deterministic',
      provider: status.provider.configured ? 'openai-compatible' : 'auto',
      scenario: 'all',
      executeGeneratedScenarios: true
    }))
    setProviderDefaultsPending(false)
  }, [status, providerDefaultsPending])

  useEffect(() => {
    if (!run || run.status !== 'running') return
    const timer = window.setInterval(() => {
      void getRun(run.runId)
        .then((next) => {
          setRun(next)
          if (next.status === 'succeeded') void refreshAll()
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
    }, 1200)
    return () => window.clearInterval(timer)
  }, [run])

  const mascotState: MascotState = useMemo(() => {
    if (run?.status === 'running') return 'sniffing'
    if (run?.status === 'failed') return 'error'
    if (run?.status === 'succeeded') return 'success'
    return 'idle'
  }, [run])
  const reportArtifactProjectId = useMemo(() => projectIdFromReportArtifacts(reportArtifactPaths(report), selectedProjectId || undefined), [report, selectedProjectId])
  const reportProjectId = reportArtifactProjectId || selectedProjectId || undefined
  const reportProjectName = useMemo(() => {
    if (reportProjectId === 'ad_hoc') return 'Ad hoc report'
    return projects.find((project) => project.id === reportProjectId)?.name
  }, [projects, reportProjectId])

  useEffect(() => {
    if (!reportArtifactProjectId || reportArtifactProjectId === selectedProjectId) return
    void Promise.all([
      getScreenshots(reportArtifactProjectId).then(setScreenshots).catch(() => setScreenshots([])),
      getFixPackets(reportArtifactProjectId).then(setFixPackets).catch(() => setFixPackets([]))
    ])
  }, [reportArtifactProjectId, selectedProjectId])

  async function refreshAll() {
    await Promise.all([
      getStatus().then(setStatus).catch(() => undefined),
      getProjects().then((next) => {
        setProjects(next)
        if (!selectedProjectId && next[0]) setSelectedProjectId(next[0].id)
      }).catch(() => setProjects([])),
      getLatestReport(selectedProjectId || undefined).then((next) => {
        setReport(next)
        setSelectedIssue((current) => current ?? next.issues?.[0] ?? null)
      }).catch(() => undefined),
      getScreenshots(selectedProjectId || undefined).then(setScreenshots).catch(() => setScreenshots([])),
      getFixPackets(selectedProjectId || undefined).then(setFixPackets).catch(() => setFixPackets([]))
    ])
  }

  async function refreshReportArtifacts() {
    await Promise.all([
      getLatestReport(selectedProjectId || undefined).then((next) => {
        setReport(next)
        setSelectedIssue(next.issues?.[0] ?? null)
      }).catch(() => setReport(null)),
      getScreenshots(selectedProjectId || undefined).then(setScreenshots).catch(() => setScreenshots([])),
      getFixPackets(selectedProjectId || undefined).then(setFixPackets).catch(() => setFixPackets([]))
    ])
  }

  async function runAudit(overrides: Partial<AuditForm> = {}) {
    const payload = { ...form, ...overrides }
    if (!payload.projectId && (!payload.repoPath.trim() || !payload.url.trim())) {
      setError('Repo path and App URL are required.')
      return
    }
    setError('')
    const response = await startAudit(payload).catch((err) => {
      setError(err instanceof Error ? err.message : String(err))
      return undefined
    })
    if (response) {
      setRun({ runId: response.runId, status: 'running', phase: 'Starting audit', command: response.command, events: [], logs: ['Audit queued'], stdout: '', stderr: '', startedAt: new Date().toISOString() })
      setScreen('timeline')
    }
  }

  async function generateFixes() {
    setError('')
    const response = await generateFixPackets(selectedProjectId || undefined).catch((err) => {
      setError(err instanceof Error ? err.message : String(err))
      return undefined
    })
    if (response) {
      setRun({ runId: response.runId, status: 'running', phase: 'Generating fix packets', events: [], logs: ['Fix packet generation queued'], stdout: '', stderr: '', startedAt: new Date().toISOString() })
      setScreen('fixes')
    }
  }

  function setAuditRunFromId(runId: string) {
    setRun({ runId, status: 'running', phase: 'Starting audit', events: [], logs: ['Audit queued'], stdout: '', stderr: '', startedAt: new Date().toISOString() })
    setScreen('timeline')
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
    const response = await verifyIssue(issue.issue_id, form.url, selectedProjectId || undefined).catch((err) => {
      setError(err instanceof Error ? err.message : String(err))
      return undefined
    })
    if (response) {
      setRun({ runId: response.runId, status: 'running', phase: 'Running verification', events: [], logs: ['Verification queued'], stdout: '', stderr: '', startedAt: new Date().toISOString() })
      setScreen('timeline')
    }
  }

  function copyFixPrompt(issue: Issue) {
    const text = issue.fix_prompt || issue.suggestedFixPrompt || `${issue.title}\n\n${issue.description}`
    void navigator.clipboard?.writeText(text)
  }

  return (
    <AppShell
      screen={screen}
      onScreenChange={setScreen}
      status={status}
      run={run}
      projects={projects}
      selectedProjectId={selectedProjectId}
      onProjectChange={(projectId) => {
        setSelectedProjectId(projectId)
        setForm((current) => ({ ...current, projectId: projectId || undefined }))
      }}
      onAddProject={() => setScreen('projects')}
    >
      {screen === 'projects' && (
        <ProjectsView
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={(project) => {
            setSelectedProjectId(project.id)
            setScreen('summary')
          }}
          onAddProject={async (input) => {
            const project = await addProject(input)
            setProjects((current) => [...current.filter((candidate) => candidate.id !== project.id), project])
            setSelectedProjectId(project.id)
          }}
          onRemoveProject={async (project) => {
            await removeProject(project.id)
            const next = projects.filter((candidate) => candidate.id !== project.id)
            setProjects(next)
            if (selectedProjectId === project.id) setSelectedProjectId(next[0]?.id ?? '')
          }}
          onAuditProject={(project) => {
            setSelectedProjectId(project.id)
            void runAudit({ projectId: project.id, repoPath: project.repoPath, url: project.appUrl })
          }}
        />
      )}
      {screen === 'summary' && (
        <SummaryPage
          report={report}
          fixPackets={fixPackets}
          screenshots={screenshots}
          status={status}
          form={form}
          mascotState={mascotState}
          error={error}
          isRunning={run?.status === 'running' || status?.status === 'running'}
          projectId={reportProjectId}
          projectName={reportProjectName}
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
      {screen === 'timeline' && <ReportTimeline report={report} fixPackets={fixPackets} run={run} projectId={reportProjectId} projectName={reportProjectName} />}
      {screen === 'scenarios' && <ScenariosView report={report} projectId={reportProjectId} projectName={reportProjectName} />}
      {screen === 'crawl' && <CrawlPathView report={report} projectId={reportProjectId} projectName={reportProjectName} />}
      {screen === 'workflows' && <WorkflowEvidenceView report={report} projectId={reportProjectId} projectName={reportProjectName} />}
      {screen === 'agent' && <AgentModelView report={report} projectId={reportProjectId} projectName={reportProjectName} />}
      {screen === 'graph' && <DiscoveryGraph report={report} fixPackets={fixPackets} screenshots={screenshots} projectId={reportProjectId} projectName={reportProjectName} />}
      {screen === 'issues' && <IssueSummary report={report} projectId={reportProjectId} projectName={reportProjectName} selectedIssue={selectedIssue} onSelectIssue={setSelectedIssue} onCopyFixPrompt={copyFixPrompt} onVerifyIssue={(issue) => void runVerification(issue)} />}
      {screen === 'fixes' && <FixPacketViewer report={report} packets={fixPackets} projectId={reportProjectId} projectName={reportProjectName} onGenerateFixes={() => void generateFixes()} />}
      {screen === 'repair' && (
        <RepairWorkbench
          report={report}
          projectId={reportProjectId}
          projectName={reportProjectName}
          form={form}
          status={status}
          onAuditQueued={setAuditRunFromId}
          onRefreshReport={() => void refreshReportArtifacts()}
        />
      )}
      {screen === 'screenshots' && <ScreenshotGallery report={report} screenshots={screenshots} projectId={reportProjectId} projectName={reportProjectName} />}
      {screen === 'raw' && <RawJsonView report={report} />}
      {screen === 'settings' && <SettingsPanel status={status} />}
    </AppShell>
  )
}

function reportArtifactPaths(report: SnifferReport | null): Array<string | undefined> {
  return [
    ...(report?.crawlGraph?.screenshots ?? []),
    ...(report?.crawlGraph?.states ?? []).map((state) => state.screenshotPath),
    ...(report?.scenarioRuns ?? []).flatMap((run) => [
      ...(run.screenshots ?? []),
      ...(run.assertions ?? []).map((assertion) => assertion.screenshotPath)
    ]),
    ...(report?.issues ?? []).map((issue) => issue.screenshotPath),
    report?.runtimeDomSnapshot?.screenshotPath
  ]
}
