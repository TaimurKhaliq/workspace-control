import { useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { FixPacketItem, ScreenshotItem, SnifferReport } from '../api'
import { getFixPacket } from '../api'
import { buildSnifferGraph } from '../graph/graphBuilder'
import type { GraphStatus, SnifferGraph, SnifferGraphEdge, SnifferGraphNode } from '../graph/graphModel'

type LayoutMode = 'layered' | 'workflow'
type GraphScopeMode = 'crawl' | 'scenario' | 'workflow' | 'issue' | 'source' | 'full'

interface GraphFilters {
  search: string
  nodeType: string
  severity: string
  status: string
  workflow: string
  sourceFile: string
  processedOnly: boolean
}

const defaultFilters: GraphFilters = {
  search: '',
  nodeType: 'all',
  severity: 'all',
  status: 'all',
  workflow: 'all',
  sourceFile: 'all',
  processedOnly: false
}

export function DiscoveryGraph({
  report,
  fixPackets,
  screenshots
}: {
  report?: SnifferReport | null
  fixPackets: FixPacketItem[]
  screenshots: ScreenshotItem[]
}) {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('layered')
  const [scope, setScope] = useState<{ mode: GraphScopeMode; workflow: string; issue: string }>({ mode: 'crawl', workflow: '', issue: '' })
  const [filters, setFilters] = useState<GraphFilters>(defaultFilters)
  const [selectedId, setSelectedId] = useState<string>('')

  const graph = useMemo(() => report ? buildSnifferGraph({ report, fixPackets, screenshots }) : emptyGraph(), [report, fixPackets, screenshots])
  const options = useMemo(() => graphOptions(graph), [graph])
  const scopedGraph = useMemo(() => scopeGraph(graph, scope, options), [graph, scope, options])
  const filteredGraph = useMemo(() => filterGraph(scopedGraph, filters), [scopedGraph, filters])
  const reactFlow = useMemo(() => toReactFlow(filteredGraph, layoutMode), [filteredGraph, layoutMode])
  const selectedNode = filteredGraph.nodes.find((node) => node.id === selectedId) ?? filteredGraph.nodes[0]

  const onNodeClick: NodeMouseHandler = (_, node) => setSelectedId(node.id)

  return (
    <section className="graph-page" data-testid="discovery-graph-view">
      <div className="graph-summary-strip">
        <Metric label="Nodes" value={filteredGraph.nodes.length} />
        <Metric label="Edges" value={filteredGraph.edges.length} />
        <Metric label="Issues" value={graph.summary.issue_count} tone={graph.summary.issue_count ? 'warn' : 'good'} />
        <Metric label="Workflows" value={graph.summary.workflow_count} />
        <Metric label="Failed scenarios" value={graph.summary.failed_scenario_count} tone={graph.summary.failed_scenario_count ? 'danger' : 'good'} />
        <Metric label="Fix packets" value={graph.summary.fix_packet_count} />
      </div>

      <div className="graph-workbench">
        <GraphFilterPanel
          filters={filters}
          options={options}
          layoutMode={layoutMode}
          scope={scope}
          onLayoutModeChange={setLayoutMode}
          onScopeChange={(patch) => setScope((current) => ({ ...current, ...patch }))}
          onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
          onQuickFilter={(nextScope, nextFilters) => {
            setScope((current) => ({ ...current, ...nextScope }))
            setFilters(nextFilters)
          }}
        />
        <div className="graph-canvas-card" data-testid="graph-canvas">
          {report ? (
            <ReactFlow
              nodes={reactFlow.nodes}
              edges={reactFlow.edges}
              fitView
              minZoom={0.2}
              maxZoom={2}
              onNodeClick={onNodeClick}
              nodesDraggable
            >
              <Background />
              <Controls />
              <MiniMap pannable zoomable nodeColor={(node) => node.style?.background as string ?? '#e5e7eb'} />
            </ReactFlow>
          ) : (
            <div className="graph-empty">
              <h2>No report loaded</h2>
              <p>Run an audit to build the discovery graph.</p>
            </div>
          )}
        </div>
        <GraphNodeDetailPanel node={selectedNode} />
      </div>

      <GraphLegend />
    </section>
  )
}

export function GraphFilterPanel({
  filters,
  options,
  layoutMode,
  scope,
  onLayoutModeChange,
  onScopeChange,
  onChange,
  onQuickFilter
}: {
  filters: GraphFilters
  options: ReturnType<typeof graphOptions>
  layoutMode: LayoutMode
  scope: { mode: GraphScopeMode; workflow: string; issue: string }
  onLayoutModeChange: (mode: LayoutMode) => void
  onScopeChange: (patch: Partial<{ mode: GraphScopeMode; workflow: string; issue: string }>) => void
  onChange: (patch: Partial<GraphFilters>) => void
  onQuickFilter: (scope: Partial<{ mode: GraphScopeMode; workflow: string; issue: string }>, filters: GraphFilters) => void
}) {
  return (
    <aside className="graph-filter-panel" data-testid="graph-filter-panel">
      <p className="eyebrow">Graph filters</p>
      <h2>Explore</h2>
      <Select label="Graph mode" value={scope.mode} values={['crawl', 'scenario', 'workflow', 'issue', 'source', 'full']} onChange={(mode) => onScopeChange({ mode: mode as GraphScopeMode })} />
      {scope.mode === 'scenario' && (
        <Select label="Scenario path" value={scope.workflow || options.scenarios[0] || ''} values={options.scenarios} onChange={(workflow) => onScopeChange({ workflow })} />
      )}
      {scope.mode === 'workflow' && (
        <Select label="Workflow graph" value={scope.workflow || options.workflows[0] || ''} values={options.workflows} onChange={(workflow) => onScopeChange({ workflow })} />
      )}
      {scope.mode === 'issue' && (
        <Select label="Issue graph" value={scope.issue || options.issues[0] || ''} values={options.issues} onChange={(issue) => onScopeChange({ issue })} />
      )}
      <label>
        Search
        <input value={filters.search} onChange={(event) => onChange({ search: event.target.value })} placeholder="label, endpoint, path, issue..." />
      </label>
      <Select label="Node type" value={filters.nodeType} values={['all', ...options.nodeTypes]} onChange={(nodeType) => onChange({ nodeType })} />
      <Select label="Severity" value={filters.severity} values={['all', ...options.severities]} onChange={(severity) => onChange({ severity })} />
      <Select label="Status" value={filters.status} values={['all', ...options.statuses]} onChange={(status) => onChange({ status })} />
      <Select label="Workflow" value={filters.workflow} values={['all', ...options.workflows]} onChange={(workflow) => onChange({ workflow })} />
      <Select label="Source file" value={filters.sourceFile} values={['all', ...options.sourceFiles]} onChange={(sourceFile) => onChange({ sourceFile })} />
      <Select label="Layout" value={layoutMode} values={['layered', 'workflow']} onChange={(value) => onLayoutModeChange(value as LayoutMode)} />
      <label className="checkbox-line">
        <input type="checkbox" checked={filters.processedOnly} onChange={(event) => onChange({ processedOnly: event.target.checked })} />
        Processed only
      </label>
      <div className="quick-filter-grid">
        <button type="button" onClick={() => onQuickFilter({ mode: 'issue' }, { ...defaultFilters, nodeType: 'issue' })}>Show issues</button>
        <button type="button" onClick={() => onQuickFilter({ mode: 'scenario' }, { ...defaultFilters, nodeType: 'scenario', status: 'failed' })}>Failed scenarios</button>
        <button type="button" onClick={() => onQuickFilter({ mode: 'crawl' }, { ...defaultFilters })}>Runtime crawl</button>
        <button type="button" onClick={() => onQuickFilter({ mode: 'source' }, { ...defaultFilters })}>Source intent</button>
        <button type="button" onClick={() => onQuickFilter({ mode: 'source' }, { ...defaultFilters, nodeType: 'api_call', status: 'failed' })}>API failures</button>
        <button type="button" onClick={() => onQuickFilter({ mode: 'full' }, { ...defaultFilters, nodeType: 'critic_decision' })}>LLM critic</button>
        <button type="button" onClick={() => onQuickFilter({ mode: 'full' }, { ...defaultFilters, nodeType: 'fix_packet' })}>Fix packets</button>
        <button type="button" onClick={() => onQuickFilter({ mode: 'full' }, { ...defaultFilters, nodeType: 'product_gap' })}>Product gaps</button>
      </div>
    </aside>
  )
}

export function GraphNodeDetailPanel({ node }: { node?: SnifferGraphNode }) {
  const [fixPacketMarkdown, setFixPacketMarkdown] = useState('')
  useEffect(() => {
    setFixPacketMarkdown('')
    if (node?.type === 'fix_packet' && node.fixPacketIds[0]) {
      void getFixPacket(node.fixPacketIds[0]).then(setFixPacketMarkdown).catch(() => setFixPacketMarkdown(''))
    }
  }, [node])

  if (!node) {
    return (
      <aside className="graph-node-detail-panel" data-testid="graph-node-detail-panel">
        <h2>Node detail</h2>
        <p className="muted">Select a graph node to inspect metadata.</p>
      </aside>
    )
  }
  const screenshot = node.screenshots[0]
  return (
    <aside className="graph-node-detail-panel" data-testid="graph-node-detail-panel">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{node.type.replace(/_/g, ' ')}</p>
          <h2>{node.label}</h2>
        </div>
        <span className={`status-chip ${statusTone(node.status)}`}>{node.status ?? 'unknown'}</span>
      </div>
      <div className="node-detail-grid">
        <Detail label="Meaning" value={nodeMeaning(node)} />
        <Detail label="Group" value={node.group} />
        {node.severity && <Detail label="Severity" value={node.severity} />}
        {node.confidence !== undefined && <Detail label="Confidence" value={String(node.confidence)} />}
        {node.sourceFile && <Detail label="Source file" value={node.sourceFile} />}
        {node.workflowName && <Detail label="Workflow" value={node.workflowName} />}
        {node.url && <Detail label="URL" value={node.url} />}
        <Detail label="Processed" value={node.processed ? 'yes' : 'no'} />
      </div>
      <NodeSpecificDetails node={node} />
      {node.evidence.length > 0 && (
        <>
          <h3>Evidence</h3>
          <ul className="evidence-list">
            {node.evidence.slice(0, 10).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </>
      )}
      {node.issues.length > 0 && (
        <>
          <h3>Linked issues</h3>
          <ul className="evidence-list">
            {node.issues.map((issue) => <li key={issue.issue_id ?? issue.title}>{issue.severity}: {issue.title}</li>)}
          </ul>
        </>
      )}
      {screenshot && (
        <div className="node-screenshot">
          <h3>Screenshot</h3>
          <a href={artifactUrl(screenshot)} target="_blank" rel="noreferrer">
            <img src={artifactUrl(screenshot)} alt={`Screenshot evidence for ${node.label}`} />
          </a>
        </div>
      )}
      {node.type === 'issue' && (
        <button type="button" className="secondary-button" onClick={() => void navigator.clipboard?.writeText(node.issues[0]?.suggestedFixPrompt ?? node.label)}>
          Copy fix prompt
        </button>
      )}
      {node.type === 'fix_packet' && (
        <button type="button" className="secondary-button" onClick={() => void navigator.clipboard?.writeText(fixPacketMarkdown || node.fixPacketIds[0])}>
          Copy fix packet
        </button>
      )}
      {fixPacketMarkdown && <pre className="markdown-preview">{fixPacketMarkdown.slice(0, 2200)}</pre>}
      <details>
        <summary>Raw metadata</summary>
        <pre>{JSON.stringify(node.metadata, null, 2)}</pre>
      </details>
    </aside>
  )
}

function GraphLegend() {
  const items = [
    ['Source files', '#f8fafc'],
    ['UI surfaces', '#dbeafe'],
    ['Workflows', '#ede9fe'],
    ['API calls', '#ccfbf1'],
    ['Runtime states', '#dcfce7'],
    ['Warnings/partial', '#fef3c7'],
    ['Issues', '#fee2e2'],
    ['Critic decisions', '#f3e8ff'],
    ['Fix packets', '#e0e7ff']
  ]
  return (
    <section className="graph-legend card-panel" data-testid="graph-legend">
      <div>
        <p className="eyebrow">Legend</p>
        <h2>Color and state guide</h2>
      </div>
      <div className="legend-grid">
        {items.map(([label, color]) => (
          <span key={label}><i style={{ background: color }} />{label}</span>
        ))}
        <span><i className="border-solid" />processed</span>
        <span><i className="border-dashed" />unprocessed</span>
        <span><i className="status-pass" />passed/executed</span>
        <span><i className="status-fail" />failed/issue edge</span>
        <span><i className="status-blocked" />skipped/deferred/duplicate</span>
        <span><i className="border-solid" />solid edge: executed transition</span>
        <span><i className="border-dashed" />dashed edge: evidence/relationship</span>
      </div>
    </section>
  )
}

function scopeGraph(graph: SnifferGraph, scope: { mode: GraphScopeMode; workflow: string; issue: string }, options: ReturnType<typeof graphOptions>): SnifferGraph {
  if (scope.mode === 'full') return graph
  if (scope.mode === 'crawl') return subgraphByTypes(graph, ['runtime_state', 'crawl_action', 'screenshot'])
  if (scope.mode === 'scenario') {
    const scenario = scope.workflow || options.scenarios[0]
    const seeds = graph.nodes
      .filter((node) => node.type === 'scenario' && (!scenario || node.label === scenario))
      .map((node) => node.id)
    return subgraphAround(graph, seeds, 2)
  }
  if (scope.mode === 'source') return subgraphByTypes(graph, ['source_file', 'ui_surface', 'source_workflow', 'api_call', 'state_action'])
  if (scope.mode === 'workflow') {
    const workflow = scope.workflow || options.workflows[0]
    const seeds = graph.nodes
      .filter((node) => node.workflowName === workflow || (node.type === 'source_workflow' && node.label === workflow))
      .map((node) => node.id)
    return subgraphAround(graph, seeds, 2)
  }
  if (scope.mode === 'issue') {
    const issue = scope.issue || options.issues[0]
    const seeds = graph.nodes
      .filter((node) => node.type === 'issue' && (node.label === issue || node.id === issue))
      .map((node) => node.id)
    return subgraphAround(graph, seeds, 2)
  }
  return graph
}

function subgraphByTypes(graph: SnifferGraph, types: SnifferGraphNode['type'][]): SnifferGraph {
  const ids = new Set(graph.nodes.filter((node) => types.includes(node.type)).map((node) => node.id))
  return graphFromIds(graph, ids)
}

function subgraphAround(graph: SnifferGraph, seeds: string[], depth: number): SnifferGraph {
  if (seeds.length === 0) return emptyGraph()
  const ids = new Set(seeds)
  for (let i = 0; i < depth; i += 1) {
    for (const edge of graph.edges) {
      if (ids.has(edge.source)) ids.add(edge.target)
      if (ids.has(edge.target)) ids.add(edge.source)
    }
  }
  return graphFromIds(graph, ids)
}

function graphFromIds(graph: SnifferGraph, ids: Set<string>): SnifferGraph {
  const nodes = graph.nodes.filter((node) => ids.has(node.id))
  const edges = graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target))
  return {
    nodes,
    edges,
    summary: { ...graph.summary, node_count: nodes.length, edge_count: edges.length }
  }
}

function toReactFlow(graph: SnifferGraph, layoutMode: LayoutMode): { nodes: Node[]; edges: Edge[] } {
  const crawlOnly = graph.nodes.length > 0 && graph.nodes.every((node) => ['runtime_state', 'crawl_action', 'screenshot'].includes(node.type))
  const positions = crawlOnly ? crawlPathPositions(graph.nodes) : layoutMode === 'workflow' ? workflowPositions(graph.nodes) : layeredPositions(graph.nodes)
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      data: { label: <GraphNodeCard node={node} /> },
      className: `sniffer-flow-node ${node.type} ${node.status ?? ''} ${node.processed ? 'processed' : 'unprocessed'}`,
      style: {
        background: nodeColor(node),
        borderColor: statusBorder(node.status),
        borderStyle: node.processed ? 'solid' : 'dashed',
        color: '#111827',
        width: node.type === 'runtime_state' ? 280 : 240,
        minHeight: node.type === 'runtime_state' ? 96 : 74,
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 700,
        padding: 8
      }
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      type: 'smoothstep',
      animated: edge.type === 'clicked_to' || edge.type === 'transitions_to',
      style: { stroke: edgeColor(edge), strokeWidth: edge.type === 'produced_issue' ? 2.2 : 1.6, strokeDasharray: dashedEdge(edge) ? '5 4' : undefined },
      labelStyle: { fontSize: 10, fill: '#64748b' }
    }))
  }
}

function crawlPathPositions(nodes: SnifferGraphNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const states = nodes
    .filter((node) => node.type === 'runtime_state')
    .sort((a, b) => Number((a.metadata as Record<string, unknown>).sequenceNumber ?? 0) - Number((b.metadata as Record<string, unknown>).sequenceNumber ?? 0))
  states.forEach((node, index) => positions.set(node.id, { x: 40 + index * 340, y: 80 }))
  const actions = nodes
    .filter((node) => node.type === 'crawl_action')
    .sort((a, b) => Number((a.metadata as Record<string, unknown>).sequenceNumber ?? 0) - Number((b.metadata as Record<string, unknown>).sequenceNumber ?? 0))
  actions.forEach((node, index) => positions.set(node.id, { x: 220 + index * 340, y: 260 }))
  nodes.filter((node) => node.type === 'screenshot').forEach((node, index) => positions.set(node.id, { x: 40 + index * 260, y: 440 }))
  return positions
}

function layeredPositions(nodes: SnifferGraphNode[]): Map<string, { x: number; y: number }> {
  const columns: Record<string, number> = {
    source_file: 0,
    ui_surface: 1,
    source_workflow: 1,
    api_call: 2,
    state_action: 2,
    runtime_state: 3,
    visible_control: 4,
    crawl_action: 4,
    scenario: 5,
    scenario_step: 6,
    issue: 7,
    critic_decision: 8,
    product_intent: 6,
    product_gap: 7,
    fix_packet: 9,
    screenshot: 5
  }
  return stackPositions(nodes, (node) => columns[node.type] ?? 0)
}

function workflowPositions(nodes: SnifferGraphNode[]): Map<string, { x: number; y: number }> {
  const workflowNames = [...new Set(nodes.map((node) => node.workflowName).filter(Boolean) as string[])]
  const workflowIndex = new Map(workflowNames.map((workflow, index) => [workflow, index]))
  return stackPositions(nodes, (node) => {
    if (node.workflowName && workflowIndex.has(node.workflowName)) return workflowIndex.get(node.workflowName)!
    if (node.type === 'source_workflow') return workflowIndex.get(node.label) ?? 0
    if (node.type === 'issue' || node.type === 'critic_decision' || node.type === 'fix_packet') return workflowNames.length + 1
    return workflowNames.length
  }, 260)
}

function stackPositions(nodes: SnifferGraphNode[], columnOf: (node: SnifferGraphNode) => number, columnWidth = 250): Map<string, { x: number; y: number }> {
  const counts = new Map<number, number>()
  const positions = new Map<string, { x: number; y: number }>()
  nodes.forEach((node) => {
    const column = columnOf(node)
    const row = counts.get(column) ?? 0
    counts.set(column, row + 1)
    positions.set(node.id, { x: 40 + column * columnWidth, y: 40 + row * 95 })
  })
  return positions
}

export function filterGraph(graph: SnifferGraph, filters: GraphFilters): SnifferGraph {
  const search = filters.search.trim().toLowerCase()
  const nodes = graph.nodes.filter((node) => {
    if (filters.nodeType !== 'all' && node.type !== filters.nodeType) return false
    if (filters.severity !== 'all' && node.severity !== filters.severity) return false
    if (filters.status !== 'all' && node.status !== filters.status) return false
    if (filters.workflow !== 'all' && node.workflowName !== filters.workflow && node.label !== filters.workflow) return false
    if (filters.sourceFile !== 'all' && node.sourceFile !== filters.sourceFile) return false
    if (filters.processedOnly && !node.processed) return false
    if (!search) return true
    return `${node.label} ${node.sourceFile ?? ''} ${node.workflowName ?? ''} ${node.url ?? ''} ${node.evidence.join(' ')} ${JSON.stringify(node.metadata)}`.toLowerCase().includes(search)
  })
  const ids = new Set(nodes.map((node) => node.id))
  const edges = graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target))
  return {
    nodes,
    edges,
    summary: { ...graph.summary, node_count: nodes.length, edge_count: edges.length }
  }
}

function graphOptions(graph: SnifferGraph) {
  return {
    nodeTypes: unique(graph.nodes.map((node) => node.type)),
    severities: unique(graph.nodes.map((node) => node.severity).filter(Boolean) as string[]),
    statuses: unique(graph.nodes.map((node) => node.status).filter(Boolean) as string[]),
    workflows: unique(graph.nodes.flatMap((node) => [node.workflowName, node.type === 'source_workflow' ? node.label : undefined]).filter(Boolean) as string[]),
    sourceFiles: unique(graph.nodes.map((node) => node.sourceFile).filter(Boolean) as string[]),
    issues: unique(graph.nodes.filter((node) => node.type === 'issue').map((node) => node.label)),
    scenarios: unique(graph.nodes.filter((node) => node.type === 'scenario').map((node) => node.label))
  }
}

function Select({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        {values.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="node-detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Metric({ label, value, tone = 'muted' }: { label: string; value: string | number; tone?: 'good' | 'warn' | 'danger' | 'muted' }) {
  return (
    <article className="graph-metric">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </article>
  )
}

function GraphNodeCard({ node }: { node: SnifferGraphNode }) {
  const metadata = (node.metadata ?? {}) as Record<string, unknown>
  const summary = metadata.visibleControlSummary as { buttons?: { count?: number }; inputs?: { count?: number }; links?: { count?: number }; tabs?: { count?: number } } | undefined
  const route = typeof metadata.hashRoute === 'string' ? metadata.hashRoute : node.url ? routeLabel(node.url) : ''
  const issueCount = node.issues.length || (Array.isArray(metadata.issuesOnState) ? metadata.issuesOnState.length : 0)
  const duplicateCount = typeof metadata.duplicateCount === 'number' ? metadata.duplicateCount : 0
  return (
    <div className="flow-node-card">
      <strong>{node.label}</strong>
      {(route || node.workflowName || node.sourceFile) && <small>{route || node.workflowName || node.sourceFile}</small>}
      <div className="flow-node-badges">
        {summary?.buttons?.count ? <span>buttons {summary.buttons.count}</span> : null}
        {summary?.inputs?.count ? <span>inputs {summary.inputs.count}</span> : null}
        {summary?.links?.count ? <span>links {summary.links.count}</span> : null}
        {summary?.tabs?.count ? <span>tabs {summary.tabs.count}</span> : null}
        {issueCount ? <span className="bad">issues {issueCount}</span> : null}
        {node.screenshots.length ? <span>camera</span> : null}
        {duplicateCount > 1 ? <span>seen {duplicateCount}x</span> : null}
      </div>
    </div>
  )
}

function NodeSpecificDetails({ node }: { node: SnifferGraphNode }) {
  const metadata = (node.metadata ?? {}) as Record<string, unknown>
  if (node.type === 'runtime_state') {
    const summary = metadata.visibleControlSummary as Record<string, { count: number; topLabels: string[] }> | undefined
    return (
      <>
        <h3>Visible controls</h3>
        {summary ? (
          <div className="node-control-summary">
            {Object.entries(summary).map(([kind, value]) => (
              <div key={kind}>
                <strong>{kind}: {value.count}</strong>
                <span>{value.topLabels?.slice(0, 6).join(', ') || 'none'}</span>
              </div>
            ))}
          </div>
        ) : <p className="muted">No control summary recorded.</p>}
        <Detail label="Screen" value={String(metadata.inferredScreenName ?? node.label)} />
        <Detail label="Route" value={String(metadata.hashRoute ?? routeLabel(node.url ?? ''))} />
        <Detail label="State hash" value={String(metadata.stateHash ?? metadata.hash ?? 'unknown')} />
        {Array.isArray(metadata.matchedSourceWorkflows) && metadata.matchedSourceWorkflows.length > 0 && <Detail label="Workflows" value={metadata.matchedSourceWorkflows.join(', ')} />}
        {Array.isArray(metadata.matchedUiSurfaces) && metadata.matchedUiSurfaces.length > 0 && <Detail label="Surfaces" value={metadata.matchedUiSurfaces.join(', ')} />}
      </>
    )
  }
  if (node.type === 'crawl_action') {
    return (
      <>
        <h3>Action transition</h3>
        <Detail label="Locator" value={String(metadata.locatorUsed ?? metadata.target ?? 'unknown')} />
        <Detail label="Changed state" value={String(metadata.changedState ?? 'unknown')} />
        <Detail label="Safe reason" value={String(metadata.safeReason ?? metadata.reason ?? 'unknown')} />
        {metadata.skippedReason && <Detail label="Skipped reason" value={String(metadata.skippedReason)} />}
      </>
    )
  }
  if (node.type === 'screenshot') {
    const context = metadata.context as { description?: string } | undefined
    return <Detail label="Context" value={context?.description ?? node.evidence.join(', ')} />
  }
  return null
}

function emptyGraph(): SnifferGraph {
  return {
    nodes: [],
    edges: [],
    summary: { node_count: 0, edge_count: 0, issue_count: 0, workflow_count: 0, failed_scenario_count: 0, fix_packet_count: 0 }
  }
}

function nodeColor(node: SnifferGraphNode): string {
  if (node.type === 'source_file') return '#f8fafc'
  if (node.type === 'ui_surface') return '#dbeafe'
  if (node.type === 'source_workflow') return '#ede9fe'
  if (node.type === 'api_call') return '#ccfbf1'
  if (node.type === 'runtime_state' || node.type === 'visible_control' || node.type === 'crawl_action') return '#dcfce7'
  if (node.type === 'issue' || node.type === 'product_gap') return node.severity === 'low' ? '#e0f2fe' : '#fee2e2'
  if (node.type === 'critic_decision') return '#f3e8ff'
  if (node.type === 'fix_packet') return '#e0e7ff'
  if (node.type === 'screenshot') return '#fef3c7'
  return '#ffffff'
}

function statusBorder(status?: GraphStatus): string {
  if (status === 'passed' || status === 'fixed') return '#16a34a'
  if (status === 'failed' || status === 'open') return '#dc2626'
  if (status === 'warning') return '#d97706'
  if (status === 'blocked' || status === 'deferred') return '#94a3b8'
  if (status === 'needs_more_crawling') return '#2563eb'
  return '#cbd5e1'
}

function statusTone(status?: GraphStatus): 'good' | 'warn' | 'danger' | 'muted' {
  if (status === 'passed' || status === 'fixed') return 'good'
  if (status === 'failed' || status === 'open') return 'danger'
  if (status === 'warning' || status === 'needs_more_crawling') return 'warn'
  return 'muted'
}

function edgeColor(edge: SnifferGraphEdge): string {
  if (edge.type === 'produced_issue') return '#dc2626'
  if (edge.type === 'classified_by') return '#7c3aed'
  if (edge.type === 'generated_fix_packet') return '#4f46e5'
  if (edge.type === 'blocked_by_precondition') return '#64748b'
  if (edge.type === 'calls_api') return '#0f766e'
  return '#94a3b8'
}

function dashedEdge(edge: SnifferGraphEdge): boolean {
  return edge.type === 'evidence_for' || edge.type === 'screenshot_of' || edge.type === 'belongs_to_workflow' || edge.type === 'discovered_in' || edge.type === 'blocked_by_precondition'
}

function routeLabel(value: string): string {
  try {
    const url = new URL(value)
    return url.hash || url.pathname || value
  } catch {
    return value
  }
}

function artifactUrl(path: string): string {
  if (/^https?:\/\//.test(path) || path.startsWith('/api/')) return path
  const marker = '/reports/sniffer/latest/'
  const index = path.indexOf(marker)
  const relative = index >= 0 ? path.slice(index + marker.length) : path.replace(/^\/+/, '')
  return `/api/reports/latest/artifacts/${encodeURIComponent(relative)}`
}

function nodeMeaning(node: SnifferGraphNode): string {
  const meanings: Record<SnifferGraphNode['type'], string> = {
    source_file: 'A source file Sniffer connected to UI intent, API calls, state/action hints, or issues.',
    ui_surface: 'A UI surface discovered from JSX/source strings and controls.',
    source_workflow: 'A workflow inferred from source code and UI semantics.',
    api_call: 'An API endpoint or client function discovered in source.',
    state_action: 'State variables and handler names that explain app intent.',
    runtime_state: 'A browser state captured during Playwright crawl.',
    visible_control: 'A visible runtime control observed in a captured state.',
    crawl_action: 'A safe action Sniffer attempted during crawl.',
    scenario: 'A built-in workflow scenario Sniffer executed.',
    scenario_step: 'A scenario step/assertion derived from execution evidence.',
    issue: 'A raw or triaged finding that may need review or repair.',
    critic_decision: 'A deterministic or LLM critic classification for a finding.',
    fix_packet: 'A Codex-ready repair packet generated for an actionable issue.',
    product_intent: 'Sniffer’s synthesized product intent model.',
    product_gap: 'A gap between expected product workflow and observed UI.',
    screenshot: 'Screenshot evidence captured during crawl or scenario execution.'
  }
  return meanings[node.type]
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}
