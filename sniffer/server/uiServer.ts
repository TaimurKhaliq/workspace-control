import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type RunStatus = 'queued' | 'running' | 'success' | 'error'

interface AuditRequest {
  repoPath: string
  url: string
  productGoal?: string
  scenario?: string
  criticMode?: string
  uxCritic?: string
  intentMode?: string
  provider?: string
  maxIterations?: number
  consistencyCheck?: boolean
}

interface RunRecord {
  runId: string
  status: RunStatus
  phase: string
  command: string[]
  logs: string[]
  stdout: string
  stderr: string
  startedAt: string
  completedAt?: string
  exitCode?: number | null
  reportPath?: string
}

const serverFile = fileURLToPath(import.meta.url)
const snifferRoot = path.resolve(path.dirname(serverFile), '..')
const reportsRoot = path.join(snifferRoot, 'reports', 'sniffer')
const latestDir = path.join(reportsRoot, 'latest')
const latestReportPath = path.join(latestDir, 'latest_report.json')
const latestMarkdownPath = path.join(latestDir, 'latest_report.md')
const runs = new Map<string, RunRecord>()

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
  if (req.method === 'POST' && parsed.pathname === '/api/audits') {
    return startAudit(req, res)
  }
  const auditMatch = parsed.pathname.match(/^\/api\/audits\/([^/]+)$/)
  if (req.method === 'GET' && auditMatch) {
    return json(res, 200, runs.get(auditMatch[1]) ?? { error: 'Run not found' })
  }
  if (req.method === 'GET' && parsed.pathname === '/api/reports/latest') {
    return sendJsonFile(res, latestReportPath)
  }
  if (req.method === 'GET' && parsed.pathname === '/api/reports/latest/markdown') {
    return sendTextFile(res, latestMarkdownPath, 'text/markdown; charset=utf-8')
  }
  if (req.method === 'GET' && parsed.pathname === '/api/reports/latest/screenshots') {
    return json(res, 200, await screenshotList())
  }
  if (req.method === 'GET' && parsed.pathname.startsWith('/api/reports/latest/artifacts/')) {
    return sendReportArtifact(res, decodeURIComponent(parsed.pathname.replace('/api/reports/latest/artifacts/', '')))
  }
  if (req.method === 'GET' && parsed.pathname === '/api/reports/latest/fix-packets') {
    return json(res, 200, await fixPacketList())
  }
  const fixPacketMatch = parsed.pathname.match(/^\/api\/reports\/latest\/fix-packets\/([^/]+)$/)
  if (req.method === 'GET' && fixPacketMatch) {
    return sendFixPacket(res, decodeURIComponent(fixPacketMatch[1]))
  }
  if (req.method === 'POST' && parsed.pathname === '/api/reports/latest/fix-packets/generate') {
    return startGenerateFixes(res)
  }
  const verifyMatch = parsed.pathname.match(/^\/api\/reports\/latest\/issues\/([^/]+)\/verify$/)
  if (req.method === 'POST' && verifyMatch) {
    const body = await readJsonBody<{ url?: string }>(req)
    return startVerify(res, decodeURIComponent(verifyMatch[1]), body.url)
  }

  return serveStaticUi(req, res, parsed.pathname)
}

async function startAudit(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if ([...runs.values()].some((run) => run.status === 'running')) {
    return json(res, 409, { error: 'A Sniffer run is already active.' })
  }
  const body = await readJsonBody<AuditRequest>(req)
  if (!body.repoPath?.trim()) return json(res, 400, { error: 'repoPath is required' })
  if (!body.url?.trim()) return json(res, 400, { error: 'url is required' })
  const args = [
    'audit',
    '--repo', body.repoPath,
    '--url', body.url,
    '--critic-mode', body.criticMode ?? 'deterministic',
    '--ux-critic', body.uxCritic ?? 'deterministic',
    '--intent-mode', body.intentMode ?? 'deterministic',
    '--provider', body.provider ?? 'auto',
    '--max-iterations', String(body.maxIterations ?? 3)
  ]
  if (body.scenario && body.scenario !== 'off' && body.scenario !== 'selected') args.push('--scenario', body.scenario)
  if (body.consistencyCheck) args.push('--consistency-check')
  if (body.productGoal?.trim()) args.push('--product-goal', body.productGoal.trim())
  const run = spawnCliRun('audit', args)
  return json(res, 202, { runId: run.runId })
}

function startGenerateFixes(res: ServerResponse): void {
  const run = spawnCliRun('generate-fixes', ['generate-fixes', '--report', latestReportPath])
  json(res, 202, { runId: run.runId })
}

function startVerify(res: ServerResponse, issueId: string, url?: string): void {
  if (!url) {
    json(res, 400, { error: 'url is required to verify an issue' })
    return
  }
  const run = spawnCliRun('verify', ['verify', '--issue', issueId, '--url', url, '--report', latestReportPath])
  json(res, 202, { runId: run.runId })
}

function spawnCliRun(phase: string, cliArgs: string[]): RunRecord {
  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const command = [tsxBin(), 'src/cli/index.ts', ...cliArgs]
  const run: RunRecord = {
    runId,
    status: 'running',
    phase: phaseLabel(phase),
    command,
    logs: [`$ ${command.map(shellQuote).join(' ')}`],
    stdout: '',
    stderr: '',
    startedAt: new Date().toISOString(),
    reportPath: latestReportPath
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
    run.status = 'error'
    run.phase = 'Error'
    run.stderr += `${error.message}\n`
    run.logs.push(error.message)
    run.completedAt = new Date().toISOString()
    void writeRunLog(run)
  })
  child.on('close', (code) => {
    run.exitCode = code
    run.status = code === 0 ? 'success' : 'error'
    run.phase = code === 0 ? 'Done' : 'Error'
    run.completedAt = new Date().toISOString()
    run.logs.push(`Process exited with code ${code}`)
    void writeRunLog(run)
  })
  return run
}

function appendRunOutput(run: RunRecord, stream: 'stdout' | 'stderr', text: string): void {
  run[stream] += text
  const lines = text.split(/\r?\n/).filter(Boolean)
  for (const line of lines) {
    run.logs.push(line)
    const phase = phaseFromLog(line)
    if (phase) run.phase = phase
  }
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
  return {
    version: pkg.version ?? '0.0.0',
    status: [...runs.values()].some((run) => run.status === 'running') ? 'running' : 'idle',
    provider: {
      configured: Boolean(process.env.SNIFFER_LLM_API_KEY && process.env.SNIFFER_LLM_BASE_URL && process.env.SNIFFER_LLM_MODEL),
      baseUrlConfigured: Boolean(process.env.SNIFFER_LLM_BASE_URL),
      model: process.env.SNIFFER_LLM_MODEL ?? null,
      apiStyle: process.env.SNIFFER_LLM_API_STYLE ?? 'auto'
    },
    agent: {
      configured: Boolean(process.env.SNIFFER_CODEX_COMMAND),
      name: process.env.SNIFFER_AGENT ?? 'manual'
    },
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

async function screenshotList(): Promise<Array<Record<string, string>>> {
  const dir = path.join(latestDir, 'screenshots')
  const files = await walkFiles(dir).catch(() => [])
  return files
    .filter((file) => /\.(png|jpe?g|webp)$/i.test(file))
    .map((file) => {
      const rel = path.relative(latestDir, file)
      return {
        name: path.basename(file),
        relativePath: rel,
        group: path.dirname(rel).replace(/^screenshots\/?/, '') || 'states',
        url: `/api/reports/latest/artifacts/${encodeURIComponent(rel)}`
      }
    })
}

async function fixPacketList(): Promise<Array<Record<string, string>>> {
  const dir = path.join(latestDir, 'fix_packets')
  const files = await walkFiles(dir).catch(() => [])
  return files
    .filter((file) => file.endsWith('.json') || file.endsWith('.md'))
    .map((file) => {
      const issueId = path.basename(file).replace(/\.(json|md)$/i, '')
      const rel = path.relative(latestDir, file)
      return { issueId, name: path.basename(file), relativePath: rel, kind: path.extname(file).slice(1) }
    })
}

async function sendFixPacket(res: ServerResponse, issueId: string): Promise<void> {
  const base = safeJoin(path.join(latestDir, 'fix_packets'), `${issueId}.md`)
  if (!base) return json(res, 400, { error: 'Invalid issue id' })
  return sendTextFile(res, base, 'text/markdown; charset=utf-8')
}

async function sendReportArtifact(res: ServerResponse, relativePath: string): Promise<void> {
  const file = safeJoin(latestDir, relativePath)
  if (!file) return json(res, 400, { error: 'Invalid artifact path' })
  const type = contentType(file)
  await sendFile(res, file, type)
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
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
