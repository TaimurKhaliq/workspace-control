import { describe, expect, it } from 'vitest'
import { MockLlmProvider } from '../src/llm/mockProvider.js'
import { OpenAICompatibleProvider } from '../src/llm/openAICompatibleProvider.js'
import { buildProductExperienceContexts, deterministicProductExperienceDecision, loadProductExperienceRubric, runProductExperienceCritic, snifferDashboardPageIntents } from '../src/critic/productExperienceCritic.js'
import type { AppProfile, CrawlGraph, ProductExperienceContext, ProductExperienceDecision, ProductExperienceFinding, SourceGraph } from '../src/types.js'
import type { LlmProvider } from '../src/llm/provider.js'

describe('Product Experience Critic', () => {
  it('loads the product experience rubric', async () => {
    const rubric = await loadProductExperienceRubric()

    expect(rubric.map((item) => item.id)).toEqual(expect.arrayContaining(['context_clarity', 'navigation_promise', 'evidence_proximity']))
  })

  it('provides a Sniffer Dashboard page intent for Run Timeline', () => {
    const timeline = snifferDashboardPageIntents().find((intent) => intent.screen_name === 'Run Timeline')

    expect(timeline?.page_intent).toContain('ordered phases')
    expect(timeline?.required_context).toEqual(expect.arrayContaining(['latest/selected run identity', 'timestamp or generated time']))
  })

  it('flags Run Timeline when run context is missing', () => {
    const context = timelineContext([
      'RUN TIMELINE What Sniffer did',
      'A QA-style replay of source discovery, crawl execution, critics, grouping, and repair packet generation.',
      '1 Source discovery passed',
      '2 Runtime crawl passed'
    ])

    const decision = deterministicProductExperienceDecision(context)

    expect(decision.overall.classification).toBe('minor_gap')
    expect(decision.findings[0]).toMatchObject({
      type: 'context_gap',
      title: 'Run Timeline lacks clear run/report context'
    })
  })

  it('passes Run Timeline when latest run, timestamp, project, and status are visible', () => {
    const context = timelineContext([
      'RUN TIMELINE What Sniffer did',
      'Latest run for project Ad hoc generated 5/7/2026, 4:10 PM with status passed.',
      '1 Source discovery passed',
      '2 Runtime crawl passed'
    ])

    const decision = deterministicProductExperienceDecision(context)

    expect(decision.overall.classification).toBe('aligned')
    expect(decision.findings.filter((finding) => finding.should_report)).toHaveLength(0)
  })

  it('lets the mock LLM confirm deterministic product experience gaps', async () => {
    const result = await runProductExperienceCritic({
      mode: 'llm',
      provider: new MockLlmProvider(),
      sourceGraph: sourceGraph(),
      crawlGraph: crawlGraph(['RUN TIMELINE What Sniffer did', '1 Source discovery passed']),
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest',
      projectId: 'ad_hoc'
    })

    expect(result.issues.some((issue) => issue.type === 'product_experience_gap')).toBe(true)
    expect(result.decisions.some((decision) => decision.findings.some((finding) => finding.evidence.some((item) => item.includes('mock_product_experience_critic'))))).toBe(true)
  })

  it('uses the LLM as the evaluator in llm mode when configured', async () => {
    const provider = new SpyProductExperienceProvider(() => llmFindingDecision('Run Timeline lacks clear run/report context'))

    const result = await runProductExperienceCritic({
      mode: 'llm',
      provider,
      sourceGraph: sourceGraph(),
      crawlGraph: crawlGraph(['RUN TIMELINE What Sniffer did', '1 Source discovery passed']),
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    expect(provider.contexts.length).toBeGreaterThan(0)
    expect(result.llmScreensReviewed).toBeGreaterThan(0)
    expect(result.decisions[0].llm_used).toBe(true)
    expect(result.issues.some((issue) => issue.type === 'product_experience_gap')).toBe(true)
  })

  it('marks an openai-compatible fixture response as real LLM review', async () => {
    const provider = new OpenAICompatibleProvider({
      SNIFFER_LLM_BASE_URL: 'https://api.openai.com/v1',
      SNIFFER_LLM_API_KEY: 'test-key',
      SNIFFER_LLM_MODEL: 'gpt-test',
      SNIFFER_LLM_API_STYLE: 'responses'
    }, async () => new Response(JSON.stringify({ output: [{ content: [{ text: JSON.stringify(alignedDecision(timelineContext(['RUN TIMELINE', 'Latest run generated 5/7/2026 with status passed.']))) }] }] }), { status: 200 }))

    const result = await runProductExperienceCritic({
      mode: 'llm',
      provider,
      sourceGraph: sourceGraph(),
      crawlGraph: crawlGraph(['RUN TIMELINE What Sniffer did', 'Latest run generated 5/7/2026 with status passed.']),
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    expect(result.providerName).toBe('openai-compatible')
    expect(result.status).toBe('completed')
    expect(result.realLlmScreensReviewed).toBeGreaterThan(0)
    expect(result.decisions[0].real_llm_used).toBe(true)
  })

  it('uses executed scenario screenshots as product critic context', async () => {
    const provider = new SpyProductExperienceProvider((context) => alignedDecision(context))
    const result = await runProductExperienceCritic({
      mode: 'llm',
      provider,
      sourceGraph: sourceGraph(),
      crawlGraph: crawlGraph(['SUMMARY']),
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [scenarioRunWithTrace('Graph Explorer', '#graph')],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    const graphContext = provider.contexts.find((context) => context.current_screen_name === 'Graph Explorer')
    expect(graphContext?.scenario_name).toBe('Dashboard navigation smoke test')
    expect(graphContext?.scenario_step).toBe('click Graph Explorer')
    expect(graphContext?.scenario_screenshot_used).toBe(true)
    expect(graphContext?.screenshot_path).toContain('graph-explorer.png')
    expect(result.decisions.find((decision) => decision.screen_name === 'Graph Explorer')?.scenario_screenshot_used).toBe(true)
  })

  it('still calls the LLM with low context sufficiency after enrichment', async () => {
    const provider = new SpyProductExperienceProvider((context) => ({
      ...alignedDecision(context),
      overall: { classification: 'inconclusive', confidence: 'low', summary: 'Context is too weak to judge.' }
    }))

    const result = await runProductExperienceCritic({
      mode: 'llm',
      provider,
      sourceGraph: { ...sourceGraph(), uiSurfaces: [] },
      crawlGraph: { ...crawlGraph([]), states: [{ ...crawlGraph([]).states[0], screenshotPath: undefined, primaryVisibleText: [], visible: [] }], screenshots: [] },
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    const timeline = provider.contexts.find((context) => context.current_screen_name === 'Run Timeline')
    expect(timeline?.context_sufficiency).toBe('low')
    expect(timeline?.context_warnings.join('\n')).toContain('context_sufficiency=low')
    expect(result.decisions[0].overall.classification).toBe('inconclusive')
  })

  it('does not call the LLM in deterministic mode', async () => {
    const provider = new SpyProductExperienceProvider(() => llmFindingDecision('Should not be called'))

    await runProductExperienceCritic({
      mode: 'deterministic',
      provider,
      sourceGraph: sourceGraph(),
      crawlGraph: crawlGraph(['RUN TIMELINE What Sniffer did', '1 Source discovery passed']),
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    expect(provider.contexts).toHaveLength(0)
  })

  it('marks llm mode as not_run when the provider is unavailable', async () => {
    const result = await runProductExperienceCritic({
      mode: 'llm',
      sourceGraph: sourceGraph(),
      crawlGraph: crawlGraph(['RUN TIMELINE What Sniffer did']),
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    expect(result.status).toBe('not_run')
    expect(result.notRunReason).toContain('LLM provider unavailable')
    expect(result.issues).toHaveLength(0)
    expect(result.decisions).toHaveLength(0)
  })

  it('marks llm mode as provider_error when provider preflight fails', async () => {
    const provider = new SpyProductExperienceProvider(() => llmFindingDecision('Should not be called'))
    const result = await runProductExperienceCritic({
      mode: 'llm',
      provider,
      providerPreflightError: 'LLM provider preflight failed status 401: Incorrect API key provided. Set SNIFFER_LLM_API_KEY or run sniffer providers check --provider openai-compatible.',
      sourceGraph: sourceGraph(),
      crawlGraph: crawlGraph(['RUN TIMELINE What Sniffer did']),
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    expect(provider.contexts).toHaveLength(0)
    expect(result.status).toBe('provider_error')
    expect(result.notRunReason).toContain('preflight failed')
    expect(result.decisions.length).toBeGreaterThan(0)
    expect(result.decisions[0].llm_request_status).toBe('provider_error')
    expect(result.decisions[0].llm_used).toBe(false)
  })

  it('marks mock provider LLM review as not real LLM', async () => {
    const result = await runProductExperienceCritic({
      mode: 'llm',
      provider: new MockLlmProvider(),
      sourceGraph: sourceGraph(),
      crawlGraph: crawlGraph(['RUN TIMELINE What Sniffer did', '1 Source discovery passed']),
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    expect(result.status).toBe('not_real_llm')
    expect(result.providerName).toBe('mock')
    expect(result.realLlmScreensReviewed).toBe(0)
    expect(result.llmScreensReviewed).toBeGreaterThan(0)
  })

  it('sets vision_used when provider metadata supports vision and screenshots exist', async () => {
    const provider = new SpyProductExperienceProvider((context) => alignedDecision(context), { visionSupported: true })
    const result = await runProductExperienceCritic({
      mode: 'llm',
      provider,
      sourceGraph: sourceGraph(),
      crawlGraph: crawlGraph(['RUN TIMELINE What Sniffer did', 'Latest run generated 5/7/2026 with status passed for project Ad hoc.']),
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    expect(provider.contexts[0].vision_used).toBe(true)
    expect(result.visionScreensReviewed).toBeGreaterThan(0)
  })

  it('sets honest non-vision reason when provider wrapper lacks image input', async () => {
    const provider = new SpyProductExperienceProvider((context) => alignedDecision(context))
    await runProductExperienceCritic({
      mode: 'llm',
      provider,
      sourceGraph: sourceGraph(),
      crawlGraph: crawlGraph(['RUN TIMELINE What Sniffer did', 'Latest run generated 5/7/2026 with status passed for project Ad hoc.']),
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    expect(provider.contexts[0].vision_used).toBe(false)
    expect(provider.contexts[0].vision_not_used_reason).toBe('provider wrapper does not support image input')
  })

  it('suppresses vague aesthetic-only LLM findings', async () => {
    const provider = new SpyProductExperienceProvider((context) => ({
      ...alignedDecision(context),
      overall: { classification: 'minor_gap', confidence: 'high', summary: 'Aesthetic concern only.' },
      findings: [{ ...aestheticFinding(), severity: 'medium' }]
    }))

    const result = await runProductExperienceCritic({
      mode: 'llm',
      provider,
      sourceGraph: sourceGraph(),
      crawlGraph: crawlGraph(['RUN TIMELINE What Sniffer did', 'Latest run generated 5/7/2026 with status passed for project Ad hoc.']),
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    expect(result.issues).toHaveLength(0)
    expect(result.decisions[0].findings[0].should_report).toBe(false)
  })

  it('does not treat loaded report issue titles as current dashboard context gaps', async () => {
    const provider = new SpyProductExperienceProvider((context) => {
      if (!['Summary', 'Issues'].includes(context.current_screen_name)) return alignedDecision(context)
      return {
        ...alignedDecision(context),
        overall: { classification: 'minor_gap', confidence: 'high', summary: 'Loaded report issue title mentions a context gap.' },
        findings: [{
          title: 'Issues screen lacks explicit run/report identity',
          type: 'context_gap',
          severity: 'medium',
          rubric_ids: ['context_clarity'],
          expected: 'Visible latest/selected run identity, project context, timestamp, and status.',
          observed: 'The loaded report data contains an older issue title about context.',
          evidence: ['DOM evidence: medium Issues screen lacks explicit run/report identity product experience gap', 'workflow evidence: Summary issue list'],
          why_it_matters: 'Users need report provenance.',
          suggested_fix: 'Add report context.',
          should_report: true
        }],
        non_issues: []
      }
    })

    const result = await runProductExperienceCritic({
      mode: 'llm',
      provider,
      sourceGraph: sourceGraph(),
      crawlGraph: crawlGraph([
        'SUMMARY Latest Sniffer run',
        'REPORT CONTEXT Ad hoc report Selected run: Latest report Review issues Generated 5/7/2026 RUN IDENTITY Latest report App URL http://127.0.0.1:4877 Repo /Users/demo/project…/sniffer/ui Scenarios 11/11 passed Issues 5 Screenshots 56',
        'Top repair groups for selected report These findings belong to the run identified in the report context strip above.',
        'medium Issues screen lacks explicit run/report identity product experience gap'
      ]),
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    expect(result.issues.map((issue) => issue.title)).not.toContain('Issues screen lacks explicit run/report identity')
    expect(result.decisions.find((decision) => decision.screen_name === 'Summary')?.findings[0]?.should_report).toBe(false)
  })

  it('does not treat embedded Raw JSON payload findings as current Raw JSON screen gaps', async () => {
    const provider = new SpyProductExperienceProvider((context) => {
      if (context.current_screen_name !== 'Raw JSON') return alignedDecision(context)
      return {
        ...alignedDecision(context),
        overall: { classification: 'minor_gap', confidence: 'high', summary: 'The loaded payload contains old missing-control findings.' },
        findings: [{
          title: 'Missing runtime control for Inspect raw JSON workflow',
          type: 'product_intent_mismatch',
          severity: 'medium',
          rubric_ids: ['intent_fit', 'workflow_continuity'],
          expected: 'Raw JSON payload panel should be visible.',
          observed: 'Loaded report payload contains deferredFindings mentioning a missing raw JSON panel.',
          evidence: ['runtimeSurfaceMatches says raw_json_panel seenInRuntime no', 'rawFindings contains Missing runtime control for Inspect raw JSON'],
          why_it_matters: 'Users need debug payload access.',
          suggested_fix: 'Expose Raw JSON.',
          should_report: true
        }],
        non_issues: []
      }
    })
    const graph = crawlGraph([
      'RAW JSON Latest report payload Use this only when you need the underlying report object.',
      'Copy JSON { "deferredFindings": [{ "title": "Missing runtime control for Inspect raw JSON" }], "runtimeSurfaceMatches": [] }'
    ])
    graph.finalUrl = 'http://localhost:4877/#raw-json'
    graph.states[0].url = 'http://localhost:4877/#raw-json'
    graph.states[0].hashRoute = '#raw-json'

    const result = await runProductExperienceCritic({
      mode: 'llm',
      provider,
      sourceGraph: sourceGraph(),
      crawlGraph: graph,
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    expect(result.issues.map((issue) => issue.title)).not.toContain('Missing runtime control for Inspect raw JSON workflow')
    expect(result.decisions.find((decision) => decision.screen_name === 'Raw JSON')?.findings[0]?.should_report).toBe(false)
  })

  it('reports Raw JSON payloads without a copy/export/download action', async () => {
    const result = await runProductExperienceCritic({
      mode: 'deterministic',
      sourceGraph: sourceGraph(),
      crawlGraph: rawJsonCrawlGraph(['RAW JSON Latest report payload', '{ "ok": true, "issues": [] }']),
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: 'Raw JSON lacks copy action',
        type: 'product_experience_gap'
      })
    ]))
    expect(result.decisions.find((decision) => decision.screen_name === 'Raw JSON')?.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
      type: 'actionability_gap',
      should_report: true
      })
    ]))
  })

  it('preserves the evidence-backed Raw JSON missing-copy candidate when the LLM overlooks it', async () => {
    const provider = new SpyProductExperienceProvider((context) => alignedDecision(context))
    const result = await runProductExperienceCritic({
      mode: 'llm',
      provider,
      sourceGraph: sourceGraph(),
      crawlGraph: rawJsonCrawlGraph(['RAW JSON Latest report payload', '{ "ok": true, "issues": [] }']),
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    const rawJsonDecision = result.decisions.find((decision) => decision.screen_name === 'Raw JSON')
    expect(result.issues.map((issue) => issue.title)).toContain('Raw JSON lacks copy action')
    expect(rawJsonDecision?.findings.some((finding) =>
      finding.title === 'Raw JSON lacks copy action' &&
      finding.evidence.some((item) => item.includes('deterministic_candidate_preserved'))
    )).toBe(true)
  })

  it('does not report missing Raw JSON copy action when Copy JSON is visible', async () => {
    const provider = new SpyProductExperienceProvider((context) => {
      if (context.current_screen_name !== 'Raw JSON') return alignedDecision(context)
      return {
        ...alignedDecision(context),
        overall: { classification: 'minor_gap', confidence: 'high', summary: 'Copy action appears missing.' },
        findings: [{
          title: 'Missing copy action control for Raw JSON screen',
          type: 'actionability_gap',
          severity: 'medium',
          rubric_ids: ['actionability'],
          expected: 'Raw JSON should have a visible Copy JSON button.',
          observed: 'No button labeled Copy JSON was found near the raw JSON view.',
          evidence: ['No button labeled Copy JSON or functionally similar control was found near or within the raw JSON view.'],
          why_it_matters: 'Users need to copy the report payload.',
          suggested_fix: 'Add Copy JSON.',
          should_report: true
        }],
        non_issues: []
      }
    })
    const graph = crawlGraph(['RAW JSON Latest report payload', 'Copy JSON { "ok": true }'])
    graph.finalUrl = 'http://localhost:4877/#raw-json'
    graph.states[0].url = 'http://localhost:4877/#raw-json'
    graph.states[0].hashRoute = '#raw-json'

    const result = await runProductExperienceCritic({
      mode: 'llm',
      provider,
      sourceGraph: sourceGraph(),
      crawlGraph: graph,
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    expect(result.issues.map((issue) => issue.title)).not.toContain('Missing copy action control for Raw JSON screen')
    expect(result.decisions.find((decision) => decision.screen_name === 'Raw JSON')?.findings[0]?.should_report).toBe(false)
  })

  it('treats Download JSON and Export JSON as valid Raw JSON actions', async () => {
    for (const action of ['Download JSON', 'Export JSON']) {
      const result = await runProductExperienceCritic({
        mode: 'deterministic',
        sourceGraph: sourceGraph(),
        crawlGraph: rawJsonCrawlGraph(['RAW JSON Latest report payload', action, '{ "ok": true }'], [action]),
        appProfile: appProfile(),
        appSubtype: 'sniffer_dashboard',
        scenarioRuns: [],
        reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
      })

      const rawJsonFindings = result.decisions.find((decision) => decision.screen_name === 'Raw JSON')?.findings ?? []
      expect(result.issues.map((issue) => issue.title)).not.toContain('Raw JSON lacks copy action')
      expect(rawJsonFindings.some((finding) => finding.type === 'actionability_gap' && finding.title === 'Raw JSON lacks copy action')).toBe(false)
    }
  })

  it('does not let Issues screen create a Raw JSON missing-copy finding without embedded Raw JSON', async () => {
    const provider = new SpyProductExperienceProvider((context) => {
      if (context.current_screen_name !== 'Issues') return alignedDecision(context)
      return {
        ...alignedDecision(context),
        overall: { classification: 'minor_gap', confidence: 'high', summary: 'Cross-screen missing copy claim.' },
        findings: [{
          title: 'Missing copy action control for Raw JSON screen',
          type: 'actionability_gap',
          severity: 'medium',
          rubric_ids: ['actionability'],
          expected: 'Raw JSON should have a visible Copy JSON button.',
          observed: 'No Copy JSON control was found.',
          evidence: ['Issues screen issue text mentions Raw JSON copy action'],
          why_it_matters: 'Users need to copy raw JSON.',
          suggested_fix: 'Add Copy JSON.',
          should_report: true
        }],
        non_issues: []
      }
    })
    const graph = crawlGraph(['ISSUES Findings for selected report', 'Copy fix prompt Run verification'])
    graph.finalUrl = 'http://localhost:4877/#issues'
    graph.states[0].url = 'http://localhost:4877/#issues'
    graph.states[0].hashRoute = '#issues'

    const result = await runProductExperienceCritic({
      mode: 'llm',
      provider,
      sourceGraph: sourceGraph(),
      crawlGraph: graph,
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    const finding = result.decisions.find((decision) => decision.screen_name === 'Issues')?.findings[0]
    expect(result.issues.map((issue) => issue.title)).not.toContain('Missing copy action control for Raw JSON screen')
    expect(finding?.should_report).toBe(false)
    expect(finding?.suppression_reason).toContain('reviewed Issues')
  })

  it('does not let suppressed cross-screen copy findings leak into the screen summary', async () => {
    const provider = new SpyProductExperienceProvider((context) => {
      if (context.current_screen_name !== 'Issues') return alignedDecision(context)
      return {
        ...alignedDecision(context),
        overall: { classification: 'minor_gap', confidence: 'high', summary: 'The Issues screen is missing a Raw JSON Copy JSON control.' },
        findings: [{
          title: 'Missing copy action control for Raw JSON report data',
          type: 'actionability_gap',
          severity: 'medium',
          rubric_ids: ['actionability'],
          expected: 'Copy JSON should be visible.',
          observed: 'No Copy JSON control was found.',
          evidence: ['The loaded Issues report mentions Raw JSON.'],
          why_it_matters: 'Users need to copy raw JSON.',
          suggested_fix: 'Add Copy JSON.',
          should_report: true
        }],
        non_issues: []
      }
    })
    const graph = crawlGraph(['ISSUES Findings for selected report', 'Raw JSON Copy JSON'])
    graph.finalUrl = 'http://localhost:4877/#issues'
    graph.states[0].url = 'http://localhost:4877/#issues'
    graph.states[0].hashRoute = '#issues'

    const result = await runProductExperienceCritic({
      mode: 'llm',
      provider,
      sourceGraph: sourceGraph(),
      crawlGraph: graph,
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    const decision = result.decisions.find((item) => item.screen_name === 'Issues')
    expect(decision?.overall.classification).toBe('aligned')
    expect(decision?.overall.summary).not.toContain('missing a Raw JSON Copy JSON control')
    expect(decision?.non_issues.some((item) => item.reason_not_reported.includes('candidate suppressed due to contradictory runtime evidence'))).toBe(true)
  })

  it('adds reviewed screen and screenshot metadata to reported product experience issues', async () => {
    const provider = new SpyProductExperienceProvider((context) => {
      if (context.current_screen_name !== 'Screenshots') return alignedDecision(context)
      return {
        ...alignedDecision(context),
        overall: { classification: 'minor_gap', confidence: 'high', summary: 'Screenshot context missing.' },
        findings: [{
          title: 'Screenshot modal lacks scenario/state/action context',
          type: 'evidence_gap',
          severity: 'medium',
          rubric_ids: ['evidence_proximity'],
          expected: 'Screenshot preview should show scenario, state, action, and related issue context.',
          observed: 'Screenshot evidence is image/file oriented without scenario context.',
          evidence: ['DOM evidence: pet-friends.png'],
          why_it_matters: 'Screenshots need provenance.',
          suggested_fix: 'Add screenshot context.',
          should_report: true
        }],
        non_issues: []
      }
    })

    const result = await runProductExperienceCritic({
      mode: 'llm',
      provider,
      sourceGraph: sourceGraph(),
      crawlGraph: screenshotsCrawlGraph(['SCREENSHOTS', 'pet-friends.png']),
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    expect(result.issues[0].evidence).toEqual(expect.arrayContaining([
      'reviewed_screen: Screenshots',
      'evidence_scope: same_screen'
    ]))
    expect(result.issues[0].evidence.some((item) => item.startsWith('screenshot_used: '))).toBe(true)
    expect(result.decisions.find((decision) => decision.screen_name === 'Screenshots')?.findings[0]?.dom_excerpt).toContain('pet-friends.png')
  })

  it('reports Screenshots when LLM confirms missing screenshot context', async () => {
    const provider = new SpyProductExperienceProvider((context) => {
      if (context.current_screen_name !== 'Screenshots') return alignedDecision(context)
      return {
        ...alignedDecision(context),
        overall: { classification: 'minor_gap', confidence: 'high', summary: 'Screenshot evidence lacks workflow context.' },
        findings: [{
          title: 'Screenshot modal lacks scenario/state/action context',
          type: 'evidence_gap',
          severity: 'medium',
          rubric_ids: ['evidence_proximity'],
          expected: 'Screenshot preview should show scenario, state, action, and related issue context.',
          observed: 'The visible screenshot evidence is image/file oriented without scenario, state, or action context.',
          evidence: ['DOM evidence: pet-friends.png', 'screenshot evidence: state-1.png', 'workflow evidence: Screenshots page intent'],
          why_it_matters: 'Screenshots are weak QA evidence unless users know what state or action produced them.',
          suggested_fix: 'Add scenario/state/action metadata to screenshot modal and thumbnail cards.',
          should_report: true
        }],
        non_issues: []
      }
    })

    const result = await runProductExperienceCritic({
      mode: 'llm',
      provider,
      sourceGraph: sourceGraph(),
      crawlGraph: screenshotsCrawlGraph(['SCREENSHOTS', 'pet-friends.png']),
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest'
    })

    expect(result.issues.some((issue) => issue.title === 'Screenshot modal lacks scenario/state/action context')).toBe(true)
  })

  it('mock LLM rejects vague aesthetic-only comments', async () => {
    const provider = new MockLlmProvider()
    const decision = await provider.critiqueProductExperience!({
      ...timelineContext(['RUN TIMELINE What Sniffer did', 'Latest run generated 5/7/2026 with status passed for project Ad hoc.']),
      candidate_findings: [aestheticFinding()]
    })

    expect(decision.findings).toHaveLength(0)
    expect(decision.non_issues[0].reason_not_reported).toContain('aesthetic-only')
  })

  it('builds contexts from crawl states and Sniffer Dashboard page intents', () => {
    const contexts = buildProductExperienceContexts({
      sourceGraph: sourceGraph(),
      crawlGraph: crawlGraph(['RUN TIMELINE What Sniffer did', '1 Source discovery passed']),
      appProfile: appProfile(),
      appSubtype: 'sniffer_dashboard',
      scenarioRuns: [],
      reportDir: '/tmp/sniffer/reports/sniffer/ad_hoc/latest',
      projectId: 'ad_hoc'
    })

    expect(contexts.map((context) => context.current_screen_name)).toContain('Run Timeline')
    expect(contexts.find((context) => context.current_screen_name === 'Run Timeline')?.screenshot_artifact_url)
      .toBe('/api/reports/latest/artifacts/screenshots%2Fstate-1.png?project=ad_hoc')
  })
})

class SpyProductExperienceProvider implements Pick<LlmProvider, 'name' | 'critiqueProductExperience' | 'isConfigured' | 'supportsVision' | 'metadata'> {
  name = 'spy-openai-compatible'
  contexts: ProductExperienceContext[] = []

  constructor(
    private readonly respond: (context: ProductExperienceContext) => ProductExperienceDecision,
    private readonly options: { visionSupported?: boolean } = {}
  ) {}

  isConfigured(): boolean {
    return true
  }

  supportsVision(): boolean {
    return Boolean(this.options.visionSupported)
  }

  metadata() {
    return { name: this.name, model: 'test-model', apiStyle: 'responses', realProvider: true, visionSupported: this.supportsVision() }
  }

  async critiqueProductExperience(context: ProductExperienceContext): Promise<ProductExperienceDecision> {
    this.contexts.push(context)
    return this.respond(context)
  }
}

function alignedDecision(context: ProductExperienceContext): ProductExperienceDecision {
  return {
    screen_name: context.current_screen_name,
    nav_label: context.nav_label_clicked,
    workflow_intent: context.workflow_intent,
    llm_used: true,
    real_llm_used: context.real_llm_expected,
    llm_provider: context.llm_provider,
    llm_model: context.llm_model,
    llm_api_style: context.llm_api_style,
    llm_request_status: 'success',
    vision_used: context.vision_used,
    vision_not_used_reason: context.vision_not_used_reason,
    scenario_screenshot_used: context.scenario_screenshot_used,
    context_sufficiency: context.context_sufficiency,
    context_sufficiency_score: context.context_sufficiency_score,
    context_warnings: context.context_warnings,
    overall: { classification: 'aligned', confidence: 'high', summary: 'Screen supports the intended user job.' },
    findings: [],
    non_issues: []
  }
}

function llmFindingDecision(title: string): ProductExperienceDecision {
  const context = timelineContext(['RUN TIMELINE What Sniffer did', '1 Source discovery passed'])
  return {
    ...alignedDecision(context),
    overall: { classification: 'minor_gap', confidence: 'high', summary: 'The screen is missing run context.' },
    findings: [{
      title,
      type: 'context_gap',
      severity: 'medium',
      rubric_ids: ['context_clarity'],
      expected: 'Visible latest/selected run identity, project context, timestamp, and status.',
      observed: 'The screen shows phase names but no run identity.',
      evidence: ['DOM evidence: Source discovery passed', 'screenshot evidence: state-1.png', 'workflow evidence: Run Timeline'],
      why_it_matters: 'Users cannot know which audit run they are reviewing.',
      suggested_fix: 'Add a compact run context strip.',
      should_report: true
    }],
    non_issues: []
  }
}

function timelineContext(dom_summary: string[]): ProductExperienceContext {
  return {
    app_name: 'Sniffer Dashboard',
    app_profile: appProfile(),
    app_subtype: 'sniffer_dashboard',
    product_intent_summary: 'Local-first QA dashboard',
    primary_user_jobs: ['inspect crawl journeys'],
    current_screen_name: 'Run Timeline',
    nav_label_clicked: 'Run Timeline',
    page_intent: 'Explain the ordered phases and evidence for a specific Sniffer audit run.',
    workflow_intent: 'Replay what Sniffer did during the selected/latest audit.',
    expected_user_questions: ['Which run am I looking at?'],
    expected_primary_content: ['run identity', 'ordered phase list'],
    expected_next_actions: ['Open scenarios'],
    required_context: ['latest/selected run identity', 'project/ad hoc context', 'timestamp or generated time', 'status', 'phase list'],
    screenshot_path: '/tmp/sniffer/reports/sniffer/ad_hoc/latest/screenshots/state-1.png',
    screenshot_artifact_url: '/api/reports/latest/artifacts/screenshots%2Fstate-1.png?project=ad_hoc',
    scenario_screenshot_used: false,
    dom_summary,
    headings: ['Run Timeline'],
    visible_controls: ['Scenarios', 'Crawl Path'],
    visible_status_text: [],
    visible_empty_states: [],
    visible_errors: [],
    active_nav_state: 'Run Timeline',
    run_project_report_context_visible: [],
    source_evidence: ['surface:Run Timeline'],
    runtime_evidence: ['state:1 http://localhost/#timeline'],
    related_issues: [],
    related_fix_packets: [],
    rubric: [],
    context_sufficiency: 'high',
    context_sufficiency_score: 0.9,
    context_sufficiency_signals: [],
    context_warnings: [],
    vision_capable: false,
    vision_used: false,
    vision_not_used_reason: 'provider wrapper does not support image input',
    real_llm_expected: true
  }
}

function aestheticFinding(): ProductExperienceFinding {
  return {
    title: 'Screen could look prettier',
    type: 'information_hierarchy_gap',
    severity: 'low',
    rubric_ids: ['visual_comprehension'],
    expected: 'A nicer visual style.',
    observed: 'Aesthetic preference only.',
    evidence: ['vague aesthetic opinion'],
    why_it_matters: 'It might look nicer.',
    suggested_fix: 'Make it prettier.',
    should_report: true
  }
}

function crawlGraph(timelineText: string[]): CrawlGraph {
  return {
    startUrl: 'http://localhost:4877',
    title: 'Sniffer Dashboard',
    finalUrl: 'http://localhost:4877/#timeline',
    states: [{
      id: 'state-1',
      sequenceNumber: 1,
      url: 'http://localhost:4877/#timeline',
      hashRoute: '#timeline',
      title: 'Sniffer Dashboard',
      hash: 'abc',
      screenshotPath: '/tmp/sniffer/reports/sniffer/ad_hoc/latest/screenshots/state-1.png',
      primaryVisibleText: timelineText,
      visible: [{ kind: 'button', text: 'Scenarios' }]
    }],
    actions: [],
    consoleErrors: [],
    networkFailures: [],
    screenshots: ['/tmp/sniffer/reports/sniffer/ad_hoc/latest/screenshots/state-1.png'],
    generatedAt: ''
  }
}

function screenshotsCrawlGraph(text: string[]): CrawlGraph {
  return {
    ...crawlGraph(text),
    finalUrl: 'http://localhost:4877/#screenshots',
    states: [{
      ...crawlGraph(text).states[0],
      url: 'http://localhost:4877/#screenshots',
      hashRoute: '#screenshots',
      inferredScreenName: 'Screenshots',
      primaryVisibleText: text,
      visible: [{ kind: 'button', text: 'Open screenshot' }]
    }]
  }
}

function rawJsonCrawlGraph(text: string[], controls: string[] = []): CrawlGraph {
  const graph = crawlGraph(text)
  graph.finalUrl = 'http://localhost:4877/#raw-json'
  graph.states[0].url = 'http://localhost:4877/#raw-json'
  graph.states[0].hashRoute = '#raw-json'
  graph.states[0].inferredScreenName = 'Raw JSON'
  graph.states[0].visible = controls.map((label) => ({ kind: 'button', text: label }))
  return graph
}

function scenarioRunWithTrace(screenName: string, hash: string) {
  return {
    slug: 'sniffer-dashboard-navigation',
    name: 'Dashboard navigation smoke test',
    status: 'passed' as const,
    prerequisites: [],
    stepsAttempted: ['Open dashboard sidebar sections'],
    screenshots: [`/tmp/sniffer/reports/sniffer/ad_hoc/latest/screenshots/generated-scenarios/${screenName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`],
    stepTraces: [{
      scenarioName: 'Dashboard navigation smoke test',
      scenarioSlug: 'sniffer-dashboard-navigation',
      stepName: `click ${screenName}`,
      actionLabel: `click ${screenName}`,
      url: `http://localhost:4877/${hash}`,
      screenName,
      navLabel: screenName,
      screenshotPath: `/tmp/sniffer/reports/sniffer/ad_hoc/latest/screenshots/generated-scenarios/${screenName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`,
      domSummary: [`${screenName.toUpperCase()} page`, 'Legend Filters Node detail'],
      headings: [screenName],
      visibleControls: ['Legend', 'Filters', 'Node detail'],
      activeNavState: screenName
    }],
    assertions: [],
    issues: []
  }
}

function sourceGraph(): SourceGraph {
  return {
    repoPath: '/tmp/sniffer/ui',
    packageName: 'sniffer-ui',
    framework: 'react',
    buildTool: 'vite',
    routes: [],
    pages: [],
    components: [],
    forms: [],
    uiSurfaces: [{ file: 'src/components/ReportTimeline.tsx', surface_type: 'unknown_ui_section', display_name: 'Run Timeline', evidence: ['Run Timeline'], relatedButtons: [], relatedInputs: [], confidence: 0.8 }],
    sourceWorkflows: [],
    apiCalls: [],
    stateActions: [],
    packageScripts: {},
    generatedAt: ''
  }
}

function appProfile(): AppProfile {
  return {
    profile_type: 'planning_control_panel',
    confidence: 'high',
    evidence: ['sniffer dashboard'],
    core_entities: ['report', 'run'],
    primary_user_jobs: ['inspect audit runs'],
    expected_navigation_patterns: ['report navigation'],
    expected_workflows: ['review run timeline'],
    expected_output_surfaces: ['timeline']
  }
}
