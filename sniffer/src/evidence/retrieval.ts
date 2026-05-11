import type {
  CrawlGraph,
  EvidenceFact,
  EvidenceInference,
  EvidencePacket,
  EvidenceRetrievalDocument,
  EvidenceRetrievalDocumentKind,
  EvidenceRetrievalOptions,
  FixPacket,
  Issue,
  ProductExperienceResult,
  RepairAttempt,
  RuntimeDomSnapshot,
  RuntimeInferredWorkflow,
  ScenarioRun,
  SnifferReport,
  SourceGraph,
  UIIntentGraph,
  UIIntentNode
} from '../types.js'
import { buildUIIntentGraph } from './contextModel.js'

export interface EvidenceRetrievalInput extends EvidenceRetrievalOptions {
  sourceGraph: SourceGraph
  crawlGraph?: CrawlGraph
  runtimeDomSnapshot?: RuntimeDomSnapshot
  runtimeWorkflows?: RuntimeInferredWorkflow[]
  scenarioRuns?: ScenarioRun[]
  issues?: Issue[]
  fixPackets?: FixPacket[]
  productExperience?: ProductExperienceResult
  repairAttempts?: Array<EvidenceRetrievalDocument | RepairAttempt>
}

interface ScoredDocument {
  doc: EvidenceRetrievalDocument
  score: number
  whyRetrieved: string[]
}

export function retrieveEvidenceFromReport(
  query: string,
  report: SnifferReport,
  options: Omit<EvidenceRetrievalInput, 'sourceGraph' | 'crawlGraph' | 'runtimeDomSnapshot' | 'runtimeWorkflows' | 'scenarioRuns' | 'issues' | 'productExperience'> = {}
): EvidencePacket {
  return retrieveEvidence(query, {
    ...options,
    sourceGraph: report.sourceGraph,
    crawlGraph: report.crawlGraph,
    runtimeDomSnapshot: report.runtimeDomSnapshot,
    runtimeWorkflows: report.runtimeAppModel?.workflows,
    scenarioRuns: report.scenarioRuns,
    issues: report.issues,
    productExperience: report.productExperience
  })
}

export function retrieveEvidence(query: string, options: EvidenceRetrievalInput): EvidencePacket {
  const uiIntentGraph = options.sourceGraph.uiIntentGraph ?? buildUIIntentGraph(options.sourceGraph)
  const documents = buildEvidenceRetrievalIndex({
    sourceGraph: options.sourceGraph,
    uiIntentGraph,
    crawlGraph: options.crawlGraph,
    runtimeDomSnapshot: options.runtimeDomSnapshot,
    runtimeWorkflows: options.runtimeWorkflows,
    scenarioRuns: options.scenarioRuns,
    issues: options.issues,
    fixPackets: options.fixPackets,
    productExperience: options.productExperience,
    repairAttempts: options.repairAttempts
  })
  const filtered = documents
    .filter((doc) => options.kinds ? options.kinds.includes(doc.kind) : true)
    .filter((doc) => options.includeRuntime === false ? !['runtime_dom', 'screenshot_metadata', 'scenario_trace'].includes(doc.kind) : true)
    .filter((doc) => options.includeScreenshots === false ? doc.kind !== 'screenshot_metadata' : true)
    .filter((doc) => options.includePriorRepairs === false ? !['fix_packet', 'repair_attempt'].includes(doc.kind) : true)
    .filter((doc) => options.minConfidence === undefined || Number(doc.metadata.confidence ?? 1) >= options.minConfidence)
  const scored = filtered
    .map((doc) => scoreDocument(doc, query, options))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id))
    .slice(0, options.maxResults ?? 12)
    .map((item) => ({
      ...item.doc,
      score: Number(item.score.toFixed(2)),
      whyRetrieved: item.whyRetrieved
    }))

  const facts = options.sourceGraph.sourceInventory?.facts ?? []
  const sourceFacts = facts.filter((fact) => scored.some((doc) => doc.relatedEvidenceIds.includes(fact.id) && fact.extractionMethod !== 'runtime'))
  const runtimeFacts = runtimeFactsFromDocuments(scored)
  const nodes = allIntentNodes(uiIntentGraph).filter((node) => scored.some((doc) => doc.metadata.nodeId === node.id || intersects(doc.relatedEvidenceIds, node.evidenceIds)))
  const contradictions = findContradictions(uiIntentGraph, scored, query)
  const screenshots = unique(scored
    .filter((doc) => doc.kind === 'screenshot_metadata' || typeof doc.metadata.screenshotPath === 'string')
    .map((doc) => String(doc.metadata.screenshotPath ?? doc.text))
    .filter(Boolean))
  const priorFindings = (options.issues ?? []).filter((issue) => scored.some((doc) => doc.kind === 'issue' && doc.metadata.issueId === issue.issue_id))
  const priorFixPackets = (options.fixPackets ?? []).filter((packet) => scored.some((doc) => doc.kind === 'fix_packet' && doc.metadata.issueId === packet.issue_id))
  const priorRepairAttempts = scored.filter((doc) => doc.kind === 'repair_attempt')

  return {
    context: {
      issueId: options.issueId,
      screenName: options.screenName,
      workflowName: options.workflowName,
      featureRequest: options.featureRequest,
      query
    },
    intent: retrievalIntent(options, query),
    retrievedDocuments: scored,
    graphNodes: nodes,
    sourceFacts,
    runtimeFacts,
    screenshots,
    priorFindings,
    priorFixPackets,
    priorRepairAttempts,
    contradictions,
    confidenceSummary: summarizeConfidence(sourceFacts, runtimeFacts, uiIntentGraph.inferences, contradictions, scored)
  }
}

export function evidencePacketSummary(packet: EvidencePacket) {
  const split = splitCounts(packet.retrievedDocuments)
  return {
    context: packet.context,
    retrievedDocumentCount: packet.retrievedDocuments.length,
    sourceFactCount: packet.sourceFacts.length,
    runtimeFactCount: packet.runtimeFacts.length,
    contradictionCount: packet.contradictions.length,
    kindBreakdown: countBy(packet.retrievedDocuments.map((doc) => doc.kind)),
    sourceRuntimeRepairSplit: split,
    averageScore: packet.confidenceSummary.averageScore,
    topDocuments: packet.retrievedDocuments.slice(0, 5).map((doc) => ({
      id: doc.id,
      kind: doc.kind,
      text: compact(doc.text, 180),
      score: doc.score,
      whyRetrieved: doc.whyRetrieved
    }))
  }
}

export function buildEvidenceRetrievalIndex(input: {
  sourceGraph: SourceGraph
  uiIntentGraph?: UIIntentGraph
  crawlGraph?: CrawlGraph
  runtimeDomSnapshot?: RuntimeDomSnapshot
  runtimeWorkflows?: RuntimeInferredWorkflow[]
  scenarioRuns?: ScenarioRun[]
  issues?: Issue[]
  fixPackets?: FixPacket[]
  productExperience?: ProductExperienceResult
  repairAttempts?: Array<EvidenceRetrievalDocument | RepairAttempt>
}): EvidenceRetrievalDocument[] {
  const uiIntentGraph = input.uiIntentGraph ?? input.sourceGraph.uiIntentGraph ?? buildUIIntentGraph(input.sourceGraph)
  const docs: EvidenceRetrievalDocument[] = []
  for (const fact of input.sourceGraph.sourceInventory?.facts ?? []) {
    docs.push(doc(`source-fact:${fact.id}`, 'source_chunk', [
      fact.kind,
      fact.value,
      fact.label,
      fact.handler,
      fact.testId,
      fact.symbol,
      fact.filePath,
      fact.snippet
    ].filter(Boolean).join(' '), {
      factId: fact.id,
      filePath: fact.filePath,
      symbol: fact.symbol,
      confidence: fact.confidence,
      extractionMethod: fact.extractionMethod,
      sourceScope: fact.sourceScope,
      label: fact.label,
      handler: fact.handler,
      testId: fact.testId
    }, [fact.id]))
  }
  for (const node of allIntentNodes(uiIntentGraph)) {
    const kind: EvidenceRetrievalDocumentKind = node.kind === 'workflow'
      ? 'workflow'
      : node.kind === 'surface'
        ? 'surface'
        : node.kind === 'api_dependency'
          ? 'api_call'
          : 'graph_node'
    docs.push(doc(`graph-node:${node.id}`, kind, nodeText(node), {
      nodeId: node.id,
      nodeKind: node.kind,
      label: node.label,
      filePath: node.filePath,
      sourceScope: node.sourceScope,
      confidence: node.confidence,
      extractionMethod: node.extractionMethod,
      ...node.metadata
    }, node.evidenceIds))
  }
  for (const edge of uiIntentGraph.edges) {
    docs.push(doc(`graph-edge:${edge.id}`, 'graph_node', `${edge.kind} ${edge.source} ${edge.target}`, {
      edgeId: edge.id,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      confidence: edge.confidence,
      edgeKind: edge.kind
    }, edge.evidenceIds))
  }
  for (const state of input.crawlGraph?.states ?? []) {
    docs.push(doc(`runtime-state:${state.id ?? state.hash}`, 'runtime_dom', [
      state.inferredScreenName,
      state.hashRoute,
      state.url,
      ...(state.primaryVisibleText ?? []),
      ...state.visible.map((item) => item.text ?? item.name ?? item.href ?? item.kind)
    ].filter(Boolean).join(' '), {
      stateId: state.id,
      screenName: state.inferredScreenName,
      url: state.url,
      hashRoute: state.hashRoute,
      screenshotPath: state.screenshotPath
    }, []))
    if (state.screenshotPath) {
      docs.push(doc(`screenshot:${state.screenshotPath}`, 'screenshot_metadata', `${state.inferredScreenName ?? 'runtime state'} screenshot ${state.screenshotPath}`, {
        stateId: state.id,
        screenName: state.inferredScreenName,
        screenshotPath: state.screenshotPath
      }, []))
    }
  }
  for (const action of input.crawlGraph?.actions ?? []) {
    docs.push(doc(`runtime-action:${action.id ?? slug(`${action.label}-${action.urlBefore}`)}`, 'runtime_dom', [
      action.actionType,
      action.label,
      action.role,
      action.urlBefore,
      action.urlAfter,
      action.safeReason,
      action.skippedReason,
      action.workflowContext,
      action.scenarioContext
    ].filter(Boolean).join(' '), {
      actionId: action.id,
      label: action.label,
      actionType: action.actionType,
      changedState: action.changedState,
      skipped: action.skipped,
      workflowContext: action.workflowContext,
      scenarioContext: action.scenarioContext
    }, []))
  }
  if (input.runtimeDomSnapshot) {
    docs.push(doc('runtime-dom:initial', 'runtime_dom', [
      input.runtimeDomSnapshot.title,
      input.runtimeDomSnapshot.url,
      ...input.runtimeDomSnapshot.visibleTextBlocks.slice(0, 80),
      ...input.runtimeDomSnapshot.controls.map((control) => control.accessibleName ?? control.visibleText ?? control.labelText ?? control.placeholder ?? control.dataTestId ?? control.kind).slice(0, 120)
    ].filter(Boolean).join(' '), {
      url: input.runtimeDomSnapshot.url,
      title: input.runtimeDomSnapshot.title,
      screenshotPath: input.runtimeDomSnapshot.screenshotPath
    }, []))
    for (const control of input.runtimeDomSnapshot.controls) {
      const name = control.accessibleName ?? control.visibleText ?? control.labelText ?? control.placeholder ?? control.dataTestId ?? control.kind
      docs.push(doc(`runtime-control:${slug(String(name))}`, 'runtime_dom', [
        control.kind,
        control.role,
        control.accessibleName,
        control.visibleText,
        control.labelText,
        control.placeholder,
        control.dataTestId,
        control.safeAction?.reason
      ].filter(Boolean).join(' '), {
        controlKind: control.kind,
        role: control.role,
        accessibleName: control.accessibleName,
        dataTestId: control.dataTestId,
        safe: control.safeAction?.safe,
        locatorCandidates: control.locatorCandidates
      }, []))
    }
  }
  for (const workflow of input.runtimeWorkflows ?? []) {
    docs.push(doc(`runtime-workflow:${slug(workflow.name)}`, 'workflow', [workflow.name, workflow.source, workflow.evidence.join(' '), workflow.steps.map((step) => `${step.action} ${step.target_name}`).join(' ')].join(' '), {
      workflowName: workflow.name,
      source: workflow.source,
      confidence: confidenceNumber(workflow.confidence)
    }, []))
  }
  for (const run of input.scenarioRuns ?? []) {
    docs.push(doc(`scenario:${run.slug}`, 'scenario_trace', [run.name, run.status, run.prerequisites.join(' '), run.stepsAttempted.join(' '), run.assertions.map((assertion) => `${assertion.label} ${assertion.status} ${assertion.evidence.join(' ')}`).join(' '), run.issues?.map((issue) => issue.title).join(' ') ?? ''].join(' '), {
      scenarioName: run.name,
      status: run.status,
      screenshots: run.screenshots
    }, []))
    for (const trace of run.stepTraces ?? []) {
      docs.push(doc(`scenario-step:${run.slug}:${slug(trace.stepName)}`, 'scenario_trace', [trace.screenName, trace.navLabel, trace.stepName, trace.actionLabel, trace.domSummary.join(' '), trace.visibleControls.join(' ')].filter(Boolean).join(' '), {
        scenarioName: trace.scenarioName,
        screenName: trace.screenName,
        stepName: trace.stepName,
        screenshotPath: trace.screenshotPath
      }, []))
    }
    for (const screenshotPath of run.screenshots ?? []) {
      docs.push(doc(`screenshot:${screenshotPath}`, 'screenshot_metadata', `${run.name} screenshot ${screenshotPath}`, {
        scenarioName: run.name,
        screenshotPath
      }, []))
    }
  }
  for (const issue of input.issues ?? []) {
    docs.push(doc(`issue:${issue.issue_id ?? slug(issue.title)}`, 'issue', [issue.title, issue.type, issue.severity, issue.description, issue.evidence.join(' '), issue.suggestedFixPrompt].join(' '), {
      issueId: issue.issue_id,
      severity: issue.severity,
      type: issue.type,
      screenshotPath: issue.screenshotPath
    }, []))
  }
  for (const packet of input.fixPackets ?? []) {
    docs.push(doc(`fix-packet:${packet.issue_id}`, 'fix_packet', [packet.title, packet.prompt, packet.suspected_files.join(' '), packet.verification_command].join(' '), {
      issueId: packet.issue_id,
      suspectedFiles: packet.suspected_files,
      repairRoot: packet.repair_root
    }, packet.evidence_packet?.sourceFacts.map((fact) => fact.id) ?? []))
  }
  for (const decision of input.productExperience?.decisions ?? []) {
    docs.push(doc(`product-experience:${slug(`${decision.screen_name}-${decision.nav_label}`)}`, 'product_experience', [
      decision.screen_name,
      decision.nav_label,
      decision.workflow_intent,
      decision.overall.summary,
      decision.findings.map((finding) => `${finding.title} ${finding.type} ${finding.evidence.join(' ')}`).join(' '),
      decision.non_issues.map((item) => `${item.observation} ${item.reason_not_reported}`).join(' ')
    ].filter(Boolean).join(' '), {
      screenName: decision.screen_name,
      navLabel: decision.nav_label,
      classification: decision.overall.classification,
      confidence: decision.overall.confidence
    }, []))
  }
  docs.push(...normalizeRepairAttemptDocs(input.repairAttempts ?? []))
  return dedupeDocs(docs)
}

function doc(id: string, kind: EvidenceRetrievalDocumentKind, text: string, metadata: Record<string, unknown>, relatedEvidenceIds: string[]): EvidenceRetrievalDocument {
  return { id, kind, text: text.replace(/\s+/g, ' ').trim(), metadata, relatedEvidenceIds: unique(relatedEvidenceIds) }
}

function scoreDocument(doc: EvidenceRetrievalDocument, query: string, options: EvidenceRetrievalOptions): ScoredDocument {
  const queryText = [
    query,
    options.featureRequest,
    options.screenName,
    options.workflowName,
    options.issueId,
    options.surfaceId,
    options.filePath,
    ...(options.entityHints ?? [])
  ].filter(Boolean).join(' ')
  const queryTokens = tokens(queryText)
  if (queryTokens.length === 0) return { doc, score: 1, whyRetrieved: ['empty query fallback'] }
  const metadataText = stringifyMetadata(doc.metadata)
  const docText = `${doc.text} ${metadataText}`
  const docTokens = new Set(tokens(docText))
  const matchedTokens = unique(queryTokens.filter((token) => docTokens.has(token)))
  let score = matchedTokens.length
  const whyRetrieved: string[] = matchedTokens.length ? [`token overlap: ${matchedTokens.slice(0, 8).join(', ')}`] : []
  if (includesNormalized(docText, query) && query.trim().length > 2) {
    score += 6
    whyRetrieved.push('exact query phrase match')
  }
  if (options.screenName && includesNormalized(docText, options.screenName)) {
    score += 8
    whyRetrieved.push(`screen match: ${options.screenName}`)
  }
  if (options.workflowName && includesNormalized(docText, options.workflowName)) {
    score += 8
    whyRetrieved.push(`workflow match: ${options.workflowName}`)
  }
  if (options.surfaceId && includesNormalized(`${doc.id} ${metadataText}`, options.surfaceId)) {
    score += 10
    whyRetrieved.push(`surface id match: ${options.surfaceId}`)
  }
  if (options.issueId && includesNormalized(`${doc.id} ${metadataText}`, options.issueId)) {
    score += 15
    whyRetrieved.push(`issue id match: ${options.issueId}`)
  }
  if (options.filePath && includesNormalized(metadataText, options.filePath)) {
    score += 10
    whyRetrieved.push(`file path match: ${options.filePath}`)
  }
  const matchedEntity = options.entityHints?.find((entity) => includesNormalized(docText, entity))
  if (matchedEntity) {
    score += 3
    whyRetrieved.push(`entity hint match: ${matchedEntity}`)
  }
  score += kindWeight(doc.kind)
  if (doc.metadata.sourceScope === 'primary_ui_source') score += 2
  if (doc.metadata.sourceScope === 'fixture' || doc.metadata.sourceScope === 'test') score -= 2
  const confidence = Number(doc.metadata.confidence ?? 0)
  if (confidence) score += confidence * 2
  if (score > 0 && whyRetrieved.length === 0) whyRetrieved.push(`${doc.kind} relevance`)
  return { doc, score, whyRetrieved }
}

function runtimeFactsFromDocuments(docs: EvidenceRetrievalDocument[]): EvidenceFact[] {
  return docs
    .filter((doc) => doc.kind === 'runtime_dom' || doc.kind === 'screenshot_metadata' || doc.kind === 'scenario_trace')
    .map((doc) => ({
      id: `runtime-fact-${slug(doc.id)}`,
      kind: doc.kind,
      value: doc.text,
      source: 'runtime',
      confidence: 0.8,
      extractionMethod: 'runtime' as const
    }))
}

function findContradictions(uiIntentGraph: UIIntentGraph, docs: EvidenceRetrievalDocument[], query: string): EvidenceInference[] {
  const explicit = uiIntentGraph.inferences.filter((inference) => inference.contradictedBy?.some((id) => docs.some((doc) => doc.relatedEvidenceIds.includes(id) || doc.id === id)))
  const text = `${query} ${docs.map((doc) => doc.text).join(' ')}`.toLowerCase()
  const copyJsonPresent = /copy json|copy raw json|download json|export json/.test(text)
  const missingCopy = /missing|lacks|not visible|not found|absent/.test(query.toLowerCase()) && /copy|export|download/.test(query.toLowerCase())
  if (copyJsonPresent && missingCopy) {
    return [
      ...explicit,
      {
        id: 'contradiction-copy-control-present',
        claim: 'A missing copy-control claim is contradicted by runtime/source evidence that a copy/export control is present.',
        basedOn: docs.filter((doc) => /copy json|copy raw json|download json|export json/i.test(doc.text)).flatMap((doc) => doc.relatedEvidenceIds.length ? doc.relatedEvidenceIds : [doc.id]),
        confidence: 0.9,
        method: 'heuristic'
      }
    ]
  }
  return explicit
}

function summarizeConfidence(sourceFacts: EvidenceFact[], runtimeFacts: EvidenceFact[], inferences: EvidenceInference[], contradictions: EvidenceInference[], docs: EvidenceRetrievalDocument[]) {
  const all = [...sourceFacts, ...runtimeFacts]
  const averageConfidence = all.length
    ? Number((all.reduce((sum, fact) => sum + fact.confidence, 0) / all.length).toFixed(2))
    : 0
  const split = splitCounts(docs)
  const averageScore = docs.length
    ? Number((docs.reduce((sum, doc) => sum + Number(doc.score ?? 0), 0) / docs.length).toFixed(2))
    : 0
  return {
    sourceFactCount: sourceFacts.length,
    runtimeFactCount: runtimeFacts.length,
    sourceDocumentCount: split.source,
    runtimeDocumentCount: split.runtime,
    scenarioDocumentCount: split.scenario,
    priorFindingCount: split.priorFindings,
    priorFixPacketCount: split.priorFixPackets,
    priorRepairAttemptCount: split.priorRepairAttempts,
    heuristicInferenceCount: inferences.filter((inference) => inference.method === 'heuristic').length,
    llmInferenceCount: inferences.filter((inference) => inference.method === 'llm').length,
    contradictionCount: contradictions.length,
    averageConfidence,
    averageScore
  }
}

function retrievalIntent(options: EvidenceRetrievalOptions, query: string): string {
  if (options.issueId) return 'issue_repair_context'
  if (options.screenName) return 'screen_product_experience_context'
  if (options.workflowName) return 'workflow_evidence_context'
  if (options.featureRequest) return 'feature_request_context'
  return query.trim() ? 'ad_hoc_evidence_query' : 'general_evidence_context'
}

function normalizeRepairAttemptDocs(attempts: Array<EvidenceRetrievalDocument | RepairAttempt>): EvidenceRetrievalDocument[] {
  return attempts.map((attempt) => {
    if ('kind' in attempt && 'text' in attempt) return attempt
    return doc(`repair-attempt:${attempt.issue_id}:${attempt.iteration}`, 'repair_attempt', [
      attempt.issue_id,
      `iteration ${attempt.iteration}`,
      attempt.agentResult.status,
      attempt.agentResult.notes.join(' '),
      attempt.agentResult.changedFiles.join(' '),
      attempt.gitDiffSummary,
      attempt.verification?.status,
      attempt.verification?.afterEvidence.join(' ') ?? ''
    ].filter(Boolean).join(' '), {
      issueId: attempt.issue_id,
      iteration: attempt.iteration,
      status: attempt.agentResult.status,
      changedFiles: attempt.agentResult.changedFiles,
      createdAt: attempt.createdAt,
      attemptDir: attempt.attemptDir
    }, [])
  })
}

function splitCounts(docs: EvidenceRetrievalDocument[]) {
  return {
    source: docs.filter((doc) => doc.kind === 'source_chunk' || doc.kind === 'graph_node' || doc.kind === 'workflow' || doc.kind === 'surface' || doc.kind === 'api_call').length,
    runtime: docs.filter((doc) => doc.kind === 'runtime_dom' || doc.kind === 'screenshot_metadata').length,
    scenario: docs.filter((doc) => doc.kind === 'scenario_trace').length,
    productExperience: docs.filter((doc) => doc.kind === 'product_experience').length,
    priorFindings: docs.filter((doc) => doc.kind === 'issue').length,
    priorFixPackets: docs.filter((doc) => doc.kind === 'fix_packet').length,
    priorRepairAttempts: docs.filter((doc) => doc.kind === 'repair_attempt').length
  }
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1
    return counts
  }, {})
}

function kindWeight(kind: EvidenceRetrievalDocumentKind): number {
  if (kind === 'workflow') return 3
  if (kind === 'surface') return 2.5
  if (kind === 'api_call') return 2
  if (kind === 'scenario_trace') return 2
  if (kind === 'runtime_dom') return 1.5
  if (kind === 'issue' || kind === 'fix_packet' || kind === 'repair_attempt') return 2
  if (kind === 'screenshot_metadata') return 1
  if (kind === 'product_experience') return 1.5
  return 0.5
}

function confidenceNumber(value: string | number): number {
  if (typeof value === 'number') return value
  if (value === 'high') return 0.9
  if (value === 'medium') return 0.6
  if (value === 'low') return 0.3
  return 0.5
}

function stringifyMetadata(metadata: Record<string, unknown>): string {
  return Object.entries(metadata)
    .map(([key, value]) => `${key} ${Array.isArray(value) ? value.join(' ') : String(value ?? '')}`)
    .join(' ')
}

function allIntentNodes(graph: UIIntentGraph): UIIntentNode[] {
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

function nodeText(node: UIIntentNode): string {
  return [node.kind, node.label, node.filePath, node.symbol, node.route, JSON.stringify(node.metadata ?? {})].filter(Boolean).join(' ')
}

function dedupeDocs(docs: EvidenceRetrievalDocument[]): EvidenceRetrievalDocument[] {
  const byId = new Map<string, EvidenceRetrievalDocument>()
  for (const item of docs) byId.set(item.id, item)
  return [...byId.values()]
}

function tokens(value: string): string[] {
  return normalize(value).split(/\s+/).filter((token) => token.length > 1)
}

function includesNormalized(value: string, needle: string): boolean {
  return normalize(value).includes(normalize(needle))
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9/_:-]+/g, ' ').trim()
}

function intersects(left: string[], right: string[]): boolean {
  const rightSet = new Set(right)
  return left.some((value) => rightSet.has(value))
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))]
}

function compact(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value
}

function slug(value: string): string {
  return normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'item'
}
