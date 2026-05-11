import { OpenAICompatibleProvider } from '../src/llm/openAICompatibleProvider.js'

export type DashboardAuditDepth = 'fast' | 'deep'
export type DashboardRunStatus = 'queued' | 'running' | 'succeeded' | 'failed'
export type DashboardRunEventType = 'phase_started' | 'phase_completed' | 'log' | 'error'

export interface DashboardAuditRequest {
  projectId?: string
  repoPath?: string
  url?: string
  productGoal?: string
  scenario?: string
  criticMode?: string
  uxCritic?: string
  intentMode?: string
  provider?: string
  discoveryMode?: string
  maxIterations?: number
  consistencyCheck?: boolean
  auditDepth?: DashboardAuditDepth
  executeGeneratedScenarios?: boolean
  productExperienceCritic?: string
}

export interface DashboardRunEvent {
  type: DashboardRunEventType
  phase: string
  message: string
  timestamp: string
}

export interface BuiltAuditCommand {
  cliArgs: string[]
  auditDepth: DashboardAuditDepth
  provider: string
  productExperienceCritic?: string
  executeGeneratedScenarios: boolean
}

export interface AuditCommandBuildOptions {
  providerConfigured: boolean
}

export function isOpenAICompatibleProviderConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return new OpenAICompatibleProvider(env).isConfigured()
}

export function buildDashboardAuditCommand(input: DashboardAuditRequest, options: AuditCommandBuildOptions): BuiltAuditCommand {
  const requestedDepth = input.auditDepth ?? (options.providerConfigured ? 'deep' : 'fast')
  const depth: DashboardAuditDepth = requestedDepth === 'deep' ? 'deep' : 'fast'
  const provider = providerFor(input, depth)
  const productExperienceCritic = productExperienceCriticFor(input, depth)
  if (requiresOpenAICompatibleProvider(provider, productExperienceCritic, depth) && !options.providerConfigured) {
    throw new Error('LLM provider is not configured. Run provider check or use fast deterministic audit.')
  }

  const cliArgs = ['audit']
  if (input.projectId) cliArgs.push('--project', input.projectId)
  else cliArgs.push('--repo', input.repoPath ?? '', '--url', input.url ?? '')

  cliArgs.push(
    '--discovery-mode', input.discoveryMode ?? 'hybrid',
    '--scenario', scenarioFor(input),
    '--critic-mode', input.criticMode ?? 'deterministic',
    '--ux-critic', input.uxCritic ?? 'deterministic',
    '--intent-mode', input.intentMode ?? 'deterministic',
    '--provider', provider,
    '--max-iterations', String(input.maxIterations ?? 3)
  )

  const executeGeneratedScenarios = input.executeGeneratedScenarios ?? true
  if (executeGeneratedScenarios) cliArgs.push('--execute-generated-scenarios')
  if (productExperienceCritic && productExperienceCritic !== 'auto') cliArgs.push('--product-experience-critic', productExperienceCritic)
  if (input.consistencyCheck) cliArgs.push('--consistency-check')
  if (input.productGoal?.trim()) cliArgs.push('--product-goal', input.productGoal.trim())

  return { cliArgs, auditDepth: depth, provider, productExperienceCritic, executeGeneratedScenarios }
}

export function parseProgressEvent(line: string): DashboardRunEvent | undefined {
  const match = line.match(/^\[sniffer-progress\]\s+(.+)$/)
  if (!match) return undefined
  try {
    const parsed = JSON.parse(match[1]) as Partial<DashboardRunEvent>
    if (!parsed.type || !parsed.phase || !parsed.message || !parsed.timestamp) return undefined
    if (!['phase_started', 'phase_completed', 'log', 'error'].includes(parsed.type)) return undefined
    return {
      type: parsed.type,
      phase: parsed.phase,
      message: parsed.message,
      timestamp: parsed.timestamp
    }
  } catch {
    return undefined
  }
}

function scenarioFor(input: DashboardAuditRequest): string {
  if (input.scenario && input.scenario !== 'selected') return input.scenario
  return 'all'
}

function providerFor(input: DashboardAuditRequest, depth: DashboardAuditDepth): string {
  if (input.provider && input.provider !== 'auto') return input.provider
  return depth === 'deep' ? 'openai-compatible' : 'auto'
}

function productExperienceCriticFor(input: DashboardAuditRequest, depth: DashboardAuditDepth): string | undefined {
  if (input.productExperienceCritic) return input.productExperienceCritic
  return depth === 'deep' ? 'llm' : undefined
}

function requiresOpenAICompatibleProvider(provider: string, productExperienceCritic: string | undefined, depth: DashboardAuditDepth): boolean {
  if (provider === 'mock') return false
  return depth === 'deep' || productExperienceCritic === 'llm'
}
