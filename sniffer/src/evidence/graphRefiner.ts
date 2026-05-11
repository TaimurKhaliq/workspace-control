import type { LlmProvider } from '../llm/provider.js'
import type {
  AppliedGraphRefinementSuggestion,
  EvidenceFact,
  GraphRefinementResult,
  GraphRefinementSuggestion,
  GraphRefinementSuggestionType,
  GraphRefinementTarget,
  GraphRefinementTargetIndex,
  GraphRefinementTargetKind,
  GraphRefinementTargetReference,
  GraphRefinementTargetResolution,
  GraphRefinerMode,
  GraphStructureCriticContext,
  RejectedGraphRefinementSuggestion,
  RuntimeDomSnapshot,
  SourceGraph,
  SourceInventory,
  UIIntentEdge,
  UIIntentGraph,
  UIIntentNode,
  UiSurfaceType
} from '../types.js'
import { buildUIIntentGraph } from './contextModel.js'

const supportedSuggestionTypes = new Set<GraphRefinementSuggestionType>([
  'reclassify_fact',
  'normalize_control',
  'add_edge',
  'remove_edge',
  'raise_confidence',
  'lower_confidence',
  'mark_as_noise',
  'add_workflow',
  'reclassify_surface',
  'unresolved_observation'
])

const surfaceTypes = new Set<UiSurfaceType>([
  'app_shell',
  'workspace_selector',
  'workspace_list',
  'repo_list',
  'add_repo_form',
  'repo_validation_panel',
  'prompt_composer',
  'generate_plan_action',
  'plan_bundle_view',
  'history_list',
  'change_set_table',
  'recipe_panel',
  'graph_evidence_panel',
  'validation_panel',
  'handoff_prompt_panel',
  'raw_json_panel',
  'debug_payload_view',
  'repair_packet_view',
  'dialog_form',
  'copy_action',
  'unknown_ui_section'
])

const allowedRefinedFactKinds = new Set([
  'api_call',
  'static_asset_reference',
  'form_control',
  'action_control',
  'ui_surface_label',
  'workflow_signal',
  'user_action_signal',
  'input_label',
  'button_label',
  'form',
  'component',
  'page',
  'route',
  'state_variable',
  'handler',
  'submit_handler',
  'package_name',
  'package_script',
  'framework_signal',
  'build_tool_signal',
  'source_file'
])

export async function runGraphStructureRefiner(input: {
  sourceGraph: SourceGraph
  mode: GraphRefinerMode
  provider?: LlmProvider
  runtimeDomSnapshot?: RuntimeDomSnapshot
}): Promise<{ sourceGraph: SourceGraph; refinement: GraphRefinementResult }> {
  const modelReviewed = modelReviewedLabel(input.sourceGraph)
  if (input.mode === 'off') {
    const refinement = emptyResult({ mode: input.mode, status: 'skipped', modelReviewed, warning: 'Graph refiner disabled.' })
    return { sourceGraph: { ...input.sourceGraph, graphRefinement: refinement }, refinement }
  }

  if (!input.provider?.critiqueGraphStructure) {
    const status = input.mode === 'llm' ? 'provider_error' : 'skipped'
    const warning = input.mode === 'llm'
      ? 'Graph refiner requires an LLM provider with graph-structure critique support.'
      : 'Graph refiner auto mode skipped because no configured provider was available.'
    const refinement = emptyResult({ mode: input.mode, status, modelReviewed, warning, provider: input.provider?.name, model: input.provider?.metadata?.().model })
    return { sourceGraph: { ...input.sourceGraph, graphRefinement: refinement }, refinement }
  }

  const metadata = input.provider.metadata?.()
  try {
    const targetIndex = buildGraphRefinementTargetIndex(input.sourceGraph)
    const context = buildGraphStructureCriticContext(input.sourceGraph, input.runtimeDomSnapshot, targetIndex)
    const response = await input.provider.critiqueGraphStructure(context)
    const applied = applyGraphRefinements(input.sourceGraph, response.suggestions ?? [])
    const refinement: GraphRefinementResult = {
      mode: input.mode,
      status: 'completed',
      modelReviewed,
      llmUsed: true,
      provider: metadata?.name ?? input.provider.name,
      model: metadata?.model,
      targetIndex,
      targetResolutionSummary: graphRefinementResolutionSummary(response.suggestions ?? [], applied.appliedSuggestions, applied.rejectedSuggestions),
      suggestions: response.suggestions ?? [],
      appliedSuggestions: applied.appliedSuggestions,
      rejectedSuggestions: applied.rejectedSuggestions,
      warnings: response.warnings ?? []
    }
    return {
      sourceGraph: { ...applied.sourceGraph, graphRefinement: refinement },
      refinement
    }
  } catch (error) {
    const refinement = emptyResult({
      mode: input.mode,
      status: 'provider_error',
      modelReviewed,
      provider: metadata?.name ?? input.provider.name,
      model: metadata?.model,
      warning: `Graph refiner LLM request failed: ${error instanceof Error ? error.message : String(error)}`
    })
    return { sourceGraph: { ...input.sourceGraph, graphRefinement: refinement }, refinement }
  }
}

export function buildGraphStructureCriticContext(sourceGraph: SourceGraph, runtimeDomSnapshot?: RuntimeDomSnapshot, targetIndex = buildGraphRefinementTargetIndex(sourceGraph)): GraphStructureCriticContext {
  const inventory = sourceGraph.sourceInventory
  const uiIntentGraph = sourceGraph.uiIntentGraph
  const facts = inventory?.facts ?? []
  const factKinds = facts.reduce<Record<string, number>>((counts, fact) => {
    counts[fact.kind] = (counts[fact.kind] ?? 0) + 1
    return counts
  }, {})
  return {
    modelReviewed: modelReviewedLabel(sourceGraph),
    targetRegistry: compactTargetRegistry(targetIndex),
    sourceInventorySummary: {
      totalFacts: facts.length,
      factKinds,
      suspiciousFacts: facts
        .filter((fact) => isSuspiciousFact(fact))
        .slice(0, 30)
        .map(({ id, kind, value, filePath, symbol, confidence, extractionMethod }) => ({ id, kind, value, filePath, symbol, confidence, extractionMethod })),
      topFacts: facts
        .slice(0, 60)
        .map(({ id, kind, value, label, controlType, handler, filePath, confidence, extractionMethod }) => ({ id, kind, value, label, controlType, handler, filePath, confidence, extractionMethod }))
    },
    uiIntentGraphDraft: {
      surfaces: (uiIntentGraph?.surfaces ?? []).slice(0, 40),
      workflows: (uiIntentGraph?.workflows ?? []).slice(0, 30),
      actions: (uiIntentGraph?.actions ?? []).slice(0, 50),
      controls: (uiIntentGraph?.controls ?? []).slice(0, 50),
      apiDataDependencies: (uiIntentGraph?.apiDataDependencies ?? []).slice(0, 40),
      edges: (uiIntentGraph?.edges ?? []).slice(0, 80)
    },
    runtimeEvidence: runtimeDomSnapshot ? {
      url: runtimeDomSnapshot.url,
      title: runtimeDomSnapshot.title,
      headings: labels(runtimeDomSnapshot.headings),
      buttons: labels(runtimeDomSnapshot.buttons),
      links: labels(runtimeDomSnapshot.links),
      inputs: labels([...runtimeDomSnapshot.inputs, ...runtimeDomSnapshot.selects, ...runtimeDomSnapshot.textareas]),
      testIds: runtimeDomSnapshot.controls.map((control) => control.dataTestId).filter(Boolean) as string[],
      visibleText: runtimeDomSnapshot.visibleTextBlocks.slice(0, 40)
    } : undefined,
    instructions: [
      'Find schema-valid, evidence-backed graph corrections only.',
      'Use only targetId values from targetRegistry. If no target exists, emit unresolved_observation instead of inventing an id.',
      'If the direct targetId is unknown but targetEvidenceIds identify the right fact/control/surface, include targetEvidenceIds and targetAlias/resolutionHint.',
      'Do not request deletion of deterministic facts. Mark noise instead.',
      'Prefer UI surfaces and workflows as semantic units; files are provenance.',
      'Repeated row actions should be modeled as row actions or locator/accessibility hints, not global unique workflows.',
      'Return strict JSON with suggestions and warnings only.'
    ]
  }
}

export function applyGraphRefinements(sourceGraph: SourceGraph, suggestions: GraphRefinementSuggestion[]): {
  sourceGraph: SourceGraph
  appliedSuggestions: AppliedGraphRefinementSuggestion[]
  rejectedSuggestions: RejectedGraphRefinementSuggestion[]
} {
  const refined = cloneSourceGraph(sourceGraph)
  const inventory = refined.sourceInventory
  const draftGraph = refined.uiIntentGraph
  const targetIndex = buildGraphRefinementTargetIndex(refined)
  const appliedSuggestions: AppliedGraphRefinementSuggestion[] = []
  const rejectedSuggestions: RejectedGraphRefinementSuggestion[] = []

  if (!inventory || !draftGraph) {
    return {
      sourceGraph: refined,
      appliedSuggestions,
      rejectedSuggestions: suggestions.map((suggestion) => reject(suggestion, 'SourceInventory and UIIntentGraph are required before refinement.'))
    }
  }

  for (const suggestion of suggestions) {
    const resolution = resolveGraphRefinementTarget(suggestion, targetIndex)
    const resolvedSuggestion = withTargetResolution(suggestion, resolution)
    if (suggestion.type === 'unresolved_observation') {
      rejectedSuggestions.push(reject(resolvedSuggestion, 'Unresolved observations are recorded but not applied.'))
      continue
    }
    if (!resolution.resolved) {
      rejectedSuggestions.push(reject(resolvedSuggestion, resolution.reason ?? 'unresolved target'))
      continue
    }
    const rejection = validateSuggestion(resolvedSuggestion, inventory, draftGraph)
    if (rejection) {
      rejectedSuggestions.push(reject(resolvedSuggestion, rejection))
      continue
    }
    const applied = applySuggestion(refined, resolvedSuggestion)
    if (applied.ok) {
      appliedSuggestions.push({ ...resolvedSuggestion, appliedAt: new Date().toISOString() })
    } else {
      rejectedSuggestions.push(reject(resolvedSuggestion, applied.reason))
    }
  }

  refined.sourceInventory = rebuildInventoryIndexes(refined.sourceInventory)
  refined.uiIntentGraph = buildUIIntentGraph(refined, refined.sourceInventory)
  applyPostBuildGraphSuggestions(refined.uiIntentGraph, appliedSuggestions)

  return { sourceGraph: refined, appliedSuggestions, rejectedSuggestions }
}

export function buildGraphRefinementTargetIndex(sourceGraph: SourceGraph): GraphRefinementTargetIndex {
  const targets: GraphRefinementTarget[] = []
  const inventory = sourceGraph.sourceInventory
  const graph = sourceGraph.uiIntentGraph
  for (const fact of inventory?.facts ?? []) {
    targets.push(makeTarget({
      id: fact.id,
      kind: 'fact',
      label: fact.label ?? fact.value,
      value: fact.value,
      sourceScope: fact.sourceScope,
      filePath: fact.filePath,
      symbol: fact.symbol,
      evidenceIds: [fact.id],
      aliases: [
        fact.id,
        fact.value,
        fact.label,
        fact.testId,
        fact.handler,
        fact.placeholder,
        fact.symbol,
        fact.filePath,
        fact.filePath && fact.symbol ? `${fact.filePath}:${fact.symbol}` : undefined,
        fact.filePath && (fact.label ?? fact.value) ? `${fact.filePath}:${fact.label ?? fact.value}` : undefined,
        slug(fact.label ?? fact.value)
      ]
    }))
  }
  const nodeById = new Map<string, UIIntentNode>()
  for (const node of graph ? allNodes(graph) : []) {
    nodeById.set(node.id, node)
    const metadataAliases = metadataAliasesForNode(node)
    targets.push(makeTarget({
      id: node.id,
      kind: targetKindForNode(node),
      label: node.label,
      value: node.label,
      sourceScope: node.sourceScope,
      filePath: node.filePath,
      symbol: node.symbol,
      evidenceIds: node.evidenceIds,
      aliases: [
        node.id,
        node.label,
        node.symbol,
        node.filePath,
        node.filePath && node.symbol ? `${node.filePath}:${node.symbol}` : undefined,
        node.filePath && node.label ? `${node.filePath}:${node.label}` : undefined,
        slug(node.label),
        ...metadataAliases
      ]
    }))
  }
  for (const edge of graph?.edges ?? []) {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    const label = `${source?.label ?? edge.source} -${edge.kind}-> ${target?.label ?? edge.target}`
    targets.push(makeTarget({
      id: edge.id,
      kind: 'edge',
      label,
      sourceScope: source?.sourceScope ?? target?.sourceScope,
      filePath: source?.filePath ?? target?.filePath,
      evidenceIds: edge.evidenceIds,
      aliases: [
        edge.id,
        label,
        `${edge.source}:${edge.kind}:${edge.target}`,
        `${source?.label ?? edge.source}:${edge.kind}:${target?.label ?? edge.target}`,
        slug(label)
      ]
    }))
  }
  const byId: Record<string, string> = {}
  const byEvidenceId: Record<string, string[]> = {}
  const byAlias: Record<string, string[]> = {}
  const byKindAndLabel: Record<string, string[]> = {}
  const byFileAndSymbol: Record<string, string[]> = {}
  for (const target of targets) {
    byId[target.id] = target.id
    for (const evidenceId of target.evidenceIds) addIndexValue(byEvidenceId, evidenceId, target.id)
    for (const alias of target.aliases) addIndexValue(byAlias, alias, target.id)
    addIndexValue(byKindAndLabel, kindLabelKey(target.kind, target.label), target.id)
    if (target.filePath && target.symbol) addIndexValue(byFileAndSymbol, fileSymbolKey(target.filePath, target.symbol), target.id)
    if (target.filePath) addIndexValue(byFileAndSymbol, fileSymbolKey(target.filePath, target.label), target.id)
  }
  return { targets, byId, byEvidenceId, byAlias, byKindAndLabel, byFileAndSymbol }
}

export function resolveGraphRefinementTarget(suggestion: GraphRefinementSuggestion, targetIndex: GraphRefinementTargetIndex): GraphRefinementTargetResolution {
  const targetsById = new Map(targetIndex.targets.map((target) => [target.id, target]))
  const desiredKinds = targetKindsForSuggestion(suggestion)
  const originalTargetId = suggestion.targetId
  const exact = originalTargetId ? targetsById.get(originalTargetId) : undefined
  if (exact && targetAllowed(exact, desiredKinds)) return resolvedTarget(exact, 'exact_id', originalTargetId, 1)

  const evidenceCandidates = uniqueTargets(
    [...(suggestion.targetEvidenceIds ?? []), ...(suggestion.evidenceIds ?? []), ...(exact?.evidenceIds ?? [])]
      .flatMap((id) => targetIndex.byEvidenceId[id] ?? [])
      .map((id) => targetsById.get(id))
      .filter((target): target is GraphRefinementTarget => Boolean(target))
      .filter((target) => targetAllowed(target, desiredKinds))
  )
  const evidence = chooseResolutionCandidate(evidenceCandidates, desiredKinds)
  if (evidence.resolved) return resolvedTarget(evidence.target, 'evidence_id', originalTargetId, evidence.confidence)
  if (evidenceCandidates.length > 1) return unresolvedTarget('ambiguous evidence_id target', originalTargetId, evidenceCandidates)

  const aliasCandidates = uniqueTargets(
    [suggestion.targetAlias, originalTargetId, suggestion.resolutionHint]
      .flatMap((alias) => alias ? (targetIndex.byAlias[normalizeKey(alias)] ?? []) : [])
      .map((id) => targetsById.get(id))
      .filter((target): target is GraphRefinementTarget => Boolean(target))
      .filter((target) => targetAllowed(target, desiredKinds))
  )
  const alias = chooseResolutionCandidate(aliasCandidates, desiredKinds)
  if (alias.resolved) return resolvedTarget(alias.target, 'alias', originalTargetId, alias.confidence)
  if (aliasCandidates.length > 1) return unresolvedTarget('ambiguous alias target', originalTargetId, aliasCandidates)

  const kind = suggestion.targetKind
  const label = suggestion.targetAlias ?? stringValue(suggestion.toValue) ?? stringValue(suggestion.fromValue) ?? originalTargetId
  if (kind && label) {
    const kindCandidates = uniqueTargets((targetIndex.byKindAndLabel[kindLabelKey(kind, label)] ?? [])
      .map((id) => targetsById.get(id))
      .filter((target): target is GraphRefinementTarget => Boolean(target))
      .filter((target) => targetAllowed(target, desiredKinds)))
    const kindLabel = chooseResolutionCandidate(kindCandidates, desiredKinds)
    if (kindLabel.resolved) return resolvedTarget(kindLabel.target, 'kind_label', originalTargetId, kindLabel.confidence)
    if (kindCandidates.length > 1) return unresolvedTarget('ambiguous kind_label target', originalTargetId, kindCandidates)
  }

  const fileSymbolCandidates = fileSymbolHints(suggestion)
    .flatMap((hint) => targetIndex.byFileAndSymbol[fileSymbolKey(hint.filePath, hint.symbol)] ?? [])
    .map((id) => targetsById.get(id))
    .filter((target): target is GraphRefinementTarget => Boolean(target))
    .filter((target) => targetAllowed(target, desiredKinds))
  const fileSymbol = chooseResolutionCandidate(uniqueTargets(fileSymbolCandidates), desiredKinds)
  if (fileSymbol.resolved) return resolvedTarget(fileSymbol.target, 'file_symbol', originalTargetId, fileSymbol.confidence)

  return unresolvedTarget(
    exact ? `targetId resolved to ${exact.kind}, which is not valid for ${suggestion.type}` : 'unresolved target',
    originalTargetId,
    exact ? [exact] : uniqueTargets([...evidenceCandidates, ...aliasCandidates, ...fileSymbolCandidates])
  )
}

function withTargetResolution(suggestion: GraphRefinementSuggestion, resolution: GraphRefinementTargetResolution): GraphRefinementSuggestion {
  return {
    ...suggestion,
    targetId: resolution.targetId ?? suggestion.targetId,
    targetKind: suggestion.targetKind ?? resolution.targetKind,
    targetResolution: resolution
  }
}

function makeTarget(input: Omit<GraphRefinementTarget, 'aliases'> & { aliases: Array<string | undefined> }): GraphRefinementTarget {
  return {
    ...input,
    aliases: unique([
      input.id,
      input.label,
      input.value,
      input.symbol,
      ...input.aliases
    ].filter((item): item is string => Boolean(item?.trim())))
  }
}

function metadataAliasesForNode(node: UIIntentNode): string[] {
  const metadata = node.metadata ?? {}
  return [
    stringField(metadata.testId),
    stringField(metadata.handler),
    stringField(metadata.endpoint),
    stringField(metadata.method),
    stringField(metadata.workflow),
    ...(Array.isArray(metadata.relatedButtons) ? metadata.relatedButtons.filter((item): item is string => typeof item === 'string') : []),
    ...(Array.isArray(metadata.relatedInputs) ? metadata.relatedInputs.filter((item): item is string => typeof item === 'string') : [])
  ].filter((item): item is string => Boolean(item))
}

function targetKindForNode(node: UIIntentNode): GraphRefinementTargetKind {
  if (node.kind === 'api_dependency') return 'api'
  return node.kind
}

function targetKindsForSuggestion(suggestion: GraphRefinementSuggestion): Set<GraphRefinementTargetKind> {
  if (suggestion.type === 'reclassify_fact' || suggestion.type === 'normalize_control' || suggestion.type === 'mark_as_noise') return new Set(['fact'])
  if (suggestion.type === 'reclassify_surface' || suggestion.type === 'merge_duplicate_surface' || suggestion.type === 'split_surface') return new Set(['surface'])
  if (suggestion.type === 'remove_edge') return new Set(['edge'])
  if (suggestion.targetKind) return new Set([suggestion.targetKind])
  return new Set(['fact', 'surface', 'workflow', 'action', 'control', 'form', 'state', 'validation', 'api', 'data_dependency', 'domain_entity', 'edge'])
}

function targetAllowed(target: GraphRefinementTarget, desiredKinds: Set<GraphRefinementTargetKind>): boolean {
  return desiredKinds.has(target.kind)
}

function chooseResolutionCandidate(candidates: GraphRefinementTarget[], desiredKinds: Set<GraphRefinementTargetKind>): { resolved: true; target: GraphRefinementTarget; confidence: number } | { resolved: false } {
  const preferred = candidates.filter((target) => desiredKinds.has(target.kind))
  if (preferred.length === 1) return { resolved: true, target: preferred[0], confidence: 0.92 }
  return { resolved: false }
}

function resolvedTarget(target: GraphRefinementTarget, method: GraphRefinementTargetResolution['resolutionMethod'], originalTargetId: string | undefined, confidence: number): GraphRefinementTargetResolution {
  return {
    resolved: true,
    originalTargetId,
    targetId: target.id,
    targetKind: target.kind,
    targetLabel: target.label,
    confidence,
    resolutionMethod: method,
    candidateTargets: [targetReference(target)]
  }
}

function unresolvedTarget(reason: string, originalTargetId: string | undefined, candidates: GraphRefinementTarget[] = []): GraphRefinementTargetResolution {
  return {
    resolved: false,
    originalTargetId,
    confidence: 0,
    resolutionMethod: 'unresolved',
    candidateTargets: candidates.slice(0, 8).map(targetReference),
    reason
  }
}

function targetReference(target: GraphRefinementTarget): GraphRefinementTargetReference {
  return { id: target.id, kind: target.kind, label: target.label }
}

function uniqueTargets(targets: GraphRefinementTarget[]): GraphRefinementTarget[] {
  const seen = new Set<string>()
  return targets.filter((target) => {
    if (seen.has(target.id)) return false
    seen.add(target.id)
    return true
  })
}

function addIndexValue(index: Record<string, string[]>, rawKey: string | undefined, value: string): void {
  if (!rawKey) return
  const key = normalizeKey(rawKey)
  if (!key) return
  index[key] = unique([...(index[key] ?? []), value])
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/["'`]/g, '').replace(/\s+/g, ' ').trim()
}

function kindLabelKey(kind: string, label: string): string {
  return `${kind}:${normalizeKey(label)}`
}

function fileSymbolKey(filePath: string, symbol: string): string {
  return `${normalizeKey(filePath)}:${normalizeKey(symbol)}`
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  return stringField(record.label) ?? stringField(record.value) ?? stringField(record.name) ?? stringField(record.id)
}

function fileSymbolHints(suggestion: GraphRefinementSuggestion): Array<{ filePath: string; symbol: string }> {
  const values = [suggestion.resolutionHint, suggestion.targetAlias, stringValue(suggestion.fromValue), stringValue(suggestion.toValue)].filter((item): item is string => Boolean(item))
  return values.flatMap((value) => {
    const match = value.match(/^(.+\.[jt]sx?|.+\.html|.+\.vue|.+\.svelte):(.+)$/)
    return match ? [{ filePath: match[1].trim(), symbol: match[2].trim() }] : []
  })
}

function compactTargetRegistry(targetIndex: GraphRefinementTargetIndex): NonNullable<GraphStructureCriticContext['targetRegistry']> {
  const summary = targetIndex.targets.reduce<Record<GraphRefinementTargetKind, number>>((counts, target) => {
    counts[target.kind] = (counts[target.kind] ?? 0) + 1
    return counts
  }, {} as Record<GraphRefinementTargetKind, number>)
  const compact = (kind: GraphRefinementTargetKind, limit: number) => targetIndex.targets
    .filter((target) => target.kind === kind)
    .slice(0, limit)
    .map((target) => ({
      ...target,
      aliases: target.aliases.slice(0, 10),
      evidenceIds: target.evidenceIds.slice(0, 10)
    }))
  return {
    summary,
    facts: compact('fact', 120),
    surfaces: compact('surface', 80),
    workflows: compact('workflow', 80),
    controls: compact('control', 80),
    actions: compact('action', 80),
    apis: compact('api', 80),
    edges: compact('edge', 80)
  }
}

function applySuggestion(sourceGraph: SourceGraph, suggestion: GraphRefinementSuggestion): { ok: true } | { ok: false; reason: string } {
  const inventory = sourceGraph.sourceInventory
  const graph = sourceGraph.uiIntentGraph
  if (!inventory || !graph) return { ok: false, reason: 'Missing graph models.' }
  const fact = inventory.facts.find((item) => item.id === suggestion.targetId)
  const node = allNodes(graph).find((item) => item.id === suggestion.targetId)
  const edge = graph.edges.find((item) => item.id === suggestion.targetId)

  if (suggestion.type === 'reclassify_fact') {
    if (!fact) return { ok: false, reason: 'Target fact not found.' }
    const parsed = parseReclassification(suggestion.toValue)
    if (!parsed.kind) return { ok: false, reason: 'Missing target fact kind.' }
    const refinedValue = parsed.value ?? defaultRefinedFactValue(fact, parsed.kind)
    fact.suppressedFromSemanticGraph = true
    inventory.facts.push({
      ...fact,
      id: stableId('fact', `graph-refiner:${fact.id}:${parsed.kind}:${refinedValue}`),
      kind: parsed.kind,
      value: refinedValue,
      source: 'graph_refiner',
      refinedFromFactId: fact.id,
      suppressedFromSemanticGraph: false,
      confidence: Math.max(fact.confidence, 0.86),
      extractionMethod: 'llm',
      snippet: fact.snippet ?? fact.rawText
    })
    return { ok: true }
  }

  if (suggestion.type === 'normalize_control') {
    if (!fact) return { ok: false, reason: 'Target fact not found.' }
    const normalized = parseNormalizedControl(suggestion.toValue)
    if (!normalized.label) return { ok: false, reason: 'Missing normalized control label.' }
    fact.suppressedFromSemanticGraph = true
    inventory.facts.push({
      ...fact,
      id: stableId('fact', `graph-refiner:${fact.id}:control:${normalized.label}`),
      kind: normalized.kind ?? fact.kind,
      value: normalized.label,
      label: normalized.label,
      controlType: normalized.controlType ?? fact.controlType ?? 'unknown',
      handler: normalized.handler ?? fact.handler,
      ariaDescribedBy: normalized.ariaDescribedBy ?? fact.ariaDescribedBy,
      placeholder: normalized.placeholder ?? fact.placeholder,
      testId: normalized.testId ?? fact.testId,
      options: normalized.options ?? fact.options,
      source: 'graph_refiner',
      rawText: fact.rawText ?? fact.value,
      refinedFromFactId: fact.id,
      suppressedFromSemanticGraph: false,
      confidence: Math.max(fact.confidence, 0.86),
      extractionMethod: 'llm'
    })
    return { ok: true }
  }

  if (suggestion.type === 'mark_as_noise') {
    if (!fact) return { ok: false, reason: 'Target fact not found.' }
    fact.suppressedFromSemanticGraph = true
    return { ok: true }
  }

  if (suggestion.type === 'reclassify_surface') {
    if (!node || node.kind !== 'surface') return { ok: false, reason: 'Target surface node not found.' }
    const surfaceType = suggestion.toValue as UiSurfaceType | undefined
    if (!surfaceType || !surfaceTypes.has(surfaceType)) return { ok: false, reason: 'Invalid surface type.' }
    const surface = sourceGraph.uiSurfaces.find((item) => item.file === node.filePath && item.display_name === node.label)
    if (!surface) return { ok: false, reason: 'Compatible source surface not found.' }
    surface.surface_type = surfaceType
    surface.confidence = Math.max(surface.confidence, 0.86)
    surface.evidence = unique([...surface.evidence, ...suggestion.evidenceIds])
    return { ok: true }
  }

  if (suggestion.type === 'add_workflow') {
    const parsed = parseWorkflow(suggestion.toValue)
    if (!parsed.name) return { ok: false, reason: 'Missing workflow name.' }
    const workflowName = parsed.name
    if (sourceGraph.sourceWorkflows.some((workflow) => workflow.name.toLowerCase() === workflowName.toLowerCase())) {
      return { ok: false, reason: 'Workflow already exists.' }
    }
    const evidenceFacts = inventory.facts.filter((item) => suggestion.evidenceIds.includes(item.id))
    sourceGraph.sourceWorkflows.push({
      name: workflowName,
      sourceFiles: unique(evidenceFacts.map((item) => item.filePath).filter(Boolean) as string[]),
      evidence: unique([...evidenceFacts.map((item) => item.label ?? item.value), ...suggestion.evidenceIds]).slice(0, 12),
      likelyUserActions: parsed.likelyUserActions ?? [],
      confidence: 0.86,
      discoveredBy: ['graph_refiner']
    })
    return { ok: true }
  }

  if (suggestion.type === 'raise_confidence' || suggestion.type === 'lower_confidence') {
    const value = suggestion.type === 'raise_confidence' ? 0.9 : 0.45
    if (fact) {
      fact.confidence = value
      return { ok: true }
    }
    if (node) {
      node.confidence = value
      const surface = node.kind === 'surface' ? sourceGraph.uiSurfaces.find((item) => item.file === node.filePath && item.display_name === node.label) : undefined
      if (surface) surface.confidence = value
      return { ok: true }
    }
    if (edge) {
      edge.confidence = value
      return { ok: true }
    }
    return { ok: false, reason: 'Target not found for confidence update.' }
  }

  if (suggestion.type === 'remove_edge') {
    if (!edge) return { ok: false, reason: 'Target edge not found.' }
    graph.edges = graph.edges.filter((item) => item.id !== edge.id)
    return { ok: true }
  }

  if (suggestion.type === 'add_edge') {
    const parsed = parseEdge(suggestion.toValue)
    if (!parsed.source || !parsed.target || !parsed.kind) return { ok: false, reason: 'Missing edge source/target/kind.' }
    const nodes = allNodes(graph)
    if (!nodes.some((item) => item.id === parsed.source) || !nodes.some((item) => item.id === parsed.target)) {
      return { ok: false, reason: 'Edge source or target node not found.' }
    }
    graph.edges.push({
      id: stableId('edge', `graph-refiner:${parsed.source}:${parsed.kind}:${parsed.target}`),
      source: parsed.source,
      target: parsed.target,
      kind: parsed.kind,
      confidence: parsed.confidence ?? 0.86,
      evidenceIds: suggestion.evidenceIds
    })
    return { ok: true }
  }

  return { ok: false, reason: `Unsupported suggestion type: ${suggestion.type}` }
}

function validateSuggestion(suggestion: GraphRefinementSuggestion, inventory: SourceInventory, graph: UIIntentGraph): string | undefined {
  if (!suggestion || typeof suggestion !== 'object') return 'Suggestion is not an object.'
  if (!supportedSuggestionTypes.has(suggestion.type)) return `Unsupported suggestion type: ${String(suggestion.type)}`
  if (suggestion.type === 'unresolved_observation') return 'Unresolved observations are recorded but not applied.'
  if (!suggestion.targetId) return 'Missing targetId.'
  if (suggestion.confidence !== 'high') return 'Only high-confidence graph refinements are applied.'
  if (suggestion.risk === 'high') return 'High-risk graph refinements are rejected.'
  if (!suggestion.evidenceIds?.length) return 'Missing evidenceIds.'
  const evidenceIds = new Set(inventory.facts.map((fact) => fact.id))
  if (!suggestion.evidenceIds.every((id) => evidenceIds.has(id))) return 'One or more evidenceIds do not exist in SourceInventory.'
  const targetExists = inventory.facts.some((fact) => fact.id === suggestion.targetId) ||
    allNodes(graph).some((node) => node.id === suggestion.targetId) ||
    graph.edges.some((edge) => edge.id === suggestion.targetId)
  if (!targetExists) return 'targetId does not exist.'
  const targetFact = inventory.facts.find((fact) => fact.id === suggestion.targetId)
  const targetNode = allNodes(graph).find((node) => node.id === suggestion.targetId)
  if (suggestion.type === 'reclassify_fact') {
    const kind = parseReclassification(suggestion.toValue).kind
    if (!kind || !allowedRefinedFactKinds.has(kind)) return 'Invalid target fact kind for reclassification. Use mark_as_noise for noisy facts.'
  }
  if (suggestion.type === 'reclassify_surface' && targetNode) {
    const surfaceType = suggestion.toValue as UiSurfaceType | undefined
    if (surfaceType && !surfaceReclassificationSupported(surfaceType, targetNode, inventory.facts.filter((fact) => suggestion.evidenceIds.includes(fact.id)))) {
      return `Target evidence does not support reclassifying surface as ${surfaceType}.`
    }
  }
  if (targetFact && deterministicContradiction(targetFact, suggestion)) return 'Suggestion contradicts deterministic source evidence.'
  const noop = noOpSuggestion(suggestion, targetFact, targetNode)
  if (noop) return noop
  return undefined
}

function surfaceReclassificationSupported(surfaceType: UiSurfaceType, node: UIIntentNode, evidenceFacts: EvidenceFact[]): boolean {
  const text = `${node.label} ${JSON.stringify(node.metadata ?? {})} ${evidenceFacts.map((fact) => `${fact.value} ${fact.label ?? ''} ${fact.snippet ?? ''}`).join(' ')}`.toLowerCase()
  if (surfaceType === 'dialog_form') return /dialog|modal|popover|cancel|create .*workspace|new .*workspace|add .*repository|workspace name cancel|×/.test(text)
  if (surfaceType === 'history_list') return /history|runs?|list|items?|table|rows?|previous|timeline|findings/.test(text)
  if (surfaceType === 'debug_payload_view') return /debug|payload|raw|json|source inventory|ui intent|evidence|runtime state|graph/.test(text)
  if (surfaceType === 'repair_packet_view') return /fix packet|repair packet|verification command|copy prompt|suspected files/.test(text)
  if (surfaceType === 'raw_json_panel') return /raw json|json payload|copy json/.test(text)
  return true
}

function deterministicContradiction(fact: EvidenceFact, suggestion: GraphRefinementSuggestion): boolean {
  if (suggestion.type !== 'reclassify_fact') return false
  const targetKind = parseReclassification(suggestion.toValue).kind
  if (!targetKind) return true
  if (isStaticAssetReference(fact.value) && targetKind === 'api_call') return true
  if (/^\/api(?:\/|$)/.test(fact.value) && targetKind === 'static_asset_reference') return true
  return false
}

function noOpSuggestion(suggestion: GraphRefinementSuggestion, fact: EvidenceFact | undefined, node: UIIntentNode | undefined): string | undefined {
  if (suggestion.type === 'reclassify_fact' && fact) {
    const parsed = parseReclassification(suggestion.toValue)
    if (parsed.kind === fact.kind && (!parsed.value || parsed.value === fact.value)) return 'Refinement would not change the target fact.'
  }
  if (suggestion.type === 'reclassify_surface' && node?.kind === 'surface' && suggestion.toValue === node.metadata?.surface_type) {
    return 'Refinement would not change the target surface type.'
  }
  if (suggestion.type === 'mark_as_noise' && fact?.suppressedFromSemanticGraph) {
    return 'Fact is already suppressed from the semantic graph.'
  }
  return undefined
}

function applyPostBuildGraphSuggestions(graph: UIIntentGraph | undefined, applied: AppliedGraphRefinementSuggestion[]): void {
  if (!graph) return
  for (const suggestion of applied) {
    if (suggestion.type === 'add_edge') {
      const parsed = parseEdge(suggestion.toValue)
      if (!parsed.source || !parsed.target || !parsed.kind) continue
      if (graph.edges.some((edge) => edge.source === parsed.source && edge.target === parsed.target && edge.kind === parsed.kind)) continue
      graph.edges.push({
        id: stableId('edge', `graph-refiner:${parsed.source}:${parsed.kind}:${parsed.target}`),
        source: parsed.source,
        target: parsed.target,
        kind: parsed.kind,
        confidence: parsed.confidence ?? 0.86,
        evidenceIds: suggestion.evidenceIds
      })
    }
    if (suggestion.type === 'remove_edge') {
      graph.edges = graph.edges.filter((edge) => edge.id !== suggestion.targetId)
    }
  }
}

function rebuildInventoryIndexes(inventory?: SourceInventory): SourceInventory | undefined {
  if (!inventory) return inventory
  const facts = inventory.facts
  return {
    ...inventory,
    frameworkSignals: facts.filter((fact) => fact.kind === 'framework_signal'),
    packageBuildSignals: facts.filter((fact) => fact.kind === 'package_name' || fact.kind === 'build_tool_signal' || fact.kind === 'package_script'),
    rawExtractedSymbols: facts.filter((fact) => ['component', 'page', 'state_variable', 'handler', 'submit_handler'].includes(fact.kind)),
    rawRoutes: facts.filter((fact) => fact.kind === 'route'),
    rawTemplates: facts.filter((fact) => ['ui_surface_label', 'button_label', 'input_label', 'form_control', 'action_control', 'static_asset_reference'].includes(fact.kind)),
    rawHandlers: facts.filter((fact) => fact.kind === 'handler' || fact.kind === 'submit_handler'),
    rawApiCalls: facts.filter((fact) => fact.kind === 'api_call' && !fact.suppressedFromSemanticGraph),
    provenance: facts.filter((fact) => fact.filePath || fact.source === 'package.json')
  }
}

function parseReclassification(value: unknown): { kind?: string; value?: string } {
  if (!value) return {}
  const parsed = parseJsonObject(value)
  if (parsed) return { kind: typeof parsed.kind === 'string' ? parsed.kind : undefined, value: typeof parsed.value === 'string' ? parsed.value : undefined }
  return typeof value === 'string' ? { kind: value } : {}
}

function defaultRefinedFactValue(fact: EvidenceFact, kind: string): string {
  if (kind === 'static_asset_reference') return stripHttpMethod(fact.value)
  return fact.value
}

function parseNormalizedControl(value: unknown): Partial<EvidenceFact> {
  const parsed = parseJsonObject(value)
  if (!parsed) return { label: typeof value === 'string' ? value : undefined, kind: 'form_control' }
  return parsed as Partial<EvidenceFact>
}

function parseWorkflow(value: unknown): { name?: string; likelyUserActions?: string[] } {
  const parsed = parseJsonObject(value)
  if (!parsed) return { name: typeof value === 'string' ? value : undefined }
  return {
    name: typeof parsed.name === 'string' ? parsed.name : undefined,
    likelyUserActions: Array.isArray(parsed.likelyUserActions) ? parsed.likelyUserActions.filter((item): item is string => typeof item === 'string') : undefined
  }
}

function parseEdge(value: unknown): Partial<UIIntentEdge> {
  const parsed = parseJsonObject(value)
  return parsed ? parsed as Partial<UIIntentEdge> : {}
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (!value) return undefined
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string') return undefined
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

function allNodes(graph: UIIntentGraph): UIIntentNode[] {
  return [
    ...graph.surfaces,
    ...graph.workflows,
    ...graph.actions,
    ...graph.controls,
    ...graph.forms,
    ...graph.state,
    ...graph.validation,
    ...graph.apiDataDependencies,
    ...graph.domainEntities
  ]
}

function reject(suggestion: GraphRefinementSuggestion, rejectedReason: string): RejectedGraphRefinementSuggestion {
  return { ...suggestion, rejectedReason }
}

function emptyResult(input: { mode: GraphRefinerMode; status: GraphRefinementResult['status']; modelReviewed: string; warning: string; provider?: string; model?: string }): GraphRefinementResult {
  return {
    mode: input.mode,
    status: input.status,
    modelReviewed: input.modelReviewed,
    llmUsed: false,
    provider: input.provider,
    model: input.model,
    suggestions: [],
    appliedSuggestions: [],
    rejectedSuggestions: [],
    warnings: [input.warning]
  }
}

function graphRefinementResolutionSummary(
  suggestions: GraphRefinementSuggestion[],
  applied: AppliedGraphRefinementSuggestion[],
  rejected: RejectedGraphRefinementSuggestion[]
): NonNullable<GraphRefinementResult['targetResolutionSummary']> {
  const resolved = [...applied, ...rejected].filter((suggestion) => suggestion.targetResolution?.resolved).length
  const unresolved = [...applied, ...rejected].filter((suggestion) => suggestion.targetResolution && !suggestion.targetResolution.resolved).length
  return {
    suggestions: suggestions.length,
    resolvedTargets: resolved,
    unresolvedTargets: unresolved,
    applied: applied.length,
    rejected: rejected.length,
    rejectedDueToSafety: rejected.filter((suggestion) => /high-risk|safety|unsupported destructive/i.test(suggestion.rejectedReason)).length,
    rejectedDueToLowConfidence: rejected.filter((suggestion) => /confidence/i.test(suggestion.rejectedReason)).length,
    rejectedDueToContradiction: rejected.filter((suggestion) => /contradict/i.test(suggestion.rejectedReason)).length,
    rejectedDueToUnresolved: rejected.filter((suggestion) => /unresolved|ambiguous|not found|does not exist/i.test(suggestion.rejectedReason) || suggestion.targetResolution?.resolved === false).length
  }
}

function modelReviewedLabel(sourceGraph: SourceGraph): string {
  const facts = sourceGraph.sourceInventory?.facts.length ?? 0
  const surfaces = sourceGraph.uiIntentGraph?.surfaces.length ?? 0
  const workflows = sourceGraph.uiIntentGraph?.workflows.length ?? 0
  return `SourceInventory(${facts} facts) + UIIntentGraphDraft(${surfaces} surfaces, ${workflows} workflows)`
}

function isSuspiciousFact(fact: EvidenceFact): boolean {
  return /event\.target|=>|autoFocus|aria-describedby=|rows=\{|^GET\s+\/(?:src|assets|static|public)\//i.test(`${fact.value} ${fact.rawText ?? ''}`) ||
    (fact.kind === 'api_call' && isStaticAssetReference(fact.value)) ||
    fact.kind === 'unknown_ui_section'
}

function labels(controls: Array<{ accessibleName?: string; visibleText?: string; labelText?: string; placeholder?: string; dataTestId?: string }>): string[] {
  return controls
    .map((control) => control.accessibleName ?? control.visibleText ?? control.labelText ?? control.placeholder ?? control.dataTestId)
    .filter(Boolean)
    .slice(0, 40) as string[]
}

function isStaticAssetReference(value: string): boolean {
  return /^\/?(?:src|assets|static|public)\//i.test(stripHttpMethod(value)) ||
    /\.(?:js|mjs|ts|tsx|css|png|jpe?g|gif|svg|webp|ico|woff2?)(?:[?#].*)?$/i.test(value)
}

function stripHttpMethod(value: string): string {
  return value.replace(/^(?:GET|POST|PUT|PATCH|DELETE)\s+/i, '')
}

function cloneSourceGraph(sourceGraph: SourceGraph): SourceGraph {
  return JSON.parse(JSON.stringify(sourceGraph)) as SourceGraph
}

function stableId(prefix: string, value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return `${prefix}-${Math.abs(hash).toString(36)}`
}

function slug(value: string): string {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))]
}
