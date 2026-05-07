import type { AppProfile, RuntimeDomSnapshot, ScenarioApplicability, ScenarioPackSelection, ScenarioSlug, SourceGraph } from '../types.js'
import { builtInScenarios } from './scenarios.js'

const WORKSPACE_SCENARIO_IDS = new Set(builtInScenarios().map((scenario) => scenario.slug))

export function selectScenarioPack(input: {
  scenarioSlug?: ScenarioSlug
  appProfile: AppProfile
  sourceGraph: SourceGraph
  runtimeDomSnapshot?: RuntimeDomSnapshot
  productGoal?: string
}): ScenarioPackSelection {
  const source = sourceText(input.sourceGraph)
  const runtime = runtimeText(input.runtimeDomSnapshot)
  const goal = input.productGoal ?? ''
  const snifferSignals = scoreSignals([
    [input.sourceGraph.packageName ?? '', /sniffer-ui/i, 'packageName:sniffer-ui'],
    [input.runtimeDomSnapshot?.title ?? '', /Sniffer Dashboard/i, 'title:Sniffer Dashboard'],
    [runtime, /Run Timeline/i, 'runtime:Run Timeline'],
    [runtime, /Crawl Path/i, 'runtime:Crawl Path'],
    [runtime, /Workflow Evidence/i, 'runtime:Workflow Evidence'],
    [runtime, /Fix Packets/i, 'runtime:Fix Packets'],
    [runtime, /Graph Explorer/i, 'runtime:Graph Explorer'],
    [runtime, /Run Audit/i, 'runtime:Run Audit'],
    [runtime, /Product goal/i, 'runtime:Product goal'],
    [source, /sniffer dashboard|AuditLauncher|FixPacketViewer|DiscoveryGraph/i, 'source:sniffer dashboard components']
  ])
  const workspaceSignals = scoreSignals([
    [input.sourceGraph.packageName ?? '', /workspace-control/i, 'packageName:workspace-control'],
    [source, /Generate plan bundle/i, 'source:Generate plan bundle'],
    [source, /Add repo\b|Add repository/i, 'source:Add repository'],
    [source, /Refresh learning|learning-status/i, 'source:Refresh learning'],
    [source, /\/api\/workspaces|\/api\/repos|plan-bundles/i, 'source:workspace/repo APIs'],
    [runtime, /Workspaces/i, 'runtime:Workspaces'],
    [runtime, /Repositories/i, 'runtime:Repositories'],
    [runtime, /Plan Runs/i, 'runtime:Plan Runs'],
    [runtime, /Generate Plan Bundle/i, 'runtime:Generate Plan Bundle'],
    [runtime, /Target id|Path or URL|Refresh learning/i, 'runtime:repo target controls'],
    [goal, /workspace-control|repo planning|plan bundle|handoff prompt/i, 'product goal:workspace-control planning']
  ])

  const hasSnifferNavCluster = countMatches(runtime, [/Summary/i, /Projects/i, /Run Timeline/i, /Scenarios/i, /Crawl Path/i, /Workflow Evidence/i, /Issues/i, /Fix Packets/i, /Screenshots/i, /Graph Explorer/i, /Raw JSON/i, /Settings/i]) >= 6
  const hasWorkspaceCluster = countMatches(`${source}\n${runtime}`, [/Workspaces/i, /Repositories/i, /Plan Runs/i, /Add repo|Add repository/i, /Generate Plan Bundle/i, /Refresh learning/i]) >= 4
  const snifferScore = snifferSignals.score + (hasSnifferNavCluster ? 3 : 0)
  const workspaceScore = workspaceSignals.score + (hasWorkspaceCluster ? 3 : 0)

  let scenarioPack: ScenarioPackSelection['scenarioPack'] = 'generic'
  let appSubtype: ScenarioPackSelection['appSubtype'] = 'generic_app'
  let confidence: ScenarioPackSelection['confidence'] = 'medium'
  let reason = 'Generic scenario pack selected from runtime/source evidence.'

  if (snifferScore >= 6 && snifferScore > workspaceScore) {
    scenarioPack = 'sniffer_dashboard'
    appSubtype = 'sniffer_dashboard'
    confidence = snifferScore >= 8 ? 'high' : 'medium'
    reason = `Sniffer dashboard scenario pack selected from ${snifferSignals.evidence.concat(hasSnifferNavCluster ? ['runtime:dashboard nav cluster'] : []).join('; ')}.`
  } else if (workspaceScore >= 7 && hasWorkspaceCluster) {
    scenarioPack = 'workspace_control'
    appSubtype = 'workspace_control'
    confidence = workspaceScore >= 10 ? 'high' : 'medium'
    reason = `Workspace-control scenario pack selected from ${workspaceSignals.evidence.concat(['workspace control nav/workflow cluster']).join('; ')}.`
  } else if (input.appProfile.profile_type === 'planning_control_panel') {
    scenarioPack = 'generic_control_panel'
    appSubtype = 'generic_control_panel'
    confidence = input.appProfile.confidence === 'high' ? 'medium' : 'low'
    reason = 'Generic control-panel scenarios selected; workspace-control-specific evidence was insufficient.'
  }

  const applicability = builtInScenarios().map((scenario) => workspaceScenarioApplicability({
    scenarioId: scenario.slug,
    scenarioName: scenario.name,
    appProfile: input.appProfile,
    source,
    runtime,
    goal,
    scenarioPack
  }))
  const skippedScenarios = applicability
    .filter((item) => !item.shouldRun)
    .map((item) => ({ scenarioId: item.scenarioId, scenarioName: item.scenarioName, reason: item.reason }))

  return { appSubtype, scenarioPack, confidence, reason, applicability, skippedScenarios }
}

export function shouldRunBuiltInScenarioPack(input: {
  scenarioSlug?: ScenarioSlug
  appProfile: AppProfile
  scenarioSelection?: ScenarioPackSelection
}): boolean {
  if (!input.scenarioSlug) return false
  if (input.scenarioSlug === 'auto') return false
  if (input.scenarioSlug === 'prompt-output-consistency') return false
  const selection = input.scenarioSelection
  if (!selection) return false
  if (selection.scenarioPack !== 'workspace_control') return false
  if (input.scenarioSlug === 'all') return selection.confidence !== 'low'
  return WORKSPACE_SCENARIO_IDS.has(input.scenarioSlug) && selection.applicability.some((item) => item.scenarioId === input.scenarioSlug && item.shouldRun)
}

export function shouldRunPromptConsistency(input: {
  consistencyCheckEnabled: boolean
  scenarioSlug?: ScenarioSlug
  promptsSource?: string
  appProfile: AppProfile
  scenarioSelection?: ScenarioPackSelection
}): boolean {
  if (!input.consistencyCheckEnabled) return false
  if (input.scenarioSlug === 'prompt-output-consistency') return input.scenarioSelection?.scenarioPack === 'workspace_control'
  if (input.promptsSource && input.promptsSource !== 'built-in') return true
  return input.scenarioSelection?.scenarioPack === 'workspace_control'
}

export function sourceGraphForRuntimeValidation(sourceGraph: SourceGraph, selection: ScenarioPackSelection): SourceGraph {
  if (selection.scenarioPack === 'workspace_control') return sourceGraph
  if (selection.scenarioPack === 'sniffer_dashboard') {
    return {
      ...sourceGraph,
      uiSurfaces: sourceGraph.uiSurfaces.filter((surface) =>
        surface.confidence >= 0.7 &&
        surface.surface_type !== 'unknown_ui_section' &&
        !/handoff_prompt_panel|plan_bundle_view|change_set_table|recipe_panel|graph_evidence_panel|validation_panel/.test(surface.surface_type)
      ),
      sourceWorkflows: sourceGraph.sourceWorkflows.filter((workflow) =>
        !isWorkspaceControlWorkflow(workflow.name) &&
        workflow.confidence >= 0.7
      )
    }
  }
  return {
    ...sourceGraph,
    sourceWorkflows: sourceGraph.sourceWorkflows.filter((workflow) => workflow.confidence >= 0.6 && !isWorkspaceControlWorkflow(workflow.name))
  }
}

function workspaceScenarioApplicability(input: {
  scenarioId: string
  scenarioName: string
  appProfile: AppProfile
  source: string
  runtime: string
  goal: string
  scenarioPack: ScenarioPackSelection['scenarioPack']
}): ScenarioApplicability {
  const positiveSource = countMatches(input.source, workspaceTermsFor(input.scenarioId))
  const positiveRuntime = countMatches(input.runtime, workspaceTermsFor(input.scenarioId))
  const positiveGoal = countMatches(input.goal, workspaceTermsFor(input.scenarioId))
  const profileSupport = input.appProfile.profile_type === 'planning_control_panel' ? 1 : 0
  const negativeEvidence: string[] = []
  if (input.scenarioPack === 'sniffer_dashboard') negativeEvidence.push('Sniffer Dashboard subtype selected; workspace/repo-target scenarios are wrong context.')
  if (input.scenarioPack === 'generic_control_panel') negativeEvidence.push('Only broad planning/control-panel evidence was found, not workspace-control-specific repo target evidence.')
  const support = profileSupport + positiveSource + positiveRuntime + positiveGoal
  const shouldRun = input.scenarioPack === 'workspace_control' && support >= 2 && negativeEvidence.length === 0
  return {
    scenarioId: input.scenarioId,
    scenarioName: input.scenarioName,
    appProfileSupport: profileSupport,
    sourceEvidenceSupport: positiveSource,
    runtimeEvidenceSupport: positiveRuntime,
    productGoalSupport: positiveGoal,
    negativeEvidence,
    confidence: shouldRun ? support >= 4 ? 'high' : 'medium' : 'low',
    shouldRun,
    reason: shouldRun
      ? `Workspace-control evidence supports this scenario: source=${positiveSource}, runtime=${positiveRuntime}, goal=${positiveGoal}.`
      : negativeEvidence[0] ?? `Insufficient workspace-control evidence: source=${positiveSource}, runtime=${positiveRuntime}, goal=${positiveGoal}.`
  }
}

function workspaceTermsFor(scenarioId: string): RegExp[] {
  const common = [/workspace/i, /repo target|repository target|target id/i, /workspace-control/i]
  if (scenarioId === 'create-select-workspace') return [/Workspaces/i, /New workspace|Create workspace/i, /workspace selector/i]
  if (scenarioId === 'add-repo-target') return [/Add repo|Add repository/i, /Target id/i, /Path or URL/i, /repo target|repository target/i]
  if (scenarioId === 'validate-local-repo-path') return [/validate-target|validation preview/i, /Path or URL/i, /local path/i]
  if (scenarioId === 'refresh-discovery') return [/Discover/i, /discovery/i, /repo target|repository target/i]
  if (scenarioId === 'refresh-learning') return [/Refresh learning/i, /learning-status/i, /recipe/i]
  if (scenarioId === 'generate-plan-bundle') return [/Generate Plan Bundle|Generate plan/i, /Feature request/i, /plan-bundles/i]
  if (scenarioId === 'review-plan-output') return [/Overview/i, /Change Set/i, /Graph Evidence/i, /Handoff/i, /Raw JSON/i]
  if (scenarioId === 'copy-handoff-prompt') return [/Copy prompt/i, /handoff/i]
  if (scenarioId === 'inspect-raw-json') return [/Raw JSON/i, /plan bundle/i]
  if (scenarioId === 'semantic-enrichment-toggle') return [/semantic enrichment/i, /use semantic/i]
  return common
}

function isWorkspaceControlWorkflow(name: string): boolean {
  return /create\/select workspace|add repo|validate repo path|refresh learning|generate plan bundle|view plan bundle tabs|copy handoff prompt/i.test(name)
}

function scoreSignals(signals: Array<[string, RegExp, string]>): { score: number; evidence: string[] } {
  const evidence: string[] = []
  for (const [value, pattern, label] of signals) {
    if (value && pattern.test(value)) evidence.push(label)
  }
  return { score: evidence.length, evidence }
}

function countMatches(value: string, patterns: RegExp[]): number {
  return patterns.filter((pattern) => pattern.test(value)).length
}

function sourceText(sourceGraph: SourceGraph): string {
  return [
    sourceGraph.repoPath,
    sourceGraph.packageName,
    sourceGraph.framework,
    sourceGraph.buildTool,
    ...sourceGraph.uiSurfaces.flatMap((surface) => [surface.surface_type, surface.display_name, ...surface.evidence, ...surface.relatedButtons, ...surface.relatedInputs]),
    ...sourceGraph.sourceWorkflows.flatMap((workflow) => [workflow.name, ...workflow.evidence, ...workflow.likelyUserActions]),
    ...sourceGraph.apiCalls.flatMap((call) => [call.method, call.endpoint, call.functionName, call.likelyWorkflow]),
    ...sourceGraph.stateActions.flatMap((state) => [...state.stateVariables, ...state.handlerNames, ...state.submitHandlers])
  ].filter(Boolean).join('\n')
}

function runtimeText(snapshot?: RuntimeDomSnapshot): string {
  if (!snapshot) return ''
  return [
    snapshot.title,
    snapshot.url,
    ...snapshot.headings.map(labelOf),
    ...snapshot.links.map(labelOf),
    ...snapshot.buttons.map(labelOf),
    ...snapshot.inputs.map(labelOf),
    ...snapshot.selects.map(labelOf),
    ...snapshot.textareas.map(labelOf),
    ...snapshot.visibleTextBlocks
  ].filter(Boolean).join('\n')
}

function labelOf(control: { accessibleName?: string; visibleText?: string; labelText?: string; placeholder?: string; dataTestId?: string; href?: string; id?: string }): string {
  return (control.accessibleName ?? control.visibleText ?? control.labelText ?? control.placeholder ?? control.dataTestId ?? control.href ?? control.id ?? '').replace(/\s+/g, ' ').trim()
}
