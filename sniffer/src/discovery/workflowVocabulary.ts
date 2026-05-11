import type { AppSubtype, SourceGraph, SourceWorkflow, WorkflowInferenceIntegrity, WorkflowInferenceRecord, WorkflowKind, WorkflowVocabularyPack } from '../types.js'

interface VocabularyWorkflow {
  name: string
  pack: WorkflowVocabularyPack
  requiredEvidence: string[]
  kind: WorkflowKind
}

const workspaceControlWorkflows: VocabularyWorkflow[] = [
  workflow('Create/select workspace', 'workspace_control', ['workspace UI', 'workspace create/select control']),
  workflow('Add repo', 'workspace_control', ['repo target management UI', 'add repo/add repository control']),
  workflow('Validate repo path', 'workspace_control', ['repo validation API or validation status UI']),
  workflow('Refresh discovery', 'workspace_control', ['repo discovery API or explicit refresh/discover action']),
  workflow('Refresh learning', 'workspace_control', ['learning status API or explicit refresh learning action']),
  workflow('Generate plan bundle', 'workspace_control', ['plan bundle generator API or Generate Plan Bundle action']),
  workflow('View plan bundle tabs', 'workspace_control', ['plan bundle tab controls']),
  workflow('Copy handoff prompt', 'workspace_control', ['handoff prompt copy control']),
  workflow('Inspect raw JSON', 'generic', ['raw JSON/debug payload view']),
  workflow('Browse/reopen previous plan runs', 'workspace_control', ['plan-run-item list and reopen action'])
]

const snifferDashboardWorkflows: VocabularyWorkflow[] = [
  workflow('Run Sniffer audit', 'sniffer_dashboard', ['audit launcher controls', 'POST /api/audits']),
  workflow('Inspect report sections', 'sniffer_dashboard', ['report section navigation']),
  workflow('Review agent model', 'sniffer_dashboard', ['Agent Model or Source Inventory/UI Intent Graph views']),
  workflow('Inspect source inventory', 'sniffer_dashboard', ['source inventory view']),
  workflow('Inspect UI intent graph', 'sniffer_dashboard', ['UI intent graph view']),
  workflow('Inspect evidence packets', 'sniffer_dashboard', ['evidence packet view']),
  workflow('Inspect fix packets', 'sniffer_dashboard', ['Fix Packets view or fix-packets API']),
  workflow('Use repair workbench', 'sniffer_dashboard', ['Repair Workbench view or repairs API']),
  workflow('Inspect raw report payload', 'sniffer_dashboard', ['Raw JSON report payload view']),
  workflow('Browse screenshots/evidence', 'sniffer_dashboard', ['Screenshots/evidence gallery']),
  workflow('Review run timeline', 'sniffer_dashboard', ['Run Timeline view']),
  workflow('Review crawl path', 'sniffer_dashboard', ['Crawl Path view']),
  workflow('Copy repair/fix prompts', 'sniffer_dashboard', ['copy fix/repair prompt control'])
]

const genericWorkflows: VocabularyWorkflow[] = [
  workflow('Navigation smoke test', 'generic', ['navigation controls']),
  workflow('Forms discoverability', 'generic', ['form/input controls']),
  workflow('Browse history/list', 'generic', ['history/list UI']),
  workflow('Generate output', 'generic', ['generate/create output action']),
  workflow('Review output', 'generic', ['output/review surface']),
  workflow('Copy/export output', 'generic', ['copy/export/download action']),
  workflow('Inspect settings', 'generic', ['settings view']),
  workflow('Submit form', 'generic', ['form controls']),
  workflow('Login form discoverability', 'generic', ['login/password controls']),
  workflow('Search/filter', 'generic', ['search/filter controls']),
  workflow('Table/list scan', 'generic', ['table/list controls']),
  workflow('Navigation route', 'generic', ['routes or links'])
]

const vocabulary = new Map<string, VocabularyWorkflow>(
  [...workspaceControlWorkflows, ...snifferDashboardWorkflows, ...genericWorkflows]
    .map((item) => [normalizeName(item.name), item])
)

const workspaceNames = new Set(workspaceControlWorkflows.map((item) => normalizeName(item.name)))
const snifferNames = new Set(snifferDashboardWorkflows.map((item) => normalizeName(item.name)))

export function scopeSourceWorkflows(graph: SourceGraph, appSubtype: AppSubtype | 'unknown'): SourceGraph {
  const emitted: SourceWorkflow[] = []
  const suppressed: WorkflowInferenceRecord[] = []
  const emittedRecords: WorkflowInferenceRecord[] = []

  for (const candidate of graph.sourceWorkflows) {
    const meta = vocabulary.get(normalizeName(candidate.name)) ?? inferUnknownVocabulary(candidate)
    const record = recordFor(candidate, appSubtype, meta)
    const suppressionReason = suppressionReasonFor(candidate, appSubtype, meta, record)
    if (suppressionReason) {
      suppressed.push({ ...record, reason: suppressionReason })
      continue
    }
    const enriched: SourceWorkflow = {
      ...candidate,
      appSubtype,
      matchedVocabularyPack: meta.pack,
      workflowKind: meta.kind,
      requiredEvidence: meta.requiredEvidence,
      matchedEvidence: record.matchedEvidence,
      missingEvidence: record.missingEvidence,
      reason: record.reason
    }
    emitted.push(enriched)
    emittedRecords.push(record)
  }

  const integrity: WorkflowInferenceIntegrity = {
    appSubtype,
    selectedVocabularyPacks: selectedPacksFor(appSubtype),
    emittedWorkflows: emittedRecords,
    suppressedWorkflows: suppressed,
    appSpecificWorkflowMismatchesPrevented: suppressed.filter((item) => item.matchedVocabularyPack !== 'generic' && item.matchedVocabularyPack !== 'unknown').length
  }

  return {
    ...graph,
    sourceWorkflows: dedupeWorkflows(emitted),
    workflowInferenceIntegrity: integrity,
    workflowDiscoverySummary: {
      ...(graph.workflowDiscoverySummary ?? { source_workflows_count: emitted.length }),
      source_workflows_count: dedupeWorkflows(emitted).length
    }
  }
}

export function inferSourceAppSubtype(graph: SourceGraph): AppSubtype | 'unknown' {
  if (isSnifferDashboardSource(graph)) return 'sniffer_dashboard'
  if (isWorkspaceControlSource(graph)) return 'workspace_control'
  if (/control|dashboard|admin|planner|planning/i.test(`${graph.packageName ?? ''} ${graph.uiPackageName ?? ''}`)) return 'generic_control_panel'
  return 'generic_app'
}

export function isWorkspaceControlWorkflowName(name: string): boolean {
  return workspaceNames.has(normalizeName(name))
}

export function isSnifferDashboardWorkflowName(name: string): boolean {
  return snifferNames.has(normalizeName(name))
}

function workflow(name: string, pack: WorkflowVocabularyPack, requiredEvidence: string[], kind: WorkflowKind = 'user_workflow'): VocabularyWorkflow {
  return { name, pack, requiredEvidence, kind }
}

function suppressionReasonFor(candidate: SourceWorkflow, appSubtype: AppSubtype | 'unknown', meta: VocabularyWorkflow, record: WorkflowInferenceRecord): string | undefined {
  const strongEvidence = hasStrongExplicitUserFacingEvidence(candidate, meta)
  if (meta.pack === 'workspace_control' && appSubtype === 'sniffer_dashboard' && !hasStrongExplicitUserFacingEvidence(candidate, meta)) {
    return `workspace_control workflow vocabulary does not match appSubtype=sniffer_dashboard; matched evidence was ${record.matchedEvidence.join(', ') || 'weak keyword-only evidence'}.`
  }
  if (meta.pack === 'sniffer_dashboard' && appSubtype === 'workspace_control' && !hasStrongExplicitUserFacingEvidence(candidate, meta)) {
    return `sniffer_dashboard workflow vocabulary does not match appSubtype=workspace_control; matched evidence was ${record.matchedEvidence.join(', ') || 'weak keyword-only evidence'}.`
  }
  if ((appSubtype === 'generic_app' || appSubtype === 'generic_control_panel' || appSubtype === 'unknown') && meta.pack !== 'generic' && meta.pack !== 'unknown' && !strongEvidence) {
    return `${meta.pack} workflow "${candidate.name}" requires app-specific evidence but only generic/weak evidence was found.`
  }
  if (candidate.confidence < 0.5 && meta.pack !== 'generic' && meta.pack !== 'unknown' && !subtypeMatchesPack(appSubtype, meta.pack) && !strongEvidence) {
    return `${meta.pack} workflow "${candidate.name}" has low confidence (${candidate.confidence}) and is not strong enough to emit as a user workflow.`
  }
  if (meta.pack === 'unknown' && candidate.confidence < 0.5) {
    return `keyword-only workflow "${candidate.name}" has low confidence (${candidate.confidence}); keeping as suggestion/debug evidence only.`
  }
  return undefined
}

function hasStrongExplicitUserFacingEvidence(candidate: SourceWorkflow, meta: VocabularyWorkflow): boolean {
  const evidenceText = `${candidate.name}\n${candidate.evidence.join('\n')}\n${candidate.likelyUserActions.join('\n')}`.toLowerCase()
  const exactName = normalizeName(candidate.name)
  if ([...candidate.evidence, ...candidate.likelyUserActions].some((item) => normalizeName(item) === exactName)) return true
  if (candidate.confidence >= 0.7 && meta.requiredEvidence.some((item) => evidenceText.includes(item.toLowerCase()))) return true
  if (candidate.confidence >= 0.7 && candidate.evidence.some((item) => /button|aria-label|data-testid|role=|onClick|click|submit|POST|GET|\/api\//i.test(item))) return true
  if (candidate.confidence >= 0.8) return true
  return false
}

function subtypeMatchesPack(appSubtype: AppSubtype | 'unknown', pack: WorkflowVocabularyPack): boolean {
  return (appSubtype === 'workspace_control' && pack === 'workspace_control') ||
    (appSubtype === 'sniffer_dashboard' && pack === 'sniffer_dashboard') ||
    pack === 'generic'
}

function recordFor(candidate: SourceWorkflow, appSubtype: AppSubtype | 'unknown', meta: VocabularyWorkflow): WorkflowInferenceRecord {
  const evidenceText = `${candidate.name}\n${candidate.evidence.join('\n')}\n${candidate.likelyUserActions.join('\n')}`.toLowerCase()
  const matchedEvidence = meta.requiredEvidence.filter((item) => evidenceText.includes(item.toLowerCase()))
  return {
    workflowName: candidate.name,
    source: candidate.discoveredBy?.join(', ') || 'source_discovery',
    appSubtype,
    matchedVocabularyPack: meta.pack,
    requiredEvidence: meta.requiredEvidence,
    matchedEvidence: matchedEvidence.length ? matchedEvidence : candidate.evidence.slice(0, 6),
    missingEvidence: meta.requiredEvidence.filter((item) => !matchedEvidence.includes(item)),
    confidence: candidate.confidence,
    reason: `${candidate.name} matched ${meta.pack} vocabulary with confidence ${candidate.confidence}.`,
    sourceFiles: candidate.sourceFiles,
    workflowKind: meta.kind
  }
}

function inferUnknownVocabulary(candidate: SourceWorkflow): VocabularyWorkflow {
  if (/discover|adapter|graph refinement|source inventory|runtime dom/i.test(`${candidate.name} ${candidate.evidence.join(' ')}`)) {
    return workflow(candidate.name, 'unknown', ['internal source/runtime evidence'], 'internal_engine_step')
  }
  return workflow(candidate.name, 'unknown', ['source/runtime evidence'])
}

function selectedPacksFor(appSubtype: AppSubtype | 'unknown'): WorkflowVocabularyPack[] {
  if (appSubtype === 'workspace_control') return ['workspace_control', 'generic']
  if (appSubtype === 'sniffer_dashboard') return ['sniffer_dashboard', 'generic']
  return ['generic']
}

function dedupeWorkflows(workflows: SourceWorkflow[]): SourceWorkflow[] {
  const byName = new Map<string, SourceWorkflow>()
  for (const workflow of workflows) {
    const existing = byName.get(workflow.name)
    if (!existing) {
      byName.set(workflow.name, workflow)
      continue
    }
    byName.set(workflow.name, {
      ...existing,
      sourceFiles: unique([...existing.sourceFiles, ...workflow.sourceFiles]).sort(),
      evidence: unique([...existing.evidence, ...workflow.evidence]).slice(0, 20),
      likelyUserActions: unique([...existing.likelyUserActions, ...workflow.likelyUserActions]).slice(0, 16),
      confidence: Math.max(existing.confidence, workflow.confidence),
      discoveredBy: unique([...(existing.discoveredBy ?? []), ...(workflow.discoveredBy ?? [])]),
      sourceScope: existing.sourceScope ?? workflow.sourceScope,
      matchedVocabularyPack: existing.matchedVocabularyPack ?? workflow.matchedVocabularyPack,
      workflowKind: existing.workflowKind ?? workflow.workflowKind
    })
  }
  return [...byName.values()]
}

function isSnifferDashboardSource(graph: SourceGraph): boolean {
  const text = corpus(graph)
  return /sniffer-ui|Sniffer Dashboard|Run Timeline|Crawl Path|Workflow Evidence|Fix Packets|Repair Workbench|Agent Model|Graph Explorer/i.test(text)
}

function isWorkspaceControlSource(graph: SourceGraph): boolean {
  const text = corpus(graph)
  const hits = [
    /StackPilot|workspace-control|Workspace Control/i,
    /Workspaces/i,
    /Repositories|repo target|Add repo|Add repository/i,
    /Plan Runs|plan-run-item|plan-runs-list/i,
    /Generate Plan Bundle|plan-bundles|generatePlanBundle/i,
    /Refresh learning|learning-status/i
  ].filter((regex) => regex.test(text)).length
  return hits >= 3
}

function corpus(graph: SourceGraph): string {
  return [
    graph.packageName,
    graph.uiPackageName,
    graph.repoPath,
    ...graph.uiSurfaces.flatMap((surface) => [surface.surface_type, surface.display_name, ...surface.evidence, ...surface.relatedButtons, ...surface.relatedInputs]),
    ...graph.sourceWorkflows.flatMap((workflow) => [workflow.name, ...workflow.evidence, ...workflow.likelyUserActions]),
    ...graph.components.flatMap((component) => [component.file, component.name]),
    ...graph.apiCalls.flatMap((call) => [call.endpoint, call.functionName ?? ''])
  ].join('\n')
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))]
}
