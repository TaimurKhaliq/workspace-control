import crypto from 'node:crypto'
import type {
  CandidateFinding,
  CrawlAction,
  CrawlGraph,
  Issue,
  KnownRuntimeState,
  RuntimeWorkflowVerification,
  SnifferCriticContext,
  SourceGraph,
  SourceWorkflow,
  UiSurface,
  VisibleElement
} from '../types.js'
import { classifyActionSafety } from '../runtime/safeActions.js'

const maxItems = {
  surfaces: 8,
  workflows: 4,
  apiCalls: 8,
  stateActions: 6,
  controls: 60,
  errors: 12,
  actions: 30,
  screenshots: 6
}

export function issuesToCandidateFindings(issues: Issue[], workflowVerifications: RuntimeWorkflowVerification[] = []): CandidateFinding[] {
  return issues.map((issue, index) => {
    const workflow = workflowVerifications.find((verification) =>
      issue.title.includes(verification.name) || issue.description.includes(verification.name)
    )
    return {
      finding_id: issue.issue_id ?? makeFindingId(issue, index),
      severity: issue.severity,
      type: issue.type,
      title: issue.title,
      description: issue.description,
      evidence: issue.evidence,
      workflowName: workflow?.name,
      screenshotPath: issue.screenshotPath,
      tracePath: issue.tracePath,
      suggestedFixPrompt: issue.suggestedFixPrompt
    }
  })
}

export function candidateToIssue(candidate: CandidateFinding): Issue {
  return {
    issue_id: candidate.finding_id,
    severity: candidate.severity,
    type: candidate.type,
    title: candidate.title,
    description: candidate.description,
    evidence: candidate.evidence,
    screenshotPath: candidate.screenshotPath,
    tracePath: candidate.tracePath,
    suggestedFixPrompt: candidate.suggestedFixPrompt
  }
}

export function buildCriticContext(input: {
  sourceGraph: SourceGraph
  crawlGraph: CrawlGraph
  workflowVerifications: RuntimeWorkflowVerification[]
  candidate: CandidateFinding
  appUrl: string
}): SnifferCriticContext {
  const workflow = selectWorkflow(input.sourceGraph.sourceWorkflows, input.candidate, input.workflowVerifications)
  const surfaces = selectSurfaces(input.sourceGraph.uiSurfaces, input.candidate, workflow)
  const apiCalls = input.sourceGraph.apiCalls.filter((call) =>
    call.likelyWorkflow === workflow?.name ||
    input.candidate.evidence.some((item) => item.includes(call.endpoint) || endpointMatchesEvidence(call.endpoint, item))
  )
  const recentStates = input.crawlGraph.states.slice(-3)
  const visibleControls = recentStates.flatMap((state) => state.visible)
  const actions = input.crawlGraph.actions.slice(-maxItems.actions)
  const knownState = inferKnownState(input.crawlGraph, input.workflowVerifications)

  const context: SnifferCriticContext = {
    app_identity: {
      repo_path: input.sourceGraph.repoPath,
      package_name: input.sourceGraph.packageName,
      framework: input.sourceGraph.framework,
      build_tool: input.sourceGraph.buildTool,
      app_url: input.appUrl
    },
    source_intent: {
      relevant_ui_surfaces: takeWithCap(surfaces, maxItems.surfaces),
      relevant_source_workflows: takeWithCap(workflow ? [workflow] : input.sourceGraph.sourceWorkflows, maxItems.workflows),
      relevant_api_calls: takeWithCap(apiCalls.length ? apiCalls : input.sourceGraph.apiCalls, maxItems.apiCalls),
      relevant_state_actions: takeWithCap(input.sourceGraph.stateActions, maxItems.stateActions)
    },
    runtime_observation: {
      current_url: input.crawlGraph.states.at(-1)?.url ?? input.crawlGraph.finalUrl,
      final_url: input.crawlGraph.finalUrl,
      visible_controls: takeWithCap(visibleControls, maxItems.controls),
      forms: takeWithCap(visibleControls.filter((control) => control.kind === 'form'), 20),
      dialogs: takeWithCap(visibleControls.filter((control) => control.kind === 'dialog'), 20),
      screenshots: takeWithCap(input.crawlGraph.screenshots, maxItems.screenshots),
      console_errors: takeWithCap(input.crawlGraph.consoleErrors, maxItems.errors),
      network_errors: takeWithCap(input.crawlGraph.networkFailures, maxItems.errors)
    },
    execution_trace: {
      actions_attempted: actions,
      state_transitions: recentStates.map((state) => `${state.url}#${state.hash}`),
      repeated_actions: repeatedActions(input.crawlGraph.actions),
      skipped_actions: input.crawlGraph.actions.filter((action) => action.type === 'skip').slice(-10),
      unvisited_safe_actions: inferUnvisitedSafeActions(visibleControls, input.crawlGraph.actions)
    },
    known_state: knownState,
    candidate_findings: [input.candidate],
    question_for_critic: 'Is this candidate finding a real UI bug, expected conditional UI, a crawler precondition gap, a test bug, inconclusive, or a need for more crawling?',
    omitted_counts: {
      relevant_ui_surfaces: Math.max(0, surfaces.length - maxItems.surfaces),
      relevant_source_workflows: Math.max(0, input.sourceGraph.sourceWorkflows.length - maxItems.workflows),
      relevant_api_calls: Math.max(0, input.sourceGraph.apiCalls.length - maxItems.apiCalls),
      visible_controls: Math.max(0, visibleControls.length - maxItems.controls),
      actions_attempted: Math.max(0, input.crawlGraph.actions.length - maxItems.actions),
      screenshots: Math.max(0, input.crawlGraph.screenshots.length - maxItems.screenshots)
    }
  }

  return context
}

export function inferKnownState(crawlGraph: CrawlGraph, workflows: RuntimeWorkflowVerification[] = []): KnownRuntimeState {
  const text = crawlText(crawlGraph).toLowerCase()
  const actionText = crawlGraph.actions.map((action) => `${action.label} ${action.reason ?? ''}`).join('\n').toLowerCase()
  const workflow = (name: string) => workflows.find((item) => item.name === name)
  return {
    workspace_exists: /no workspace selected|workspace|workspaces/.test(text),
    workspace_selected: !/no workspace selected|select workspace/.test(text) && /workspace/.test(text),
    repo_exists: /repo targets|discovery targets|repository|target selected/.test(text) && !/no repo targets/.test(text),
    repo_selected: /target selected|petclinic|spring-petclinic|no target selected/.test(text) && !/no target selected/.test(text),
    plan_bundle_generated: /overview|change set|recommended_change_set|raw json|handoff prompt|copy prompt/.test(text),
    handoff_prompt_exists: /copy prompt|handoff prompt/.test(text),
    raw_json_visible: /raw json|schema_version|recommended_change_set/.test(text),
    add_repo_modal_open: /target id|path or url|source type/.test(text),
    workspace_modal_open: /workspace name|create workspace/.test(text) && /modal|dialog/.test(text),
    semantic_enabled: /semantic/.test(text),
    last_action_changed_state: Boolean(actionText && !/skip|failed/.test(crawlGraph.actions.at(-1)?.type ?? ''))
  }
}

function selectWorkflow(workflows: SourceWorkflow[], candidate: CandidateFinding, verifications: RuntimeWorkflowVerification[]): SourceWorkflow | undefined {
  if (candidate.workflowName) return workflows.find((workflow) => workflow.name === candidate.workflowName)
  const verification = verifications.find((item) => candidate.title.includes(item.name) || candidate.description.includes(item.name))
  return workflows.find((workflow) => workflow.name === verification?.name) ??
    workflows.find((workflow) => candidate.title.toLowerCase().includes(workflow.name.toLowerCase()))
}

function selectSurfaces(surfaces: UiSurface[], candidate: CandidateFinding, workflow?: SourceWorkflow): UiSurface[] {
  const words = `${candidate.title} ${candidate.description} ${candidate.evidence.join(' ')} ${workflow?.name ?? ''}`.toLowerCase()
  const selected = surfaces.filter((surface) =>
    words.includes(surface.surface_type) ||
    words.includes(surface.display_name.toLowerCase()) ||
    surface.evidence.some((item) => words.includes(item.toLowerCase()))
  )
  return selected.length ? selected : surfaces.slice(0, maxItems.surfaces)
}

function takeWithCap<T>(items: T[], max: number): T[] {
  return items.slice(0, max)
}

function repeatedActions(actions: CrawlAction[]): string[] {
  const counts = new Map<string, number>()
  actions.forEach((action) => counts.set(action.label, (counts.get(action.label) ?? 0) + 1))
  return [...counts.entries()].filter(([, count]) => count > 1).map(([label]) => label)
}

function inferUnvisitedSafeActions(controls: VisibleElement[], actions: CrawlAction[]): string[] {
  const attempted = new Set(actions.map((action) => action.label.toLowerCase()))
  return controls
    .map((control) => control.text ?? control.name ?? '')
    .filter(Boolean)
    .filter((label) => !attempted.has(label.toLowerCase()) && classifyActionSafety(label, 'button').safe)
    .slice(0, 20)
}

function endpointMatchesEvidence(endpoint: string, evidence: string): boolean {
  const pattern = endpoint.replace(/\$\{[^}]+\}/g, '[^/]+').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(pattern).test(evidence)
}

function crawlText(crawlGraph: CrawlGraph): string {
  return crawlGraph.states.flatMap((state) => state.visible.flatMap((control) => [control.text, control.name, control.href].filter(Boolean))).join('\n')
}

function makeFindingId(issue: Issue, index: number): string {
  const slug = issue.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48) || 'finding'
  const digest = crypto.createHash('sha1').update(`${issue.type}:${issue.title}:${issue.evidence.join('|')}:${index}`).digest('hex').slice(0, 8)
  return `${slug}-${digest}`
}
