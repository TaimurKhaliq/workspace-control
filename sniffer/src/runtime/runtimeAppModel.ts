import type { AppProfile, AppProfileType, RuntimeActionPlanItem, RuntimeAppModel, RuntimeDomControl, RuntimeDomSnapshot, RuntimeInferredWorkflow, RuntimeLlmIntent, SourceGraph } from '../types.js'

export function buildRuntimeAppModel(input: {
  snapshot: RuntimeDomSnapshot
  sourceGraph?: SourceGraph
  appProfile?: AppProfile
  llmIntent?: RuntimeLlmIntent
}): RuntimeAppModel {
  const runtimeType = inferRuntimeAppType(input.snapshot)
  const appType = chooseAppType(runtimeType, input.appProfile, input.llmIntent)
  const actions = planRuntimeActions(input.snapshot)
  const workflows = [
    ...inferRuntimeWorkflows(input.snapshot, appType),
    ...(input.llmIntent?.workflows ?? []).map((workflow) => ({ ...workflow, source: 'llm' as const }))
  ]
  return {
    app_name: inferAppName(input.snapshot, input.sourceGraph),
    inferred_app_type: appType,
    screens: [{
      name: inferScreenName(input.snapshot),
      url: input.snapshot.url,
      evidence: [
        ...input.snapshot.headings.map(labelOf).filter(Boolean).slice(0, 3),
        input.snapshot.title
      ].filter(Boolean),
      confidence: input.snapshot.headings.length > 0 ? 'medium' : 'low'
    }],
    nav_items: navItems(input.snapshot),
    forms: input.snapshot.forms,
    workflows,
    entities: inferEntities(input.snapshot, input.sourceGraph),
    actions,
    route_candidates: routeCandidates(input.snapshot),
    locator_inventory: input.snapshot.controls.filter((control) => control.locatorCandidates.length > 0),
    confidence: confidenceFor(input.snapshot, workflows),
    evidence: [
      `url:${input.snapshot.url}`,
      `title:${input.snapshot.title}`,
      `runtime_type:${runtimeType}`,
      input.appProfile ? `profile_type:${input.appProfile.profile_type} (${input.appProfile.confidence})` : undefined,
      `headings:${input.snapshot.headings.map(labelOf).filter(Boolean).join(', ') || 'none'}`,
      `forms:${input.snapshot.forms.length}`,
      `buttons:${input.snapshot.buttons.length}`,
      `links:${input.snapshot.links.length}`
    ].filter(Boolean) as string[],
    llmInferredWorkflows: input.llmIntent?.workflows,
    unsafe_actions: actions.filter((action) => !action.safe)
  }
}

function chooseAppType(runtimeType: AppProfileType, appProfile?: AppProfile, llmIntent?: RuntimeLlmIntent): AppProfileType {
  const llmType = normalizeAppType(llmIntent?.app_type)
  if (llmType && llmType !== 'unknown') return llmType
  if (appProfile?.profile_type === 'planning_control_panel' && appProfile.confidence === 'high') return appProfile.profile_type
  if (runtimeType === 'unknown') return appProfile?.profile_type ?? 'unknown'
  return runtimeType
}

export function planRuntimeActions(snapshot: RuntimeDomSnapshot): RuntimeActionPlanItem[] {
  const actions: RuntimeActionPlanItem[] = []
  for (const control of snapshot.controls) {
    const label = labelOf(control)
    if (!label) continue
    if (control.kind === 'link' || control.kind === 'button' || control.kind === 'tab') {
      actions.push({
        action: control.safeAction.safe ? 'click' : 'skip',
        target: label,
        locator: control.locatorCandidates[0],
        safe: control.safeAction.safe,
        reason: control.safeAction.reason,
        expectedStateChange: expectedStateChange(control),
        controlId: control.id,
        priority: priorityFor(control)
      })
    }
    if (['input', 'textarea', 'select'].includes(control.kind)) {
      actions.push({
        action: control.kind === 'select' ? 'select' : 'type',
        target: label,
        locator: control.locatorCandidates[0],
        safe: isSafeFormProbe(control),
        reason: isSafeFormProbe(control) ? 'temporary form exploration is safe in inspection mode' : 'form control may submit real data without test mode',
        expectedStateChange: 'Control accepts temporary value; no submit is attempted.',
        controlId: control.id,
        priority: /search|filter/i.test(label) ? 85 : 45
      })
    }
  }
  return actions.sort((left, right) => right.priority - left.priority)
}

export function buildRuntimeIntentContext(input: {
  snapshot: RuntimeDomSnapshot
  sourceGraph?: SourceGraph
  appProfile?: AppProfile
  project?: { id?: string; name?: string; repoPath?: string; appUrl: string; framework?: string; buildTool?: string; packageName?: string }
}) {
  const actions = planRuntimeActions(input.snapshot)
  return {
    project: {
      id: input.project?.id,
      name: input.project?.name,
      repoPath: input.project?.repoPath ?? input.sourceGraph?.repoPath,
      appUrl: input.project?.appUrl ?? input.snapshot.url,
      framework: input.project?.framework ?? input.sourceGraph?.framework,
      buildTool: input.project?.buildTool ?? input.sourceGraph?.buildTool,
      packageName: input.project?.packageName ?? input.sourceGraph?.packageName
    },
    source_summary: input.sourceGraph ? {
      workflows: input.sourceGraph.sourceWorkflows.slice(0, 16),
      uiSurfaces: input.sourceGraph.uiSurfaces.slice(0, 24),
      apiCalls: input.sourceGraph.apiCalls.slice(0, 24),
      routes: input.sourceGraph.routes.slice(0, 24)
    } : undefined,
    runtime_snapshot: {
      url: input.snapshot.url,
      title: input.snapshot.title,
      headings: input.snapshot.headings.slice(0, 12),
      nav_items: navItems(input.snapshot).slice(0, 24),
      buttons: input.snapshot.buttons.slice(0, 32),
      links: input.snapshot.links.slice(0, 32),
      forms: input.snapshot.forms.slice(0, 12),
      inputs: [...input.snapshot.inputs, ...input.snapshot.selects, ...input.snapshot.textareas].slice(0, 32),
      tables: input.snapshot.tables.slice(0, 12),
      dialogs: input.snapshot.dialogs.slice(0, 8),
      visible_text_blocks: input.snapshot.visibleTextBlocks.slice(0, 24),
      screenshot_path: input.snapshot.screenshotPath
    },
    candidate_actions: actions.slice(0, 40),
    question_for_llm: 'Infer evidence-backed workflows, important controls, safe next actions, unsafe actions, and reliable Playwright locators from this runtime DOM snapshot.'
  }
}

function inferRuntimeWorkflows(snapshot: RuntimeDomSnapshot, appType: AppProfileType): RuntimeInferredWorkflow[] {
  const workflows: RuntimeInferredWorkflow[] = []
  if (navItems(snapshot).length > 0) {
    workflows.push(workflow('Navigation smoke test', 'runtime', ['primary navigation/link controls visible'], navItems(snapshot).slice(0, 6).map((item) => clickStep(item, 'Navigate without errors.'))))
  }
  if (snapshot.forms.length > 0) {
    workflows.push(workflow(appType === 'auth_app' ? 'Login form discoverability' : 'Forms discoverability', 'runtime', snapshot.forms.map((form) => `form:${form.name ?? form.id}`), snapshot.forms.flatMap((form) => form.controls.slice(0, 4).map((control) => assertStep(control)))))
  }
  if (snapshot.tables.length > 0 || /table|list|article|feed/i.test(snapshot.domText)) {
    workflows.push(workflow('Table/list scan', 'runtime', ['table/list text visible'], [], 'medium'))
  }
  if (snapshot.tabs.length > 0) {
    workflows.push(workflow('Tab switching', 'runtime', snapshot.tabs.map(labelOf).filter(Boolean), snapshot.tabs.slice(0, 8).map((tab) => clickStep(tab, 'Tab content changes or remains stable without errors.'))))
  }
  const search = snapshot.controls.find((control) => /search|filter/i.test(labelOf(control)))
  if (search) workflows.push(workflow('Search/filter', 'runtime', [labelOf(search)], [assertStep(search)], 'medium'))
  const dialogs = snapshot.buttons.filter((button) => /add|new|create|open/i.test(labelOf(button)) && button.safeAction.safe)
  if (dialogs.length > 0) workflows.push(workflow('Modal/open action smoke test', 'runtime', dialogs.map(labelOf), dialogs.slice(0, 4).map((button) => clickStep(button, 'Dialog or related UI appears without destructive submit.')), 'medium'))
  return workflows
}

function workflow(name: string, source: RuntimeInferredWorkflow['source'], evidence: string[], steps: RuntimeInferredWorkflow['steps'], confidence: RuntimeInferredWorkflow['confidence'] = 'medium'): RuntimeInferredWorkflow {
  return { name, confidence, evidence, steps, source }
}

function clickStep(control: RuntimeDomControl, expected: string) {
  const locator = control.locatorCandidates[0]
  return {
    action: 'click' as const,
    target_name: labelOf(control),
    locator_strategy: locator?.strategy ?? 'text' as const,
    locator_value: locator?.value ?? labelOf(control),
    safe: control.safeAction.safe,
    expected_result: expected,
    confidence: locator?.confidence && locator.confidence > 0.8 ? 'high' as const : 'medium' as const,
    evidence: [labelOf(control)]
  }
}

function assertStep(control: RuntimeDomControl) {
  const locator = control.locatorCandidates[0]
  return {
    action: 'assert' as const,
    target_name: labelOf(control),
    locator_strategy: locator?.strategy ?? 'text' as const,
    locator_value: locator?.value ?? labelOf(control),
    safe: true,
    expected_result: 'Control is visible and has an accessible locator.',
    confidence: locator?.confidence && locator.confidence > 0.8 ? 'high' as const : 'medium' as const,
    evidence: [labelOf(control)]
  }
}

function inferRuntimeAppType(snapshot: RuntimeDomSnapshot): AppProfileType {
  const text = `${snapshot.title} ${snapshot.domText}`.toLowerCase()
  if (/sign in|log in|password|email/.test(text) && snapshot.forms.length > 0) return 'auth_app'
  if (/cart|checkout|product|price|order/.test(text)) return 'ecommerce_app'
  if (/docs|documentation|guide|api reference/.test(text)) return 'docs_site'
  if (/pricing|contact|hero|testimonial|demo/.test(text)) return 'marketing_site'
  if (/dashboard|metric|analytics|chart|report/.test(text)) return 'dashboard_app'
  if (snapshot.forms.length > 0 || snapshot.tables.length > 0 || /edit|delete|create|article|list|feed/.test(text)) return 'crud_app'
  if (/admin|settings|users|roles|permissions/.test(text)) return 'admin_console'
  return 'unknown'
}

function normalizeAppType(value: unknown): AppProfileType | undefined {
  const allowed: AppProfileType[] = ['planning_control_panel', 'admin_console', 'dashboard_app', 'crud_app', 'ecommerce_app', 'docs_site', 'marketing_site', 'auth_app', 'unknown']
  return typeof value === 'string' && allowed.includes(value as AppProfileType) ? value as AppProfileType : undefined
}

function inferAppName(snapshot: RuntimeDomSnapshot, sourceGraph?: SourceGraph): string {
  return snapshot.headings.map(labelOf).find(Boolean) ?? sourceGraph?.packageName ?? snapshot.title ?? 'Runtime app'
}

function inferScreenName(snapshot: RuntimeDomSnapshot): string {
  return snapshot.headings.map(labelOf).find(Boolean) ?? snapshot.title ?? (new URL(snapshot.url).pathname || 'Runtime screen')
}

function navItems(snapshot: RuntimeDomSnapshot): RuntimeDomControl[] {
  const landmarkNavText = snapshot.landmarks.filter((item) => item.role === 'navigation' || item.tagName === 'nav').map((item) => item.visibleText).join(' ')
  if (!landmarkNavText) return snapshot.links.slice(0, 12)
  return snapshot.links.filter((link) => landmarkNavText.includes(link.visibleText ?? link.accessibleName ?? '')).slice(0, 24)
}

function routeCandidates(snapshot: RuntimeDomSnapshot): string[] {
  return [...new Set(snapshot.links.map((link) => link.href).filter((href): href is string => Boolean(href)).map((href) => {
    try {
      const url = new URL(href)
      return url.hash || url.pathname || '/'
    } catch {
      return href
    }
  }))]
}

function inferEntities(snapshot: RuntimeDomSnapshot, sourceGraph?: SourceGraph): string[] {
  const text = `${snapshot.title} ${snapshot.domText} ${sourceGraph?.packageName ?? ''}`.toLowerCase()
  const entities = ['user', 'article', 'profile', 'tag', 'comment', 'product', 'order', 'report', 'dashboard', 'setting', 'document']
  return entities.filter((entity) => text.includes(entity)).slice(0, 12)
}

function confidenceFor(snapshot: RuntimeDomSnapshot, workflows: RuntimeInferredWorkflow[]): RuntimeAppModel['confidence'] {
  if (workflows.length >= 3 && snapshot.controls.length >= 8) return 'high'
  if (workflows.length >= 1 || snapshot.controls.length >= 4) return 'medium'
  return 'low'
}

function labelOf(control: RuntimeDomControl): string {
  return (control.accessibleName ?? control.visibleText ?? control.labelText ?? control.placeholder ?? control.dataTestId ?? control.href ?? control.id).replace(/\s+/g, ' ').trim()
}

function expectedStateChange(control: RuntimeDomControl): string {
  if (control.kind === 'link') return 'URL or route changes.'
  if (control.kind === 'tab') return 'Selected tab/content changes.'
  if (/open|add|new|create|details|view/i.test(labelOf(control))) return 'Dialog, details, or related screen appears.'
  if (/copy/i.test(labelOf(control))) return 'Clipboard action completes without visible error.'
  return 'UI changes or remains stable without console/network errors.'
}

function priorityFor(control: RuntimeDomControl): number {
  const label = labelOf(control)
  let priority = 10
  if (control.kind === 'link') priority += 80
  if (control.kind === 'tab') priority += 65
  if (/search|filter/i.test(label)) priority += 45
  if (/add|new|create|details|view|open/i.test(label)) priority += 40
  if (/copy|download|export/i.test(label)) priority += 25
  if (!control.safeAction.safe) priority -= 200
  return priority
}

function isSafeFormProbe(control: RuntimeDomControl): boolean {
  const label = labelOf(control)
  return /search|filter|query|email|username|name|title|description|body|comment/i.test(label)
}
