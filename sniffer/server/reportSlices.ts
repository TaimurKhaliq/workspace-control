import type {
  EvidenceFact,
  EvidenceRetrievalSummary,
  GraphRefinementResult,
  SnifferReport,
  UIIntentGraph
} from '../src/types.js'

type LooseRecord = Record<string, unknown>

export type ReportSliceName =
  | 'source-inventory'
  | 'ui-intent-graph'
  | 'evidence-retrieval'
  | 'graph-refinements'
  | 'evidence-packets'
  | 'suppressions'

export function reportSlicePayload(report: SnifferReport, slice: ReportSliceName): unknown {
  if (slice === 'source-inventory') return sourceInventoryOf(report)
  if (slice === 'ui-intent-graph') return uiIntentGraphOf(report)
  if (slice === 'graph-refinements') return graphRefinementOf(report)
  if (slice === 'evidence-retrieval') return evidenceRetrievalPayload(report)
  if (slice === 'evidence-packets') return evidencePacketsPayload(report)
  if (slice === 'suppressions') return suppressionsPayload(report)
  return undefined
}

export function sourceInventoryOf(report: SnifferReport): SnifferReport['sourceInventory'] {
  return report.sourceInventory ?? report.sourceGraph.sourceInventory
}

export function uiIntentGraphOf(report: SnifferReport): UIIntentGraph | undefined {
  return report.uiIntentGraph ?? report.sourceGraph.uiIntentGraph
}

export function graphRefinementOf(report: SnifferReport): GraphRefinementResult | undefined {
  return report.graphRefinement ?? report.sourceGraph.graphRefinement
}

export function evidenceRetrievalPayload(report: SnifferReport): {
  available: boolean
  summaries: EvidenceRetrievalSummary[]
  productExperienceSummaries: EvidenceRetrievalSummary[]
  consumers: Array<{ consumer: string; count: number }>
} {
  const topLevel = report.evidenceRetrievalSummaries ?? []
  const productExperience = report.productExperience?.evidenceRetrievalSummaries ?? []
  const summaries = topLevel.length ? topLevel : productExperience
  return {
    available: summaries.length > 0,
    summaries,
    productExperienceSummaries: productExperience,
    consumers: [
      { consumer: 'Product Experience Critic', count: productExperience.length },
      { consumer: 'Report-level retrieval', count: topLevel.length }
    ]
  }
}

export function evidencePacketsPayload(report: SnifferReport): {
  productExperiencePackets: Array<{
    id: string
    screenName: string
    navLabel?: string
    screenshotPath?: string
    screenshotArtifactUrl?: string
    context: unknown
    decision?: unknown
    evidenceRetrievalSummary?: EvidenceRetrievalSummary
  }>
  fixPacketIssues: Array<{
    issueId: string
    title: string
    severity: string
    type: string
    suspectedFiles: string[]
    screenshotPath?: string
    evidence: string[]
  }>
} {
  const contexts = report.productExperience?.contexts ?? []
  const decisions = report.productExperience?.decisions ?? []
  return {
    productExperiencePackets: contexts.map((context, index) => {
      const packet = context as unknown as LooseRecord
      return {
        id: String(packet.current_screen_name ?? packet.nav_label_clicked ?? `product-experience-${index}`),
        screenName: String(packet.current_screen_name ?? 'Unknown screen'),
        navLabel: stringValue(packet.nav_label_clicked),
        screenshotPath: stringValue(packet.screenshot_path),
        screenshotArtifactUrl: stringValue(packet.screenshot_artifact_url),
        context,
        decision: decisions[index],
        evidenceRetrievalSummary: packet.evidence_retrieval_summary as EvidenceRetrievalSummary | undefined
      }
    }),
    fixPacketIssues: (report.issues ?? []).map((issue) => ({
      issueId: issue.issue_id ?? issue.title,
      title: issue.title,
      severity: issue.severity,
      type: issue.type,
      suspectedFiles: issue.suspected_files ?? [],
      screenshotPath: issue.screenshotPath,
      evidence: issue.evidence ?? []
    }))
  }
}

export function suppressionsPayload(report: SnifferReport): {
  suppressedFacts: EvidenceFact[]
  rejectedRefinements: GraphRefinementResult['rejectedSuggestions']
  nonIssues: Array<{ screenName?: string; observation: string; reason: string }>
  deferredFindings: SnifferReport['deferredFindings']
  blockedChecks: SnifferReport['blockedChecks']
  contradictions: unknown[]
} {
  const inventory = sourceInventoryOf(report)
  const refinement = graphRefinementOf(report)
  const decisions = report.productExperience?.decisions ?? []
  const nonIssues = decisions.flatMap((decision) => {
    const record = decision as unknown as LooseRecord
    const screenName = stringValue(record.screen_name)
    const nonIssuesList = Array.isArray(record.non_issues) ? record.non_issues as LooseRecord[] : []
    return nonIssuesList.map((item) => ({
      screenName,
      observation: String(item.observation ?? 'Non-issue'),
      reason: String(item.reason_not_reported ?? item.reason ?? 'Suppressed by evidence gate')
    }))
  })
  const retrievalContradictions = [
    ...(report.evidenceRetrievalSummaries ?? []),
    ...(report.productExperience?.evidenceRetrievalSummaries ?? [])
  ].filter((summary) => summary.contradictionCount > 0)

  return {
    suppressedFacts: (inventory?.facts ?? []).filter((fact) => fact.suppressedFromSemanticGraph),
    rejectedRefinements: refinement?.rejectedSuggestions ?? [],
    nonIssues,
    deferredFindings: report.deferredFindings ?? [],
    blockedChecks: report.blockedChecks ?? [],
    contradictions: retrievalContradictions
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}
