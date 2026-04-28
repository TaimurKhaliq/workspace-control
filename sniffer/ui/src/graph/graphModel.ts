import type { FixPacketItem, Issue, ScreenshotItem, SnifferReport } from '../api'

export type GraphNodeType =
  | 'source_file'
  | 'ui_surface'
  | 'source_workflow'
  | 'api_call'
  | 'state_action'
  | 'runtime_state'
  | 'visible_control'
  | 'crawl_action'
  | 'scenario'
  | 'scenario_step'
  | 'issue'
  | 'critic_decision'
  | 'fix_packet'
  | 'product_intent'
  | 'product_gap'
  | 'screenshot'

export type GraphEdgeType =
  | 'discovered_in'
  | 'belongs_to_workflow'
  | 'calls_api'
  | 'rendered_at_runtime'
  | 'clicked_to'
  | 'transitions_to'
  | 'produced_issue'
  | 'classified_by'
  | 'generated_fix_packet'
  | 'screenshot_of'
  | 'evidence_for'
  | 'blocked_by_precondition'

export type GraphStatus =
  | 'passed'
  | 'failed'
  | 'warning'
  | 'blocked'
  | 'deferred'
  | 'needs_more_crawling'
  | 'processed'
  | 'unprocessed'
  | 'open'
  | 'fixed'

export interface SnifferGraphNode {
  id: string
  label: string
  type: GraphNodeType
  group: string
  status?: GraphStatus
  severity?: string
  confidence?: number | string
  sourceFile?: string
  workflowName?: string
  url?: string
  metadata: unknown
  evidence: string[]
  issues: Issue[]
  criticDecisions: unknown[]
  screenshots: string[]
  fixPacketIds: string[]
  processed: boolean
}

export interface SnifferGraphEdge {
  id: string
  source: string
  target: string
  type: GraphEdgeType
  label?: string
  confidence?: number | string
  metadata?: Record<string, unknown>
}

export interface SnifferGraph {
  nodes: SnifferGraphNode[]
  edges: SnifferGraphEdge[]
  summary: {
    node_count: number
    edge_count: number
    issue_count: number
    workflow_count: number
    failed_scenario_count: number
    fix_packet_count: number
  }
}

export interface GraphBuildInput {
  report: SnifferReport
  fixPackets?: FixPacketItem[]
  screenshots?: ScreenshotItem[]
}
