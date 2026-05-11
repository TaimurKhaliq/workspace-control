import type { ApiCall, SourceFileSummary, SourceForm, SourceRoute, SourceScope, StateActionHints, UiSurface, SourceWorkflow } from '../../types.js'

export interface SourceFileContent {
  file: string
  relative: string
  content: string
  sourceScope?: SourceScope
}

export interface DiscoveryContext {
  repoPath: string
  packageJson: Record<string, unknown>
  dependencies: Record<string, string>
  files: SourceFileContent[]
}

export interface AdapterDetection {
  adapterId: string
  framework: string
  confidence: number
  evidence: string[]
}

export interface FrameworkDiscoveryResult {
  adapterId: string
  framework: string
  confidence: number
  routes: SourceRoute[]
  pages: SourceFileSummary[]
  components: SourceFileSummary[]
  forms: SourceForm[]
  uiSurfaces: UiSurface[]
  sourceWorkflows: SourceWorkflow[]
  apiCalls: ApiCall[]
  stateActions: StateActionHints[]
  evidence: string[]
  warnings: string[]
}

export interface DiscoveryAdapter {
  id: string
  name: string
  detect(context: DiscoveryContext): AdapterDetection
  discover(context: DiscoveryContext): FrameworkDiscoveryResult
}

export function emptyDiscoveryResult(adapterId: string, framework: string, confidence: number, evidence: string[], warnings: string[] = []): FrameworkDiscoveryResult {
  return {
    adapterId,
    framework,
    confidence,
    routes: [],
    pages: [],
    components: [],
    forms: [],
    uiSurfaces: [],
    sourceWorkflows: [],
    apiCalls: [],
    stateActions: [],
    evidence,
    warnings
  }
}
