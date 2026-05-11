import type { AppIntent, GraphRefinementResult, GraphStructureCriticContext, Issue, IssueTriageContext, LlmCriticProvider, ProductExperienceContext, ProductExperienceDecision, ProductIntentContext, ProductIntentModel, PromptConsistencyContext, PromptConsistencyDecision, RuntimeIntentContext, RuntimeLlmIntent, SourceGraph, SnifferCriticContext, UxCriticContext, UxCriticFinding, WorkflowCriticDecision } from '../types.js'

export interface LlmProviderMetadata {
  name: string
  model?: string
  apiStyle?: string
  baseUrlHost?: string
  realProvider: boolean
  supportsText?: boolean
  supportsJson?: boolean
  visionSupported: boolean
  visionEnabled?: boolean
  imageInputStyle?: 'responses_input_image' | 'chat_image_url' | 'none'
  maxImageBytes?: number
  imageDetail?: string
}

export interface LlmProviderEnvDiagnostics {
  SNIFFER_LLM_BASE_URL: boolean
  SNIFFER_LLM_API_KEY: boolean
  SNIFFER_LLM_MODEL: boolean
  SNIFFER_LLM_API_STYLE: boolean
  SNIFFER_LLM_VISION_ENABLED: boolean
  SNIFFER_LLM_MAX_IMAGE_BYTES: boolean
  SNIFFER_LLM_IMAGE_DETAIL: boolean
  STACKPILOT_SEMANTIC_BASE_URL: boolean
  STACKPILOT_SEMANTIC_API_KEY: boolean
  STACKPILOT_SEMANTIC_MODEL: boolean
  STACKPILOT_SEMANTIC_API_STYLE: boolean
  OPENAI_API_KEY: boolean
}

export interface LlmProviderCheckResult {
  provider: string
  baseUrlHost?: string
  model?: string
  apiStyle?: string
  visionSupported?: boolean
  visionEnabled?: boolean
  imageInputStyle?: 'responses_input_image' | 'chat_image_url' | 'none'
  maxImageBytes?: number
  imageDetail?: string
  authConfigured: boolean
  configSource: {
    baseUrl?: string
    apiKey?: string
    model?: string
    apiStyle?: string
    visionEnabled?: string
    maxImageBytes?: string
    imageDetail?: string
  }
  env: LlmProviderEnvDiagnostics
  request: {
    attempted: boolean
    success: boolean
    statusCode?: number
    errorSummary?: string
    responseTextExtracted?: boolean
  }
  realProvider: boolean
}

export interface LlmProvider extends Partial<LlmCriticProvider> {
  name: string
  isConfigured?(): boolean
  supportsVision?(): boolean
  metadata?(): LlmProviderMetadata
  checkConnection?(): Promise<LlmProviderCheckResult>
  inferIntent(input: { sourceGraph: SourceGraph; deterministicIntent: AppIntent }): Promise<AppIntent>
  repairTest?(input: { testFile: string; failure: string }): Promise<string | undefined>
  critiqueWorkflow?(context: SnifferCriticContext): Promise<WorkflowCriticDecision>
  critiqueUx?(context: UxCriticContext): Promise<UxCriticFinding[]>
  synthesizeProductIntent?(context: ProductIntentContext): Promise<ProductIntentModel>
  critiqueProductExperience?(context: ProductExperienceContext): Promise<ProductExperienceDecision>
  inferRuntimeIntent?(context: RuntimeIntentContext): Promise<RuntimeLlmIntent>
  critiquePromptConsistency?(context: PromptConsistencyContext): Promise<PromptConsistencyDecision>
  triageIssues?(context: IssueTriageContext): Promise<Issue[]>
  critiqueGraphStructure?(context: GraphStructureCriticContext): Promise<Pick<GraphRefinementResult, 'suggestions' | 'warnings'>>
}
