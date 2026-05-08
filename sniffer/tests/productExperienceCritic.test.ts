import { describe, expect, it } from 'vitest'
import { MockLlmProvider } from '../src/llm/mockProvider.js'
import { buildProductExperienceContexts, deterministicProductExperienceDecision, loadProductExperienceRubric, runProductExperienceCritic, snifferDashboardPageIntents } from '../src/critic/productExperienceCritic.js'
import type { AppProfile, CrawlGraph, ProductExperienceContext, ProductExperienceFinding, SourceGraph } from '../src/types.js'

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
    related_fix_packets: []
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
