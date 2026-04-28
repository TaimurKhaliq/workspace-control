import type {
  CandidateFinding,
  CrawlGraph,
  Issue,
  LlmCriticProvider,
  NextSafeAction,
  RuntimeWorkflowVerification,
  SnifferCriticContext,
  SourceGraph,
  WorkflowCriticDecision
} from '../types.js'
import { classifyActionSafety } from '../runtime/safeActions.js'
import { buildCriticContext, candidateToIssue, issuesToCandidateFindings } from './contextBuilder.js'

export type CriticMode = 'deterministic' | 'llm' | 'auto'

export interface CriticResult {
  issues: Issue[]
  criticDecisions: WorkflowCriticDecision[]
  deferredFindings: CandidateFinding[]
  blockedChecks: CandidateFinding[]
  needsMoreCrawling: CandidateFinding[]
}

export async function critiqueFindings(input: {
  sourceGraph: SourceGraph
  crawlGraph: CrawlGraph
  workflowVerifications: RuntimeWorkflowVerification[]
  candidateIssues: Issue[]
  appUrl: string
  mode: CriticMode
  provider?: LlmCriticProvider
}): Promise<CriticResult> {
  const candidates = issuesToCandidateFindings(input.candidateIssues, input.workflowVerifications)
  const decisions: WorkflowCriticDecision[] = []

  for (const candidate of candidates) {
    const context = buildCriticContext({
      sourceGraph: input.sourceGraph,
      crawlGraph: input.crawlGraph,
      workflowVerifications: input.workflowVerifications,
      candidate,
      appUrl: input.appUrl
    })
    const decision = await decide({ context, candidate, mode: input.mode, provider: input.provider })
    decisions.push(validateDecision(decision))
  }

  const issues = candidates
    .filter((candidate) => decisions.find((decision) => decision.finding_id === candidate.finding_id)?.should_report)
    .map((candidate) => {
      const decision = decisions.find((item) => item.finding_id === candidate.finding_id)
      return { ...candidateToIssue(candidate), critic_decision: decision }
    })

  return {
    issues,
    criticDecisions: decisions,
    deferredFindings: candidates.filter((candidate) => {
      const decision = decisions.find((item) => item.finding_id === candidate.finding_id)
      return decision && !decision.should_report && ['conditional_ui_not_bug', 'crawler_needs_precondition'].includes(decision.classification)
    }),
    blockedChecks: candidates.filter((candidate) => decisions.find((item) => item.finding_id === candidate.finding_id)?.classification === 'crawler_needs_precondition'),
    needsMoreCrawling: candidates.filter((candidate) => decisions.find((item) => item.finding_id === candidate.finding_id)?.classification === 'needs_more_crawling')
  }
}

async function decide(input: {
  context: SnifferCriticContext
  candidate: CandidateFinding
  mode: CriticMode
  provider?: LlmCriticProvider
}): Promise<WorkflowCriticDecision> {
  if ((input.mode === 'llm' || input.mode === 'auto') && input.provider?.critiqueWorkflow) {
    return input.provider.critiqueWorkflow(input.context)
  }
  return deterministicDecision(input.context, input.candidate)
}

export function deterministicDecision(context: SnifferCriticContext, candidate: CandidateFinding): WorkflowCriticDecision {
  const text = `${candidate.title} ${candidate.description} ${candidate.evidence.join(' ')}`.toLowerCase()
  const state = context.known_state

  if ((candidate.type === 'api_error' || candidate.type === 'network_error' || candidate.type === 'console_error') && /500|internal server error|\/api\//i.test(text)) {
    return realBug(candidate, 'Runtime API/console failure is actionable and not merely conditional UI.', 0.9)
  }

  if (/raw json|overview tab|change set|plan bundle|plan tabs|view plan bundle tabs/.test(text) && !state.plan_bundle_generated) {
    return precondition(candidate, 'plan_bundle_generated', 'generate_plan_bundle_with_sample_prompt', 'Plan bundle tabs and raw JSON are expected to be absent before a plan bundle exists.')
  }

  if (/copy prompt|handoff/.test(text) && !state.handoff_prompt_exists) {
    return precondition(candidate, 'handoff_prompt_exists', state.plan_bundle_generated ? 'open_plan_tab' : 'generate_plan_bundle_with_sample_prompt', 'Handoff prompt copy controls are conditional on a generated plan bundle with handoff content.')
  }

  if (/target id|path or url|source type|add repo/.test(text) && !state.add_repo_modal_open) {
    return precondition(candidate, 'add_repo_modal_open', 'open_add_repo_modal', 'Add repo form fields are expected inside the Add Repo modal.')
  }

  if (/workspace name/.test(text) && !state.workspace_modal_open) {
    return precondition(candidate, 'workspace_modal_open', 'open_workspace_modal', 'Workspace name input is expected inside the workspace creation modal.')
  }

  if (context.execution_trace.repeated_actions.length > 0 && context.execution_trace.unvisited_safe_actions.length > 0) {
    return {
      finding_id: candidate.finding_id,
      classification: 'needs_more_crawling',
      is_real_bug: false,
      confidence: 0.55,
      next_safe_action: mapVisibleLabelToSafeAction(context.execution_trace.unvisited_safe_actions[0]),
      reasoning_summary: 'Crawler repeated actions while other safe controls remained unvisited.',
      evidence: context.execution_trace.unvisited_safe_actions.slice(0, 5),
      should_report: false,
      should_generate_fix_packet: false
    }
  }

  return realBug(candidate, 'Deterministic critic found no unmet precondition explaining the finding.', 0.6)
}

function realBug(candidate: CandidateFinding, reason: string, confidence: number): WorkflowCriticDecision {
  return {
    finding_id: candidate.finding_id,
    classification: 'real_bug',
    is_real_bug: true,
    confidence,
    reasoning_summary: reason,
    evidence: candidate.evidence,
    should_report: true,
    should_generate_fix_packet: true
  }
}

function precondition(candidate: CandidateFinding, required: string, action: NextSafeAction, reason: string): WorkflowCriticDecision {
  return {
    finding_id: candidate.finding_id,
    classification: 'crawler_needs_precondition',
    is_real_bug: false,
    confidence: 0.86,
    required_precondition: required,
    next_safe_action: action,
    reasoning_summary: reason,
    evidence: candidate.evidence,
    should_report: false,
    should_generate_fix_packet: false
  }
}

function validateDecision(decision: WorkflowCriticDecision): WorkflowCriticDecision {
  const shouldReport = decision.classification === 'real_bug' && decision.is_real_bug && decision.should_report
  const shouldGenerateFixPacket = shouldReport && decision.should_generate_fix_packet
  let normalized = {
    ...decision,
    should_report: shouldReport,
    should_generate_fix_packet: shouldGenerateFixPacket
  }
  if (decision.next_safe_action && !isSupportedSafeAction(decision.next_safe_action)) {
    normalized = {
      ...normalized,
      next_safe_action: undefined,
      reasoning_summary: `${decision.reasoning_summary} Unsafe or unsupported next action was removed.`
    }
  }
  return normalized
}

function isSupportedSafeAction(action: NextSafeAction): boolean {
  const safe = new Set<NextSafeAction>([
    'navigate_to_repositories',
    'navigate_to_plan_runs',
    'open_add_repo_modal',
    'open_workspace_modal',
    'select_first_workspace',
    'select_first_repo_target',
    'generate_plan_bundle_with_sample_prompt',
    'open_plan_tab',
    'copy_handoff_prompt'
  ])
  return safe.has(action) && classifyActionSafety(action, 'button').safe
}

function mapVisibleLabelToSafeAction(label: string): NextSafeAction | undefined {
  if (/repo/i.test(label)) return 'navigate_to_repositories'
  if (/plan/i.test(label)) return 'navigate_to_plan_runs'
  if (/workspace/i.test(label)) return 'select_first_workspace'
  return undefined
}
