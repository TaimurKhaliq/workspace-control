import type { AppIntent } from '../types.js'
import type { Issue, IssueTriageContext, SnifferCriticContext, UxCriticContext, UxCriticFinding, WorkflowCriticDecision } from '../types.js'
import type { LlmProvider } from './provider.js'

type ApiStyle = 'responses' | 'chat_completions' | 'auto'

export class OpenAICompatibleProvider implements LlmProvider {
  name = 'openai-compatible'
  private baseUrl: string
  private apiKey: string
  private model: string
  private apiStyle: ApiStyle

  constructor(env = process.env) {
    this.baseUrl = env.SNIFFER_LLM_BASE_URL ?? 'https://api.openai.com/v1'
    this.apiKey = env.SNIFFER_LLM_API_KEY ?? ''
    this.model = env.SNIFFER_LLM_MODEL ?? ''
    this.apiStyle = (env.SNIFFER_LLM_API_STYLE as ApiStyle | undefined) ?? 'auto'
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.model)
  }

  async inferIntent(input: Parameters<LlmProvider['inferIntent']>[0]): Promise<AppIntent> {
    if (!this.isConfigured()) return input.deterministicIntent

    const prompt = [
      'Infer likely UI workflows from this deterministic source graph.',
      'Return concise JSON with summary and likelyWorkflows.',
      JSON.stringify(input.sourceGraph)
    ].join('\n\n')

    const text = await this.complete(prompt)
    try {
      const parsed = JSON.parse(text) as Partial<AppIntent>
      return {
        ...input.deterministicIntent,
        ...parsed,
        sourceSignals: input.deterministicIntent.sourceSignals,
        llmUsed: true
      }
    } catch {
      return {
        ...input.deterministicIntent,
        summary: `${input.deterministicIntent.summary}\n\nLLM notes: ${text.slice(0, 1000)}`,
        llmUsed: true
      }
    }
  }

  async repairTest(input: { testFile: string; failure: string }): Promise<string | undefined> {
    if (!this.isConfigured()) return undefined
    return this.complete(`Repair this Playwright test if the failure is likely a selector or timing test bug. Return only the full test file.\n\nFailure:\n${input.failure}\n\nTest:\n${input.testFile}`)
  }

  async critiqueWorkflow(context: SnifferCriticContext): Promise<WorkflowCriticDecision> {
    if (!this.isConfigured()) throw new Error('LLM provider is not configured')
    const prompt = [
      'You are a UI workflow analyst for Sniffer.',
      'Use source intent, runtime observation, execution trace, known app state, and candidate findings.',
      'Decide whether the candidate is a real bug, expected conditional UI, crawler precondition gap, test bug, inconclusive, or needs more crawling.',
      'Do not suggest destructive actions. Safe action policy is authoritative.',
      'Return JSON only matching this shape:',
      '{"finding_id":"...","classification":"real_bug|conditional_ui_not_bug|crawler_needs_precondition|test_bug|inconclusive|needs_more_crawling","is_real_bug":true,"confidence":0.0,"required_precondition":"...","next_safe_action":"...","reasoning_summary":"...","evidence":["..."],"should_report":true,"should_generate_fix_packet":true}',
      JSON.stringify(context)
    ].join('\n\n')
    const text = await this.complete(prompt)
    return JSON.parse(text) as WorkflowCriticDecision
  }

  async critiqueUx(context: UxCriticContext): Promise<UxCriticFinding[]> {
    if (!this.isConfigured()) throw new Error('LLM provider is not configured')
    const prompt = [
      'You are a UI/UX critic for a context-aware QA agent.',
      'Use app purpose, source workflow, visible DOM controls, screenshots paths, known state, and candidate heuristic issues.',
      'Decide whether the screen is usable for the workflow and identify confusing, broken, cluttered, unreadable, or inaccessible UI.',
      'Do not suggest destructive actions. Return structured JSON only.',
      'Return exactly this shape:',
      '{"ux_findings":[{"title":"...","severity":"critical|high|medium|low","type":"usability_issue|layout_issue|accessibility_issue|workflow_confusion|visual_clutter","evidence":["..."],"suggested_fix":"...","should_report":true}]}',
      JSON.stringify(context)
    ].join('\n\n')
    const text = await this.complete(prompt)
    const parsed = JSON.parse(text) as { ux_findings?: UxCriticFinding[] }
    return parsed.ux_findings ?? []
  }

  async triageIssues(context: IssueTriageContext): Promise<Issue[]> {
    if (!this.isConfigured()) throw new Error('LLM provider is not configured')
    const compact = {
      sourceGraph: {
        repoPath: context.sourceGraph.repoPath,
        framework: context.sourceGraph.framework,
        buildTool: context.sourceGraph.buildTool,
        workflows: context.sourceGraph.sourceWorkflows,
        apiCalls: context.sourceGraph.apiCalls,
        uiSurfaces: context.sourceGraph.uiSurfaces
      },
      runtimeWorkflowVerifications: context.runtimeWorkflowVerifications,
      crawl: {
        startUrl: context.crawlGraph.startUrl,
        finalUrl: context.crawlGraph.finalUrl,
        screenshots: context.crawlGraph.screenshots,
        consoleErrors: context.crawlGraph.consoleErrors,
        networkFailures: context.crawlGraph.networkFailures
      },
      rawFindings: context.rawFindings
    }
    const prompt = [
      'You are triaging raw Sniffer UI QA findings into repair-sized groups.',
      'Group tiny missing-control findings into actionable themes. Preserve severe API issues. Mark likely locator/test issues as inconclusive in the evidence or status.',
      'Return JSON only with this shape:',
      '{"issues":[{"severity":"critical|high|medium|low","type":"functional_bug|api_error|workflow_confusion|layout_issue|usability_issue|accessibility_issue|inconclusive","title":"...","description":"...","evidence":["..."],"suggestedFixPrompt":"...","screenshotPath":"..."}]}',
      JSON.stringify(compact)
    ].join('\n\n')
    const text = await this.complete(prompt)
    const parsed = JSON.parse(text) as { issues?: Issue[] }
    return parsed.issues ?? []
  }

  private async complete(prompt: string): Promise<string> {
    const useResponses = this.apiStyle === 'responses' || this.apiStyle === 'auto'
    const url = useResponses ? `${this.baseUrl.replace(/\/$/, '')}/responses` : `${this.baseUrl.replace(/\/$/, '')}/chat/completions`
    const body = useResponses
      ? { model: this.model, input: prompt }
      : { model: this.model, messages: [{ role: 'user', content: prompt }] }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    if (!response.ok) throw new Error(`LLM request failed: ${response.status}`)
    const json = await response.json() as {
      output_text?: string
      choices?: { message?: { content?: string } }[]
    }
    return json.output_text ?? json.choices?.[0]?.message?.content ?? ''
  }
}
