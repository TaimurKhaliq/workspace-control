import type { AppProfile, GeneratedScenario, RuntimeAppModel, ScenarioPackSelection, ScenarioStep, SourceGraph } from '../types.js'

export function generateGenericScenarios(input: {
  appProfile: AppProfile
  sourceGraph: SourceGraph
  runtimeAppModel?: RuntimeAppModel
  scenarioSelection?: ScenarioPackSelection
}): GeneratedScenario[] {
  const profile = input.appProfile.profile_type
  const scenarioPack = input.scenarioSelection?.scenarioPack ?? 'generic'
  const scenarios: GeneratedScenario[] = [
    generatedScenario('navigation-smoke', 'Navigation smoke test', ['unknown', profile], [], [
      step('Open primary navigation items', 'open_primary_navigation', ['links or navigation buttons']),
      step('Verify route/content changes', 'verify_navigation_change', ['stable URL, hash, or visible page heading'])
    ], ['primary navigation is visible'], ['safe routes open without console or network errors'], 'high', input.appProfile.evidence),
    generatedScenario('forms-discoverability', 'Forms discoverability', ['unknown', profile], [], [
      step('Find forms and labelled controls', 'inspect_forms', ['labelled inputs/selects/textareas']),
      step('Inspect validation affordances', 'inspect_validation_states', ['inline help, status, or error areas'])
    ], ['labelled form controls'], ['forms are discoverable without destructive submission'], 'medium', formEvidence(input.sourceGraph)),
    generatedScenario('accessibility-labels', 'Accessibility labels check', ['unknown', profile], [], [
      step('Inspect accessible names', 'inspect_accessible_names', ['buttons and inputs have accessible names'])
    ], ['accessible buttons and form controls'], ['key controls are keyboard and screen-reader discoverable'], 'medium', input.appProfile.evidence),
    generatedScenario('overflow-readability', 'Overflow/readability check', ['unknown', profile], [], [
      step('Inspect common laptop viewport', 'inspect_layout_overflow', ['no page-level horizontal overflow'])
    ], ['readable lists/cards/tables'], ['long text wraps or truncates safely'], 'medium', input.appProfile.evidence)
  ]

  if (profile === 'planning_control_panel' && scenarioPack === 'workspace_control') {
    scenarios.push(
      generatedScenario('planning-generation-flow', 'Run creation/generation flow', ['planning_control_panel'], ['workspace or project selected', 'target entity selected'], [
        step('Select workspace/project', 'select_context', ['workspace/project selector']),
        step('Select target', 'select_target', ['target selector']),
        step('Enter safe sample request', 'enter_safe_prompt', ['prompt/feature request input']),
        step('Generate output', 'click_generate', ['generate/create/run button'])
      ], ['prompt composer', 'target selector', 'generate action'], ['new plan/output is visible or controlled error is shown'], 'medium', planningEvidence(input.sourceGraph)),
      generatedScenario('planning-output-review', 'Output review flow', ['planning_control_panel'], ['generated output exists'], [
        step('Open output sections', 'open_output_sections', ['overview/change set/evidence/handoff/raw JSON tabs']),
        step('Inspect copy/export affordances', 'inspect_copy_export', ['copy/export button'])
      ], ['output sections', 'copy/export controls'], ['generated output is reviewable and copyable'], 'medium', planningEvidence(input.sourceGraph)),
      generatedScenario('planning-history-reopen', 'History/reopen flow', ['planning_control_panel'], ['previous runs may exist'], [
        step('Open history/list', 'open_history', ['plan runs/history list']),
        step('Reopen previous output', 'reopen_previous_run', ['reopen/view details button'])
      ], ['history list', 'run metadata', 'reopen action'], ['previous outputs can be distinguished and reopened'], 'medium', planningEvidence(input.sourceGraph))
    )
  }

  if (profile === 'planning_control_panel' && scenarioPack === 'sniffer_dashboard') {
    scenarios.push(...snifferDashboardScenarios(input.scenarioSelection))
  }

  if (profile === 'planning_control_panel' && scenarioPack === 'generic_control_panel') {
    scenarios.push(
      generatedScenario('control-panel-report-navigation', 'Report/viewer navigation', ['planning_control_panel'], [], [
        step('Open report/viewer sections', 'open_report_sections', ['summary, timeline, issues, screenshots, raw JSON, or settings navigation']),
        step('Verify section content changes', 'verify_navigation_change', ['changed content or active section'])
      ], ['report/viewer navigation'], ['control-panel sections can be inspected without errors'], 'medium', input.appProfile.evidence),
      generatedScenario('control-panel-copy-export', 'Copy/export actions availability', ['planning_control_panel'], [], [
        step('Find copy/export actions', 'inspect_copy_export', ['copy/export/download buttons if output is present'])
      ], ['copy/export controls when applicable'], ['generated or report output has clear copy/export affordances'], 'low', input.appProfile.evidence)
    )
  }

  if (profile === 'crud_app' || hasCrudSignals(input.sourceGraph)) {
    scenarios.push(
      generatedScenario('crud-list-create-detail', 'CRUD list/create/detail smoke test', ['crud_app', profile], [], [
        step('Open list view', 'open_list_view', ['list/table/cards']),
        step('Find create action', 'find_create_action', ['create/add/new button']),
        step('Find detail action', 'find_detail_action', ['details/view/edit link'])
      ], ['list view', 'create action', 'detail action'], ['CRUD surfaces are discoverable without destructive saving'], 'medium', input.appProfile.evidence)
    )
  }

  if (profile === 'auth_app') {
    scenarios.push(generatedScenario('auth-form-discoverability', 'Login form discoverability', ['auth_app'], [], [
      step('Find login form', 'inspect_login_form', ['email/username field', 'password field', 'sign in button']),
      step('Inspect validation/error area', 'inspect_auth_errors', ['validation or error state'])
    ], ['login form controls'], ['auth form is labelled and communicates errors'], 'medium', input.appProfile.evidence))
  }

  for (const workflow of input.runtimeAppModel?.workflows ?? []) {
    if (/table|list/i.test(workflow.name) && !scenarios.some((scenario) => scenario.id === 'table-list-scan')) {
      scenarios.push(generatedScenario('table-list-scan', 'Table/list scan', [profile], [], [
        step('Find list/table/card content', 'inspect_list_table', ['table, list, feed, cards, or rows']),
        step('Inspect row/action labels', 'inspect_row_actions', ['visible row/card labels and actions'])
      ], ['list/table/card content'], ['list-like content is visible and scan-friendly'], 'medium', workflow.evidence))
    }
    if (/tab/i.test(workflow.name) && !scenarios.some((scenario) => scenario.id === 'tab-switching')) {
      scenarios.push(generatedScenario('tab-switching', 'Tab switching', [profile], [], [
        step('Open tabs', 'open_tabs', ['tab controls']),
        step('Verify tab content', 'verify_tab_content', ['changed or stable tab panel'])
      ], ['tab controls'], ['tabs can be switched without errors'], 'medium', workflow.evidence))
    }
  }

  if (profile === 'docs_site' || profile === 'marketing_site') {
    scenarios.push(generatedScenario('content-link-smoke', 'Content/navigation link smoke test', [profile], [], [
      step('Open header/footer links', 'open_content_links', ['navigation links']),
      step('Inspect search or CTA', 'inspect_search_or_cta', ['search or primary CTA if present'])
    ], ['navigation links'], ['content links and primary actions are reachable'], 'medium', input.appProfile.evidence))
  }

  return dedupeScenarios(scenarios)
}

function snifferDashboardScenarios(selection?: ScenarioPackSelection): GeneratedScenario[] {
  const evidence = selection ? [selection.reason, ...selection.applicability.flatMap((item) => item.negativeEvidence).slice(0, 4)] : []
  return [
    dashboardScenario('sniffer-dashboard-navigation', 'Dashboard navigation smoke test', [
      step('Open dashboard sidebar sections', 'open_sniffer_navigation', ['Summary', 'Projects', 'Run Timeline', 'Scenarios', 'Crawl Path', 'Workflow Evidence', 'Issues', 'Fix Packets', 'Screenshots', 'Graph Explorer', 'Raw JSON', 'Settings'])
    ], ['dashboard sidebar navigation'], ['primary dashboard sections are reachable'], 'high', evidence),
    dashboardScenario('sniffer-project-selector', 'Project selector/add project discoverability', [
      step('Inspect project selector', 'inspect_project_selector', ['Selected Sniffer project', 'Add project']),
      step('Open add project dialog', 'open_add_project_dialog', ['Add project dialog'])
    ], ['project selector', 'Add project'], ['project registration controls are discoverable'], 'medium', evidence),
    dashboardScenario('sniffer-audit-launcher', 'Audit launcher form discoverability', [
      step('Inspect audit launcher form', 'inspect_audit_launcher', ['Repo path', 'App URL', 'Product goal', 'Run Audit', 'Run Consistency Check', 'Generate Fix Packets', 'Open Latest Report'])
    ], ['audit launcher form controls'], ['audit launch controls are visible and labelled'], 'high', evidence),
    dashboardScenario('sniffer-report-sections', 'Report section navigation', [
      step('Open report section tabs', 'open_report_sections', ['Run Timeline', 'Scenarios', 'Crawl Path', 'Workflow Evidence', 'Issues'])
    ], ['report navigation controls'], ['report sections can be opened safely'], 'high', evidence),
    dashboardScenario('sniffer-issues-fix-packets', 'Issue/fix packet browsing', [
      step('Open issues and fix packets', 'open_issues_fixes', ['Issues', 'Fix Packets', 'Copy fix prompt'])
    ], ['Issues', 'Fix Packets'], ['issues and fix packets are browseable'], 'medium', evidence),
    dashboardScenario('sniffer-screenshots-gallery', 'Screenshot gallery browsing', [
      step('Open screenshots view', 'open_screenshots', ['Screenshots'])
    ], ['Screenshots'], ['screenshot evidence page is reachable'], 'medium', evidence),
    dashboardScenario('sniffer-graph-raw-settings', 'Graph, Raw JSON, and Settings availability', [
      step('Open graph/raw/settings views', 'open_graph_raw_settings', ['Graph Explorer', 'Raw JSON', 'Settings'])
    ], ['Graph Explorer', 'Raw JSON', 'Settings'], ['advanced evidence and configuration views are reachable'], 'medium', evidence)
  ]
}

function dashboardScenario(
  id: string,
  name: string,
  steps: ScenarioStep[],
  expectedControls: string[],
  expectedOutcomes: string[],
  confidence: GeneratedScenario['confidence'],
  evidence: string[]
): GeneratedScenario {
  return {
    ...generatedScenario(id, name, ['planning_control_panel'], [], steps, expectedControls, expectedOutcomes, confidence, evidence),
    appSubtype: 'sniffer_dashboard',
    scenarioPack: 'sniffer_dashboard'
  }
}

function generatedScenario(
  id: string,
  name: string,
  profileApplicability: string[],
  prerequisites: string[],
  steps: ScenarioStep[],
  expectedControls: string[],
  expectedOutcomes: string[],
  confidence: GeneratedScenario['confidence'],
  evidence: string[]
): GeneratedScenario {
  return {
    id,
    name,
    profileApplicability: profileApplicability as GeneratedScenario['profileApplicability'],
    prerequisites,
    steps,
    expectedControls,
    expectedOutcomes,
    destructiveRisk: 'none',
    confidence,
    evidence: evidence.slice(0, 10)
  }
}

function step(name: string, action: string, expectedControls: string[]): ScenarioStep {
  return { name, action, expectedControls, safe: true }
}

function formEvidence(sourceGraph: SourceGraph): string[] {
  return [
    ...sourceGraph.forms.map((form) => `Form ${form.name} in ${form.file}`),
    ...sourceGraph.uiSurfaces.flatMap((surface) => surface.relatedInputs.map((input) => `Input "${input}" in ${surface.display_name}`))
  ].slice(0, 10)
}

function planningEvidence(sourceGraph: SourceGraph): string[] {
  return [
    ...sourceGraph.sourceWorkflows.filter((workflow) => /plan|prompt|handoff|workspace|repo|target/i.test(workflow.name)).map((workflow) => `Workflow: ${workflow.name}`),
    ...sourceGraph.uiSurfaces.filter((surface) => /plan|prompt|handoff|workspace|repo|target/i.test(`${surface.surface_type} ${surface.display_name}`)).map((surface) => `Surface: ${surface.display_name}`),
    ...sourceGraph.apiCalls.filter((call) => /plan|prompt|repo|workspace|run/i.test(call.endpoint)).map((call) => `API: ${call.method ?? 'GET'} ${call.endpoint}`)
  ].slice(0, 12)
}

function hasCrudSignals(sourceGraph: SourceGraph): boolean {
  const text = [
    ...sourceGraph.sourceWorkflows.flatMap((workflow) => [workflow.name, ...workflow.likelyUserActions]),
    ...sourceGraph.uiSurfaces.flatMap((surface) => [surface.display_name, ...surface.relatedButtons])
  ].join(' ')
  return /create|edit|delete|save|cancel|detail|list|table|filter|search/i.test(text)
}

function dedupeScenarios(scenarios: GeneratedScenario[]): GeneratedScenario[] {
  const seen = new Set<string>()
  return scenarios.filter((scenario) => {
    if (seen.has(scenario.id)) return false
    seen.add(scenario.id)
    return true
  })
}
