import type { AppIntent, Issue, IssueTriageContext, LlmCriticProvider, ProductIntentContext, ProductIntentModel, PromptConsistencyContext, PromptConsistencyDecision, RuntimeIntentContext, RuntimeLlmIntent, SourceGraph, SnifferCriticContext, UxCriticContext, UxCriticFinding, WorkflowCriticDecision } from '../types.js'

export interface LlmProvider extends Partial<LlmCriticProvider> {
  name: string
  inferIntent(input: { sourceGraph: SourceGraph; deterministicIntent: AppIntent }): Promise<AppIntent>
  repairTest?(input: { testFile: string; failure: string }): Promise<string | undefined>
  critiqueWorkflow?(context: SnifferCriticContext): Promise<WorkflowCriticDecision>
  critiqueUx?(context: UxCriticContext): Promise<UxCriticFinding[]>
  synthesizeProductIntent?(context: ProductIntentContext): Promise<ProductIntentModel>
  inferRuntimeIntent?(context: RuntimeIntentContext): Promise<RuntimeLlmIntent>
  critiquePromptConsistency?(context: PromptConsistencyContext): Promise<PromptConsistencyDecision>
  triageIssues?(context: IssueTriageContext): Promise<Issue[]>
}
