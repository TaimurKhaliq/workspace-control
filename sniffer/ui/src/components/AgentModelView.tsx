import { useMemo, useState } from 'react'
import type {
  EvidenceFact,
  EvidencePacket,
  EvidenceRetrievalSummary,
  GraphRefinementSuggestion,
  ProductExperienceContext,
  SnifferReport,
  UIIntentEdge,
  UIIntentGraph,
  UIIntentNode
} from '../api'
import { retrieveEvidence } from '../api'
import { ReportContextStrip } from './ReportContextStrip'

type AgentTab = 'inventory' | 'intent' | 'retrieval' | 'refinements' | 'packets' | 'suppressions'

interface FactFilters {
  search: string
  kind: string
  file: string
  method: string
  confidence: string
  suppressed: string
}

const defaultFactFilters: FactFilters = {
  search: '',
  kind: 'all',
  file: 'all',
  method: 'all',
  confidence: 'all',
  suppressed: 'all'
}

export function AgentModelView({
  report,
  projectId,
  projectName
}: {
  report?: SnifferReport | null
  projectId?: string
  projectName?: string
}) {
  const [tab, setTab] = useState<AgentTab>('inventory')
  const model = useMemo(() => buildAgentModel(report), [report])
  return (
    <section className="page-stack" data-testid="agent-model-view">
      <ReportContextStrip report={report} projectId={projectId} projectName={projectName} />
      <section className="card-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Agent Model</p>
            <h2>How Sniffer built its understanding</h2>
            <p className="muted">Trace deterministic source facts into UI intent, runtime evidence, LLM refinement, evidence packets, and suppression decisions.</p>
          </div>
          <div className="chip-row">
            <span className="status-chip muted">Facts {model.inventory?.facts.length ?? 0}</span>
            <span className="status-chip muted">Surfaces {model.intent?.surfaces.length ?? 0}</span>
            <span className="status-chip muted">Workflows {model.intent?.workflows.length ?? 0}</span>
            <span className={`status-chip ${model.refinement?.llmUsed ? 'good' : 'muted'}`}>Graph refiner {model.refinement?.status ?? 'not available'}</span>
          </div>
        </div>
        <div className="tab-row" role="tablist" aria-label="Agent model sections">
          {agentTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? 'tab-button active' : 'tab-button'}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {tab === 'inventory' && <SourceInventoryPanel model={model} />}
      {tab === 'intent' && <UiIntentGraphPanel model={model} />}
      {tab === 'retrieval' && <EvidenceRetrievalPanel report={report} summaries={model.retrievalSummaries} projectId={projectId} />}
      {tab === 'refinements' && <LlmRefinementsPanel model={model} />}
      {tab === 'packets' && <EvidencePacketsPanel report={report} model={model} />}
      {tab === 'suppressions' && <SuppressionsPanel report={report} model={model} />}
    </section>
  )
}

function SourceInventoryPanel({ model }: { model: AgentModel }) {
  const [filters, setFilters] = useState<FactFilters>(defaultFactFilters)
  const inventory = model.inventory
  const facts = useMemo(() => filterFacts(inventory?.facts ?? [], filters), [inventory, filters])
  const usedBy = useMemo(() => factUsage(model.intent), [model.intent])
  if (!inventory) return <Unavailable title="Source Inventory" flag="Run source discovery or audit with a current Sniffer build to populate sourceInventory." />
  const categories: Array<[string, number]> = [
    ['Files/modules', inventory.files?.length ?? 0],
    ['Framework signals', inventory.frameworkSignals?.length ?? 0],
    ['Package/build', inventory.packageBuildSignals?.length ?? 0],
    ['Symbols', inventory.rawExtractedSymbols?.length ?? 0],
    ['Form controls', countKind(inventory.facts, 'form_control')],
    ['Action controls', countKind(inventory.facts, 'action_control')],
    ['API calls', countKind(inventory.facts, 'api_call')],
    ['Static assets', countKind(inventory.facts, 'static_asset_reference')],
    ['Handlers', inventory.rawHandlers?.length ?? 0],
    ['Suppressed', inventory.facts.filter((fact) => fact.suppressedFromSemanticGraph).length]
  ]
  return (
    <section className="agent-model-grid inventory-layout">
      <aside className="card-panel agent-filter-panel">
        <p className="eyebrow">Source Inventory</p>
        <h2>Deterministic facts</h2>
        <p className="muted">Facts are kept separate from semantic inferences. Raw snippets are collapsed by default.</p>
        <MetricGrid items={categories} />
        <FactFiltersView facts={inventory.facts} filters={filters} onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))} />
      </aside>
      <div className="agent-detail-stack">
        <InventoryDistributions facts={inventory.facts} />
        <section className="card-panel">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Facts</p>
              <h2>{facts.length} matching facts</h2>
            </div>
            <span className="status-chip muted">Collapsed snippets</span>
          </div>
          <div className="fact-list">
            {facts.slice(0, 160).map((fact) => (
              <FactCard key={fact.id} fact={fact} usedBy={usedBy.get(fact.id) ?? []} />
            ))}
          </div>
          {facts.length > 160 && <p className="muted">Showing first 160 facts. Narrow the filters to inspect more.</p>}
        </section>
      </div>
    </section>
  )
}

function UiIntentGraphPanel({ model }: { model: AgentModel }) {
  const graph = model.intent
  const [selectedId, setSelectedId] = useState('')
  const nodes = graph ? allIntentNodes(graph) : []
  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0]
  if (!graph) return <Unavailable title="UI Intent Graph" flag="Run source discovery or audit with a current Sniffer build to populate uiIntentGraph." />
  return (
    <section className="agent-model-grid">
      <aside className="card-panel agent-filter-panel">
        <p className="eyebrow">UI Intent Graph</p>
        <h2>Semantic model</h2>
        <p className="muted">Surfaces and workflows are the canonical semantic units; files are provenance.</p>
        <MetricGrid items={[
          ['Surfaces', graph.surfaces.length],
          ['Workflows', graph.workflows.length],
          ['Actions', graph.actions.length],
          ['Controls', graph.controls.length],
          ['Forms', graph.forms.length],
          ['API/data deps', graph.apiDataDependencies.length],
          ['Edges', graph.edges.length],
          ['Inferences', graph.inferences?.length ?? 0]
        ]} />
        <h3>Focused relationship map</h3>
        <p className="muted">Select a node to see nearby facts, edges, runtime confirmation, and screenshots when available.</p>
        <MiniEvidenceGraph graph={graph} selectedId={selected?.id} />
      </aside>
      <div className="agent-detail-stack">
        <section className="card-panel">
          <p className="eyebrow">Surfaces</p>
          <div className="intent-card-grid">
            {graph.surfaces.map((node) => <IntentNodeButton key={node.id} node={node} selected={selected?.id === node.id} onSelect={setSelectedId} />)}
          </div>
        </section>
        <section className="card-panel">
          <p className="eyebrow">Workflows</p>
          <div className="intent-card-grid">
            {graph.workflows.map((node) => <IntentNodeButton key={node.id} node={node} selected={selected?.id === node.id} onSelect={setSelectedId} />)}
          </div>
        </section>
      </div>
      <IntentDetailDrawer node={selected} graph={graph} facts={model.factById} report={model.report} />
    </section>
  )
}

function EvidenceRetrievalPanel({ report, summaries, projectId }: { report?: SnifferReport | null; summaries: EvidenceRetrievalSummary[]; projectId?: string }) {
  const [query, setQuery] = useState('reopen plan run')
  const [packet, setPacket] = useState<EvidencePacket | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function runRetrieval() {
    if (!query.trim()) return
    setLoading(true)
    setError('')
    try {
      setPacket(await retrieveEvidence(query.trim(), projectId))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPacket(null)
    } finally {
      setLoading(false)
    }
  }
  if (!report) return <Unavailable title="Evidence Retrieval" flag="Load a report to inspect retrieval context." />
  return (
    <section className="report-grid">
      <div className="summary-column">
        <section className="card-panel">
          <p className="eyebrow">Evidence Retrieval</p>
          <h2>{summaries.length ? 'Retrieved context packets' : 'Retrieval not available'}</h2>
          <p className="muted">
            {summaries.length
              ? 'These summaries show the RAG-style evidence selected for critics and repair prompts.'
              : 'This report does not include retrieval summaries yet. Showing available critic context packets instead.'}
          </p>
          <div className="inline-form evidence-search">
            <label>
              Retrieve evidence
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="reopen plan run, raw json copy, issue id..."
                aria-label="Evidence retrieval query"
              />
            </label>
            <button type="button" className="primary-button" onClick={runRetrieval} disabled={loading || !query.trim()}>
              {loading ? 'Retrieving...' : 'Retrieve'}
            </button>
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
        </section>
        {packet && <EvidencePacketResult packet={packet} />}
        <div className="scenario-card-list">
          {summaries.map((summary, index) => (
            <section key={`${summary.context.query}-${index}`} className="scenario-card static-card">
              <span className="status-chip muted">{summary.context.screenName ?? summary.context.workflowName ?? summary.context.issueId ?? 'context'}</span>
              <strong>{summary.context.query}</strong>
              <small>{summary.retrievedDocumentCount} docs · {summary.sourceFactCount} source facts · {summary.runtimeFactCount} runtime facts · {summary.contradictionCount} contradictions{summary.averageScore ? ` · avg score ${summary.averageScore}` : ''}</small>
              <ul className="evidence-list compact">
                {summary.topDocuments.slice(0, 4).map((doc) => <li key={doc.id}>{doc.kind}{doc.score ? ` (${doc.score})` : ''}: {doc.text}{doc.whyRetrieved?.length ? <small>Why: {doc.whyRetrieved.join('; ')}</small> : null}</li>)}
              </ul>
            </section>
          ))}
          {!summaries.length && (report.productExperience?.contexts ?? []).map((context, index) => (
            <section key={`${context.current_screen_name}-${index}`} className="scenario-card static-card">
              <span className="status-chip muted">context packet</span>
              <strong>{context.current_screen_name ?? 'Product Experience context'}</strong>
              <small>{context.nav_label_clicked ?? 'No nav label'} · {context.screenshot_path ? 'screenshot metadata present' : 'no screenshot metadata'}</small>
            </section>
          ))}
        </div>
      </div>
      <aside className="detail-column">
        <section className="card-panel sticky-detail">
          <p className="eyebrow">Consumers</p>
          <h2>Who used retrieval?</h2>
          <MetricGrid items={[
            ['Product Experience contexts', report.productExperience?.contexts?.length ?? 0],
            ['Product Experience summaries', report.productExperience?.evidenceRetrievalSummaries?.length ?? 0],
            ['Report summaries', report.evidenceRetrievalSummaries?.length ?? 0],
            ['Fix packets', report.issues?.filter((issue) => issue.fix_prompt || issue.suggestedFixPrompt).length ?? 0]
          ]} />
        </section>
      </aside>
    </section>
  )
}

function EvidencePacketResult({ packet }: { packet: EvidencePacket }) {
  const split = packet.confidenceSummary
  return (
    <section className="card-panel" data-testid="evidence-packet-result">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Retrieved Evidence Packet</p>
          <h2>{packet.context.query}</h2>
          <p className="muted">{packet.intent ?? 'ad hoc query'} · {packet.retrievedDocuments.length} documents · {packet.contradictions.length} contradictions</p>
        </div>
        <div className="chip-row">
          <span className="status-chip muted">Source {split.sourceDocumentCount ?? packet.sourceFacts.length}</span>
          <span className="status-chip muted">Runtime {split.runtimeDocumentCount ?? packet.runtimeFacts.length}</span>
          <span className="status-chip muted">Scenario {split.scenarioDocumentCount ?? 0}</span>
          <span className="status-chip muted">Prior fixes {split.priorFixPacketCount ?? 0}</span>
        </div>
      </div>
      <div className="scenario-card-list tight">
        {packet.retrievedDocuments.slice(0, 12).map((doc) => (
          <section key={doc.id} className="mini-card">
            <div className="section-heading compact">
              <strong>{doc.kind}</strong>
              <span className="status-chip muted">score {doc.score ?? 'n/a'}</span>
            </div>
            <code>{doc.id}</code>
            <p>{doc.text}</p>
            {doc.whyRetrieved?.length ? <small>Why: {doc.whyRetrieved.join('; ')}</small> : null}
            {typeof doc.metadata.filePath === 'string' && <small>File: {doc.metadata.filePath}</small>}
            {typeof doc.metadata.screenshotPath === 'string' && <small>Screenshot: {doc.metadata.screenshotPath}</small>}
          </section>
        ))}
      </div>
      {packet.contradictions.length > 0 && (
        <div className="warning-panel">
          <strong>Contradictions</strong>
          <ul className="evidence-list compact">{packet.contradictions.map((item) => <li key={item.id}>{item.claim}</li>)}</ul>
        </div>
      )}
    </section>
  )
}

function LlmRefinementsPanel({ model }: { model: AgentModel }) {
  const refinement = model.refinement
  if (!refinement) return <Unavailable title="LLM Refinements" flag="Graph refiner was not enabled for this report. Run with --graph-refiner llm to review the draft graph." />
  const suggestions = [
    ...refinement.appliedSuggestions.map((suggestion) => ({ suggestion, status: 'applied', rejectedReason: '' })),
    ...refinement.rejectedSuggestions.map((suggestion) => ({ suggestion, status: 'rejected', rejectedReason: suggestion.rejectedReason }))
  ]
  return (
    <section className="page-stack compact-page-stack">
      <section className="card-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LLM Refinements</p>
            <h2>Graph Structure Critic</h2>
            <p className="muted">The LLM suggests graph corrections. Sniffer applies only high-confidence, evidence-backed, low-risk suggestions.</p>
          </div>
          <div className="chip-row">
            <span className={`status-chip ${refinement.llmUsed ? 'good' : 'muted'}`}>LLM {refinement.llmUsed ? 'used' : 'not used'}</span>
            <span className="status-chip muted">{refinement.provider ?? 'no provider'}</span>
            {refinement.model && <span className="status-chip muted">{refinement.model}</span>}
            <span className="status-chip good">Applied {refinement.appliedSuggestions.length}</span>
            <span className="status-chip warn">Rejected {refinement.rejectedSuggestions.length}</span>
          </div>
        </div>
        {refinement.warnings.length > 0 && <ul className="evidence-list">{refinement.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
      </section>
      <div className="agent-table-card card-panel">
        <table className="agent-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Type</th>
              <th>Target</th>
              <th>From → To</th>
              <th>Confidence/Risk</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map(({ suggestion, status, rejectedReason }) => (
              <tr key={`${status}-${suggestion.id}`}>
                <td><span className={`status-chip ${status === 'applied' ? 'good' : 'warn'}`}>{status}</span></td>
                <td>{suggestion.type}</td>
                <td><code>{suggestion.targetId}</code></td>
                <td><span className="wrap-cell">{formatRefinementValue(suggestion.fromValue) ?? 'n/a'} → {formatRefinementValue(suggestion.toValue) ?? 'n/a'}</span></td>
                <td>{suggestion.confidence}/{suggestion.risk}</td>
                <td>{rejectedReason || suggestion.reason}<EvidenceIdRow ids={suggestion.evidenceIds} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function formatRefinementValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(formatRefinementValue).filter(Boolean).join(', ')
  if (typeof value !== 'object') return String(value)
  const record = value as Record<string, unknown>
  const kind = stringValue(record.kind) ?? stringValue(record.type) ?? stringValue(record.edgeKind)
  const label = stringValue(record.label) ?? stringValue(record.value) ?? stringValue(record.name) ?? stringValue(record.id)
  const source = stringValue(record.source)
  const target = stringValue(record.target)
  if (source && target) return `${source}${kind ? ` -${kind}-> ` : ' -> '}${target}`
  if (kind && label) return `${kind}: ${label}`
  if (label) return label
  return JSON.stringify(value, null, 2)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function EvidencePacketsPanel({ report, model }: { report?: SnifferReport | null; model: AgentModel }) {
  const contexts = report?.productExperience?.contexts ?? []
  const decisions = report?.productExperience?.decisions ?? []
  if (!report) return <Unavailable title="Evidence Packets" flag="Load a report to inspect evidence packets." />
  return (
    <section className="report-grid">
      <div className="summary-column">
        <section className="card-panel">
          <p className="eyebrow">Evidence Packets</p>
          <h2>Critic and repair context</h2>
          <p className="muted">These packets show the focused context Sniffer handed to the Product Experience Critic and the issues available for fix packets.</p>
        </section>
        <div className="scenario-card-list">
          {contexts.map((context, index) => <ProductExperiencePacket key={`${context.current_screen_name}-${index}`} context={context} decision={decisions[index]} />)}
          {!contexts.length && <EmptyCard title="No Product Experience packets" text="Run with --product-experience-critic llm or auto to capture screen-level evidence packets." />}
        </div>
      </div>
      <aside className="detail-column">
        <section className="card-panel sticky-detail">
          <p className="eyebrow">Fix packet evidence</p>
          <h2>{report.issues?.length ?? 0} issue contexts</h2>
          <div className="scenario-card-list tight">
            {(report.issues ?? []).slice(0, 20).map((issue) => (
              <section key={issue.issue_id ?? issue.title} className="mini-card">
                <strong>{issue.title}</strong>
                <small>{issue.severity} · {issue.type}</small>
                <div className="file-list">{(issue.suspected_files ?? []).slice(0, 5).map((file) => <code key={file}>{file}</code>)}</div>
                <ul className="evidence-list compact">{issue.evidence?.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
              </section>
            ))}
          </div>
          <h3>Retrieved evidence available</h3>
          <p className="muted">{model.retrievalSummaries.length} retrieval summaries in this report.</p>
        </section>
      </aside>
    </section>
  )
}

function SuppressionsPanel({ report, model }: { report?: SnifferReport | null; model: AgentModel }) {
  if (!report) return <Unavailable title="Contradictions / Suppressions" flag="Load a report to inspect evidence gating decisions." />
  const suppressedFacts = model.inventory?.facts.filter((fact) => fact.suppressedFromSemanticGraph) ?? []
  const rejected = model.refinement?.rejectedSuggestions ?? []
  const nonIssues = (report.productExperience?.decisions ?? []).flatMap((decision) => (decision.non_issues ?? []).map((item) => ({
    screen: decision.screen_name,
    observation: item.observation ?? 'Non-issue',
    reason: item.reason_not_reported ?? 'Suppressed by evidence gate'
  })))
  return (
    <section className="page-stack compact-page-stack" data-testid="suppressions-view">
      <section className="card-panel">
        <p className="eyebrow">Contradictions / Suppressions</p>
        <h2>Evidence gating decisions</h2>
        <p className="muted">Sniffer keeps rejected LLM suggestions, suppressed facts, deferred findings, and non-issues visible so false-positive control is auditable.</p>
        <MetricGrid items={[
          ['Suppressed facts', suppressedFacts.length],
          ['Rejected LLM suggestions', rejected.length],
          ['Critic non-issues', nonIssues.length],
          ['Deferred findings', report.deferredFindings?.length ?? 0],
          ['Blocked checks', report.blockedChecks?.length ?? 0],
          ['Retrieval contradictions', model.retrievalSummaries.filter((summary) => summary.contradictionCount > 0).length]
        ]} />
      </section>
      <div className="three-column-grid">
        <SuppressionList title="Suppressed facts" items={suppressedFacts.map((fact) => ({ title: fact.label ?? fact.value, detail: `${fact.kind} · ${fact.id}`, reason: fact.refinedFromFactId ? `Refined from ${fact.refinedFromFactId}` : 'Suppressed from semantic graph' }))} />
        <SuppressionList title="Rejected refinements" items={rejected.map((suggestion) => ({ title: suggestion.type, detail: suggestion.targetId, reason: suggestion.rejectedReason }))} />
        <SuppressionList title="Critic non-issues" items={nonIssues.map((item) => ({ title: item.observation, detail: item.screen ?? 'screen-scoped', reason: item.reason }))} />
      </div>
    </section>
  )
}

function FactFiltersView({ facts, filters, onChange }: { facts: EvidenceFact[]; filters: FactFilters; onChange: (patch: Partial<FactFilters>) => void }) {
  const kinds = unique(facts.map((fact) => fact.kind))
  const files = unique(facts.map((fact) => fact.filePath).filter(Boolean) as string[])
  const methods = unique(facts.map((fact) => fact.extractionMethod))
  return (
    <div className="agent-filter-form">
      <label>
        Search facts
        <input value={filters.search} onChange={(event) => onChange({ search: event.target.value })} placeholder="label, handler, endpoint..." />
      </label>
      <Select label="Kind" value={filters.kind} values={['all', ...kinds]} onChange={(kind) => onChange({ kind })} />
      <Select label="File" value={filters.file} values={['all', ...files]} onChange={(file) => onChange({ file })} />
      <Select label="Method" value={filters.method} values={['all', ...methods]} onChange={(method) => onChange({ method })} />
      <Select label="Confidence" value={filters.confidence} values={['all', 'high', 'medium', 'low']} onChange={(confidence) => onChange({ confidence })} />
      <Select label="Suppression" value={filters.suppressed} values={['all', 'active', 'suppressed']} onChange={(suppressed) => onChange({ suppressed })} />
    </div>
  )
}

function InventoryDistributions({ facts }: { facts: EvidenceFact[] }) {
  return (
    <section className="card-panel">
      <p className="eyebrow">Distribution</p>
      <div className="three-column-grid compact">
        <MiniDistribution title="By method" counts={countBy(facts, (fact) => fact.extractionMethod)} />
        <MiniDistribution title="By confidence" counts={countBy(facts, confidenceBucket)} />
        <MiniDistribution title="By kind" counts={countBy(facts, (fact) => fact.kind, 8)} />
      </div>
    </section>
  )
}

function FactCard({ fact, usedBy }: { fact: EvidenceFact; usedBy: UIIntentNode[] }) {
  return (
    <article className={fact.suppressedFromSemanticGraph ? 'fact-card suppressed' : 'fact-card'}>
      <div className="fact-card-main">
        <div>
          <span className="status-chip muted">{fact.kind}</span>
          {fact.suppressedFromSemanticGraph && <span className="status-chip warn">suppressed</span>}
          <strong>{fact.label ?? fact.value}</strong>
          <small>{fact.id} · {fact.filePath ?? 'no file'} · {fact.extractionMethod} · confidence {fact.confidence}</small>
        </div>
        {usedBy.length > 0 && <span className="status-chip good">Used by {usedBy.length}</span>}
      </div>
      <div className="chip-row">
        {fact.handler && <span className="status-chip muted">handler {fact.handler}</span>}
        {fact.controlType && <span className="status-chip muted">{fact.controlType}</span>}
        {fact.testId && <span className="status-chip muted">testid {fact.testId}</span>}
        {usedBy.slice(0, 4).map((node) => <span key={node.id} className="status-chip muted">{node.kind}: {node.label}</span>)}
      </div>
      {(fact.snippet || fact.rawText) && (
        <details>
          <summary>Raw snippet</summary>
          <pre className="snippet-preview">{fact.rawText ?? fact.snippet}</pre>
        </details>
      )}
    </article>
  )
}

function IntentNodeButton({ node, selected, onSelect }: { node: UIIntentNode; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button type="button" className={selected ? 'intent-node-card active' : 'intent-node-card'} onClick={() => onSelect(node.id)}>
      <span className="status-chip muted">{node.kind}</span>
      <strong>{node.label}</strong>
      <small>{node.filePath ?? 'runtime/model'} · confidence {node.confidence}</small>
      <span>{node.evidenceIds.length} evidence ids</span>
    </button>
  )
}

function IntentDetailDrawer({ node, graph, facts, report }: { node?: UIIntentNode; graph: UIIntentGraph; facts: Map<string, EvidenceFact>; report?: SnifferReport | null }) {
  if (!node) return <aside className="card-panel sticky-detail"><h2>Select a node</h2></aside>
  const evidenceFacts = node.evidenceIds.map((id) => facts.get(id)).filter(Boolean) as EvidenceFact[]
  const edges = graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id)
  const runtimeStatus = runtimeStatusForNode(node, report)
  return (
    <aside className="card-panel sticky-detail agent-detail-drawer">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{node.kind}</p>
          <h2>{node.label}</h2>
        </div>
        <span className={`status-chip ${runtimeStatus.tone}`}>{runtimeStatus.label}</span>
      </div>
      <dl className="node-detail-grid">
        <Detail label="ID" value={node.id} />
        <Detail label="File" value={node.filePath ?? 'n/a'} />
        <Detail label="Method" value={node.extractionMethod} />
        <Detail label="Confidence" value={String(node.confidence)} />
        <Detail label="Evidence ids" value={String(node.evidenceIds.length)} />
        <Detail label="Edges" value={String(edges.length)} />
      </dl>
      <h3>Deterministic / heuristic / LLM facts</h3>
      <div className="fact-list compact">
        {evidenceFacts.slice(0, 12).map((fact) => <FactCard key={fact.id} fact={fact} usedBy={[]} />)}
      </div>
      <h3>Relationships</h3>
      <ul className="evidence-list">
        {edges.slice(0, 14).map((edge) => <li key={edge.id}>{edge.kind}: {edge.source === node.id ? 'this' : edge.source} → {edge.target === node.id ? 'this' : edge.target}</li>)}
      </ul>
      <h3>Metadata</h3>
      <pre className="snippet-preview">{JSON.stringify(node.metadata ?? {}, null, 2)}</pre>
    </aside>
  )
}

function MiniEvidenceGraph({ graph, selectedId }: { graph: UIIntentGraph; selectedId?: string }) {
  const selectedEdges = graph.edges.filter((edge) => edge.source === selectedId || edge.target === selectedId).slice(0, 8)
  const nodes = allIntentNodes(graph)
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  if (!selectedId || selectedEdges.length === 0) return <p className="muted">Select a node with relationships to preview its evidence graph.</p>
  return (
    <div className="mini-evidence-graph" aria-label="Focused evidence relationship graph">
      {selectedEdges.map((edge) => {
        const source = nodeById.get(edge.source)
        const target = nodeById.get(edge.target)
        return (
          <div key={edge.id} className="mini-edge-row">
            <span className="mini-node">{source?.label ?? edge.source}</span>
            <span className="mini-edge">{edge.kind}</span>
            <span className="mini-node">{target?.label ?? edge.target}</span>
          </div>
        )
      })}
    </div>
  )
}

function ProductExperiencePacket({ context, decision }: { context: ProductExperienceContext; decision?: unknown }) {
  const decisionRecord = decision as { overall?: { classification?: string; summary?: string }; findings?: unknown[]; non_issues?: unknown[] } | undefined
  return (
    <section className="scenario-card static-card">
      <span className="status-chip muted">{context.nav_label_clicked ?? 'screen'}</span>
      <strong>{context.current_screen_name ?? 'Product Experience screen'}</strong>
      <small>{context.page_intent ?? context.workflow_intent ?? 'No page intent text'}</small>
      <div className="chip-row">
        <span className="status-chip muted">Screenshot {context.screenshot_path ? 'yes' : 'no'}</span>
        <span className="status-chip muted">DOM {context.dom_summary ? 'yes' : 'summary unavailable'}</span>
        <span className="status-chip muted">Decision {decisionRecord?.overall?.classification ?? 'n/a'}</span>
      </div>
      <details>
        <summary>Evidence packet details</summary>
        <pre className="snippet-preview">{JSON.stringify({ context, decision }, null, 2)}</pre>
      </details>
    </section>
  )
}

function SuppressionList({ title, items }: { title: string; items: Array<{ title: string; detail: string; reason: string }> }) {
  return (
    <section className="card-panel">
      <p className="eyebrow">{title}</p>
      {items.length ? (
        <div className="scenario-card-list tight">
          {items.slice(0, 80).map((item, index) => (
            <article key={`${item.title}-${index}`} className="mini-card">
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
              <p className="muted">{item.reason}</p>
            </article>
          ))}
        </div>
      ) : <p className="muted">No records in this report.</p>}
    </section>
  )
}

function MetricGrid({ items }: { items: Array<[string, number | string]> }) {
  return (
    <div className="agent-metric-grid">
      {items.map(([label, value]) => (
        <div key={label} className="agent-metric">
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}

function MiniDistribution({ title, counts }: { title: string; counts: Array<[string, number]> }) {
  return (
    <div className="mini-card">
      <strong>{title}</strong>
      <div className="chip-row">
        {counts.map(([label, count]) => <span key={label} className="status-chip muted">{label}: {count}</span>)}
      </div>
    </div>
  )
}

function EmptyCard({ title, text }: { title: string; text: string }) {
  return <section className="scenario-card static-card"><strong>{title}</strong><small>{text}</small></section>
}

function Unavailable({ title, flag }: { title: string; flag: string }) {
  return (
    <section className="card-panel" data-testid="agent-model-unavailable">
      <p className="eyebrow">{title}</p>
      <h2>Not available in this report</h2>
      <p className="muted">{flag}</p>
    </section>
  )
}

function Select({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {values.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd title={value}>{value}</dd></div>
}

function EvidenceIdRow({ ids }: { ids: string[] }) {
  return <div className="evidence-id-row">{ids.slice(0, 5).map((id) => <code key={id}>{id}</code>)}</div>
}

interface AgentModel {
  report?: SnifferReport | null
  inventory?: NonNullable<SnifferReport['sourceInventory']>
  intent?: UIIntentGraph
  refinement?: SnifferReport['graphRefinement']
  retrievalSummaries: EvidenceRetrievalSummary[]
  factById: Map<string, EvidenceFact>
}

function buildAgentModel(report?: SnifferReport | null): AgentModel {
  const inventory = report?.sourceInventory ?? report?.sourceGraph?.sourceInventory
  const intent = report?.uiIntentGraph ?? report?.sourceGraph?.uiIntentGraph
  const refinement = report?.graphRefinement ?? report?.sourceGraph?.graphRefinement
  const retrievalSummaries = report ? [
    ...(report.evidenceRetrievalSummaries ?? []),
    ...(report.productExperience?.evidenceRetrievalSummaries ?? [])
  ] : []
  return {
    report,
    inventory,
    intent,
    refinement,
    retrievalSummaries,
    factById: new Map((inventory?.facts ?? []).map((fact) => [fact.id, fact]))
  }
}

function filterFacts(facts: EvidenceFact[], filters: FactFilters): EvidenceFact[] {
  const needle = filters.search.trim().toLowerCase()
  return facts.filter((fact) => {
    if (filters.kind !== 'all' && fact.kind !== filters.kind) return false
    if (filters.file !== 'all' && fact.filePath !== filters.file) return false
    if (filters.method !== 'all' && fact.extractionMethod !== filters.method) return false
    if (filters.confidence !== 'all' && confidenceBucket(fact) !== filters.confidence) return false
    if (filters.suppressed === 'active' && fact.suppressedFromSemanticGraph) return false
    if (filters.suppressed === 'suppressed' && !fact.suppressedFromSemanticGraph) return false
    if (!needle) return true
    return `${fact.id} ${fact.kind} ${fact.value} ${fact.label ?? ''} ${fact.filePath ?? ''} ${fact.handler ?? ''} ${fact.snippet ?? ''}`.toLowerCase().includes(needle)
  })
}

function factUsage(graph?: UIIntentGraph): Map<string, UIIntentNode[]> {
  const usage = new Map<string, UIIntentNode[]>()
  for (const node of allIntentNodes(graph)) {
    for (const id of node.evidenceIds ?? []) {
      const current = usage.get(id) ?? []
      current.push(node)
      usage.set(id, current)
    }
  }
  return usage
}

function allIntentNodes(graph?: UIIntentGraph): UIIntentNode[] {
  if (!graph) return []
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

function runtimeStatusForNode(node: UIIntentNode, report?: SnifferReport | null): { label: string; tone: string } {
  const matches = report?.runtimeSurfaceMatches ?? []
  const match = matches.find((item) => JSON.stringify(item).toLowerCase().includes(node.label.toLowerCase()))
  if (!match) return { label: 'runtime unknown', tone: 'muted' }
  const text = JSON.stringify(match).toLowerCase()
  if (text.includes('partial')) return { label: 'runtime partial', tone: 'warn' }
  if (text.includes('missing') || text.includes('"no"')) return { label: 'runtime missing', tone: 'danger' }
  return { label: 'runtime evidence', tone: 'good' }
}

function countKind(facts: EvidenceFact[], kind: string): number {
  return facts.filter((fact) => fact.kind === kind).length
}

function countBy(facts: EvidenceFact[], selector: (fact: EvidenceFact) => string, limit = 6): Array<[string, number]> {
  const counts = new Map<string, number>()
  for (const fact of facts) counts.set(selector(fact), (counts.get(selector(fact)) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
}

function confidenceBucket(fact: EvidenceFact): string {
  if (fact.confidence >= 0.8) return 'high'
  if (fact.confidence >= 0.5) return 'medium'
  return 'low'
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

const agentTabs: Array<{ id: AgentTab; label: string }> = [
  { id: 'inventory', label: 'Source Inventory' },
  { id: 'intent', label: 'UI Intent Graph' },
  { id: 'retrieval', label: 'Evidence Retrieval' },
  { id: 'refinements', label: 'LLM Refinements' },
  { id: 'packets', label: 'Evidence Packets' },
  { id: 'suppressions', label: 'Contradictions / Suppressions' }
]
