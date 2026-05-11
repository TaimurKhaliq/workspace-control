import path from 'node:path'
import type {
  ApiCall,
  EvidenceFact,
  EvidenceInference,
  SourceGraph,
  SourceInventory,
  SourceInventoryFile,
  UIIntentEdge,
  UIIntentGraph,
  UIIntentNode
} from '../types.js'
import type { SourceFileContent } from '../discovery/adapters/types.js'

interface NormalizedControlFact {
  kind: 'form_control' | 'action_control'
  label: string
  controlType: 'input' | 'textarea' | 'select' | 'checkbox' | 'button' | 'unknown'
  handler?: string
  ariaDescribedBy?: string
  placeholder?: string
  testId?: string
  options?: string[]
  safeActionHint?: boolean
  filePath: string
  rawText: string
}

export function buildSourceInventory(input: {
  repoPath: string
  packageJson: Record<string, unknown>
  files: SourceFileContent[]
  sourceGraph: SourceGraph
}): SourceInventory {
  const facts: EvidenceFact[] = []
  const addFact = factFactory(facts)
  const inventoryFiles: SourceInventoryFile[] = input.files.map((file) => {
    const fact = addFact({
      kind: 'source_file',
      value: file.relative,
      source: 'source_inventory',
      filePath: file.relative,
      snippet: firstMeaningfulLine(file.content),
      confidence: 1,
      extractionMethod: 'deterministic'
    })
    return {
      path: file.relative,
      extension: path.extname(file.relative),
      moduleName: moduleName(file.relative),
      evidenceIds: [fact.id]
    }
  })

  const packageName = typeof input.packageJson.name === 'string' ? input.packageJson.name : undefined
  if (packageName) {
    addFact({ kind: 'package_name', value: packageName, source: 'package.json', confidence: 1, extractionMethod: 'deterministic' })
  }
  addFact({ kind: 'framework_signal', value: input.sourceGraph.framework, source: 'source_discovery', confidence: input.sourceGraph.framework === 'unknown' ? 0.3 : 0.9, extractionMethod: 'deterministic' })
  addFact({ kind: 'build_tool_signal', value: input.sourceGraph.buildTool, source: 'source_discovery', confidence: input.sourceGraph.buildTool === 'unknown' ? 0.3 : 0.9, extractionMethod: 'deterministic' })

  for (const [name, command] of Object.entries(input.sourceGraph.packageScripts)) {
    addFact({ kind: 'package_script', value: `${name}: ${command}`, source: 'package.json', symbol: name, confidence: 1, extractionMethod: 'deterministic' })
  }
  for (const route of input.sourceGraph.routes) {
    addFact({ kind: 'route', value: route.path, source: route.source, filePath: route.file, snippet: evidenceSnippet(route.evidence), confidence: route.confidence ?? 0.8, extractionMethod: 'deterministic' })
  }
  for (const page of input.sourceGraph.pages) {
    addFact({ kind: 'page', value: page.name, source: 'source_discovery', filePath: page.file, snippet: evidenceSnippet(page.evidence), confidence: page.confidence ?? 0.7, extractionMethod: 'deterministic' })
  }
  for (const component of input.sourceGraph.components) {
    addFact({ kind: 'component', value: component.name, source: 'source_discovery', filePath: component.file, snippet: evidenceSnippet(component.evidence), confidence: component.confidence ?? 0.7, extractionMethod: 'deterministic' })
  }
  for (const form of input.sourceGraph.forms) {
    addFact({ kind: 'form', value: form.name, source: 'source_discovery', filePath: form.file, snippet: form.inputs.map(cleanControlText).filter(Boolean).join(', '), confidence: form.confidence ?? 0.75, extractionMethod: 'deterministic' })
  }
  for (const file of input.files) {
    for (const control of extractNormalizedControls(file)) {
      addFact({
        kind: control.kind,
        value: control.label,
        label: control.label,
        controlType: control.controlType,
        handler: control.handler,
        ariaDescribedBy: control.ariaDescribedBy,
        placeholder: control.placeholder,
        testId: control.testId,
        options: control.options,
        safeActionHint: control.safeActionHint,
        rawText: control.rawText,
        source: 'source_inventory',
        filePath: control.filePath,
        symbol: componentSymbol(file.relative),
        snippet: control.rawText.slice(0, 240),
        confidence: control.kind === 'action_control' ? 0.85 : 0.8,
        extractionMethod: 'deterministic'
      })
    }
    for (const asset of extractStaticAssetReferences(file)) {
      addFact({
        kind: 'static_asset_reference',
        value: asset,
        source: 'source_inventory',
        filePath: file.relative,
        snippet: asset,
        confidence: 0.9,
        extractionMethod: 'deterministic'
      })
    }
  }
  for (const surface of input.sourceGraph.uiSurfaces) {
    addFact({ kind: 'ui_surface_label', value: surface.display_name, source: 'source_discovery', filePath: surface.file, snippet: evidenceSnippet(surface.evidence), confidence: surface.confidence, extractionMethod: 'heuristic' })
    for (const button of surface.relatedButtons) {
      addFact({ kind: 'button_label', value: button, source: 'source_discovery', filePath: surface.file, symbol: surface.display_name, confidence: surface.confidence, extractionMethod: 'deterministic' })
    }
    for (const inputName of surface.relatedInputs) {
      addFact({ kind: 'input_label', value: inputName, source: 'source_discovery', filePath: surface.file, symbol: surface.display_name, confidence: surface.confidence, extractionMethod: 'deterministic' })
    }
  }
  for (const workflow of input.sourceGraph.sourceWorkflows) {
    addFact({ kind: 'workflow_signal', value: workflow.name, source: 'source_discovery', filePath: workflow.sourceFiles[0], snippet: evidenceSnippet(workflow.evidence), confidence: workflow.confidence, extractionMethod: 'heuristic' })
    for (const action of workflow.likelyUserActions) {
      addFact({ kind: 'user_action_signal', value: action, source: 'source_discovery', filePath: workflow.sourceFiles[0], symbol: workflow.name, confidence: workflow.confidence, extractionMethod: 'heuristic' })
    }
  }
  for (const call of input.sourceGraph.apiCalls) {
    if (isStaticAssetReference(call.endpoint)) continue
    addFact({ kind: 'api_call', value: formatApiCall(call), source: 'source_discovery', filePath: call.sourceFile, symbol: call.functionName, snippet: evidenceSnippet(call.evidence), confidence: call.confidence ?? 0.85, extractionMethod: 'deterministic' })
  }
  for (const state of input.sourceGraph.stateActions) {
    for (const name of state.stateVariables) {
      addFact({ kind: 'state_variable', value: name, source: 'source_discovery', filePath: state.file, confidence: state.confidence ?? 0.8, extractionMethod: 'deterministic' })
    }
    for (const name of state.handlerNames) {
      addFact({ kind: 'handler', value: name, source: 'source_discovery', filePath: state.file, confidence: state.confidence ?? 0.8, extractionMethod: 'deterministic' })
    }
    for (const name of state.submitHandlers) {
      addFact({ kind: 'submit_handler', value: name, source: 'source_discovery', filePath: state.file, confidence: state.confidence ?? 0.8, extractionMethod: 'deterministic' })
    }
  }

  return {
    files: inventoryFiles,
    modules: unique(inventoryFiles.map((file) => file.moduleName).filter(Boolean) as string[]),
    frameworkSignals: facts.filter((fact) => fact.kind === 'framework_signal'),
    packageBuildSignals: facts.filter((fact) => fact.kind === 'package_name' || fact.kind === 'build_tool_signal' || fact.kind === 'package_script'),
    rawExtractedSymbols: facts.filter((fact) => ['component', 'page', 'state_variable', 'handler', 'submit_handler'].includes(fact.kind)),
    rawRoutes: facts.filter((fact) => fact.kind === 'route'),
    rawTemplates: facts.filter((fact) => ['ui_surface_label', 'button_label', 'input_label', 'form_control', 'action_control', 'static_asset_reference'].includes(fact.kind)),
    rawHandlers: facts.filter((fact) => fact.kind === 'handler' || fact.kind === 'submit_handler'),
    rawApiCalls: facts.filter((fact) => fact.kind === 'api_call'),
    provenance: facts.filter((fact) => fact.filePath || fact.source === 'package.json'),
    facts,
    generatedAt: input.sourceGraph.generatedAt
  }
}

export function buildUIIntentGraph(sourceGraph: SourceGraph, inventory: SourceInventory = sourceGraph.sourceInventory ?? emptyInventory()): UIIntentGraph {
  const nodes: UIIntentNode[] = []
  const edges: UIIntentEdge[] = []
  const inferences: EvidenceInference[] = []
  const addNode = nodeFactory(nodes)
  const addEdge = edgeFactory(edges)
  const factIndex = factLookup(inventory.facts)

  for (const surface of sourceGraph.uiSurfaces) {
    const evidenceIds = evidenceForSurface(surface.file, [surface.display_name, ...surface.evidence, ...surface.relatedButtons, ...surface.relatedInputs], factIndex)
    addNode({
      kind: 'surface',
      label: surface.display_name,
      filePath: surface.file,
      confidence: surface.confidence,
      evidenceIds,
      extractionMethod: 'heuristic',
      metadata: { surface_type: surface.surface_type, relatedButtons: surface.relatedButtons, relatedInputs: surface.relatedInputs }
    })
  }
  for (const workflow of sourceGraph.sourceWorkflows) {
    const evidenceIds = evidenceForFiles(workflow.sourceFiles, [workflow.name, ...workflow.evidence, ...workflow.likelyUserActions], factIndex)
    const workflowNode = addNode({
      kind: 'workflow',
      label: workflow.name,
      filePath: workflow.sourceFiles[0],
      confidence: workflow.confidence,
      evidenceIds,
      extractionMethod: 'heuristic',
      metadata: { sourceFiles: workflow.sourceFiles, likelyUserActions: workflow.likelyUserActions }
    })
    inferences.push({
      id: stableId('inference', workflow.name),
      claim: `Workflow "${workflow.name}" is supported by source evidence.`,
      basedOn: evidenceIds,
      confidence: workflow.confidence,
      method: 'heuristic'
    })
    for (const action of workflow.likelyUserActions) {
      const actionNode = addNode({
        kind: 'action',
        label: action,
        filePath: workflow.sourceFiles[0],
        confidence: workflow.confidence,
        evidenceIds: evidenceForFiles(workflow.sourceFiles, [action], factIndex),
        extractionMethod: 'heuristic',
        metadata: { workflow: workflow.name }
      })
      addEdge(workflowNode.id, actionNode.id, 'has_action', workflow.confidence, actionNode.evidenceIds)
    }
  }
  for (const surfaceNode of nodes.filter((node) => node.kind === 'surface')) {
    for (const workflowNode of nodes.filter((node) => node.kind === 'workflow')) {
      const overlap = intersect(surfaceNode.evidenceIds, workflowNode.evidenceIds)
      const textRelated = tokenOverlap(surfaceNode.label, workflowNode.label) > 0 || tokenOverlap(JSON.stringify(surfaceNode.metadata ?? {}), workflowNode.label) > 0
      if (overlap.length > 0 || textRelated) {
        addEdge(workflowNode.id, surfaceNode.id, 'uses_surface', Math.min(workflowNode.confidence, surfaceNode.confidence), overlap)
      }
    }
  }
  for (const form of sourceGraph.forms) {
    const formNode = addNode({
      kind: 'form',
      label: form.name,
      filePath: form.file,
      confidence: form.confidence ?? 0.75,
      evidenceIds: evidenceForSurface(form.file, [form.name, ...form.inputs.map(cleanControlText)], factIndex),
      extractionMethod: 'deterministic',
      metadata: { inputs: form.inputs.map(cleanControlText).filter(Boolean) }
    })
    for (const input of form.inputs.map(cleanControlText).filter(Boolean)) {
      const controlNode = addNode({
        kind: 'control',
        label: input,
        filePath: form.file,
        confidence: form.confidence ?? 0.75,
        evidenceIds: evidenceForSurface(form.file, [input], factIndex),
        extractionMethod: 'deterministic',
        metadata: { form: form.name }
      })
      addEdge(formNode.id, controlNode.id, 'contains_control', controlNode.confidence, controlNode.evidenceIds)
    }
  }
  for (const fact of factIndex.filter((item) => item.kind === 'form_control' || item.kind === 'action_control')) {
    const node = addNode({
      kind: fact.kind === 'action_control' ? 'action' : 'control',
      label: fact.label ?? fact.value,
      filePath: fact.filePath,
      symbol: fact.handler,
      confidence: fact.confidence,
      evidenceIds: [fact.id],
      extractionMethod: fact.extractionMethod,
      metadata: {
        controlType: fact.controlType,
        handler: fact.handler,
        ariaDescribedBy: fact.ariaDescribedBy,
        placeholder: fact.placeholder,
        testId: fact.testId,
        options: fact.options,
        safeActionHint: fact.safeActionHint
      }
    })
    for (const surfaceNode of nodes.filter((item) => item.kind === 'surface' && item.filePath === fact.filePath)) {
      if (tokenOverlap(surfaceNode.label, fact.label ?? fact.value) > 0 || tokenOverlap(JSON.stringify(surfaceNode.metadata ?? {}), fact.label ?? fact.value) > 0) {
        addEdge(surfaceNode.id, node.id, fact.kind === 'action_control' ? 'exposes_action' : 'exposes_control', fact.confidence, [fact.id])
      }
    }
  }
  for (const call of sourceGraph.apiCalls) {
    if (isStaticAssetReference(call.endpoint)) continue
    const apiNode = addNode({
      kind: 'api_dependency',
      label: formatApiCall(call),
      filePath: call.sourceFile,
      symbol: call.functionName,
      confidence: call.confidence ?? 0.85,
      evidenceIds: evidenceForSurface(call.sourceFile, [call.endpoint, call.functionName ?? '', call.method ?? ''], factIndex),
      extractionMethod: 'deterministic',
      metadata: { endpoint: call.endpoint, method: call.method, likelyWorkflow: call.likelyWorkflow }
    })
    if (call.likelyWorkflow) {
      const workflowNode = nodes.find((node) => node.kind === 'workflow' && node.label.toLowerCase() === call.likelyWorkflow?.toLowerCase())
      if (workflowNode) addEdge(workflowNode.id, apiNode.id, 'calls_api', apiNode.confidence, apiNode.evidenceIds)
    }
  }
  for (const state of sourceGraph.stateActions) {
    for (const value of [...state.stateVariables, ...state.handlerNames, ...state.submitHandlers]) {
      addNode({
        kind: state.handlerNames.includes(value) || state.submitHandlers.includes(value) ? 'action' : 'state',
        label: value,
        filePath: state.file,
        confidence: state.confidence ?? 0.8,
        evidenceIds: evidenceForSurface(state.file, [value], factIndex),
        extractionMethod: 'deterministic',
        metadata: { stateFile: state.file }
      })
    }
  }

  const apiText = sourceGraph.apiCalls.map((call) => `${call.endpoint} ${call.functionName ?? ''}`).join(' ')
  const entityLabels = inferEntities(`${sourceGraph.packageName ?? ''} ${sourceGraph.uiSurfaces.map((surface) => surface.display_name).join(' ')} ${sourceGraph.sourceWorkflows.map((workflow) => workflow.name).join(' ')} ${apiText}`)
  for (const entity of entityLabels) {
    addNode({
      kind: 'domain_entity',
      label: entity,
      confidence: 0.65,
      evidenceIds: evidenceForValue(entity, factIndex),
      extractionMethod: 'heuristic'
    })
  }

  const averageConfidence = nodes.length
    ? nodes.reduce((sum, node) => sum + node.confidence, 0) / nodes.length
    : 0
  return {
    surfaces: nodes.filter((node) => node.kind === 'surface'),
    workflows: nodes.filter((node) => node.kind === 'workflow'),
    actions: nodes.filter((node) => node.kind === 'action'),
    controls: nodes.filter((node) => node.kind === 'control'),
    forms: nodes.filter((node) => node.kind === 'form'),
    state: nodes.filter((node) => node.kind === 'state'),
    validation: nodes.filter((node) => node.kind === 'validation'),
    apiDataDependencies: nodes.filter((node) => node.kind === 'api_dependency' || node.kind === 'data_dependency'),
    domainEntities: nodes.filter((node) => node.kind === 'domain_entity'),
    edges,
    confidence: Number(averageConfidence.toFixed(2)),
    evidenceReferences: unique(nodes.flatMap((node) => node.evidenceIds)),
    inferences,
    generatedAt: sourceGraph.generatedAt
  }
}

function factFactory(facts: EvidenceFact[]) {
  return (input: Omit<EvidenceFact, 'id'>): EvidenceFact => {
    const fact: EvidenceFact = { id: stableId('fact', `${input.kind}:${input.filePath ?? ''}:${input.symbol ?? ''}:${input.value}`), ...input }
    if (!facts.some((existing) => existing.id === fact.id)) facts.push(fact)
    return fact
  }
}

function nodeFactory(nodes: UIIntentNode[]) {
  return (input: Omit<UIIntentNode, 'id'>): UIIntentNode => {
    const node: UIIntentNode = { id: stableId(input.kind, `${input.filePath ?? ''}:${input.symbol ?? ''}:${input.label}`), ...input, evidenceIds: unique(input.evidenceIds) }
    const existing = nodes.find((item) => item.id === node.id)
    if (existing) return existing
    nodes.push(node)
    return node
  }
}

function edgeFactory(edges: UIIntentEdge[]) {
  return (source: string, target: string, kind: string, confidence: number, evidenceIds: string[]): UIIntentEdge => {
    const edge: UIIntentEdge = { id: stableId('edge', `${source}:${kind}:${target}`), source, target, kind, confidence, evidenceIds: unique(evidenceIds) }
    if (!edges.some((item) => item.id === edge.id)) edges.push(edge)
    return edge
  }
}

function factLookup(facts: EvidenceFact[]): EvidenceFact[] {
  return facts
}

function evidenceForSurface(filePath: string | undefined, values: string[], facts: EvidenceFact[]): string[] {
  return unique(facts
    .filter((fact) => (!filePath || fact.filePath === filePath) && values.some((value) => factMatches(fact, value)))
    .map((fact) => fact.id))
}

function evidenceForFiles(files: string[], values: string[], facts: EvidenceFact[]): string[] {
  return unique(files.flatMap((file) => evidenceForSurface(file, values, facts)))
}

function evidenceForValue(value: string, facts: EvidenceFact[]): string[] {
  return unique(facts.filter((fact) => factMatches(fact, value)).map((fact) => fact.id)).slice(0, 8)
}

function factMatches(fact: EvidenceFact, value: string): boolean {
  if (!value) return false
  const left = normalize(`${fact.value} ${fact.symbol ?? ''} ${fact.snippet ?? ''}`)
  return left.includes(normalize(value)) || normalize(value).includes(normalize(fact.value))
}

function formatApiCall(call: ApiCall): string {
  return `${call.method ?? 'GET'} ${call.endpoint}`
}

function evidenceSnippet(evidence?: string[]): string | undefined {
  return evidence?.filter(Boolean).slice(0, 3).join('; ')
}

function extractNormalizedControls(file: SourceFileContent): NormalizedControlFact[] {
  const controls: NormalizedControlFact[] = []
  const content = maskJsxArrows(file.content)
  const labelByFor = labelsByFor(content)
  const labelledControls = new Set<string>()
  for (const labelMatch of content.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)) {
    const body = labelMatch[2]
    const controlMatch = body.match(/<(input|textarea|select)\b([\s\S]*?)(?:\/>|>([\s\S]*?)<\/\1>)/i)
    if (!controlMatch) continue
    const controlType = controlTypeFor(controlMatch[1], controlMatch[2])
    const label = cleanControlText(attrValue(labelMatch[1], 'aria-label')) ||
      cleanControlText(attrValue(controlMatch[2], 'aria-label')) ||
      cleanControlText(labelByFor.get(attrValue(controlMatch[2], 'id') ?? '')) ||
      cleanControlText(removeControlMarkup(body)) ||
      cleanControlText(attrValue(controlMatch[2], 'placeholder')) ||
      cleanControlText(attrValue(controlMatch[2], 'name')) ||
      'Unlabelled control'
    const rawText = unmaskJsxArrows(controlMatch[0])
    labelledControls.add(rawText)
    controls.push({
      kind: 'form_control',
      label,
      controlType,
      handler: handlerFromAttrs(controlMatch[2], ['onChange', 'onInput', 'onSelect', 'change', 'input', 'ngModelChange']),
      ariaDescribedBy: attrValue(controlMatch[2], 'aria-describedby'),
      placeholder: attrValue(controlMatch[2], 'placeholder'),
      testId: attrValue(controlMatch[2], 'data-testid'),
      options: controlMatch[1].toLowerCase() === 'select' ? optionLabels(controlMatch[3] ?? '') : undefined,
      filePath: file.relative,
      rawText
    })
  }
  for (const match of content.matchAll(/<(input|textarea|select)\b([\s\S]*?)(?:\/>|>([\s\S]*?)<\/\1>)/gi)) {
    const rawText = unmaskJsxArrows(match[0])
    if (labelledControls.has(rawText)) continue
    const label = cleanControlText(labelByFor.get(attrValue(match[2], 'id') ?? '')) ||
      cleanControlText(attrValue(match[2], 'aria-label')) ||
      cleanControlText(attrValue(match[2], 'placeholder')) ||
      cleanControlText(attrValue(match[2], 'name')) ||
      cleanControlText(attrValue(match[2], 'formControlName')) ||
      cleanControlText(attrValue(match[2], 'data-testid')) ||
      'Unlabelled control'
    controls.push({
      kind: 'form_control',
      label,
      controlType: controlTypeFor(match[1], match[2]),
      handler: handlerFromAttrs(match[2], ['onChange', 'onInput', 'onSelect', 'change', 'input', 'ngModelChange']),
      ariaDescribedBy: attrValue(match[2], 'aria-describedby'),
      placeholder: attrValue(match[2], 'placeholder'),
      testId: attrValue(match[2], 'data-testid'),
      options: match[1].toLowerCase() === 'select' ? optionLabels(match[3] ?? '') : undefined,
      filePath: file.relative,
      rawText
    })
  }
  for (const match of content.matchAll(/<button\b([\s\S]*?)>([\s\S]*?)<\/button>/gi)) {
    const label = cleanControlText(match[2]) ||
      cleanControlText(attrValue(match[1], 'aria-label')) ||
      cleanControlText(attrValue(match[1], 'title')) ||
      cleanControlText(attrValue(match[1], 'data-testid')) ||
      'Unlabelled button'
    controls.push({
      kind: 'action_control',
      label,
      controlType: 'button',
      handler: handlerFromAttrs(match[1], ['onClick', 'click']),
      ariaDescribedBy: attrValue(match[1], 'aria-describedby'),
      testId: attrValue(match[1], 'data-testid'),
      safeActionHint: safeActionHint(label),
      filePath: file.relative,
      rawText: unmaskJsxArrows(match[0])
    })
  }
  return dedupeControls(controls)
}

function extractStaticAssetReferences(file: SourceFileContent): string[] {
  return unique([
    ...[...file.content.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]),
    ...[...file.content.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]),
    ...[...file.content.matchAll(/\b(?:src|href)=["']([^"']+\.(?:js|mjs|ts|tsx|css|png|jpe?g|gif|svg|webp|ico|woff2?))["']/gi)].map((match) => match[1])
  ].filter(isStaticAssetReference))
}

function isStaticAssetReference(value: string): boolean {
  return /^\/?(?:src|assets|static|public)\//i.test(value) ||
    /\.(?:js|mjs|ts|tsx|css|png|jpe?g|gif|svg|webp|ico|woff2?)(?:[?#].*)?$/i.test(value)
}

function cleanControlText(value: string | undefined): string {
  if (!value) return ''
  return unmaskJsxArrows(value)
    .replace(/\{[\s\S]*?\}/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function removeControlMarkup(value: string): string {
  return value
    .replace(/<small\b[\s\S]*?<\/small>/gi, ' ')
    .replace(/<(input|textarea|select)\b[\s\S]*?(?:\/>|<\/\1>)/gi, ' ')
    .replace(/<option\b[\s\S]*?<\/option>/gi, ' ')
}

function labelsByFor(content: string): Map<string, string> {
  const labels = new Map<string, string>()
  for (const match of content.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)) {
    const target = attrValue(match[1], 'for') ?? attrValue(match[1], 'htmlFor')
    if (target) labels.set(target, cleanControlText(removeControlMarkup(match[2])))
  }
  return labels
}

function attrValue(attrs: string | undefined, attr: string): string | undefined {
  if (!attrs) return undefined
  return attrs.match(new RegExp(`\\b${escapeRegex(attr)}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|\\{["']([^"']+)["']\\})`, 'i'))?.slice(1).find(Boolean)
}

function handlerFromAttrs(attrs: string, names: string[]): string | undefined {
  for (const name of names) {
    const raw = attrs.match(new RegExp(`\\b${escapeRegex(name)}\\s*=\\s*(?:\\{([\\s\\S]*?)\\}|["']([^"']+)["'])`, 'i'))?.[1] ??
      attrs.match(new RegExp(`\\(${escapeRegex(name)}\\)\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1]
    const handler = raw?.match(/\b([A-Za-z_$][\w$]*)\s*\(/)?.[1] ?? raw?.match(/^\s*([A-Za-z_$][\w$]*)\s*$/)?.[1]
    if (handler) return handler
  }
  return undefined
}

function controlTypeFor(tagName: string, attrs: string): NormalizedControlFact['controlType'] {
  const tag = tagName.toLowerCase()
  if (tag === 'textarea') return 'textarea'
  if (tag === 'select') return 'select'
  if (tag === 'input') {
    const type = (attrValue(attrs, 'type') ?? 'input').toLowerCase()
    if (type === 'checkbox') return 'checkbox'
    return 'input'
  }
  return 'unknown'
}

function optionLabels(content: string): string[] {
  return unique([...content.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)].map((match) => cleanControlText(match[1])).filter(Boolean))
}

function safeActionHint(label: string): boolean {
  return !/\b(delete|remove|reset|destroy|force|overwrite|purge|drop)\b/i.test(label)
}

function dedupeControls(controls: NormalizedControlFact[]): NormalizedControlFact[] {
  const byKey = new Map<string, NormalizedControlFact>()
  for (const control of controls) {
    const key = `${control.filePath}:${control.kind}:${control.label}:${control.controlType}:${control.handler ?? ''}:${control.testId ?? ''}`
    if (!byKey.has(key)) byKey.set(key, control)
  }
  return [...byKey.values()]
}

function componentSymbol(relativePath: string): string {
  return path.basename(relativePath, path.extname(relativePath))
}

function firstMeaningfulLine(content: string): string | undefined {
  return content.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !line.startsWith('//'))?.slice(0, 240)
}

function moduleName(relativePath: string): string {
  return relativePath.replace(/\.[^.]+$/, '').split('/').filter((part) => !['src', 'app', 'components', 'pages'].includes(part)).join('/') || relativePath
}

function inferEntities(text: string): string[] {
  const lower = text.toLowerCase()
  const candidates = [
    ['workspace', /workspace/],
    ['project', /project/],
    ['repo target', /repo|repository|target/],
    ['plan run', /plan.?run|run history/],
    ['plan bundle', /plan.?bundle/],
    ['report', /report/],
    ['issue', /issue|finding/],
    ['fix packet', /fix.?packet|repair/],
    ['screenshot', /screenshot/],
    ['user/account', /login|sign.?in|user|account/],
    ['article', /article/]
  ] as const
  return candidates.filter(([, regex]) => regex.test(lower)).map(([label]) => label)
}

function tokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(tokens(left))
  return tokens(right).filter((token) => leftTokens.has(token)).length
}

function tokens(value: string): string[] {
  return normalize(value).split(/\s+/).filter((token) => token.length > 2)
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9/_:-]+/g, ' ').trim()
}

function intersect(left: string[], right: string[]): string[] {
  const rightSet = new Set(right)
  return left.filter((value) => rightSet.has(value))
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))]
}

function stableId(prefix: string, value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return `${prefix}-${Math.abs(hash).toString(36)}`
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function maskJsxArrows(value: string): string {
  return value.replace(/=>/g, '=__SNIFFER_JSX_ARROW__')
}

function unmaskJsxArrows(value: string): string {
  return value.replace(/=__SNIFFER_JSX_ARROW__/g, '=>')
}

function emptyInventory(): SourceInventory {
  return {
    files: [],
    modules: [],
    frameworkSignals: [],
    packageBuildSignals: [],
    rawExtractedSymbols: [],
    rawRoutes: [],
    rawTemplates: [],
    rawHandlers: [],
    rawApiCalls: [],
    provenance: [],
    facts: [],
    generatedAt: ''
  }
}
