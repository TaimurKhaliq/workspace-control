import type { AppIntent, GraphRefinementResult, GraphStructureCriticContext, Issue, IssueTriageContext, ProductExperienceContext, ProductExperienceDecision, ProductIntentContext, ProductIntentModel, PromptConsistencyContext, PromptConsistencyDecision, RuntimeIntentContext, RuntimeLlmIntent, UxCriticContext, UxCriticFinding } from '../types.js'
import type { SnifferCriticContext, WorkflowCriticDecision } from '../types.js'
import type { LlmProvider } from './provider.js'
import { deterministicDecision } from '../critic/workflowCritic.js'
import { triageIssues } from '../heuristics/issueTriage.js'

export class MockLlmProvider implements LlmProvider {
  name = 'mock'

  isConfigured(): boolean {
    return true
  }

  supportsVision(): boolean {
    return false
  }

  metadata() {
    return {
      name: this.name,
      realProvider: false,
      visionSupported: false
    }
  }

  async checkConnection() {
    return {
      provider: this.name,
      authConfigured: true,
      configSource: {},
      env: {
        SNIFFER_LLM_BASE_URL: false,
        SNIFFER_LLM_API_KEY: false,
        SNIFFER_LLM_MODEL: false,
        SNIFFER_LLM_API_STYLE: false,
        STACKPILOT_SEMANTIC_BASE_URL: false,
        STACKPILOT_SEMANTIC_API_KEY: false,
        STACKPILOT_SEMANTIC_MODEL: false,
        STACKPILOT_SEMANTIC_API_STYLE: false,
        OPENAI_API_KEY: false
      },
      request: {
        attempted: true,
        success: true,
        responseTextExtracted: true
      },
      realProvider: false
    }
  }

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

  async critiqueProductExperience(context: ProductExperienceContext): Promise<ProductExperienceDecision> {
    const reportable = (context.candidate_findings ?? []).filter((finding) => {
      const text = `${finding.title} ${finding.observed} ${finding.evidence.join(' ')}`.toLowerCase()
      return !/prettier|aesthetic|style preference|looks nicer|visual opinion/.test(text)
    })
    return {
      screen_name: context.current_screen_name,
      nav_label: context.nav_label_clicked,
      workflow_intent: context.workflow_intent,
      llm_used: true,
      real_llm_used: false,
      llm_provider: this.name,
      llm_request_status: 'success',
      vision_used: Boolean(context.vision_used),
      vision_not_used_reason: context.vision_not_used_reason,
      outerAuditRunId: context.outerAuditRunId,
      outerReportGeneratedAt: context.outerReportGeneratedAt,
      displayedReportId: context.displayedReportId,
      displayedReportGeneratedAt: context.displayedReportGeneratedAt,
      displayedReportPath: context.displayedReportPath,
      screenshotSource: context.screenshotSource,
      contextScope: context.contextScope,
      scenario_screenshot_used: context.scenario_screenshot_used,
      context_sufficiency: context.context_sufficiency,
      context_sufficiency_score: context.context_sufficiency_score,
      context_warnings: context.context_warnings,
      overall: {
        classification: reportable.length === 0 ? 'aligned' : reportable.some((finding) => finding.severity === 'high' || finding.severity === 'critical') ? 'major_gap' : 'minor_gap',
        confidence: 'high',
        summary: reportable.length === 0
          ? 'Mock product experience critic: no evidence-backed product gaps.'
          : `Mock product experience critic confirmed ${reportable.length} evidence-backed product gap(s).`
      },
      findings: reportable.map((finding) => ({
        ...finding,
        evidence: [...finding.evidence, 'mock_product_experience_critic: confirmed from deterministic evidence'],
        should_report: true
      })),
      non_issues: (context.candidate_findings ?? []).length > reportable.length
        ? [{ observation: 'Vague aesthetic observation', reason_not_reported: 'Mock critic rejects aesthetic-only comments without workflow evidence.' }]
        : []
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

  async critiqueGraphStructure(context: GraphStructureCriticContext): Promise<Pick<GraphRefinementResult, 'suggestions' | 'warnings'>> {
    const suggestions = []
    const staticAsset = context.sourceInventorySummary.suspiciousFacts.find((fact) => fact.kind === 'api_call' && /\/(?:src|assets|static|public)\//i.test(fact.value))
    if (staticAsset) {
      suggestions.push({
        id: 'mock-static-asset-reclassify',
        type: 'reclassify_fact' as const,
        targetId: staticAsset.id,
        fromValue: staticAsset.kind,
        toValue: 'static_asset_reference',
        reason: 'Mock graph critic: module/static asset path is not a backend API call.',
        evidenceIds: [staticAsset.id],
        confidence: 'high' as const,
        risk: 'low' as const
      })
    }
    const planRuns = context.uiIntentGraphDraft.surfaces.find((surface) => /plan runs?|history/i.test(surface.label) && surface.metadata?.surface_type === 'unknown_ui_section')
    if (planRuns?.evidenceIds[0]) {
      suggestions.push({
        id: 'mock-plan-runs-history-list',
        type: 'reclassify_surface' as const,
        targetId: planRuns.id,
        fromValue: 'unknown_ui_section',
        toValue: 'history_list',
        reason: 'Mock graph critic: plan-run evidence indicates a history/list surface.',
        evidenceIds: [planRuns.evidenceIds[0]],
        confidence: 'high' as const,
        risk: 'low' as const
      })
    }
    return {
      suggestions,
      warnings: ['mock_graph_refiner: generated deterministic mock suggestions from compact graph context']
    }
  }
}
