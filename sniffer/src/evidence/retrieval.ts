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
  RuntimeDomSnapshot,
  RuntimeInferredWorkflow,
  ScenarioRun,
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
  repairAttempts?: EvidenceRetrievalDocument[]
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
    repairAttempts: options.repairAttempts
  })
  const filtered = documents
    .filter((doc) => options.kinds ? options.kinds.includes(doc.kind) : true)
    .filter((doc) => options.includeRuntime === false ? !['runtime_dom', 'screenshot_metadata'].includes(doc.kind) : true)
    .filter((doc) => options.includePriorRepairs === false ? !['fix_packet', 'repair_attempt'].includes(doc.kind) : true)
  const scored = filtered
    .map((doc) => ({ doc, score: scoreDocument(doc, query, options) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id))
    .slice(0, options.maxResults ?? 12)
    .map((item) => item.doc)

  const facts = options.sourceGraph.sourceInventory?.facts ?? []
  const sourceFacts = facts.filter((fact) => scored.some((doc) => doc.relatedEvidenceIds.includes(fact.id) && fact.extractionMethod !== 'runtime'))
  const runtimeFacts = runtimeFactsFromDocuments(scored)
  const nodes = allIntentNodes(uiIntentGraph).filter((node) => scored.some((doc) => doc.metadata.nodeId === node.id || intersects(doc.relatedEvidenceIds, node.evidenceIds)))
  const contradictions = findContradictions(uiIntentGraph, scored, query)
  const screenshots = unique(scored
    .filter((doc) => doc.kind === 'screenshot_metadata' || typeof doc.metadata.screenshotPath === 'string')
    .map((doc) => String(doc.metadata.screenshotPath ?? doc.text))
    .filter(Boolean))

  return {
    context: {
      issueId: options.issueId,
      screenName: options.screenName,
      workflowName: options.workflowName,
      featureRequest: options.featureRequest,
      query
    },
    retrievedDocuments: scored,
    graphNodes: nodes,
    sourceFacts,
    runtimeFacts,
    screenshots,
    contradictions,
    confidenceSummary: summarizeConfidence(sourceFacts, runtimeFacts, uiIntentGraph.inferences, contradictions)
  }
}

export function evidencePacketSummary(packet: EvidencePacket) {
  return {
    context: packet.context,
    retrievedDocumentCount: packet.retrievedDocuments.length,
    sourceFactCount: packet.sourceFacts.length,
    runtimeFactCount: packet.runtimeFacts.length,
    contradictionCount: packet.contradictions.length,
    topDocuments: packet.retrievedDocuments.slice(0, 5).map((doc) => ({
      id: doc.id,
      kind: doc.kind,
      text: compact(doc.text, 180)
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
  repairAttempts?: EvidenceRetrievalDocument[]
}): EvidenceRetrievalDocument[] {
  const uiIntentGraph = input.uiIntentGraph ?? input.sourceGraph.uiIntentGraph ?? buildUIIntentGraph(input.sourceGraph)
  const docs: EvidenceRetrievalDocument[] = []
  for (const fact of input.sourceGraph.sourceInventory?.facts ?? []) {
    docs.push(doc(`source-fact:${fact.id}`, 'source_chunk', [fact.kind, fact.value, fact.symbol, fact.filePath, fact.snippet].filter(Boolean).join(' '), {
      factId: fact.id,
      filePath: fact.filePath,
      symbol: fact.symbol,
      confidence: fact.confidence,
      extractionMethod: fact.extractionMethod
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
      confidence: node.confidence,
      extractionMethod: node.extractionMethod,
      ...node.metadata
    }, node.evidenceIds))
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
  }
  for (const workflow of input.runtimeWorkflows ?? []) {
    docs.push(doc(`runtime-workflow:${slug(workflow.name)}`, 'workflow', [workflow.name, workflow.source, workflow.evidence.join(' '), workflow.steps.map((step) => `${step.action} ${step.target_name}`).join(' ')].join(' '), {
      workflowName: workflow.name,
      source: workflow.source,
      confidence: workflow.confidence
    }, []))
  }
  for (const run of input.scenarioRuns ?? []) {
    docs.push(doc(`scenario:${run.slug}`, 'runtime_dom', [run.name, run.status, run.prerequisites.join(' '), run.stepsAttempted.join(' '), run.assertions?.join(' ') ?? '', run.issues?.map((issue) => issue.title).join(' ') ?? ''].join(' '), {
      scenarioName: run.name,
      status: run.status,
      screenshots: run.screenshots
    }, []))
    for (const trace of run.stepTraces ?? []) {
      docs.push(doc(`scenario-step:${run.slug}:${slug(trace.stepName)}`, 'runtime_dom', [trace.screenName, trace.navLabel, trace.stepName, trace.actionLabel, trace.domSummary.join(' '), trace.visibleControls.join(' ')].filter(Boolean).join(' '), {
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
  docs.push(...(input.repairAttempts ?? []))
  return dedupeDocs(docs)
}

function doc(id: string, kind: EvidenceRetrievalDocumentKind, text: string, metadata: Record<string, unknown>, relatedEvidenceIds: string[]): EvidenceRetrievalDocument {
  return { id, kind, text: text.replace(/\s+/g, ' ').trim(), metadata, relatedEvidenceIds: unique(relatedEvidenceIds) }
}

function scoreDocument(doc: EvidenceRetrievalDocument, query: string, options: EvidenceRetrievalOptions): number {
  const queryText = [
    query,
    options.featureRequest,
    options.screenName,
    options.workflowName,
    options.issueId,
    ...(options.entityHints ?? [])
  ].filter(Boolean).join(' ')
  const queryTokens = tokens(queryText)
  if (queryTokens.length === 0) return 1
  const docTokens = new Set(tokens(`${doc.text} ${Object.values(doc.metadata).join(' ')}`))
  let score = queryTokens.reduce((sum, token) => sum + (docTokens.has(token) ? 1 : 0), 0)
  if (options.screenName && includesNormalized(doc.text, options.screenName)) score += 4
  if (options.workflowName && includesNormalized(doc.text, options.workflowName)) score += 4
  if (options.issueId && includesNormalized(`${doc.id} ${Object.values(doc.metadata).join(' ')}`, options.issueId)) score += 5
  if (options.entityHints?.some((entity) => includesNormalized(doc.text, entity))) score += 2
  if (doc.kind === 'workflow' || doc.kind === 'surface') score += 1
  const confidence = Number(doc.metadata.confidence ?? 0)
  if (confidence) score += confidence
  return score
}

function runtimeFactsFromDocuments(docs: EvidenceRetrievalDocument[]): EvidenceFact[] {
  return docs
    .filter((doc) => doc.kind === 'runtime_dom' || doc.kind === 'screenshot_metadata')
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
  const copyJsonPresent = /copy json|copy raw json/.test(text)
  const missingCopy = /missing|lacks|not visible|not found/.test(query.toLowerCase()) && /copy/.test(query.toLowerCase())
  if (copyJsonPresent && missingCopy) {
    return [
      ...explicit,
      {
        id: 'contradiction-copy-control-present',
        claim: 'A missing copy-control claim is contradicted by runtime/source evidence that a copy control is present.',
        basedOn: docs.filter((doc) => /copy json|copy raw json/i.test(doc.text)).flatMap((doc) => doc.relatedEvidenceIds.length ? doc.relatedEvidenceIds : [doc.id]),
        confidence: 0.9,
        method: 'heuristic'
      }
    ]
  }
  return explicit
}

function summarizeConfidence(sourceFacts: EvidenceFact[], runtimeFacts: EvidenceFact[], inferences: EvidenceInference[], contradictions: EvidenceInference[]) {
  const all = [...sourceFacts, ...runtimeFacts]
  const averageConfidence = all.length
    ? Number((all.reduce((sum, fact) => sum + fact.confidence, 0) / all.length).toFixed(2))
    : 0
  return {
    sourceFactCount: sourceFacts.length,
    runtimeFactCount: runtimeFacts.length,
    heuristicInferenceCount: inferences.filter((inference) => inference.method === 'heuristic').length,
    llmInferenceCount: inferences.filter((inference) => inference.method === 'llm').length,
    contradictionCount: contradictions.length,
    averageConfidence
  }
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
