import { describe, expect, it } from 'vitest'
import { classifyRuntimeIssues } from '../src/heuristics/issueClassifier.js'
import type { CrawlGraph, RuntimeWorkflowVerification, ScenarioRun, SourceGraph } from '../src/types.js'

describe('classifyRuntimeIssues', () => {
  it('turns console and network failures into issues', () => {
    const issues = classifyRuntimeIssues(sourceGraph(), {
      startUrl: 'http://localhost:3000',
      title: 'Demo',
      finalUrl: 'http://localhost:3000',
      states: [{ url: 'http://localhost:3000', title: 'Demo', hash: 'x', visible: [] }],
      actions: [],
      consoleErrors: [{ text: 'boom' }],
      networkFailures: [{ url: '/api/demo', method: 'GET', failureText: '500' }],
      screenshots: [],
      generatedAt: new Date().toISOString()
    })

    expect(issues.map((issue) => issue.type)).toEqual(expect.arrayContaining(['console_error', 'api_error']))
  })

  it('groups repeated learning-status endpoint failures', () => {
    const issues = classifyRuntimeIssues(sourceGraph(), {
      startUrl: 'http://localhost:3000',
      title: 'Demo',
      finalUrl: 'http://localhost:3000',
      states: [{ url: 'http://localhost:3000', title: 'Demo', hash: 'x', visible: [] }],
      actions: [],
      consoleErrors: [
        { text: 'Failed to load resource: 500', location: 'http://localhost/api/repos/petclinic-react/learning-status' },
        { text: 'Failed to load resource: 500', location: 'http://localhost/api/repos/spring-petclinic-react/learning-status' }
      ],
      networkFailures: [],
      screenshots: ['/tmp/screen.png'],
      generatedAt: new Date().toISOString()
    })

    expect(issues.filter((issue) => issue.title.includes('Learning status endpoint'))).toHaveLength(1)
    expect(issues[0].evidence).toEqual(expect.arrayContaining(['count: 2']))
  })

  it('captures API status code and response body evidence', () => {
    const issues = classifyRuntimeIssues(sourceGraph(), {
      startUrl: 'http://localhost:3000',
      title: 'Demo',
      finalUrl: 'http://localhost:3000',
      states: [{ url: 'http://localhost:3000', title: 'Demo', hash: 'x', visible: [] }],
      actions: [],
      consoleErrors: [],
      networkFailures: [{
        url: 'http://localhost/api/workspaces',
        method: 'GET',
        failureText: 'HTTP 500 Internal Server Error',
        statusCode: 500,
        responseBody: '{"detail":"database locked"}'
      }],
      screenshots: ['/tmp/screen.png'],
      generatedAt: new Date().toISOString()
    })

    expect(issues[0].evidence).toEqual(expect.arrayContaining([
      'endpoint_pattern: GET /api/workspaces',
      'method: GET',
      'status_code: 500',
      'response_body: {"detail":"database locked"}'
    ]))
  })

  it('does not report source-discovered copy actions that were not reached by shallow crawl', () => {
    const graph = sourceGraph()
    graph.uiSurfaces = [{
      file: 'src/components/IssueSummary.tsx',
      surface_type: 'copy_action',
      display_name: 'Copy action',
      evidence: ['Copy fix prompt'],
      relatedButtons: ['Copy fix prompt'],
      relatedInputs: [],
      confidence: 0.8
    }]
    const issues = classifyRuntimeIssues(graph, {
      startUrl: 'http://localhost:3000',
      title: 'Demo',
      finalUrl: 'http://localhost:3000',
      states: [{ url: 'http://localhost:3000', title: 'Demo', hash: 'x', visible: [] }],
      actions: [],
      consoleErrors: [],
      networkFailures: [],
      screenshots: ['/tmp/screen.png'],
      generatedAt: new Date().toISOString()
    })

    expect(issues.map((issue) => issue.title)).not.toContain('Source-discovered UI surfaces were not observed at runtime')
  })

  it('does not classify crawler instrumentation events as app console errors', () => {
    const issues = classifyRuntimeIssues(sourceGraph(), {
      startUrl: 'http://localhost:3000',
      title: 'Demo',
      finalUrl: 'http://localhost:3000',
      states: [{ url: 'http://localhost:3000', title: 'Demo', hash: 'x', visible: [] }],
      actions: [],
      consoleErrors: [{ text: 'Crawler action failed after page crash: locator.click: Target crashed', location: 'http://localhost:3000' }],
      networkFailures: [],
      screenshots: [],
      generatedAt: new Date().toISOString()
    })

    expect(issues.some((issue) => issue.type === 'console_error')).toBe(false)
  })

  it('suppresses missing Run Sniffer audit when Run Audit is visible at runtime', () => {
    const issues = classifyRuntimeIssues(sourceGraph(), crawlGraphWithControls(['Run Audit', 'Repo path', 'App URL']), [
      missingWorkflow('Run Sniffer audit', 'Run Audit')
    ])

    expect(issues.map((issue) => issue.title)).not.toContain('Missing runtime control for Run Sniffer audit')
    expect(issues.map((issue) => issue.title)).not.toContain('Runtime workflow missing: Run Sniffer audit')
  })

  it('suppresses missing Inspect fix packets when a Fix Packets scenario passes', () => {
    const issues = classifyRuntimeIssues(sourceGraph(), crawlGraphWithControls([]), [
      missingWorkflow('Inspect fix packets', 'Open Fix Packets')
    ], [
      scenarioRun('sniffer-issues-fix-packets', 'Issue/fix packet browsing', 'Fix Packets')
    ])

    expect(issues.map((issue) => issue.title)).not.toContain('Missing runtime control for Inspect fix packets')
    expect(issues.map((issue) => issue.title)).not.toContain('Runtime workflow missing: Inspect fix packets')
  })

  it('suppresses missing Use repair workbench when a Repair Workbench scenario passes', () => {
    const issues = classifyRuntimeIssues(sourceGraph(), crawlGraphWithControls([]), [
      missingWorkflow('Use repair workbench', 'Open Repair Workbench')
    ], [
      scenarioRun('sniffer-repair-workbench', 'Repair workbench view', 'Repair Workbench')
    ])

    expect(issues.map((issue) => issue.title)).not.toContain('Missing runtime control for Use repair workbench')
    expect(issues.map((issue) => issue.title)).not.toContain('Runtime workflow missing: Use repair workbench')
  })
})

function crawlGraphWithControls(labels: string[]): CrawlGraph {
  return {
    startUrl: 'http://localhost:3000',
    title: 'Demo',
    finalUrl: 'http://localhost:3000',
    states: [{
      url: 'http://localhost:3000',
      title: 'Demo',
      hash: 'x',
      primaryVisibleText: labels,
      visible: labels.map((label) => ({ kind: 'button' as const, text: label, selectorHint: `button:${label}` }))
    }],
    actions: labels.map((label, index) => ({
      sequenceNumber: index + 1,
      type: 'click' as const,
      actionType: 'click' as const,
      label,
      target: label,
      urlBefore: 'http://localhost:3000',
      safe: true
    })),
    consoleErrors: [],
    networkFailures: [],
    screenshots: [],
    generatedAt: new Date().toISOString()
  }
}

function missingWorkflow(name: string, control: string): RuntimeWorkflowVerification {
  return {
    name,
    sourceFiles: ['src/App.tsx'],
    status: 'missing',
    evidence: [],
    controls: [{ label: control, status: 'missing', matchedEvidence: [], missingReason: 'no matching accessible locator or visible text found' }],
    attemptedInteractions: [],
    issues: [{
      type: 'missing_ui_surface',
      title: `Missing runtime control for ${name}`,
      description: `${control} was expected from source-discovered workflow "${name}" but was not found in the runtime DOM.`,
      evidence: [control]
    }]
  }
}

function scenarioRun(slug: string, name: string, visibleControl: string): ScenarioRun {
  return {
    slug,
    name,
    status: 'passed',
    prerequisites: [],
    stepsAttempted: [`Open ${visibleControl}`],
    screenshots: ['/tmp/shot.png'],
    stepTraces: [{
      scenarioName: name,
      scenarioSlug: slug,
      stepName: `Open ${visibleControl}`,
      actionLabel: `click ${visibleControl}`,
      url: 'http://localhost:3000',
      screenName: visibleControl,
      navLabel: visibleControl,
      screenshotPath: '/tmp/shot.png',
      domSummary: [visibleControl],
      headings: [visibleControl],
      visibleControls: [visibleControl],
      activeNavState: visibleControl
    }],
    assertions: [{
      label: `${visibleControl} is reachable`,
      status: 'passed',
      evidence: [`${visibleControl}:changed`],
      screenshotPath: '/tmp/shot.png'
    }],
    issues: []
  }
}

function sourceGraph(): SourceGraph {
  return {
    repoPath: '/tmp/demo',
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
    generatedAt: new Date().toISOString()
  }
}
