import type { AppIntent, Issue, IssueTriageContext, ProductIntentContext, ProductIntentModel, PromptConsistencyContext, PromptConsistencyDecision, RuntimeIntentContext, RuntimeLlmIntent, UxCriticContext, UxCriticFinding } from '../types.js'
import type { SnifferCriticContext, WorkflowCriticDecision } from '../types.js'
import type { LlmProvider } from './provider.js'
import { deterministicDecision } from '../critic/workflowCritic.js'
import { triageIssues } from '../heuristics/issueTriage.js'

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

  async critiqueUx(context: UxCriticContext): Promise<UxCriticFinding[]> {
    return context.candidate_heuristic_issues.slice(0, 3).map((issue) => ({
      title: `Mock UX critic: ${issue.title}`,
      severity: issue.severity,
      type: issue.type === 'accessibility_issue' ? 'accessibility_issue' : issue.type === 'layout_issue' ? 'layout_issue' : 'usability_issue',
      evidence: issue.evidence,
      suggested_fix: issue.suggestedFixPrompt,
      should_report: true,
      screenshotPath: issue.screenshotPath
    }))
  }

  async synthesizeProductIntent(context: ProductIntentContext): Promise<ProductIntentModel> {
    return {
      ...context.deterministic_model,
      product_summary: `Mock LLM product synthesis: ${context.deterministic_model.product_summary}`,
      assumptions: [
        ...context.deterministic_model.assumptions,
        'mock_llm_product_intent: structured product intent returned without external calls.'
      ],
      llmUsed: true
    }
  }

  async inferRuntimeIntent(context: RuntimeIntentContext): Promise<RuntimeLlmIntent> {
    const firstButton = context.runtime_snapshot.buttons.find((button) => button.accessibleName || button.visibleText)
    const firstForm = context.runtime_snapshot.forms[0]
    return {
      app_type: context.runtime_snapshot.forms.length > 0 ? 'crud_app' : 'dashboard_app',
      primary_user_jobs: [
        'navigate primary screens',
        firstForm ? 'complete visible forms' : 'inspect dashboard content'
      ],
      workflows: [
        {
          name: firstForm ? 'Inspect visible form' : 'Navigation smoke test',
          confidence: 'medium',
          evidence: firstForm ? [`form:${firstForm.name ?? firstForm.id}`] : context.runtime_snapshot.headings.map((heading) => heading.accessibleName ?? heading.visibleText ?? heading.id).slice(0, 3),
          source: 'llm',
          steps: firstButton ? [{
            action: 'click',
            target_name: firstButton.accessibleName ?? firstButton.visibleText ?? 'primary button',
            locator_strategy: firstButton.locatorCandidates[0]?.strategy ?? 'text',
            locator_value: firstButton.locatorCandidates[0]?.value ?? firstButton.accessibleName ?? firstButton.visibleText ?? '',
            safe: firstButton.safeAction.safe,
            expected_result: 'UI responds without console or network errors.',
            confidence: 'medium',
            evidence: [firstButton.accessibleName ?? firstButton.visibleText ?? firstButton.id]
          }] : []
        }
      ],
      safe_next_actions: context.candidate_actions.filter((action) => action.safe).slice(0, 5),
      unsafe_actions: context.candidate_actions.filter((action) => !action.safe).slice(0, 5),
      notes: ['mock_runtime_intent: inferred from compact runtime DOM context']
    }
  }

  async critiquePromptConsistency(context: PromptConsistencyContext): Promise<PromptConsistencyDecision> {
    const stale = context.forbidden_concepts_detected
    const classification = stale.length >= 2
      ? 'semantic_mismatch'
      : stale.length === 1 ? 'stale_output' : 'consistent'
    return {
      classification,
      confidence: stale.length > 0 ? 'high' : 'medium',
      reasoning_summary: stale.length > 0
        ? `Mock consistency critic: stale concepts found for current prompt: ${stale.join(', ')}.`
        : 'Mock consistency critic: output appears aligned with the current prompt.',
      stale_concepts: stale,
      should_report: stale.length > 0
    }
  }

  async triageIssues(context: IssueTriageContext): Promise<Issue[]> {
    return triageIssues({
      rawFindings: context.rawFindings,
      sourceGraph: context.sourceGraph,
      workflowVerifications: context.runtimeWorkflowVerifications
    }).map((issue) => ({
      ...issue,
      evidence: [...issue.evidence, 'mock_llm_triage: grouped by mock provider']
    }))
  }
}
