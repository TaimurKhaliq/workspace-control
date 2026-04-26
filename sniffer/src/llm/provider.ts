import type { AppIntent, LlmCriticProvider, SourceGraph, SnifferCriticContext, WorkflowCriticDecision } from '../types.js'

export interface LlmProvider extends Partial<LlmCriticProvider> {
  name: string
  inferIntent(input: { sourceGraph: SourceGraph; deterministicIntent: AppIntent }): Promise<AppIntent>
  repairTest?(input: { testFile: string; failure: string }): Promise<string | undefined>
  critiqueWorkflow?(context: SnifferCriticContext): Promise<WorkflowCriticDecision>
}
