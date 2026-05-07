import path from 'node:path'
import type { ApiCall, SourceForm, SourceRoute, SourceWorkflow, UiSurface } from '../../types.js'
import type { AdapterDetection, DiscoveryAdapter, DiscoveryContext, FrameworkDiscoveryResult, SourceFileContent } from './types.js'
import { emptyDiscoveryResult } from './types.js'
import { attrValues, cleanText, endpointStrings, regexMatches, relativeName, roundConfidence, tagText, unique, wordsFromName } from './common.js'

const templateExtensions = new Set(['.html', '.vue', '.svelte', '.astro', '.hbs', '.ejs'])

export class HtmlTemplateDiscoveryAdapter implements DiscoveryAdapter {
  id = 'html-template'
  name = 'Generic HTML/template discovery'

  detect(context: DiscoveryContext): AdapterDetection {
    const templates = templateFiles(context.files)
    return {
      adapterId: this.id,
      framework: 'template',
      confidence: templates.length > 0 ? 0.55 : 0,
      evidence: templates.slice(0, 8).map((file) => `template:${file.relative}`)
    }
  }

  discover(context: DiscoveryContext): FrameworkDiscoveryResult {
    const detection = this.detect(context)
    const result = emptyDiscoveryResult(this.id, 'template', detection.confidence, detection.evidence)
    if (detection.confidence <= 0) return result
    const templates = templateFiles(context.files)
    result.routes = dedupeRoutes(templates.flatMap((file) => discoverRoutes(file)))
    result.components = templates.map((file) => ({ file: file.relative, name: relativeName(file.relative), discoveredBy: [this.id], framework: 'template', confidence: 0.45 }))
    result.forms = templates.flatMap((file) => discoverForms(file))
    result.uiSurfaces = templates.flatMap((file) => discoverUiSurfaces(file))
    result.sourceWorkflows = inferWorkflows(templates, result.forms)
    result.apiCalls = templates.flatMap((file) => discoverApiCalls(file))
    return result
  }
}

function templateFiles(files: SourceFileContent[]): SourceFileContent[] {
  return files.filter((file) => templateExtensions.has(path.extname(file.file)))
}

function discoverRoutes(file: SourceFileContent): SourceRoute[] {
  const routes = [
    ...attrValues(file.content, 'href').filter((href) => href.startsWith('/') || href.startsWith('#')),
    ...attrValues(file.content, 'routerLink').filter((href) => href.startsWith('/') || href.startsWith('#')),
    ...regexMatches(file.content, /\[routerLink\]\s*=\s*["']\[\s*['"]([^'"]+)['"]/gi)
  ]
  return unique(routes).map((route) => ({
    path: route,
    file: file.relative,
    source: route.startsWith('#') ? 'link' : 'router',
    discoveredBy: ['html-template'],
    framework: 'template',
    confidence: 0.55,
    evidence: [route]
  }))
}

function discoverForms(file: SourceFileContent): SourceForm[] {
  const forms = [...file.content.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)]
  return forms.map((match, index) => {
    const body = match[2]
    const inputs = unique([
      ...attrValues(body, 'aria-label'),
      ...attrValues(body, 'placeholder'),
      ...attrValues(body, 'name'),
      ...attrValues(body, 'formControlName'),
      ...attrValues(body, 'ngModel'),
      ...tagText(body, ['label']),
      ...tagText(body, ['button'])
    ]).slice(0, 20)
    return {
      file: file.relative,
      name: cleanText(tagText(body, ['h1', 'h2', 'h3'])[0] ?? attrValues(match[1], 'aria-label')[0] ?? `Form ${index + 1}`),
      inputs,
      discoveredBy: ['html-template'],
      framework: 'template',
      confidence: inputs.length ? 0.65 : 0.45,
      evidence: inputs
    }
  })
}

function discoverUiSurfaces(file: SourceFileContent): UiSurface[] {
  const headings = tagText(file.content, ['h1', 'h2', 'h3'])
  const buttons = unique([...tagText(file.content, ['button']), ...attrValues(file.content, 'aria-label').filter((value) => /button|copy|submit|save|add|new|create|login|sign/i.test(value))])
  const inputs = unique([
    ...tagText(file.content, ['label']),
    ...attrValues(file.content, 'placeholder'),
    ...attrValues(file.content, 'aria-label'),
    ...attrValues(file.content, 'formControlName'),
    ...attrValues(file.content, 'name')
  ]).slice(0, 20)
  const routes = discoverRoutes(file).map((route) => route.path)
  const surfaces: UiSurface[] = []
  for (const heading of headings.slice(0, 8)) {
    surfaces.push(surface(file, heading, [heading, ...buttons.slice(0, 6), ...inputs.slice(0, 6)], buttons, inputs, 0.5))
  }
  if (surfaces.length === 0 && (buttons.length || inputs.length || routes.length)) {
    surfaces.push(surface(file, wordsFromName(relativeName(file.relative)) || 'Template UI', [...buttons, ...inputs, ...routes].slice(0, 16), buttons, inputs, 0.42))
  }
  return surfaces
}

function surface(file: SourceFileContent, displayName: string, evidence: string[], buttons: string[], inputs: string[], confidence: number): UiSurface {
  return {
    file: file.relative,
    surface_type: 'unknown_ui_section',
    display_name: displayName,
    evidence: unique(evidence).slice(0, 14),
    relatedButtons: unique(buttons).slice(0, 10),
    relatedInputs: unique(inputs).slice(0, 10),
    confidence: roundConfidence(confidence),
    discoveredBy: ['html-template'],
    framework: 'template'
  }
}

function inferWorkflows(files: SourceFileContent[], forms: SourceForm[]): SourceWorkflow[] {
  const workflows: SourceWorkflow[] = []
  const routeFiles = new Set<string>()
  for (const file of files) {
    const text = cleanText(file.content).toLowerCase()
    const actions = unique([
      ...regexMatches(file.content, /\((?:click|submit|ngSubmit)\)\s*=\s*["']([^"']+)["']/gi),
      ...tagText(file.content, ['button'])
    ])
    const routes = discoverRoutes(file)
    if (routes.length) routeFiles.add(file.relative)
    if (forms.some((form) => form.file === file.relative)) {
      workflows.push(workflow('Submit form', file.relative, ['form', ...actions].slice(0, 10), ['Inspect labelled fields', 'Avoid destructive submit unless explicitly safe'], 0.45))
    }
    if (/password|sign in|log in|login/.test(text)) {
      workflows.push(workflow('Login form discoverability', file.relative, ['password', 'sign in', ...actions].slice(0, 10), ['Find email/username field', 'Find password field', 'Find sign in button without submitting credentials'], 0.65))
    }
    if (/search|filter/.test(text)) {
      workflows.push(workflow('Search/filter', file.relative, ['search', 'filter'], ['Find search/filter input', 'Verify filter affordance is visible'], 0.5))
    }
    if (/<table\b|<ul\b|<ol\b|ngFor|v-for|each\s/.test(file.content)) {
      workflows.push(workflow('Table/list scan', file.relative, ['list/table template', ...tagText(file.content, ['th', 'li']).slice(0, 8)], ['Inspect list/table rows', 'Check row actions and overflow'], 0.55))
    }
  }
  if (routeFiles.size > 0) workflows.push(workflow('Navigation route', [...routeFiles].sort(), ['router/href links'], ['Open safe navigation links', 'Verify route or content changes'], 0.55))
  return dedupeWorkflows(workflows)
}

function workflow(name: string, sourceFiles: string | string[], evidence: string[], actions: string[], confidence: number): SourceWorkflow {
  return {
    name,
    sourceFiles: Array.isArray(sourceFiles) ? sourceFiles : [sourceFiles],
    evidence: unique(evidence).slice(0, 12),
    likelyUserActions: actions,
    confidence: roundConfidence(confidence),
    discoveredBy: ['html-template'],
    framework: 'template'
  }
}

function discoverApiCalls(file: SourceFileContent): ApiCall[] {
  return endpointStrings(file.content).map((endpoint) => ({
    endpoint,
    sourceFile: file.relative,
    method: undefined,
    discoveredBy: ['html-template'],
    framework: 'template',
    confidence: 0.35,
    evidence: [endpoint]
  }))
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

function dedupeWorkflows(workflows: SourceWorkflow[]): SourceWorkflow[] {
  const byKey = new Map<string, SourceWorkflow>()
  for (const workflow of workflows) {
    const key = `${workflow.name}:${workflow.sourceFiles.join(',')}`
    if (!byKey.has(key)) byKey.set(key, workflow)
  }
  return [...byKey.values()]
}
