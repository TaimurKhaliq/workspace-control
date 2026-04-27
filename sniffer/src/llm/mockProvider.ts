import type { AppIntent, Issue, IssueTriageContext, UxCriticContext, UxCriticFinding } from '../types.js'
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
