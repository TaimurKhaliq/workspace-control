import path from 'node:path'
import type { ApiCall, SourceWorkflow, StateActionHints, UiSurface, UiSurfaceType } from '../types.js'

type FileContent = readonly [string, string]

interface FileSignals {
  file: string
  headings: string[]
  buttons: string[]
  links: string[]
  tabs: string[]
  labels: string[]
  placeholders: string[]
  selectOptions: string[]
  ariaLabels: string[]
  testIds: string[]
  roles: string[]
  visibleText: string[]
  stateHints: StateActionHints
  apiCalls: ApiCall[]
}

interface SurfacePattern {
  type: UiSurfaceType
  displayName: string
  terms: string[]
  buttonTerms?: string[]
  inputTerms?: string[]
  minConfidence: number
}

const surfacePatterns: SurfacePattern[] = [
  { type: 'app_shell', displayName: 'App shell', terms: ['StackPilot', 'Control Plane', 'Primary navigation', 'Workspaces', 'Repositories'], minConfidence: 0.65 },
  { type: 'workspace_selector', displayName: 'Workspace selector/creation', terms: ['Workspace', 'Select workspace', 'New workspace', 'Create workspace', 'workspaceName', 'createWorkspace', 'onCreateWorkspace'], buttonTerms: ['New workspace', 'Create workspace'], inputTerms: ['Workspace name'], minConfidence: 0.7 },
  { type: 'workspace_list', displayName: 'Workspace list', terms: ['workspace-list', 'workspaces.map', 'Create a workspace to begin', 'selectedWorkspaceId'], minConfidence: 0.6 },
  { type: 'repo_list', displayName: 'Repo management', terms: ['Repositories', 'Discovery targets', 'Registered repository targets', 'Add repo', 'Discover', 'Refresh learning', 'repo-table'], buttonTerms: ['Add repo', 'Discover', 'Refresh learning', 'View details'], minConfidence: 0.7 },
  { type: 'add_repo_form', displayName: 'Add repo form', terms: ['Add repository', 'target_id', 'repoTargetId', 'source_type', 'locator', 'onAddRepo', 'Add repo', 'Repository target id'], buttonTerms: ['Add repository', 'Add repo'], inputTerms: ['target id', 'locator', 'repository'], minConfidence: 0.55 },
  { type: 'repo_validation_panel', displayName: 'Repo validation panel', terms: ['validateRepoTarget', 'repoValidation', 'detected_frameworks', 'detected_repo_type', 'warnings', 'suggested_root_path'], minConfidence: 0.65 },
  { type: 'prompt_composer', displayName: 'Prompt composer', terms: ['Prompt', 'featureRequest', 'Feature request', 'Plan Runs', 'onGeneratePlan', 'textarea'], buttonTerms: ['Generate', 'Generate plan', 'Generate Plan Bundle'], inputTerms: ['feature request', 'prompt'], minConfidence: 0.7 },
  { type: 'generate_plan_action', displayName: 'Generate plan bundle action', terms: ['generatePlanBundle', 'Generating Plan Bundle', 'onGeneratePlan', 'Generate plan', 'Plan Bundle'], buttonTerms: ['Generate', 'Generate Plan Bundle'], minConfidence: 0.75 },
  { type: 'plan_bundle_view', displayName: 'Plan bundle renderer', terms: ['PlanBundleView', 'planBundle', 'activePlanTab', 'overview', 'changes', 'recipes', 'graph', 'validation', 'handoff', 'json'], minConfidence: 0.75 },
  { type: 'change_set_table', displayName: 'Change set table', terms: ['recommended_change_set', 'Change set', 'selectedChange', 'sourceFilter', 'actionFilter', 'sectionFilter'], minConfidence: 0.65 },
  { type: 'recipe_panel', displayName: 'Recipe panel', terms: ['matched_recipes', 'recipes', 'recipeCounts', 'Learned recipes'], minConfidence: 0.65 },
  { type: 'graph_evidence_panel', displayName: 'Graph evidence panel', terms: ['source_graph_evidence', 'Graph evidence', 'graph', 'Evidence'], minConfidence: 0.65 },
  { type: 'validation_panel', displayName: 'Validation panel', terms: ['validation', 'commands', 'risks_and_caveats', 'Validation'], minConfidence: 0.65 },
  { type: 'handoff_prompt_panel', displayName: 'Handoff prompt copy area', terms: ['handoff_prompts', 'Handoff', 'prompt', 'copy'], buttonTerms: ['Copy'], minConfidence: 0.65 },
  { type: 'raw_json_panel', displayName: 'Raw JSON view', terms: ['Raw JSON', 'JSON', 'json', 'debug'], minConfidence: 0.6 },
  { type: 'copy_action', displayName: 'Copy action', terms: ['navigator.clipboard', 'Copy', 'copy'], buttonTerms: ['Copy'], minConfidence: 0.65 }
]

const workflowPatterns = [
  {
    name: 'Create/select workspace',
    terms: ['Workspace', 'Select workspace', 'New workspace', 'Create workspace', 'createWorkspace', 'onCreateWorkspace'],
    actions: ['Open workspace creation', 'Enter workspace name', 'Create workspace', 'Select workspace']
  },
  {
    name: 'Add repo',
    terms: ['Add repo', 'Add repository', 'repoTargetId', 'sourceType', 'locator', 'addRepo', 'onAddRepo'],
    actions: ['Open add repository form', 'Enter target id and locator', 'Submit repository']
  },
  {
    name: 'Validate repo path',
    terms: ['validateRepoTarget', 'repoValidation', 'suggested_root_path', 'detected_frameworks', 'warnings'],
    actions: ['Enter repo locator', 'Review validation status', 'Use suggested root if available']
  },
  {
    name: 'Refresh discovery',
    terms: ['discoverRepo', 'onDiscover', 'Discovering repo', 'Discover'],
    actions: ['Select repository', 'Run discovery', 'Review discovered status']
  },
  {
    name: 'Refresh learning',
    terms: ['refreshLearning', 'learningStatus', 'Refresh learning', 'Learned recipes'],
    actions: ['Select repository', 'Refresh learning', 'Review recipe count']
  },
  {
    name: 'Generate plan bundle',
    terms: ['generatePlanBundle', 'featureRequest', 'onGeneratePlan', 'Generating Plan Bundle', 'Plan Bundle'],
    actions: ['Write feature request', 'Select target repository', 'Generate Plan Bundle']
  },
  {
    name: 'View plan bundle tabs',
    terms: ['activePlanTab', 'overview', 'changes', 'recipes', 'graph', 'validation', 'handoff', 'json'],
    actions: ['Open generated plan bundle', 'Switch between plan tabs', 'Inspect each plan section']
  },
  {
    name: 'Copy handoff prompt',
    terms: ['handoff_prompts', 'Handoff', 'Copy', 'navigator.clipboard'],
    actions: ['Open handoff tab', 'Copy handoff prompt']
  },
  {
    name: 'Inspect raw JSON',
    terms: ['Raw JSON', 'JSON', 'json', 'debug'],
    actions: ['Open JSON tab', 'Inspect raw plan bundle payload']
  }
]

export function discoverReactUi(repoPath: string, files: readonly FileContent[]): {
  uiSurfaces: UiSurface[]
  sourceWorkflows: SourceWorkflow[]
  apiCalls: ApiCall[]
  stateActions: StateActionHints[]
} {
  const jsxFiles = files.filter(([file]) => ['.tsx', '.jsx'].includes(path.extname(file)))
  const allFiles = files.filter(([file]) => ['.ts', '.tsx', '.js', '.jsx'].includes(path.extname(file)))
  const signals = jsxFiles.map(([file, content]) => collectFileSignals(repoPath, file, content))
  const apiCalls = allFiles.flatMap(([file, content]) => discoverApiCalls(repoPath, file, content))
  const stateActions = allFiles
    .map(([file, content]) => discoverStateActions(repoPath, file, content))
    .filter((hint) => hint.stateVariables.length || hint.handlerNames.length || hint.submitHandlers.length)

  return {
    uiSurfaces: discoverUiSurfaces(signals),
    sourceWorkflows: inferSourceWorkflows(signals, apiCalls),
    apiCalls,
    stateActions
  }
}

function collectFileSignals(repoPath: string, file: string, content: string): FileSignals {
  const relative = path.relative(repoPath, file)
  return {
    file: relative,
    headings: jsxTagText(content, ['h1', 'h2', 'h3', 'h4']),
    buttons: discoverButtonText(content),
    links: jsxTagText(content, ['a']),
    tabs: discoverTabs(content),
    labels: jsxTagText(content, ['label']),
    placeholders: attrValues(content, 'placeholder'),
    selectOptions: jsxTagText(content, ['option']),
    ariaLabels: attrValues(content, 'aria-label'),
    testIds: attrValues(content, 'data-testid'),
    roles: attrValues(content, 'role'),
    visibleText: discoverVisibleText(content),
    stateHints: discoverStateActions(repoPath, file, content),
    apiCalls: discoverApiCalls(repoPath, file, content)
  }
}

function discoverUiSurfaces(files: FileSignals[]): UiSurface[] {
  const surfaces: UiSurface[] = []
  for (const signals of files) {
    const haystack = signalHaystack(signals)
    for (const pattern of surfacePatterns) {
      const matchedTerms = pattern.terms.filter((term) => includesLoose(haystack, term))
      const relatedButtons = signals.buttons.filter((button) => matchesAny(button, pattern.buttonTerms ?? pattern.terms))
      const relatedInputs = [...signals.labels, ...signals.placeholders, ...signals.selectOptions]
        .filter((input) => matchesAny(input, pattern.inputTerms ?? pattern.terms))
      const confidence = Math.min(0.95, (matchedTerms.length / Math.max(pattern.terms.length, 1)) + (relatedButtons.length ? 0.15 : 0) + (relatedInputs.length ? 0.1 : 0))
      if (confidence >= pattern.minConfidence || matchedTerms.length >= 3) {
        surfaces.push({
          file: signals.file,
          surface_type: pattern.type,
          display_name: pattern.displayName,
          evidence: unique([...matchedTerms, ...relatedButtons, ...relatedInputs]).slice(0, 12),
          relatedButtons: unique(relatedButtons).slice(0, 10),
          relatedInputs: unique(relatedInputs).slice(0, 10),
          confidence: roundConfidence(confidence)
        })
      }
    }

    const knownEvidence = new Set(surfaces.filter((surface) => surface.file === signals.file).flatMap((surface) => surface.evidence))
    for (const heading of signals.headings.filter((heading) => !knownEvidence.has(heading)).slice(0, 6)) {
      surfaces.push({
        file: signals.file,
        surface_type: 'unknown_ui_section',
        display_name: heading,
        evidence: [heading],
        relatedButtons: signals.buttons.slice(0, 5),
        relatedInputs: [...signals.labels, ...signals.placeholders].slice(0, 5),
        confidence: 0.45
      })
    }
  }

  return dedupeSurfaces(surfaces)
}

function inferSourceWorkflows(files: FileSignals[], apiCalls: ApiCall[]): SourceWorkflow[] {
  const workflows: SourceWorkflow[] = []
  for (const pattern of workflowPatterns) {
    const sourceFiles = new Set<string>()
    const evidence: string[] = []
    for (const signals of files) {
      const haystack = signalHaystack(signals)
      const matches = pattern.terms.filter((term) => includesLoose(haystack, term))
      if (matches.length > 0) {
        sourceFiles.add(signals.file)
        evidence.push(...matches)
      }
    }
    const matchingApi = apiCalls.filter((call) => call.likelyWorkflow === pattern.name)
    matchingApi.forEach((call) => {
      sourceFiles.add(call.sourceFile)
      evidence.push(`${call.method ?? 'GET'} ${call.endpoint}`)
    })
    const confidence = Math.min(0.95, unique(evidence).length / Math.max(pattern.terms.length, 1))
    if (sourceFiles.size > 0 && confidence >= 0.2) {
      workflows.push({
        name: pattern.name,
        sourceFiles: [...sourceFiles].sort(),
        evidence: unique(evidence).slice(0, 12),
        likelyUserActions: pattern.actions,
        confidence: roundConfidence(confidence)
      })
    }
  }
  return workflows
}

function discoverApiCalls(repoPath: string, file: string, content: string): ApiCall[] {
  const relative = path.relative(repoPath, file)
  const calls: ApiCall[] = []
  const functionBlocks = [...content.matchAll(/export\s+function\s+(\w+)\s*\([^)]*\)\s*\{([\s\S]*?)(?=\nexport\s+function|\nconst\s+\w+|\nasync\s+function|$)/g)]
  for (const block of functionBlocks) {
    calls.push(...endpointStrings(block[2]).map((endpoint) => ({
      endpoint,
      sourceFile: relative,
      functionName: block[1],
      method: inferMethod(block[2]),
      likelyWorkflow: inferWorkflowForApi(block[1], endpoint)
    })))
  }

  for (const match of content.matchAll(/fetch\(\s*([`'"])(.+?)\1([\s\S]{0,180})\)/g)) {
    if (calls.some((call) => call.endpoint === match[2])) continue
    calls.push({
      endpoint: match[2],
      sourceFile: relative,
      method: inferMethod(match[3]),
      likelyWorkflow: inferWorkflowForApi(undefined, match[2])
    })
  }

  for (const endpoint of endpointStrings(content)) {
    if (calls.some((call) => call.endpoint === endpoint)) continue
    calls.push({
      endpoint,
      sourceFile: relative,
      method: inferMethod(near(content, endpoint)),
      likelyWorkflow: inferWorkflowForApi(undefined, endpoint)
    })
  }

  return dedupeApiCalls(calls.filter((call) => call.endpoint.includes('/api/')))
}

function discoverStateActions(repoPath: string, file: string, content: string): StateActionHints {
  const stateVariables = [...content.matchAll(/const\s*\[\s*(\w+)\s*,\s*set\w+\s*\]\s*=\s*useState/g)].map((match) => match[1])
  const functionHandlers = [...content.matchAll(/(?:async\s+)?function\s+((?:handle|on|create|add|refresh|generate|discover|validate|copy|submit|open|close|pick)\w*)\s*\(/gi)].map((match) => match[1])
  const constHandlers = [...content.matchAll(/const\s+((?:handle|on|create|add|refresh|generate|discover|validate|copy|submit|open|close|pick)\w*)\s*=/gi)].map((match) => match[1])
  const handlerNames = unique([...functionHandlers, ...constHandlers])
  return {
    file: path.relative(repoPath, file),
    stateVariables: unique(stateVariables),
    handlerNames,
    submitHandlers: handlerNames.filter((name) => /submit|create|add|generate/i.test(name)),
    loadingStateVariables: stateVariables.filter((name) => /busy|loading|pending|saving|submitting/i.test(name)),
    errorStateVariables: stateVariables.filter((name) => /error|warning|invalid/i.test(name))
  }
}

function jsxTagText(content: string, tags: string[]): string[] {
  return unique(tags.flatMap((tag) =>
    [...content.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))]
      .map((match) => cleanText(match[1]))
      .filter((text) => Boolean(text) && isHumanText(text))
  ))
}

function discoverButtonText(content: string): string[] {
  const direct = jsxTagText(content, ['button'])
  const title = [...content.matchAll(/<button\b[^>]*\btitle=["']([^"']+)["'][^>]*>/gi)].map((match) => cleanText(match[1]))
  return unique([...direct, ...title].filter(isHumanText))
}

function discoverTabs(content: string): string[] {
  const roleTabs = [...content.matchAll(/<[^>]+\brole=["']tab["'][^>]*>([\s\S]*?)<\/[^>]+>/gi)].map((match) => cleanText(match[1]))
  const planTabLabels = [...content.matchAll(/['"](overview|changes|recipes|graph|validation|handoff|json)['"]/gi)].map((match) => match[1])
  return unique([...roleTabs, ...planTabLabels].filter(Boolean))
}

function discoverVisibleText(content: string): string[] {
  const jsxText = [...content.matchAll(/>\s*([^<>{}\n][^<>{}]*)\s*</g)]
    .map((match) => cleanText(match[1]))
    .filter((text) => text.length >= 3 && isHumanText(text))
  const stringLiterals = [...content.matchAll(/['"`]([^'"`{}<>]*(?:workspace|repo|repository|prompt|plan|bundle|copy|json|validation|learning|discover|settings|target|graph|handoff)[^'"`{}<>]*)['"`]/gi)]
    .map((match) => cleanText(match[1]))
    .filter((text) => text.length >= 3 && !text.startsWith('/api/') && isHumanText(text))
  return unique([...jsxText, ...stringLiterals]).slice(0, 200)
}

function attrValues(content: string, attr: string): string[] {
  return unique([...content.matchAll(new RegExp(`\\b${attr}=["']([^"']+)["']`, 'gi'))].map((match) => cleanText(match[1])).filter(Boolean))
}

function endpointStrings(content: string): string[] {
  return unique([
    ...[...content.matchAll(/['"`]([^'"`]*\/api\/[^'"`]*)['"`]/g)].map((match) => match[1]),
    ...[...content.matchAll(/request<[^>]+>\(([`'"])(.+?)\1/g)].map((match) => match[2]),
    ...[...content.matchAll(/request\(([`'"])(.+?)\1/g)].map((match) => match[2])
  ].filter(Boolean))
}

function inferMethod(content: string): string | undefined {
  return content.match(/method:\s*['"`]([A-Z]+)['"`]/)?.[1] ?? (content.includes('body:') ? 'POST' : undefined)
}

function inferWorkflowForApi(functionName: string | undefined, endpoint: string): string | undefined {
  const text = `${functionName ?? ''} ${endpoint}`.toLowerCase()
  if (text.includes('workspaces') && !text.includes('repos') && !text.includes('plan-bundles')) return 'Create/select workspace'
  if (text.includes('validate-target')) return 'Validate repo path'
  if (text.includes('discover')) return 'Refresh discovery'
  if (text.includes('learning')) return 'Refresh learning'
  if (text.includes('plan-bundles')) return 'Generate plan bundle'
  if (text.includes('repos')) return 'Add repo'
  if (text.includes('semantic')) return 'Generate plan bundle'
  return undefined
}

function signalHaystack(signals: FileSignals): string {
  return [
    signals.file,
    ...signals.headings,
    ...signals.buttons,
    ...signals.links,
    ...signals.tabs,
    ...signals.labels,
    ...signals.placeholders,
    ...signals.selectOptions,
    ...signals.ariaLabels,
    ...signals.testIds,
    ...signals.roles,
    ...signals.visibleText,
    ...signals.stateHints.stateVariables,
    ...signals.stateHints.handlerNames,
    ...signals.apiCalls.map((call) => `${call.functionName ?? ''} ${call.method ?? ''} ${call.endpoint}`)
  ].join('\n')
}

function cleanText(value: string): string {
  const withoutInlineHandlerFragment = value.includes('}>') ? value.slice(value.lastIndexOf('}>') + 2) : value
  return withoutInlineHandlerFragment
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isHumanText(value: string): boolean {
  return /[A-Za-z]/.test(value) && !/\w+\([^)]*\)/.test(value) && !/[{}]/.test(value)
}

function includesLoose(value: string, term: string): boolean {
  return value.toLowerCase().includes(term.toLowerCase())
}

function matchesAny(value: string, terms: string[]): boolean {
  return terms.some((term) => includesLoose(value, term) || includesLoose(term, value))
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100
}

function dedupeSurfaces(surfaces: UiSurface[]): UiSurface[] {
  const byKey = new Map<string, UiSurface>()
  for (const surface of surfaces.sort((a, b) => b.confidence - a.confidence)) {
    const key = `${surface.file}:${surface.surface_type}`
    if (!byKey.has(key)) byKey.set(key, surface)
  }
  return [...byKey.values()].sort((a, b) => a.file.localeCompare(b.file) || b.confidence - a.confidence)
}

function dedupeApiCalls(calls: ApiCall[]): ApiCall[] {
  const byKey = new Map<string, ApiCall>()
  for (const call of calls) {
    const key = `${call.sourceFile}:${call.functionName ?? ''}:${call.method ?? ''}:${call.endpoint}`
    if (!byKey.has(key)) byKey.set(key, call)
  }
  return [...byKey.values()].sort((a, b) => a.sourceFile.localeCompare(b.sourceFile) || a.endpoint.localeCompare(b.endpoint))
}

function near(content: string, needle: string): string {
  const index = content.indexOf(needle)
  if (index < 0) return ''
  return content.slice(Math.max(0, index - 160), index + needle.length + 220)
}
