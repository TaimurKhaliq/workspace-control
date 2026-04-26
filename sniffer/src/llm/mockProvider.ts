import type { AppIntent } from '../types.js'
import type { SnifferCriticContext, WorkflowCriticDecision } from '../types.js'
import type { LlmProvider } from './provider.js'
import { deterministicDecision } from '../critic/workflowCritic.js'

export class MockLlmProvider implements LlmProvider {
  name = 'mock'

  async inferIntent(input: Parameters<LlmProvider['inferIntent']>[0]): Promise<AppIntent> {
    return {
      ...input.deterministicIntent,
      summary: `Mock LLM interpretation: ${input.deterministicIntent.summary}`,
      llmUsed: true
    }
  }

  async repairTest(input: { testFile: string }): Promise<string> {
    return input.testFile
  }

  async critiqueWorkflow(context: SnifferCriticContext): Promise<WorkflowCriticDecision> {
    const candidate = context.candidate_findings[0]
    return {
      ...deterministicDecision(context, candidate),
      reasoning_summary: `Mock critic: ${deterministicDecision(context, candidate).reasoning_summary}`
    }
  }
}
