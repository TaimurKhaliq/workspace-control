import { describe, expect, it } from 'vitest'
import { critiqueFindings, deterministicDecision } from '../src/critic/workflowCritic.js'
import { MockLlmProvider } from '../src/llm/mockProvider.js'
import type { CandidateFinding, SnifferCriticContext } from '../src/types.js'
import { isSafeNextAction } from '../src/critic/nextActionExecutor.js'

describe('workflow critic', () => {
  it('blocks Raw JSON missing before plan generation as precondition', () => {
    const decision = deterministicDecision(context({ plan_bundle_generated: false }), finding('Missing runtime control for View plan bundle tabs', 'Raw JSON tab/button'))

    expect(decision.classification).toBe('crawler_needs_precondition')
    expect(decision.required_precondition).toBe('plan_bundle_generated')
    expect(decision.should_report).toBe(false)
  })

  it('blocks Copy prompt before handoff prompt exists', () => {
    const decision = deterministicDecision(context({ handoff_prompt_exists: false }), finding('Missing runtime control for Copy handoff prompt', 'Copy prompt button'))

    expect(decision.classification).toBe('crawler_needs_precondition')
    expect(decision.required_precondition).toBe('handoff_prompt_exists')
    expect(decision.should_generate_fix_packet).toBe(false)
  })

  it('classifies 500 network or console evidence as real bug', () => {
    const decision = deterministicDecision(context({}), {
      ...finding('Console error during crawl', 'http://localhost/api/repos/demo/learning-status 500'),
      type: 'console_error',
      severity: 'medium'
    })

    expect(decision.classification).toBe('real_bug')
    expect(decision.should_report).toBe(true)
    expect(decision.should_generate_fix_packet).toBe(true)
  })

  it('suggests more crawling when repeated actions leave safe actions unvisited', () => {
    const base = context({})
    base.execution_trace.repeated_actions = ['Workspaces']
    base.execution_trace.unvisited_safe_actions = ['Repositories']
    const decision = deterministicDecision(base, finding('Source-discovered UI surfaces were not observed at runtime', 'Repositories'))

    expect(decision.classification).toBe('needs_more_crawling')
    expect(decision.next_safe_action).toBe('navigate_to_repositories')
    expect(decision.should_report).toBe(false)
  })

  it('mock LLM critic returns structured decisions', async () => {
    const decision = await new MockLlmProvider().critiqueWorkflow(context({ plan_bundle_generated: false }))

    expect(decision.finding_id).toBe('finding-1')
    expect(decision.reasoning_summary).toContain('Mock critic')
  })

  it('blocks unsupported unsafe next actions from provider decisions', async () => {
    const result = await critiqueFindings({
      sourceGraph: {
        repoPath: '/tmp/web',
        framework: 'react',
        buildTool: 'vite',
        routes: [],
        pages: [],
        components: [],
        forms: [],
        uiSurfaces: [],
        sourceWorkflows: [],
        apiCalls: [],
        stateActions: [],
        packageScripts: {},
        generatedAt: ''
      },
      crawlGraph: {
        startUrl: 'http://localhost',
        title: '',
        finalUrl: 'http://localhost',
        states: [],
        actions: [],
        consoleErrors: [],
        networkFailures: [],
        screenshots: [],
        generatedAt: ''
      },
      workflowVerifications: [],
      candidateIssues: [{
        severity: 'low',
        type: 'missing_ui_surface',
        title: 'Missing thing',
        description: 'Missing thing',
        evidence: ['missing'],
        suggestedFixPrompt: 'Fix it'
      }],
      appUrl: 'http://localhost',
      mode: 'llm',
      provider: {
        name: 'unsafe',
        async critiqueWorkflow(ctx) {
          return {
            finding_id: ctx.candidate_findings[0].finding_id,
            classification: 'needs_more_crawling',
            is_real_bug: false,
            confidence: 0.5,
            next_safe_action: 'delete_everything' as never,
            reasoning_summary: 'try unsafe action',
            evidence: [],
            should_report: false,
            should_generate_fix_packet: false
          }
        }
      }
    })

    expect(result.criticDecisions[0].next_safe_action).toBeUndefined()
  })

  it('allows supported safe next action for plan generation', () => {
    expect(isSafeNextAction('generate_plan_bundle_with_sample_prompt')).toBe(true)
  })
})

function finding(title: string, evidence: string): CandidateFinding {
  return {
    finding_id: 'finding-1',
    severity: 'low',
    type: 'missing_ui_surface',
    title,
    description: evidence,
    evidence: [evidence],
    suggestedFixPrompt: 'Fix it'
  }
}

function context(state: Partial<SnifferCriticContext['known_state']>): SnifferCriticContext {
  const candidate = finding('Missing runtime control for View plan bundle tabs', 'Raw JSON tab/button')
  return {
    app_identity: { repo_path: '/tmp/web', package_name: 'demo', framework: 'react', build_tool: 'vite', app_url: 'http://localhost:5173' },
    source_intent: { relevant_ui_surfaces: [], relevant_source_workflows: [], relevant_api_calls: [], relevant_state_actions: [] },
    runtime_observation: { current_url: 'http://localhost:5173', final_url: 'http://localhost:5173', visible_controls: [], forms: [], dialogs: [], screenshots: [], console_errors: [], network_errors: [] },
    execution_trace: { actions_attempted: [], state_transitions: [], repeated_actions: [], skipped_actions: [], unvisited_safe_actions: [] },
    known_state: {
      workspace_exists: false,
      workspace_selected: false,
      repo_exists: false,
      repo_selected: false,
      plan_bundle_generated: false,
      handoff_prompt_exists: false,
      raw_json_visible: false,
      add_repo_modal_open: false,
      workspace_modal_open: false,
      semantic_enabled: false,
      last_action_changed_state: false,
      ...state
    },
    candidate_findings: [candidate],
    question_for_critic: 'Is this a real bug?',
    omitted_counts: {}
  }
}
