import type {
  ApiCall,
  CandidateFinding,
  CriticDecision,
  CrawlAction,
  CrawlState,
  FixPacketItem,
  Issue,
  ScenarioRun,
  ScreenshotItem,
  SnifferReport,
  SourceWorkflow,
  StateAction,
  UiSurface,
  UxFinding
} from '../api'
import type { GraphBuildInput, GraphEdgeType, GraphStatus, SnifferGraph, SnifferGraphEdge, SnifferGraphNode } from './graphModel'

export function buildSnifferGraph({ report, fixPackets = [], screenshots = [] }: GraphBuildInput): SnifferGraph {
  const nodes = new Map<string, SnifferGraphNode>()
  const edges = new Map<string, SnifferGraphEdge>()

  const addNode = (node: SnifferGraphNode) => {
    const existing = nodes.get(node.id)
    if (existing) {
      nodes.set(node.id, {
        ...existing,
        ...node,
        evidence: unique([...existing.evidence, ...node.evidence]),
        screenshots: unique([...existing.screenshots, ...node.screenshots]),
        fixPacketIds: unique([...existing.fixPacketIds, ...node.fixPacketIds]),
        issues: mergeIssues(existing.issues, node.issues),
        criticDecisions: [...existing.criticDecisions, ...node.criticDecisions]
      })
    } else {
      nodes.set(node.id, node)
    }
  }
  const addEdge = (edge: SnifferGraphEdge) => {
    if (edge.source !== edge.target) edges.set(edge.id, edge)
  }

  const sourceGraph = report.sourceGraph
  const crawlGraph = report.crawlGraph

  const sourceFiles = new Set<string>()
  sourceGraph?.uiSurfaces?.forEach((surface) => sourceFiles.add(surface.file))
  sourceGraph?.sourceWorkflows?.forEach((workflow) => workflow.sourceFiles.forEach((file) => sourceFiles.add(file)))
  sourceGraph?.apiCalls?.forEach((api) => sourceFiles.add(api.sourceFile))
  sourceGraph?.stateActions?.forEach((state) => sourceFiles.add(state.file))
  report.issues?.forEach((issue) => issue.suspected_files?.forEach((file) => sourceFiles.add(file)))

  for (const file of sourceFiles) {
    addNode(baseNode({
      id: sourceFileId(file),
      label: file.split('/').pop() ?? file,
      type: 'source_file',
      group: 'Source',
      sourceFile: file,
      metadata: { file },
      processed: true
    }))
  }

  sourceGraph?.uiSurfaces?.forEach((surface, index) => {
    const id = `surface:${slug(surface.file)}:${slug(surface.surface_type)}:${index}`
    addNode(baseNode({
      id,
      label: surface.display_name,
      type: 'ui_surface',
      group: 'Source intent',
      status: 'processed',
      confidence: surface.confidence,
      sourceFile: surface.file,
      metadata: surface,
      evidence: surface.evidence,
      processed: true
    }))
    addEdge(edge(sourceFileId(surface.file), id, 'discovered_in', 'contains'))
  })

  sourceGraph?.sourceWorkflows?.forEach((workflow, index) => {
    const id = workflowId(workflow.name, index)
    addNode(baseNode({
      id,
      label: workflow.name,
      type: 'source_workflow',
      group: 'Workflows',
      status: 'processed',
      confidence: workflow.confidence,
      workflowName: workflow.name,
      metadata: workflow,
      evidence: workflow.evidence,
      processed: true
    }))
    workflow.sourceFiles.forEach((file) => addEdge(edge(sourceFileId(file), id, 'belongs_to_workflow', 'workflow')))
    sourceGraph.uiSurfaces?.forEach((surface, surfaceIndex) => {
      if (evidenceOverlaps(workflow.evidence, [...surface.evidence, surface.display_name, surface.surface_type])) {
        addEdge(edge(id, `surface:${slug(surface.file)}:${slug(surface.surface_type)}:${surfaceIndex}`, 'belongs_to_workflow', 'surface'))
      }
    })
  })

  sourceGraph?.apiCalls?.forEach((api, index) => {
    const id = apiId(api, index)
    addNode(baseNode({
      id,
      label: `${api.method ?? 'GET'} ${api.endpoint}`,
      type: 'api_call',
      group: 'API',
      status: apiStatus(api, report),
      sourceFile: api.sourceFile,
      workflowName: api.likelyWorkflow,
      metadata: api,
      evidence: [api.endpoint, api.functionName, api.likelyWorkflow].filter(Boolean) as string[],
      processed: true
    }))
    addEdge(edge(sourceFileId(api.sourceFile), id, 'calls_api', 'declares'))
    const workflow = findWorkflowByName(sourceGraph.sourceWorkflows ?? [], api.likelyWorkflow)
    if (workflow) addEdge(edge(workflowId(workflow.name, sourceGraph.sourceWorkflows?.indexOf(workflow) ?? 0), id, 'calls_api', 'calls'))
  })

  sourceGraph?.stateActions?.forEach((state, index) => {
    const id = `state-action:${slug(state.file)}:${index}`
    addNode(baseNode({
      id,
      label: state.file.split('/').pop() ?? 'state/action hints',
      type: 'state_action',
      group: 'Source state',
      sourceFile: state.file,
      metadata: state,
      evidence: [...state.stateVariables, ...state.handlerNames, ...state.submitHandlers],
      processed: true
    }))
    addEdge(edge(sourceFileId(state.file), id, 'discovered_in', 'state/action'))
  })

  crawlGraph?.states?.forEach((state, index) => {
    const id = runtimeStateId(index, state)
    const issueRefs = (state.issuesOnState ?? [])
      .map((issueId) => report.issues?.find((issue) => issue.issue_id === issueId || issue.title === issueId))
      .filter(Boolean) as Issue[]
    const controlSummary = state.visibleControlSummary
    addNode(baseNode({
      id,
      label: `${state.sequenceNumber ?? index + 1} · ${state.inferredScreenName ?? inferScreenName(state)}`,
      type: 'runtime_state',
      group: 'Runtime crawl',
      status: issueRefs.length ? issueStatus(issueRefs[0]) : (state.consoleErrorsOnState?.length || state.networkErrorsOnState?.length ? 'warning' : 'processed'),
      url: state.url,
      metadata: { ...state, visibleCount: state.visible.length },
      evidence: [
        state.title,
        state.url,
        state.hashRoute,
        state.inferredPageType,
        controlSummary ? `buttons: ${controlSummary.buttons.count}` : undefined,
        controlSummary ? `inputs: ${controlSummary.inputs.count}` : undefined,
        ...(state.primaryVisibleText ?? []).slice(0, 3)
      ].filter(Boolean) as string[],
      issues: issueRefs,
      screenshots: state.screenshotPath ? [state.screenshotPath] : screenshotForIndex(crawlGraph.screenshots, index),
      processed: true
    }))
    state.visible.slice(0, 24).forEach((control, controlIndex) => {
      const controlId = `control:${index}:${controlIndex}`
      addNode(baseNode({
        id: controlId,
        label: control.text || control.name || control.kind,
        type: 'visible_control',
        group: 'Runtime crawl',
        status: 'processed',
        url: state.url,
        metadata: control,
        evidence: [control.text, control.name, control.href].filter(Boolean) as string[],
        processed: true
      }))
      addEdge(edge(id, controlId, 'rendered_at_runtime', control.kind))
    })
  })

  crawlGraph?.actions?.forEach((action, index) => {
    const id = `action:${index}:${slug(action.label)}`
    addNode(baseNode({
      id,
      label: `${action.actionType ?? action.type} ${action.label}`,
      type: 'crawl_action',
      group: 'Runtime crawl',
      status: action.skipped ? 'blocked' : action.changedState === false ? 'warning' : action.safe ? 'processed' : 'blocked',
      url: action.urlAfter ?? action.urlBefore,
      metadata: action,
      evidence: [action.locatorUsed, action.target, action.safeReason, action.skippedReason, action.urlBefore, action.urlAfter].filter(Boolean) as string[],
      screenshots: [action.screenshotBefore, action.screenshotAfter].filter(Boolean) as string[],
      processed: !action.skipped
    }))
    const from = findStateIndexForAction(crawlGraph.states ?? [], action.stateHashBefore, action.urlBefore)
    const to = findStateIndexForAction(crawlGraph.states ?? [], action.stateHashAfter, action.urlAfter ?? action.urlBefore)
    if (from >= 0) addEdge(edge(runtimeStateId(from, crawlGraph.states?.[from]), id, 'clicked_to', action.actionType ?? action.type))
    if (to >= 0) addEdge(edge(id, runtimeStateId(to, crawlGraph.states?.[to]), 'transitions_to', `${action.actionType ?? action.type} ${action.label}`))
  })

  report.scenarioRuns?.forEach((scenario, index) => {
    const id = scenarioId(scenario.name, index)
    addNode(baseNode({
      id,
      label: scenario.name,
      type: 'scenario',
      group: 'Scenarios',
      status: scenarioStatus(scenario),
      metadata: scenario,
      evidence: scenario.issues?.flatMap((issue) => issue.evidence).slice(0, 8) ?? [],
      screenshots: scenario.screenshots ?? [],
      processed: true
    }))
    const workflow = findWorkflowByEvidence(sourceGraph?.sourceWorkflows ?? [], scenario.name)
    if (workflow) addEdge(edge(workflowId(workflow.name, sourceGraph?.sourceWorkflows?.indexOf(workflow) ?? 0), id, 'belongs_to_workflow', 'scenario'))
    scenario.steps?.forEach((step, stepIndex) => {
      const stepId = `${id}:step:${stepIndex}`
      addNode(baseNode({
        id: stepId,
        label: step.name || step.action || `Step ${stepIndex + 1}`,
        type: 'scenario_step',
        group: 'Scenarios',
        status: step.status === 'passed' ? 'passed' : step.status === 'failed' ? 'failed' : 'processed',
        metadata: step,
        evidence: step.evidence ?? [],
        processed: true
      }))
      addEdge(edge(id, stepId, 'transitions_to', 'step'))
    })
  })

  report.criticDecisions?.forEach((decision, index) => {
    const id = criticId(decision, index)
    addNode(baseNode({
      id,
      label: decision.classification,
      type: 'critic_decision',
      group: 'Critic',
      status: criticStatus(decision),
      confidence: decision.confidence,
      metadata: decision,
      evidence: decision.evidence ?? [],
      criticDecisions: [decision],
      processed: true
    }))
  })

  addProductIntentNodes(report, addNode, addEdge)
  addIssueNodes(report, fixPackets, addNode, addEdge, sourceGraph?.apiCalls ?? [], sourceGraph?.sourceWorkflows ?? [])
  addUxFindingNodes(report, addNode, addEdge)
  addFixPacketNodes(fixPackets, report, addNode, addEdge)
  addScreenshotNodes(screenshots, report, addNode, addEdge)
  connectCriticDecisions(report, addNode, addEdge)

  const graphNodes = [...nodes.values()]
  const graphEdges = [...edges.values()]
  return {
    nodes: graphNodes,
    edges: graphEdges,
    summary: {
      node_count: graphNodes.length,
      edge_count: graphEdges.length,
      issue_count: graphNodes.filter((node) => node.type === 'issue').length,
      workflow_count: graphNodes.filter((node) => node.type === 'source_workflow').length,
      failed_scenario_count: graphNodes.filter((node) => node.type === 'scenario' && node.status === 'failed').length,
      fix_packet_count: graphNodes.filter((node) => node.type === 'fix_packet').length
    }
  }
}

function addIssueNodes(
  report: SnifferReport,
  fixPackets: FixPacketItem[],
  addNode: (node: SnifferGraphNode) => void,
  addEdge: (edge: SnifferGraphEdge) => void,
  apiCalls: ApiCall[],
  workflows: SourceWorkflow[]
) {
  const allIssues = [
    ...(report.issues ?? []),
    ...(report.rawFindings ?? []),
    ...candidateFindingsToIssues(report.deferredFindings ?? [], 'deferred'),
    ...candidateFindingsToIssues(report.blockedChecks ?? [], 'blocked'),
    ...candidateFindingsToIssues(report.needsMoreCrawling ?? [], 'needs_more_crawling')
  ]
  allIssues.forEach((issue, index) => {
    const id = issueId(issue, index)
    const fixPacketIds = fixPackets.filter((packet) => packet.issueId === issue.issue_id).map((packet) => packet.issueId)
    addNode(baseNode({
      id,
      label: issue.title,
      type: 'issue',
      group: 'Issues',
      status: issueStatus(issue),
      severity: issue.severity,
      sourceFile: issue.suspected_files?.[0],
      metadata: issue,
      evidence: issue.evidence,
      issues: [issue],
      screenshots: [issue.screenshotPath].filter(Boolean) as string[],
      fixPacketIds,
      processed: true
    }))
    issue.suspected_files?.forEach((file) => addEdge(edge(sourceFileId(file), id, 'produced_issue', 'suspected')))
    const api = apiCalls.find((call) => issueText(issue).includes(call.endpoint.toLowerCase()) || issueText(issue).includes(endpointTail(call.endpoint)))
    if (api) addEdge(edge(apiId(api, apiCalls.indexOf(api)), id, 'produced_issue', 'failure'))
    const workflow = workflows.find((workflow) => issueText(issue).includes(workflow.name.toLowerCase()))
    if (workflow) addEdge(edge(workflowId(workflow.name, workflows.indexOf(workflow)), id, 'produced_issue', 'workflow'))
    if (issue.screenshotPath) addEdge(edge(screenshotId(issue.screenshotPath), id, 'evidence_for', 'screenshot'))
  })
}

function addUxFindingNodes(report: SnifferReport, addNode: (node: SnifferGraphNode) => void, addEdge: (edge: SnifferGraphEdge) => void) {
  report.uxCriticFindings?.forEach((finding, index) => {
    const id = `ux:${index}:${slug(finding.title)}`
    addNode(baseNode({
      id,
      label: finding.title,
      type: 'issue',
      group: 'UX critic',
      status: finding.should_report ? 'open' : 'deferred',
      severity: finding.severity,
      metadata: finding,
      evidence: finding.evidence,
      screenshots: [finding.screenshotPath].filter(Boolean) as string[],
      issues: [uxFindingToIssue(finding, index)],
      processed: true
    }))
    if (finding.screenshotPath) addEdge(edge(screenshotId(finding.screenshotPath), id, 'evidence_for', 'screenshot'))
  })
}

function addProductIntentNodes(report: SnifferReport, addNode: (node: SnifferGraphNode) => void, addEdge: (edge: SnifferGraphEdge) => void) {
  if (report.productIntent) {
    addNode(baseNode({
      id: 'product-intent',
      label: report.productIntent.app_category ?? 'Product intent',
      type: 'product_intent',
      group: 'Product intent',
      status: 'processed',
      confidence: report.productIntent.confidence,
      metadata: report.productIntent,
      evidence: [
        ...(report.productIntent.core_entities?.map((entity) => entity.name) ?? []),
        ...(report.productIntent.primary_user_jobs?.map((job) => job.name) ?? [])
      ],
      processed: true
    }))
  }
  report.productIntentFindings?.forEach((finding, index) => {
    const id = `product-gap:${index}:${slug(finding.title)}`
    addNode(baseNode({
      id,
      label: finding.title,
      type: 'product_gap',
      group: 'Product intent',
      status: finding.should_report ? 'warning' : 'deferred',
      severity: finding.severity,
      confidence: finding.confidence,
      metadata: finding,
      evidence: finding.evidence ?? [],
      processed: true
    }))
    if (report.productIntent) addEdge(edge('product-intent', id, 'produced_issue', 'gap'))
  })
}

function addFixPacketNodes(
  fixPackets: FixPacketItem[],
  report: SnifferReport,
  addNode: (node: SnifferGraphNode) => void,
  addEdge: (edge: SnifferGraphEdge) => void
) {
  fixPackets.forEach((packet) => {
    addNode(baseNode({
      id: fixPacketId(packet.issueId),
      label: packet.issueId,
      type: 'fix_packet',
      group: 'Repair',
      status: 'processed',
      metadata: packet,
      evidence: [packet.relativePath],
      fixPacketIds: [packet.issueId],
      processed: true
    }))
    const issueIndex = report.issues?.findIndex((issue) => issue.issue_id === packet.issueId) ?? -1
    const issue = issueIndex >= 0 ? report.issues?.[issueIndex] : undefined
    if (issue) addEdge(edge(issueId(issue, issueIndex), fixPacketId(packet.issueId), 'generated_fix_packet', 'fix packet'))
  })
}

function addScreenshotNodes(
  screenshots: ScreenshotItem[],
  report: SnifferReport,
  addNode: (node: SnifferGraphNode) => void,
  addEdge: (edge: SnifferGraphEdge) => void
) {
  screenshots.forEach((shot) => {
    const context = screenshotContext(shot.relativePath, report)
    addNode(baseNode({
      id: screenshotId(shot.relativePath),
      label: context.label,
      type: 'screenshot',
      group: 'Evidence',
      status: 'processed',
      metadata: { ...shot, context },
      evidence: [shot.relativePath, shot.group, context.description],
      screenshots: [shot.url],
      processed: true
    }))
  })
  report.crawlGraph?.screenshots?.forEach((shot, index) => {
    const rel = relativeReportPath(shot)
    const stateIndex = Math.min(index, Math.max((report.crawlGraph?.states?.length ?? 1) - 1, 0))
    addEdge(edge(runtimeStateId(stateIndex, report.crawlGraph?.states?.[stateIndex]), screenshotId(rel), 'screenshot_of', 'state screenshot'))
  })
  report.scenarioRuns?.forEach((scenario, scenarioIndex) => {
    scenario.screenshots?.forEach((shot) => addEdge(edge(scenarioId(scenario.name, scenarioIndex), screenshotId(relativeReportPath(shot)), 'screenshot_of', 'scenario')))
  })
}

function connectCriticDecisions(report: SnifferReport, addNode: (node: SnifferGraphNode) => void, addEdge: (edge: SnifferGraphEdge) => void) {
  report.criticDecisions?.forEach((decision, index) => {
    const decisionNodeId = criticId(decision, index)
    const allIssues = [...(report.issues ?? []), ...(report.rawFindings ?? [])]
    const matched = allIssues.findIndex((issue) => issue.issue_id === decision.finding_id)
    if (matched >= 0) {
      addEdge(edge(issueId(allIssues[matched], matched), decisionNodeId, 'classified_by', decision.classification))
    }
    if (decision.required_precondition) {
      const id = preconditionNode(decision.required_precondition)
      addNode(baseNode({
        id,
        label: decision.required_precondition,
        type: 'critic_decision',
        group: 'Critic',
        status: 'blocked',
        metadata: { required_precondition: decision.required_precondition },
        evidence: [decision.reasoning_summary],
        processed: true
      }))
      addEdge(edge(decisionNodeId, id, 'blocked_by_precondition', decision.required_precondition))
    }
  })
}

function baseNode(input: Partial<SnifferGraphNode> & Pick<SnifferGraphNode, 'id' | 'label' | 'type' | 'group'>): SnifferGraphNode {
  return {
    status: 'unprocessed',
    metadata: {},
    evidence: [],
    issues: [],
    criticDecisions: [],
    screenshots: [],
    fixPacketIds: [],
    processed: false,
    ...input
  }
}

function edge(source: string, target: string, type: GraphEdgeType, label?: string): SnifferGraphEdge {
  return {
    id: `${type}:${source}->${target}:${label ?? ''}`,
    source,
    target,
    type,
    label
  }
}

function candidateFindingsToIssues(findings: CandidateFinding[], status: GraphStatus): Issue[] {
  return findings.map((finding) => ({
    issue_id: finding.finding_id,
    severity: finding.severity,
    type: finding.type,
    title: finding.title,
    description: finding.description,
    evidence: finding.evidence,
    screenshotPath: finding.screenshotPath,
    suggestedFixPrompt: `Review ${status} finding.`
  }))
}

function uxFindingToIssue(finding: UxFinding, index: number): Issue {
  return {
    issue_id: `ux-${index}-${slug(finding.title)}`,
    severity: finding.severity,
    type: finding.type,
    title: finding.title,
    description: finding.suggested_fix ?? 'UX critic finding.',
    evidence: finding.evidence,
    screenshotPath: finding.screenshotPath,
    suggestedFixPrompt: finding.suggested_fix ?? 'Review UX finding.'
  }
}

function issueStatus(issue: Issue): GraphStatus {
  if (issue.status === 'fixed') return 'fixed'
  if (issue.status === 'failed') return 'failed'
  if (issue.severity === 'critical' || issue.severity === 'high') return 'failed'
  if (/blocked|deferred/.test(issue.type)) return 'blocked'
  return 'open'
}

function scenarioStatus(scenario: ScenarioRun): GraphStatus {
  if (scenario.status === 'passed') return 'passed'
  if (scenario.status === 'failed') return 'failed'
  return 'blocked'
}

function criticStatus(decision: CriticDecision): GraphStatus {
  if (decision.classification === 'real_bug') return 'failed'
  if (decision.classification === 'crawler_needs_precondition') return 'blocked'
  if (decision.classification === 'needs_more_crawling') return 'needs_more_crawling'
  if (decision.classification === 'conditional_ui_not_bug') return 'deferred'
  return 'processed'
}

function apiStatus(api: ApiCall, report: SnifferReport): GraphStatus {
  const apiText = `${api.endpoint} ${endpointTail(api.endpoint)}`.toLowerCase()
  const issue = [...(report.issues ?? []), ...(report.rawFindings ?? [])].find((item) => issueText(item).includes(apiText) || issueText(item).includes(endpointTail(api.endpoint)))
  return issue ? 'failed' : 'processed'
}

function sourceFileId(file: string): string {
  return `file:${file}`
}

function workflowId(name: string, index: number): string {
  return `workflow:${index}:${slug(name)}`
}

function apiId(api: ApiCall, index: number): string {
  return `api:${index}:${slug(api.endpoint)}`
}

function runtimeStateId(index: number, state?: CrawlState): string {
  return `runtime-state:${state?.id ?? index}`
}

function scenarioId(name: string, index: number): string {
  return `scenario:${index}:${slug(name)}`
}

function issueId(issue: Issue, index: number): string {
  return `issue:${issue.issue_id ?? `${index}:${slug(issue.title)}`}`
}

function criticId(decision: CriticDecision, index: number): string {
  return `critic:${decision.finding_id ?? index}:${decision.classification}`
}

function fixPacketId(issueId: string): string {
  return `fix-packet:${issueId}`
}

function screenshotId(path: string): string {
  return `screenshot:${relativeReportPath(path)}`
}

function preconditionNode(name: string): string {
  return `precondition:${slug(name)}`
}

function findWorkflowByName(workflows: SourceWorkflow[], name?: string): SourceWorkflow | undefined {
  if (!name) return undefined
  return workflows.find((workflow) => workflow.name.toLowerCase() === name.toLowerCase())
}

function findWorkflowByEvidence(workflows: SourceWorkflow[], label: string): SourceWorkflow | undefined {
  const text = label.toLowerCase()
  return workflows.find((workflow) => text.includes(workflow.name.toLowerCase()) || workflow.evidence.some((item) => text.includes(item.toLowerCase())))
}

function findStateIndexForAction(states: CrawlState[], stateHash?: string, url?: string): number {
  if (stateHash) {
    const byHash = states.findIndex((state) => state.hash === stateHash || state.stateHash === stateHash)
    if (byHash >= 0) return byHash
  }
  if (!url) return -1
  return states.findIndex((state) => state.url === url)
}

function screenshotForIndex(screenshots: string[], index: number): string[] {
  const shot = screenshots[index]
  return shot ? [shot] : []
}

function screenshotContext(relativePath: string, report: SnifferReport): { label: string; description: string } {
  const normalized = relativeReportPath(relativePath)
  const stateIndex = report.crawlGraph?.states?.findIndex((state) => relativeReportPath(state.screenshotPath ?? '') === normalized) ?? -1
  if (stateIndex >= 0) {
    const state = report.crawlGraph?.states?.[stateIndex]
    return {
      label: `State ${state?.sequenceNumber ?? stateIndex + 1} screenshot`,
      description: `${state?.inferredScreenName ?? (state ? inferScreenName(state) : 'Runtime state')} at ${state?.hashRoute ?? state?.url ?? ''}`
    }
  }
  const scenario = report.scenarioRuns?.find((run) => run.screenshots?.some((shot) => relativeReportPath(shot) === normalized))
  if (scenario) return { label: `${scenario.name} screenshot`, description: `Scenario ${scenario.status}: ${scenario.name}` }
  return { label: normalized.split('/').pop() ?? 'Screenshot evidence', description: normalized }
}

function inferScreenName(state: CrawlState): string {
  const route = state.hashRoute ?? ''
  if (route === '#workspaces') return 'Workspaces'
  if (route === '#repositories') return 'Repositories'
  if (route === '#learning') return 'Learning'
  if (route === '#settings') return 'Settings'
  const text = state.visible.map((item) => `${item.text ?? ''} ${item.name ?? ''}`).join(' ').toLowerCase()
  if (/add repository|target id|path or url/.test(text)) return 'Add repository dialog'
  if (/handoff/.test(text)) return 'Handoff tab'
  if (/raw json/.test(text)) return 'Raw JSON tab'
  if (/overview|change set|graph evidence/.test(text)) return 'Plan Bundle result'
  return 'Prompt composer / Plan Runs'
}

function evidenceOverlaps(left: string[], right: string[]): boolean {
  const rightText = right.join(' ').toLowerCase()
  return left.some((item) => item.length > 2 && rightText.includes(item.toLowerCase()))
}

function issueText(issue: Issue): string {
  return `${issue.title} ${issue.description} ${issue.evidence.join(' ')}`.toLowerCase()
}

function endpointTail(endpoint: string): string {
  return endpoint.split('/').filter(Boolean).slice(-2).join('/').toLowerCase()
}

function relativeReportPath(value: string): string {
  const marker = '/reports/sniffer/latest/'
  const index = value.indexOf(marker)
  return index >= 0 ? value.slice(index + marker.length) : value.replace(/^\/+/, '')
}

function mergeIssues(left: Issue[], right: Issue[]): Issue[] {
  const map = new Map<string, Issue>()
  for (const issue of [...left, ...right]) map.set(issue.issue_id ?? issue.title, issue)
  return [...map.values()]
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter(Boolean) as string[])]
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80) || 'node'
}
