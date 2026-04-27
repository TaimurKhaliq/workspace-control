import type { CrawlGraph, Issue, SourceGraph, UxCriticContext, UxCriticFinding, WorkflowCriticDecision } from '../types.js'
import type { LlmProvider } from '../llm/provider.js'
import { inferKnownState } from './contextBuilder.js'

export type UxCriticMode = 'off' | 'deterministic' | 'llm'

export async function critiqueUx(input: {
  mode: UxCriticMode
  provider?: LlmProvider
  sourceGraph: SourceGraph
  crawlGraph: CrawlGraph
  candidateIssues: Issue[]
}): Promise<{ uxCriticFindings: UxCriticFinding[]; issues: Issue[] }> {
  if (input.mode === 'off') return { uxCriticFindings: [], issues: [] }
  if (input.mode === 'llm' && input.provider?.critiqueUx) {
    const findings = await input.provider.critiqueUx(buildUxCriticContext(input))
    return { uxCriticFindings: findings, issues: findings.filter((finding) => finding.should_report).map(findingToIssue) }
  }
  const findings = input.candidateIssues.map(issueToFinding)
  return { uxCriticFindings: findings, issues: [] }
}

export function buildUxCriticContext(input: {
  sourceGraph: SourceGraph
  crawlGraph: CrawlGraph
  candidateIssues: Issue[]
}): UxCriticContext {
  const lastState = input.crawlGraph.states.at(-1)
  return {
    app_purpose: `UI for ${input.sourceGraph.packageName ?? 'the app'} (${input.sourceGraph.framework}/${input.sourceGraph.buildTool})`,
    workflow: input.sourceGraph.sourceWorkflows.find((workflow) => /plan|workspace|repo/i.test(workflow.name)),
    runtime_visible_controls: lastState?.visible.slice(0, 80) ?? [],
    screenshot_paths: input.crawlGraph.screenshots.slice(-5),
    dom_text_summary: (lastState?.visible ?? []).map((element) => element.text ?? element.name ?? element.kind).filter(Boolean).slice(0, 80) as string[],
    known_state: inferKnownState(input.crawlGraph),
    candidate_heuristic_issues: input.candidateIssues.slice(0, 20),
    question_for_critic: 'Which candidate UX/accessibility findings are real issues for completing the current workflow? Return structured JSON only.'
  }
}

function issueToFinding(issue: Issue): UxCriticFinding {
  return {
    title: issue.title,
    severity: issue.severity,
    type: issue.type === 'accessibility_issue'
      ? 'accessibility_issue'
      : issue.type === 'layout_issue'
        ? 'layout_issue'
        : issue.type === 'workflow_confusion'
          ? 'workflow_confusion'
          : issue.type === 'visual_clutter'
            ? 'visual_clutter'
            : 'usability_issue',
    evidence: issue.evidence,
    suggested_fix: issue.suggestedFixPrompt,
    should_report: true,
    screenshotPath: issue.screenshotPath
  }
}

function findingToIssue(finding: UxCriticFinding): Issue {
  return {
    severity: finding.severity,
    type: finding.type,
    title: finding.title,
    description: `LLM UX critic reported this ${finding.type.replace(/_/g, ' ')}.`,
    evidence: finding.evidence,
    screenshotPath: finding.screenshotPath,
    suggestedFixPrompt: finding.suggested_fix,
    critic_decision: uxDecision(finding)
  }
}

function uxDecision(finding: UxCriticFinding): WorkflowCriticDecision {
  return {
    finding_id: `ux-critic-${finding.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)}`,
    classification: finding.should_report ? 'real_bug' : 'inconclusive',
    is_real_bug: finding.should_report,
    confidence: finding.should_report ? 0.7 : 0.4,
    reasoning_summary: 'LLM UX critic classified this screen-level finding.',
    evidence: finding.evidence,
    should_report: finding.should_report,
    should_generate_fix_packet: finding.should_report
  }
}
