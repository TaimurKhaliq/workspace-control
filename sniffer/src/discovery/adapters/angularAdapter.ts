import { existsSync } from 'node:fs'
import path from 'node:path'
import type { ApiCall, SourceFileSummary, SourceForm, SourceRoute, SourceWorkflow, StateActionHints, UiSurface } from '../../types.js'
import type { AdapterDetection, DiscoveryAdapter, DiscoveryContext, FrameworkDiscoveryResult, SourceFileContent } from './types.js'
import { emptyDiscoveryResult } from './types.js'
import { attrValues, cleanText, endpointStrings, inferHttpMethod, regexMatches, relativeName, roundConfidence, tagText, unique, wordsFromName } from './common.js'

export class AngularDiscoveryAdapter implements DiscoveryAdapter {
  id = 'angular'
  name = 'Angular template/component discovery'

  detect(context: DiscoveryContext): AdapterDetection {
    const evidence: string[] = []
    if (context.dependencies['@angular/core']) evidence.push('package.json dependency: @angular/core')
    if (context.dependencies['@angular/cli']) evidence.push('package.json dependency: @angular/cli')
    if (existsSync(path.join(context.repoPath, 'angular.json'))) evidence.push('angular.json present')
    if (context.files.some((file) => /\.component\.ts$/.test(file.relative))) evidence.push('Angular component TS files present')
    if (context.files.some((file) => /\.component\.html$/.test(file.relative))) evidence.push('Angular component HTML templates present')
    return {
      adapterId: this.id,
      framework: 'angular',
      confidence: evidence.some((item) => item.includes('@angular/core') || item.includes('angular.json')) ? 0.95 : evidence.length ? 0.55 : 0,
      evidence
    }
  }

  discover(context: DiscoveryContext): FrameworkDiscoveryResult {
    const detection = this.detect(context)
    const result = emptyDiscoveryResult(this.id, 'angular', detection.confidence, detection.evidence)
    if (detection.confidence <= 0) return result
    const components = angularComponents(context.files)
    const templates = angularTemplates(context.files)
    result.components = discoverComponents(components, templates)
    result.pages = result.components.filter((component) => /page|view|screen|route/i.test(component.name))
    result.routes = dedupeRoutes([...discoverRoutes(context.files), ...templates.flatMap((file) => discoverTemplateRoutes(file))])
    result.forms = templates.flatMap((file) => discoverTemplateForms(file))
    result.uiSurfaces = templates.flatMap((file) => discoverTemplateSurfaces(file))
    result.apiCalls = discoverAngularApiCalls(context.files)
    result.stateActions = discoverStateActions(components, templates)
    result.sourceWorkflows = inferAngularWorkflows({ components, templates, routes: result.routes, forms: result.forms, apiCalls: result.apiCalls, stateActions: result.stateActions })
    return result
  }
}

function angularComponents(files: SourceFileContent[]): SourceFileContent[] {
  return files.filter((file) => /\.component\.ts$/.test(file.relative))
}

function angularTemplates(files: SourceFileContent[]): SourceFileContent[] {
  return files.filter((file) => /\.component\.html$/.test(file.relative) || inlineTemplate(file))
}

function inlineTemplate(file: SourceFileContent): boolean {
  return /\.component\.ts$/.test(file.relative) && /@Component\s*\(/.test(file.content) && /template\s*:/.test(file.content)
}

function templateContent(file: SourceFileContent): string {
  if (!inlineTemplate(file)) return file.content
  return file.content.match(/template\s*:\s*`([\s\S]*?)`/)?.[1] ??
    file.content.match(/template\s*:\s*['"]([\s\S]*?)['"]/)?.[1] ??
    ''
}

function discoverComponents(components: SourceFileContent[], templates: SourceFileContent[]): SourceFileSummary[] {
  const summaries = components.map((file) => ({
    file: file.relative,
    name: file.content.match(/export\s+class\s+(\w+)/)?.[1] ?? wordsFromName(relativeName(file.relative)),
    discoveredBy: ['angular'],
    framework: 'angular',
    confidence: 0.85,
    evidence: [
      file.content.match(/selector\s*:\s*['"]([^'"]+)['"]/)?.[1],
      file.content.match(/templateUrl\s*:\s*['"]([^'"]+)['"]/)?.[1]
    ].filter(Boolean) as string[]
  }))
  const templateSummaries = templates
    .filter((file) => /\.component\.html$/.test(file.relative) && !summaries.some((summary) => relatedComponentTemplate(summary.file, file.relative)))
    .map((file) => ({
      file: file.relative,
      name: wordsFromName(relativeName(file.relative)),
      discoveredBy: ['angular'],
      framework: 'angular',
      confidence: 0.6,
      evidence: tagText(file.content, ['h1', 'h2', 'h3']).slice(0, 4)
    }))
  return [...summaries, ...templateSummaries]
}

function relatedComponentTemplate(componentFile: string, templateFile: string): boolean {
  return componentFile.replace(/\.ts$/, '.html') === templateFile
}

function discoverRoutes(files: SourceFileContent[]): SourceRoute[] {
  const routeFiles = files.filter((file) => /routes?\.ts$|routing.*\.ts$|app\.routes\.ts$/.test(file.relative))
  return routeFiles.flatMap((file) => {
    const routes = regexMatches(file.content, /\bpath\s*:\s*['"]([^'"]*)['"]/g)
    const redirects = regexMatches(file.content, /\bredirectTo\s*:\s*['"]([^'"]+)['"]/g)
    return unique([...routes, ...redirects]).map((route) => ({
      path: route === '' ? '/' : `/${route.replace(/^\//, '')}`,
      file: file.relative,
      source: 'router' as const,
      discoveredBy: ['angular'],
      framework: 'angular',
      confidence: 0.85,
      evidence: [route]
    }))
  })
}

function discoverTemplateRoutes(file: SourceFileContent): SourceRoute[] {
  const content = templateContent(file)
  const routes = unique([
    ...attrValues(content, 'routerLink'),
    ...regexMatches(content, /\[routerLink\]\s*=\s*["']\[\s*['"]([^'"]+)['"]/gi),
    ...attrValues(content, 'href').filter((href) => href.startsWith('/') || href.startsWith('#'))
  ])
  return routes.map((route) => ({
    path: route.startsWith('/') || route.startsWith('#') ? route : `/${route}`,
    file: file.relative,
    source: 'link' as const,
    discoveredBy: ['angular'],
    framework: 'angular',
    confidence: 0.65,
    evidence: [route]
  }))
}

function discoverTemplateForms(file: SourceFileContent): SourceForm[] {
  const content = templateContent(file)
  const forms = [...content.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)]
  if (forms.length === 0 && /<(input|select|textarea)\b/i.test(content)) {
    const inputs = templateInputs(content)
    return inputs.length ? [{
      file: file.relative,
      name: wordsFromName(relativeName(file.relative)),
      inputs,
      discoveredBy: ['angular'],
      framework: 'angular',
      confidence: 0.55,
      evidence: inputs
    }] : []
  }
  return forms.map((match, index) => {
    const body = match[2]
    const inputs = templateInputs(body)
    const submit = submitHandlers(match[1]).at(0)
    return {
      file: file.relative,
      name: cleanText(tagText(body, ['h1', 'h2', 'h3'])[0] ?? submit ?? `Form ${index + 1}`),
      inputs,
      discoveredBy: ['angular'],
      framework: 'angular',
      confidence: inputs.length ? 0.75 : 0.55,
      evidence: unique([submit, ...inputs].filter(Boolean) as string[])
    }
  })
}

function discoverTemplateSurfaces(file: SourceFileContent): UiSurface[] {
  const content = templateContent(file)
  const headings = tagText(content, ['h1', 'h2', 'h3'])
  const buttons = unique([...tagText(content, ['button']), ...attrValues(content, 'aria-label').filter((value) => /button|submit|save|sign|log|follow|favorite|publish|update|delete|new|add/i.test(value))])
  const inputs = templateInputs(content)
  const routes = discoverTemplateRoutes(file).map((route) => route.path)
  const surfaces: UiSurface[] = []
  for (const heading of headings.slice(0, 8)) {
    surfaces.push(surface(file.relative, heading, [heading, ...buttons.slice(0, 8), ...inputs.slice(0, 8), ...routes.slice(0, 4)], buttons, inputs, 0.65))
  }
  if (surfaces.length === 0 && (buttons.length || inputs.length || routes.length)) {
    surfaces.push(surface(file.relative, wordsFromName(relativeName(file.relative)), [...buttons, ...inputs, ...routes].slice(0, 16), buttons, inputs, 0.55))
  }
  return surfaces
}

function surface(file: string, name: string, evidence: string[], buttons: string[], inputs: string[], confidence: number): UiSurface {
  return {
    file,
    surface_type: 'unknown_ui_section',
    display_name: name,
    evidence: unique(evidence).slice(0, 14),
    relatedButtons: unique(buttons).slice(0, 12),
    relatedInputs: unique(inputs).slice(0, 12),
    confidence: roundConfidence(confidence),
    discoveredBy: ['angular'],
    framework: 'angular'
  }
}

function discoverAngularApiCalls(files: SourceFileContent[]): ApiCall[] {
  const apiFiles = files.filter((file) => /\.(service|api|client|repository)\.ts$/.test(file.relative) || /HttpClient|http\.(get|post|put|patch|delete)/i.test(file.content))
  return dedupeApiCalls(apiFiles.flatMap((file) => {
    const calls: ApiCall[] = []
    for (const match of file.content.matchAll(/(\w+)\s*\([^)]*\)\s*(?::[^{]+)?\{([\s\S]*?)(?=\n\s*(?:public|private|protected)?\s*\w+\s*\(|\n\s*}\s*$)/g)) {
      const methodName = match[1]
      const body = match[2]
      for (const http of body.matchAll(/http\.(get|post|put|patch|delete)\s*(?:<[^>]+>)?\s*\(\s*['"`]([^'"`]+)['"`]/gi)) {
        calls.push(apiCall(file, http[2], http[1].toUpperCase(), methodName, body))
      }
      for (const endpoint of endpointStrings(body)) {
        if (!calls.some((call) => call.sourceFile === file.relative && call.endpoint === endpoint && call.functionName === methodName)) {
          calls.push(apiCall(file, endpoint, inferHttpMethod(body), methodName, body))
        }
      }
    }
    for (const endpoint of endpointStrings(file.content)) {
      if (!calls.some((call) => call.endpoint === endpoint)) calls.push(apiCall(file, endpoint, inferHttpMethod(file.content), undefined, file.content))
    }
    return calls
  }))
}

function apiCall(file: SourceFileContent, endpoint: string, method: string | undefined, functionName: string | undefined, evidenceSource: string): ApiCall {
  return {
    endpoint,
    method,
    sourceFile: file.relative,
    functionName,
    likelyWorkflow: inferWorkflowForApi(functionName, endpoint, evidenceSource),
    discoveredBy: ['angular'],
    framework: 'angular',
    confidence: 0.75,
    evidence: [endpoint, functionName].filter(Boolean) as string[]
  }
}

function discoverStateActions(components: SourceFileContent[], templates: SourceFileContent[]): StateActionHints[] {
  const templateHandlersByFile = new Map<string, string[]>()
  for (const template of templates) {
    templateHandlersByFile.set(template.relative, unique([...clickHandlers(templateContent(template)), ...submitHandlers(templateContent(template))]))
  }
  return components.map((file) => {
    const stateVariables = unique([
      ...regexMatches(file.content, /^\s*(?:public\s+|private\s+|protected\s+)?(\w+)\s*(?::[^=;]+)?\s*=/gm),
      ...regexMatches(file.content, /^\s*(?:public\s+|private\s+|protected\s+)?(\w+)\s*:\s*(?:FormGroup|FormControl|Signal|Observable)/gm)
    ]).filter((name) => !/constructor|return|if|for|while|switch/.test(name))
    const methodNames = unique(regexMatches(file.content, /^\s*(?:async\s+)?(?:public\s+|private\s+|protected\s+)?(\w+)\s*\([^)]*\)\s*(?::[^{]+)?\{/gm))
    const templateFile = file.relative.replace(/\.ts$/, '.html')
    const templateHandlers = templateHandlersByFile.get(templateFile) ?? []
    const handlerNames = unique([...methodNames.filter((name) => /login|submit|save|create|delete|update|publish|follow|favorite|search|filter|open|close|cancel|register|sign/i.test(name)), ...templateHandlers])
    return {
      file: file.relative,
      stateVariables,
      handlerNames,
      submitHandlers: handlerNames.filter((name) => /submit|save|create|update|publish|login|register|sign/i.test(name)),
      loadingStateVariables: stateVariables.filter((name) => /loading|pending|saving|submitting|busy/i.test(name)),
      errorStateVariables: stateVariables.filter((name) => /error|invalid|warning|message/i.test(name)),
      discoveredBy: ['angular'],
      framework: 'angular',
      confidence: handlerNames.length || stateVariables.length ? 0.75 : 0.4,
      evidence: handlerNames.slice(0, 10)
    }
  }).filter((item) => item.stateVariables.length || item.handlerNames.length || item.submitHandlers.length)
}

function inferAngularWorkflows(input: {
  components: SourceFileContent[]
  templates: SourceFileContent[]
  routes: SourceRoute[]
  forms: SourceForm[]
  apiCalls: ApiCall[]
  stateActions: StateActionHints[]
}): SourceWorkflow[] {
  const workflows: SourceWorkflow[] = []
  for (const template of input.templates) {
    const content = templateContent(template)
    const text = cleanText(content).toLowerCase()
    const buttons = tagText(content, ['button'])
    const actions = unique([...clickHandlers(content), ...submitHandlers(content), ...buttons])
    if (/password|sign in|log in|login/.test(text)) {
      workflows.push(workflow('Login form', template.relative, unique(['password', 'login', ...actions]).slice(0, 12), ['Find username/email field', 'Find password field', 'Find sign in button without submitting credentials'], 0.8))
    }
    if (input.forms.some((form) => form.file === template.relative)) {
      workflows.push(workflow('Submit form', template.relative, unique(['form', ...actions]).slice(0, 12), ['Inspect labelled form controls', 'Avoid submit unless explicitly safe'], 0.65))
    }
    if (/new article|edit article|publish|save|update|create/.test(text) || actions.some((action) => /publish|save|update|create/i.test(action))) {
      workflows.push(workflow('Create/edit entity', template.relative, unique([...buttons, ...actions]).slice(0, 12), ['Open create/edit form', 'Inspect required fields', 'Verify save/cancel affordances'], 0.65))
    }
    if (/search|filter/.test(text)) {
      workflows.push(workflow('Search/filter', template.relative, ['search', 'filter'], ['Find search/filter control', 'Verify results/list context'], 0.55))
    }
    if (/<table\b|<ul\b|<ol\b|\*ngFor|@for\s*\(|article-preview|app-article-list/.test(content)) {
      workflows.push(workflow('Table/list scan', template.relative, unique(['list/table template', ...tagText(content, ['h1', 'h2', 'li', 'th']).slice(0, 8)]), ['Inspect list/table rows', 'Check row action names and overflow'], 0.65))
    }
  }
  if (input.routes.length) {
    workflows.push(workflow('Navigation route', unique(input.routes.map((route) => route.file)), unique(input.routes.map((route) => route.path)).slice(0, 16), ['Open safe navigation links', 'Verify route/content changes'], 0.75))
  }
  for (const call of input.apiCalls) {
    if (!call.likelyWorkflow) continue
    workflows.push(workflow(call.likelyWorkflow, call.sourceFile, [`${call.method ?? 'GET'} ${call.endpoint}`, call.functionName ?? ''].filter(Boolean), [`Use ${wordsFromName(call.functionName ?? call.likelyWorkflow)}`], 0.55))
  }
  return mergeWorkflows(workflows)
}

function workflow(name: string, sourceFiles: string | string[], evidence: string[], actions: string[], confidence: number): SourceWorkflow {
  return {
    name,
    sourceFiles: Array.isArray(sourceFiles) ? sourceFiles : [sourceFiles],
    evidence: unique(evidence).slice(0, 14),
    likelyUserActions: actions,
    confidence: roundConfidence(confidence),
    discoveredBy: ['angular'],
    framework: 'angular'
  }
}

function templateInputs(content: string): string[] {
  return unique([
    ...tagText(content, ['label']),
    ...attrValues(content, 'placeholder'),
    ...attrValues(content, 'aria-label'),
    ...attrValues(content, 'formControlName'),
    ...attrValues(content, 'name'),
    ...attrValues(content, 'ngModel')
  ]).slice(0, 24)
}

function clickHandlers(content: string): string[] {
  return regexMatches(content, /\(click\)\s*=\s*["']\s*([\w.]+)\s*\(/gi)
}

function submitHandlers(content: string): string[] {
  return unique([
    ...regexMatches(content, /\((?:ngSubmit|submit)\)\s*=\s*["']\s*([\w.]+)\s*\(/gi),
    ...regexMatches(content, /ng-submit\s*=\s*["']\s*([\w.]+)\s*\(/gi)
  ])
}

function inferWorkflowForApi(functionName: string | undefined, endpoint: string, source: string): string | undefined {
  const text = `${functionName ?? ''} ${endpoint} ${source}`.toLowerCase()
  if (/login|auth|session|token|register|user/.test(text)) return 'Login form'
  if (/article|post|feed|favorite|comment/.test(text) && /post|put|patch|delete|create|update|publish/.test(text)) return 'Create/edit entity'
  if (/article|feed|list|tags/.test(text)) return 'Table/list scan'
  if (/search|filter/.test(text)) return 'Search/filter'
  return undefined
}

function dedupeRoutes(routes: SourceRoute[]): SourceRoute[] {
  const seen = new Set<string>()
  return routes.filter((route) => {
    const key = `${route.file}:${route.path}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function dedupeApiCalls(calls: ApiCall[]): ApiCall[] {
  const seen = new Set<string>()
  return calls.filter((call) => {
    const key = `${call.sourceFile}:${call.functionName ?? ''}:${call.method ?? ''}:${call.endpoint}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function mergeWorkflows(workflows: SourceWorkflow[]): SourceWorkflow[] {
  const byName = new Map<string, SourceWorkflow>()
  for (const item of workflows) {
    const existing = byName.get(item.name)
    if (!existing) {
      byName.set(item.name, item)
      continue
    }
    existing.sourceFiles = unique([...existing.sourceFiles, ...item.sourceFiles]).sort()
    existing.evidence = unique([...existing.evidence, ...item.evidence]).slice(0, 18)
    existing.likelyUserActions = unique([...existing.likelyUserActions, ...item.likelyUserActions]).slice(0, 12)
    existing.confidence = Math.max(existing.confidence, item.confidence)
  }
  return [...byName.values()].sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name))
}
