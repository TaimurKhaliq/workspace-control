import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSnifferEnv } from '../src/config/env.js'
import { initProject, listProjects, getProject, removeProject } from '../src/projects/registry.js'
import { latestReportDir, projectLatestReportDir } from '../src/reporting/paths.js'
import { generateFixPackets } from '../src/repair/fixPackets.js'
import type { FixPacket, SnifferReport } from '../src/types.js'
import { retrieveEvidenceFromReport } from '../src/evidence/retrieval.js'
import { resolveReportArtifact } from './artifacts.js'
import {
  buildDashboardAuditCommand,
  isOpenAICompatibleProviderConfigured,
  parseProgressEvent,
  type DashboardAuditRequest,
  type DashboardRunEvent,
  type DashboardRunStatus
} from './auditRunner.js'
import { reportSlicePayload, type ReportSliceName } from './reportSlices.js'
import {
  attachRepairStatuses,
  buildRepairCommand,
  listRepairHistory,
  packetLooksDestructive,
  readAttemptArtifacts,
  readFixPacketDetail,
  summarizeIssues,
  type RepairAgent,
  type RepairMode,
  type RepairStatus
} from './repairWorkbench.js'

loadSnifferEnv()

type RunStatus = DashboardRunStatus

interface RunRecord {
  runId: string
  status: RunStatus
  phase: string
  command: string[]
  events: DashboardRunEvent[]
  logs: string[]
  stdout: string
  stderr: string
  stdoutTail: string
  stderrTail: string
  startedAt: string
  endedAt?: string
  exitCode?: number | null
  errorSummary?: string
  reportPath?: string
  projectId?: string
}

interface RepairStartRequest {
  project?: string
  issueId?: string
  agent?: RepairAgent
  mode?: RepairMode
  allowDestructiveConfirmed?: boolean
}

interface RepairRunRecord {
  repairRunId: string
  status: RepairStatus
  issueId: string
  project?: string
  agent: RepairAgent
  mode: RepairMode
  command: string[]
  commandSummary: string
  stdout: string
  stderr: string
  logs: string[]
  stdoutTail: string
  stderrTail: string
  startedAt: string
  endedAt?: string
  exitCode?: number | null
  reportPath: string
  repairAttemptDir?: string
  changedFiles: string[]
  diffSummary: string
  rawDiff?: string
  verification: {
    status: 'not_run' | 'passed' | 'failed' | 'inconclusive' | 'running'
    command?: string
    summary?: string
  }
}

const serverFile = fileURLToPath(import.meta.url)
const snifferRoot = path.resolve(path.dirname(serverFile), '..')
const reportsRoot = path.join(snifferRoot, 'reports', 'sniffer')
const latestDir = latestReportDir(snifferRoot)
const latestReportPath = path.join(latestDir, 'latest_report.json')
const latestMarkdownPath = path.join(latestDir, 'latest_report.md')
const runs = new Map<string, RunRecord>()
const repairRuns = new Map<string, RepairRunRecord>()

const port = Number(process.env.SNIFFER_UI_PORT ?? 4877)
const host = process.env.SNIFFER_UI_HOST ?? '127.0.0.1'

const server = createServer((req, res) => {
  void route(req, res).catch((error) => {
    console.error(error)
    json(res, 500, { error: error instanceof Error ? error.message : String(error) })
  })
})

server.listen(port, host, () => {
  console.log(`Sniffer UI server listening on http://${host}:${port}`)
})

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = new URL(req.url ?? '/', `http://${req.headers.host ?? `${host}:${port}`}`)
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'GET' && parsed.pathname === '/api/status') {
    return json(res, 200, await statusPayload())
  }
  if (req.method === 'GET' && parsed.pathname === '/api/projects') {
    return json(res, 200, await listProjects(snifferRoot))
  }
  if (req.method === 'POST' && parsed.pathname === '/api/projects') {
    const body = await readJsonBody<{ id?: string; name?: string; repoPath?: string; appUrl?: string; url?: string; productGoal?: string; devCommand?: string; buildCommand?: string; testCommand?: string }>(req)
    if (!body.name?.trim()) return json(res, 400, { error: 'Project name is required' })
    if (!body.repoPath?.trim()) return json(res, 400, { error: 'Repo path is required' })
    const appUrl = body.appUrl ?? body.url
    if (!appUrl?.trim()) return json(res, 400, { error: 'App URL is required' })
    const project = await initProject({
      id: body.id,
      name: body.name,
      repoPath: body.repoPath,
      appUrl,
      productGoal: body.productGoal,
      devCommand: body.devCommand,
      buildCommand: body.buildCommand,
      testCommand: body.testCommand
    }, snifferRoot)
    return json(res, 201, project)
  }
  const projectMatch = parsed.pathname.match(/^\/api\/projects\/([^/]+)$/)
  if (req.method === 'GET' && projectMatch) {
    const project = await getProject(decodeURIComponent(projectMatch[1]), snifferRoot)
    return project ? json(res, 200, project) : json(res, 404, { error: 'Project not found' })
  }
  if (req.method === 'DELETE' && projectMatch) {
    const removed = await removeProject(decodeURIComponent(projectMatch[1]), snifferRoot)
    return removed ? json(res, 200, { removed: true }) : json(res, 404, { error: 'Project not found' })
  }
  if (req.method === 'POST' && parsed.pathname === '/api/audits') {
    return startAudit(req, res)
  }
  const auditMatch = parsed.pathname.match(/^\/api\/audits\/([^/]+)$/)
  if (req.method === 'GET' && auditMatch) {
    return json(res, 200, runs.get(auditMatch[1]) ?? { error: 'Run not found' })
  }
  if (req.method === 'GET' && parsed.pathname === '/api/reports/latest') {
    return sendJsonFile(res, latestReportPathFor(parsed))
  }
  if (req.method === 'GET' && parsed.pathname === '/api/reports/latest/markdown') {
    return sendTextFile(res, path.join(latestDirFor(parsed), 'latest_report.md'), 'text/markdown; charset=utf-8')
  }
  if (req.method === 'GET' && parsed.pathname === '/api/reports/latest/screenshots') {
    return json(res, 200, await screenshotList(latestDirFor(parsed), projectQuery(parsed)))
  }
  if (req.method === 'GET' && parsed.pathname === '/api/reports/latest/issues') {
    const reportPath = latestReportPathFor(parsed)
    const report = await readJsonFile<SnifferReport>(reportPath).catch(() => undefined)
    if (!report) return json(res, 404, { error: 'Latest report not found' })
    const issues = await attachRepairStatuses(summarizeIssues(report, latestDirFor(parsed), projectQuery(parsed)), latestDirFor(parsed))
    return json(res, 200, issues)
  }
  const reportSliceMatch = parsed.pathname.match(/^\/api\/reports\/latest\/(source-inventory|ui-intent-graph|evidence-retrieval|graph-refinements|evidence-packets|suppressions)$/)
  if (req.method === 'GET' && reportSliceMatch) {
    const report = await readJsonFile<SnifferReport>(latestReportPathFor(parsed)).catch(() => undefined)
    if (!report) return json(res, 404, { error: 'Latest report not found' })
    const payload = reportSlicePayload(report, reportSliceMatch[1] as ReportSliceName)
    return payload ? json(res, 200, payload) : json(res, 404, { error: 'Report section not available' })
  }
  if (req.method === 'GET' && parsed.pathname === '/api/reports/latest/retrieve-evidence') {
    const report = await readJsonFile<SnifferReport>(latestReportPathFor(parsed)).catch(() => undefined)
    if (!report) return json(res, 404, { error: 'Latest report not found' })
    const query = parsed.searchParams.get('query')?.trim()
    if (!query) return json(res, 400, { error: 'query is required' })
    const packet = retrieveEvidenceFromReport(query, report, {
      fixPackets: await fixPacketsForRetrieval(latestDirFor(parsed)),
      includeRuntime: true,
      includeScreenshots: true,
      includePriorRepairs: true,
      maxResults: Number(parsed.searchParams.get('maxResults') ?? 16)
    })
    return json(res, 200, packet)
  }
  if (req.method === 'GET' && parsed.pathname.startsWith('/api/reports/latest/artifacts/')) {
    return sendReportArtifact(res, latestDirFor(parsed), parsed.pathname.replace('/api/reports/latest/artifacts/', ''))
  }
  if (req.method === 'GET' && parsed.pathname === '/api/reports/latest/fix-packets') {
    return json(res, 200, await fixPacketList(latestDirFor(parsed)))
  }
  const fixPacketMatch = parsed.pathname.match(/^\/api\/reports\/latest\/fix-packets\/([^/]+)$/)
  if (req.method === 'GET' && fixPacketMatch) {
    return sendFixPacket(res, latestDirFor(parsed), decodeURIComponent(fixPacketMatch[1]), parsed)
  }
  if (req.method === 'POST' && parsed.pathname === '/api/reports/latest/fix-packets/generate') {
    return startGenerateFixes(res, latestReportPathFor(parsed), projectQuery(parsed))
  }
  if (req.method === 'POST' && parsed.pathname === '/api/reports/latest/generate-fixes') {
    const body = await readJsonBody<{ project?: string; issueIds?: string[] }>(req)
    const projectId = body.project?.trim() || projectQuery(parsed)
    return generateFixesNow(res, reportPathForProject(projectId), latestDirForProject(projectId), body.issueIds)
  }
  const verifyMatch = parsed.pathname.match(/^\/api\/reports\/latest\/issues\/([^/]+)\/verify$/)
  if (req.method === 'POST' && verifyMatch) {
    const body = await readJsonBody<{ url?: string }>(req)
    return startVerify(res, latestReportPathFor(parsed), decodeURIComponent(verifyMatch[1]), body.url, projectQuery(parsed))
  }
  if (req.method === 'POST' && parsed.pathname === '/api/repairs/start') {
    return startRepair(req, res)
  }
  if (req.method === 'GET' && parsed.pathname === '/api/repairs/history') {
    const projectId = projectQuery(parsed)
    const issueId = parsed.searchParams.get('issueId')?.trim() || undefined
    return json(res, 200, await listRepairHistory(latestDirForProject(projectId), issueId))
  }
  const repairMatch = parsed.pathname.match(/^\/api\/repairs\/([^/]+)$/)
  if (req.method === 'GET' && repairMatch) {
    const run = repairRuns.get(decodeURIComponent(repairMatch[1]))
    return run ? json(res, 200, publicRepairRun(run)) : json(res, 404, { error: 'Repair run not found' })
  }
  const repairLogsMatch = parsed.pathname.match(/^\/api\/repairs\/([^/]+)\/logs$/)
  if (req.method === 'GET' && repairLogsMatch) {
    const run = repairRuns.get(decodeURIComponent(repairLogsMatch[1]))
    return run ? json(res, 200, { stdout: run.stdout, stderr: run.stderr, logs: run.logs }) : json(res, 404, { error: 'Repair run not found' })
  }
  const repairVerifyMatch = parsed.pathname.match(/^\/api\/repairs\/([^/]+)\/verify$/)
  if (req.method === 'POST' && repairVerifyMatch) {
    return startRepairVerification(req, res, decodeURIComponent(repairVerifyMatch[1]))
  }
  const repairAuditMatch = parsed.pathname.match(/^\/api\/repairs\/([^/]+)\/rerun-audit$/)
  if (req.method === 'POST' && repairAuditMatch) {
    return startRepairAuditRerun(req, res, decodeURIComponent(repairAuditMatch[1]))
  }

  return serveStaticUi(req, res, parsed.pathname)
}

async function startAudit(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if ([...runs.values()].some((run) => run.status === 'running')) {
    return json(res, 409, { error: 'A Sniffer run is already active.' })
  }
  const body = await readJsonBody<DashboardAuditRequest>(req)
  if (!body.projectId && !body.repoPath?.trim()) return json(res, 400, { error: 'repoPath is required' })
  if (!body.projectId && !body.url?.trim()) return json(res, 400, { error: 'url is required' })
  const reportPath = body.projectId
    ? path.join(projectLatestReportDir(body.projectId, snifferRoot), 'latest_report.json')
    : latestReportPath
  let built
  try {
    built = buildDashboardAuditCommand(body, { providerConfigured: isOpenAICompatibleProviderConfigured(process.env) })
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : String(error) })
  }
  const run = spawnCliRun('audit', built.cliArgs, reportPath, body.projectId)
  return json(res, 202, { runId: run.runId, command: run.command, auditDepth: built.auditDepth })
}

function startGenerateFixes(res: ServerResponse, reportPath: string, projectId?: string, issueIds?: string[]): void {
  const run = spawnCliRun('generate-fixes', ['generate-fixes', '--report', reportPath], reportPath, projectId)
  json(res, 202, { runId: run.runId, issueIds })
}

async function generateFixesNow(res: ServerResponse, reportPath: string, reportDir: string, issueIds?: string[]): Promise<void> {
  const packets = await generateFixPackets(reportPath)
  const selected = issueIds?.length ? packets.filter((packet) => issueIds.includes(packet.issue_id)) : packets
  return json(res, 200, {
    packets: await fixPacketList(reportDir),
    generated: selected.map((packet) => ({ issueId: packet.issue_id, title: packet.title }))
  })
}

function startVerify(res: ServerResponse, reportPath: string, issueId: string, url?: string, projectId?: string): void {
  if (!url) {
    json(res, 400, { error: 'url is required to verify an issue' })
    return
  }
  const run = spawnCliRun('verify', ['verify', '--issue', issueId, '--url', url, '--report', reportPath], reportPath, projectId)
  json(res, 202, { runId: run.runId })
}

async function startRepair(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if ([...repairRuns.values()].some((run) => run.status === 'running' || run.status === 'queued')) {
    return json(res, 409, { error: 'A repair attempt is already active.' })
  }
  const body = await readJsonBody<RepairStartRequest>(req)
  const issueId = body.issueId?.trim()
  if (!issueId) return json(res, 400, { error: 'issueId is required' })
  const agent = body.agent ?? 'manual'
  const mode = body.mode ?? 'repair-proof'
  if (!['manual', 'codex'].includes(agent)) return json(res, 400, { error: 'agent must be manual or codex' })
  if (!['repair-proof', 'apply-fix'].includes(mode)) return json(res, 400, { error: 'mode must be repair-proof or apply-fix' })
  if (mode === 'repair-proof' && agent !== 'manual') return json(res, 400, { error: 'repair-proof only supports manual mode' })
  if (agent === 'codex' && !process.env.SNIFFER_CODEX_COMMAND) {
    return json(res, 400, { error: 'Codex is not configured. Set SNIFFER_CODEX_COMMAND before running codex repairs.' })
  }
  const projectId = body.project?.trim() || undefined
  const reportPath = reportPathForProject(projectId)
  const reportDir = latestDirForProject(projectId)
  const report = await readJsonFile<SnifferReport>(reportPath).catch(() => undefined)
  if (!report) return json(res, 404, { error: 'Latest report not found' })
  let packet = await readFixPacketDetail(reportDir, issueId)
  if (!packet || packet.json?.allowed_paths.length === 0) {
    await generateFixPackets(reportPath)
    packet = await readFixPacketDetail(reportDir, issueId)
  }
  if (!packet) return json(res, 404, { error: 'Fix packet not found for issue. Generate fix packets and try again.' })
  if (packetLooksDestructive(packet) && !body.allowDestructiveConfirmed) {
    return json(res, 409, { error: 'Fix packet may contain destructive actions. Explicit confirmation is required.' })
  }

  const spec = buildRepairCommand({ issueId, reportPath, agent, mode })
  const run = spawnRepairRun({
    issueId,
    projectId,
    agent,
    mode,
    reportPath,
    cliArgs: spec.cliArgs,
    phase: spec.phase,
    commandSummary: spec.commandSummary
  })
  return json(res, 202, { repairRunId: run.repairRunId, status: run.status })
}

async function startRepairVerification(req: IncomingMessage, res: ServerResponse, repairRunId: string): Promise<void> {
  const run = repairRuns.get(repairRunId)
  if (!run) return json(res, 404, { error: 'Repair run not found' })
  if (run.verification.status === 'running') return json(res, 409, { error: 'Verification is already running for this repair.' })
  const body = await readJsonBody<{ url?: string }>(req)
  const report = await readJsonFile<SnifferReport>(run.reportPath).catch(() => undefined)
  const project = run.project ? await getProject(run.project, snifferRoot).catch(() => undefined) : undefined
  const url = body.url?.trim() || project?.appUrl || report?.crawlGraph.startUrl
  if (!url) return json(res, 400, { error: 'A URL is required to verify this issue.' })
  run.verification = {
    status: 'running',
    command: `${tsxBin()} src/cli/index.ts verify --issue ${run.issueId} --url ${url} --report ${run.reportPath}`
  }
  const command = [tsxBin(), 'src/cli/index.ts', 'verify', '--issue', run.issueId, '--url', url, '--report', run.reportPath]
  const child = spawn(command[0], command.slice(1), {
    cwd: snifferRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', (chunk) => appendRepairOutput(run, 'stdout', chunk.toString()))
  child.stderr.on('data', (chunk) => appendRepairOutput(run, 'stderr', chunk.toString()))
  child.on('error', (error) => {
    run.verification = { status: 'failed', command: run.verification.command, summary: error.message }
    void writeRepairRunLog(run)
  })
  child.on('close', (code) => {
    run.verification = {
      status: code === 0 ? 'passed' : 'failed',
      command: run.verification.command,
      summary: `Verification exited with code ${code}`
    }
    void refreshRepairArtifacts(run).then(() => writeRepairRunLog(run))
  })
  return json(res, 202, { repairRunId: run.repairRunId, status: run.verification.status })
}

async function startRepairAuditRerun(req: IncomingMessage, res: ServerResponse, repairRunId: string): Promise<void> {
  const repair = repairRuns.get(repairRunId)
  if (!repair) return json(res, 404, { error: 'Repair run not found' })
  const body = await readJsonBody<Partial<DashboardAuditRequest>>(req)
  const report = await readJsonFile<SnifferReport>(repair.reportPath).catch(() => undefined)
  const project = repair.project ? await getProject(repair.project, snifferRoot).catch(() => undefined) : undefined
  const auditBody: DashboardAuditRequest = project
    ? { ...body, projectId: project.id, repoPath: project.repoPath, url: project.appUrl, scenario: body.scenario ?? 'all' }
    : {
      ...body,
      repoPath: body.repoPath ?? report?.sourceGraph.repoPath,
      url: body.url ?? report?.crawlGraph.startUrl,
      scenario: body.scenario ?? 'all'
    }
  const fakeReq = { [Symbol.asyncIterator]: async function* () { yield Buffer.from(JSON.stringify(auditBody)) } } as unknown as IncomingMessage
  return startAudit(fakeReq, res)
}

function spawnCliRun(phase: string, cliArgs: string[], reportPath = latestReportPath, projectId?: string): RunRecord {
  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const command = [tsxBin(), 'src/cli/index.ts', ...cliArgs]
  const run: RunRecord = {
    runId,
    status: 'running',
    phase: phaseLabel(phase),
    command,
    events: [{
      type: 'phase_started',
      phase: phaseLabel(phase),
      message: `${phaseLabel(phase)} queued`,
      timestamp: new Date().toISOString()
    }],
    logs: [`$ ${command.map(shellQuote).join(' ')}`],
    stdout: '',
    stderr: '',
    stdoutTail: '',
    stderrTail: '',
    startedAt: new Date().toISOString(),
    reportPath,
    projectId
  }
  runs.set(runId, run)
  void writeRunLog(run)

  const child = spawn(command[0], command.slice(1), {
    cwd: snifferRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  child.stdout.on('data', (chunk) => appendRunOutput(run, 'stdout', chunk.toString()))
  child.stderr.on('data', (chunk) => appendRunOutput(run, 'stderr', chunk.toString()))
  child.on('error', (error) => {
    run.status = 'failed'
    run.phase = 'Error'
    run.stderr += `${error.message}\n`
    run.stderrTail = tail(run.stderr)
    run.logs.push(error.message)
    run.errorSummary = error.message
    run.events.push({ type: 'error', phase: 'Error', message: error.message, timestamp: new Date().toISOString() })
    run.endedAt = new Date().toISOString()
    void writeRunLog(run)
  })
  child.on('close', (code) => {
    run.exitCode = code
    run.status = code === 0 ? 'succeeded' : 'failed'
    run.phase = code === 0 ? 'Done' : 'Error'
    run.endedAt = new Date().toISOString()
    if (code !== 0) run.errorSummary = tail(run.stderr || `Process exited with code ${code}`, 800)
    run.events.push({
      type: code === 0 ? 'phase_completed' : 'error',
      phase: run.phase,
      message: `Process exited with code ${code}`,
      timestamp: new Date().toISOString()
    })
    run.logs.push(`Process exited with code ${code}`)
    void writeRunLog(run)
  })
  return run
}

function spawnRepairRun(input: {
  issueId: string
  projectId?: string
  agent: RepairAgent
  mode: RepairMode
  reportPath: string
  cliArgs: string[]
  phase: string
  commandSummary: string
}): RepairRunRecord {
  const repairRunId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const command = [tsxBin(), 'src/cli/index.ts', ...input.cliArgs]
  const run: RepairRunRecord = {
    repairRunId,
    status: 'running',
    issueId: input.issueId,
    project: input.projectId,
    agent: input.agent,
    mode: input.mode,
    command,
    commandSummary: input.commandSummary,
    stdout: '',
    stderr: '',
    stdoutTail: '',
    stderrTail: '',
    logs: [`$ ${command.map(shellQuote).join(' ')}`],
    startedAt: new Date().toISOString(),
    reportPath: input.reportPath,
    changedFiles: [],
    diffSummary: '',
    verification: { status: 'not_run' }
  }
  repairRuns.set(repairRunId, run)
  void writeRepairRunLog(run)
  const child = spawn(command[0], command.slice(1), {
    cwd: snifferRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', (chunk) => appendRepairOutput(run, 'stdout', chunk.toString()))
  child.stderr.on('data', (chunk) => appendRepairOutput(run, 'stderr', chunk.toString()))
  child.on('error', (error) => {
    run.status = 'failed'
    run.stderr += `${error.message}\n`
    run.stderrTail = tail(run.stderr)
    run.logs.push(error.message)
    run.endedAt = new Date().toISOString()
    void writeRepairRunLog(run)
  })
  child.on('close', (code) => {
    run.exitCode = code
    run.status = code === 0 ? 'succeeded' : 'failed'
    run.endedAt = new Date().toISOString()
    run.logs.push(`Process exited with code ${code}`)
    void refreshRepairArtifacts(run).then(() => writeRepairRunLog(run))
  })
  return run
}

function appendRepairOutput(run: RepairRunRecord, stream: 'stdout' | 'stderr', text: string): void {
  run[stream] += text
  if (stream === 'stdout') run.stdoutTail = tail(run.stdout)
  else run.stderrTail = tail(run.stderr)
  for (const line of text.split(/\r?\n/).filter(Boolean)) run.logs.push(line)
  run.logs = run.logs.slice(-300)
  void writeRepairRunLog(run)
}

async function refreshRepairArtifacts(run: RepairRunRecord): Promise<void> {
  const history = await listRepairHistory(path.dirname(path.resolve(run.reportPath)), run.issueId)
  const latest = history[0]
  if (latest) {
    run.repairAttemptDir = latest.attemptDir
    run.changedFiles = latest.changedFiles
    run.diffSummary = latest.diffSummary
    if (run.verification.status !== 'running') run.verification = latest.verification
  }
  const artifacts = await readAttemptArtifacts(run.repairAttemptDir)
  run.changedFiles = artifacts.changedFiles.length ? artifacts.changedFiles : run.changedFiles
  run.diffSummary = artifacts.diffSummary || run.diffSummary
  run.rawDiff = artifacts.rawDiff
}

async function writeRepairRunLog(run: RepairRunRecord): Promise<void> {
  const dir = path.join(reportsRoot, 'ui-repairs', run.repairRunId)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'repair_run.json'), JSON.stringify(publicRepairRun(run), null, 2))
  await writeFile(path.join(dir, 'repair_run.log'), run.logs.join('\n'))
}

function publicRepairRun(run: RepairRunRecord): RepairRunRecord {
  return {
    ...run,
    stdoutTail: tail(run.stdout),
    stderrTail: tail(run.stderr),
    logs: run.logs.slice(-300)
  }
}

function appendRunOutput(run: RunRecord, stream: 'stdout' | 'stderr', text: string): void {
  run[stream] += text
  if (stream === 'stdout') run.stdoutTail = tail(run.stdout)
  else run.stderrTail = tail(run.stderr)
  const lines = text.split(/\r?\n/).filter(Boolean)
  for (const line of lines) {
    const event = parseProgressEvent(line)
    if (event) {
      run.events.push(event)
      if (event.type === 'phase_started' || event.type === 'phase_completed') run.phase = event.phase
      if (event.type === 'error') {
        run.phase = event.phase
        run.errorSummary = event.message
      }
      continue
    }
    run.logs.push(line)
    const phase = phaseFromLog(line)
    if (phase) run.phase = phase
  }
  run.events = run.events.slice(-300)
  run.logs = run.logs.slice(-250)
  void writeRunLog(run)
}

async function writeRunLog(run: RunRecord): Promise<void> {
  const dir = path.join(reportsRoot, 'ui-runs', run.runId)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'run.json'), JSON.stringify(run, null, 2))
  await writeFile(path.join(dir, 'run.log'), run.logs.join('\n'))
}

async function statusPayload(): Promise<Record<string, unknown>> {
  const pkg = JSON.parse(await readFile(path.join(snifferRoot, 'package.json'), 'utf8')) as { version?: string }
  const latest = await readJsonFile<Record<string, unknown>>(latestReportPath).catch(() => undefined)
  const projects = await listProjects(snifferRoot).catch(() => [])
  const providerConfigured = isOpenAICompatibleProviderConfigured(process.env)
  return {
    version: pkg.version ?? '0.0.0',
    status: [...runs.values()].some((run) => run.status === 'running') ? 'running' : 'idle',
    provider: {
      configured: providerConfigured,
      baseUrlConfigured: Boolean(process.env.SNIFFER_LLM_BASE_URL),
      model: process.env.SNIFFER_LLM_MODEL ?? null,
      apiStyle: process.env.SNIFFER_LLM_API_STYLE ?? 'auto'
    },
    agent: {
      configured: Boolean(process.env.SNIFFER_CODEX_COMMAND),
      name: process.env.SNIFFER_AGENT ?? 'manual'
    },
    projects,
    latestReport: latest
      ? {
        path: latestReportPath,
        generatedAt: latest.generatedAt,
        issues: Array.isArray(latest.issues) ? latest.issues.length : 0,
        rawFindings: Array.isArray(latest.rawFindings) ? latest.rawFindings.length : 0,
        repoPath: nested(latest, ['sourceGraph', 'repoPath']),
        appUrl: nested(latest, ['crawlGraph', 'startUrl'])
      }
      : null,
    reportDir: latestDir
  }
}

function projectQuery(parsed: URL): string | undefined {
  const project = parsed.searchParams.get('project')
  return project?.trim() || undefined
}

function latestDirFor(parsed: URL): string {
  const project = projectQuery(parsed)
  return latestDirForProject(project)
}

function latestReportPathFor(parsed: URL): string {
  return reportPathForProject(projectQuery(parsed))
}

function latestDirForProject(project?: string): string {
  return project ? projectLatestReportDir(project, snifferRoot) : latestDir
}

function reportPathForProject(project?: string): string {
  return path.join(latestDirForProject(project), 'latest_report.json')
}

async function screenshotList(baseDir = latestDir, projectId?: string): Promise<Array<Record<string, string>>> {
  const dir = path.join(baseDir, 'screenshots')
  const files = await walkFiles(dir).catch(() => [])
  return files
    .filter((file) => /\.(png|jpe?g|webp)$/i.test(file))
    .map((file) => {
      const rel = path.relative(baseDir, file)
      return {
        name: path.basename(file),
        relativePath: rel,
        group: path.dirname(rel).replace(/^screenshots\/?/, '') || 'states',
        url: `/api/reports/latest/artifacts/${encodeURIComponent(rel)}${projectId ? `?project=${encodeURIComponent(projectId)}` : ''}`
      }
    })
}

async function fixPacketList(baseDir = latestDir): Promise<Array<Record<string, string>>> {
  const dir = path.join(baseDir, 'fix_packets')
  const files = await walkFiles(dir).catch(() => [])
  return files
    .filter((file) => file.endsWith('.json') || file.endsWith('.md'))
    .map((file) => {
      const issueId = path.basename(file).replace(/\.(json|md)$/i, '')
      const rel = path.relative(baseDir, file)
      return { issueId, name: path.basename(file), relativePath: rel, kind: path.extname(file).slice(1) }
    })
}

async function fixPacketsForRetrieval(baseDir = latestDir): Promise<FixPacket[]> {
  const items = await fixPacketList(baseDir)
  const issueIds = [...new Set(items.map((item) => item.issueId))]
  const packets = await Promise.all(issueIds.map((issueId) => readFixPacketDetail(baseDir, issueId).catch(() => undefined)))
  return packets.map((packet) => packet?.json).filter((packet): packet is FixPacket => Boolean(packet))
}

async function sendFixPacket(res: ServerResponse, baseDir: string, issueId: string, parsed?: URL): Promise<void> {
  if (parsed?.searchParams.get('format') === 'json') {
    const detail = await readFixPacketDetail(baseDir, issueId)
    return detail ? json(res, 200, detail) : json(res, 404, { error: 'Fix packet not found' })
  }
  const base = safeJoin(path.join(baseDir, 'fix_packets'), `${issueId}.md`)
  if (!base) return json(res, 400, { error: 'Invalid issue id' })
  return sendTextFile(res, base, 'text/markdown; charset=utf-8')
}

async function sendReportArtifact(res: ServerResponse, baseDir: string, relativePath: string): Promise<void> {
  const resolved = resolveReportArtifact(baseDir, relativePath)
  if (!resolved.file) return json(res, 400, { error: 'Invalid artifact path' })
  const type = contentType(resolved.file)
  await sendFile(res, resolved.file, type)
}

async function serveStaticUi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  if (req.method !== 'GET') return json(res, 404, { error: 'Not found' })
  const distDir = path.join(snifferRoot, 'ui', 'dist')
  const candidate = pathname === '/' ? 'index.html' : pathname.slice(1)
  const file = safeJoin(distDir, candidate)
  if (file && await exists(file) && (await stat(file)).isFile()) {
    return sendFile(res, file, contentType(file))
  }
  const index = path.join(distDir, 'index.html')
  if (await exists(index)) return sendFile(res, index, 'text/html; charset=utf-8')
  json(res, 404, {
    error: 'Sniffer UI build not found. Run `npm --prefix ui install` and `npm run ui:build`, or run the Vite dev server in sniffer/ui.'
  })
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) as T : {} as T
}

async function sendJsonFile(res: ServerResponse, file: string): Promise<void> {
  const data = await readJsonFile(file).catch(() => undefined)
  if (!data) return json(res, 404, { error: 'Latest report not found' })
  json(res, 200, data)
}

async function sendTextFile(res: ServerResponse, file: string, type: string): Promise<void> {
  if (!await exists(file)) return json(res, 404, { error: 'File not found' })
  return sendFile(res, file, type)
}

async function sendFile(res: ServerResponse, file: string, type: string): Promise<void> {
  if (!await exists(file)) return json(res, 404, { error: 'File not found' })
  res.writeHead(200, { 'Content-Type': type })
  createReadStream(file).pipe(res)
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body, null, 2))
}

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', process.env.SNIFFER_UI_CORS_ORIGIN ?? '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

async function readJsonFile<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(() => true).catch(() => false)
}

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await walkFiles(full))
    if (entry.isFile()) files.push(full)
  }
  return files
}

function safeJoin(root: string, relative: string): string | undefined {
  const file = path.resolve(root, relative)
  return file.startsWith(path.resolve(root) + path.sep) || file === path.resolve(root) ? file : undefined
}

function tsxBin(): string {
  return process.platform === 'win32'
    ? path.join(snifferRoot, 'node_modules', '.bin', 'tsx.cmd')
    : path.join(snifferRoot, 'node_modules', '.bin', 'tsx')
}

function phaseLabel(phase: string): string {
  if (phase === 'audit') return 'Starting audit'
  if (phase === 'verify') return 'Running verification'
  if (phase === 'generate-fixes') return 'Generating fix packets'
  return phase
}

function phaseFromLog(line: string): string | undefined {
  if (/discover/i.test(line)) return 'Discovering source'
  if (/crawl/i.test(line)) return 'Crawling UI'
  if (/scenario/i.test(line)) return 'Running scenarios'
  if (/critic|llm/i.test(line)) return 'Calling critic'
  if (/fix packet/i.test(line)) return 'Generating fix packets'
  if (/Wrote .*latest_report/i.test(line)) return 'Writing report'
  return undefined
}

function tail(text: string, max = 6000): string {
  return text.length > max ? text.slice(text.length - max) : text
}

function contentType(file: string): string {
  const ext = path.extname(file).toLowerCase()
  if (ext === '.html') return 'text/html; charset=utf-8'
  if (ext === '.js') return 'text/javascript; charset=utf-8'
  if (ext === '.css') return 'text/css; charset=utf-8'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.md') return 'text/markdown; charset=utf-8'
  return 'application/octet-stream'
}

function shellQuote(value: string): string {
  return /\s/.test(value) ? JSON.stringify(value) : value
}

function nested(value: Record<string, unknown>, keys: string[]): unknown {
  let current: unknown = value
  for (const key of keys) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}
