import type { Issue, ScenarioRun, ScreenshotItem, SnifferReport } from '../api'

export interface ScreenshotEvidenceItem extends ScreenshotItem {
  typeLabel: string
  scenarioName?: string
  stepLabel?: string
  actionLabel?: string
  pageUrl?: string
  screenName?: string
  stateHash?: string
  sequenceLabel?: string
  relatedIssues: Issue[]
  relatedFixPacketIds: string[]
  contextAvailable: boolean
  contextSummary: string
  details: string[]
}

interface ScreenshotEvidenceContext {
  typeLabel?: string
  scenarioName?: string
  stepLabel?: string
  actionLabel?: string
  pageUrl?: string
  screenName?: string
  stateHash?: string
  sequenceLabel?: string
  issue?: Issue
  fixPacketId?: string
}

export function buildScreenshotEvidenceItems(report: SnifferReport | null | undefined, screenshots: ScreenshotItem[]): ScreenshotEvidenceItem[] {
  const contextByPath = new Map<string, ScreenshotEvidenceContext[]>()
  const add = (screenshotPath: string | undefined, context: ScreenshotEvidenceContext) => {
    if (!screenshotPath) return
    for (const key of screenshotKeys(screenshotPath)) {
      const existing = contextByPath.get(key) ?? []
      existing.push(context)
      contextByPath.set(key, existing)
    }
  }

  for (const state of report?.crawlGraph?.states ?? []) {
    add(state.screenshotPath, {
      typeLabel: 'state',
      screenName: state.inferredScreenName,
      pageUrl: state.url,
      stateHash: state.stateHash ?? state.hash,
      sequenceLabel: state.sequenceNumber ? `State ${state.sequenceNumber}` : undefined
    })
  }

  for (const action of report?.crawlGraph?.actions ?? []) {
    add(action.screenshotBefore, {
      typeLabel: 'state',
      actionLabel: `Before ${action.label}`,
      pageUrl: action.urlBefore,
      stateHash: action.stateHashBefore,
      sequenceLabel: action.sequenceNumber ? `Action ${action.sequenceNumber} before` : undefined
    })
    add(action.screenshotAfter, {
      typeLabel: 'state',
      actionLabel: action.label,
      pageUrl: action.urlAfter ?? action.urlBefore,
      stateHash: action.stateHashAfter,
      sequenceLabel: action.sequenceNumber ? `Action ${action.sequenceNumber} after` : undefined
    })
  }

  for (const scenario of report?.scenarioRuns ?? []) {
    addScenarioEvidence(contextByPath, scenario)
  }

  for (const context of report?.productExperience?.contexts ?? []) {
    add(context.screenshot_path, {
      typeLabel: 'scenario',
      scenarioName: asString(context.scenario_name),
      stepLabel: asString(context.scenario_step),
      actionLabel: context.nav_label_clicked ? `Navigate to ${context.nav_label_clicked}` : undefined,
      screenName: context.current_screen_name,
      pageUrl: asString(context.screenshot_artifact_url)
    })
  }

  for (const issue of report?.issues ?? []) {
    add(issue.screenshotPath, {
      typeLabel: 'evidence',
      issue,
      fixPacketId: issue.issue_id,
      sequenceLabel: issue.severity ? `${issue.severity} issue` : undefined
    })
  }

  if (report?.runtimeDomSnapshot?.screenshotPath) {
    add(report.runtimeDomSnapshot.screenshotPath, {
      typeLabel: 'state',
      screenName: report.runtimeDomSnapshot.title,
      pageUrl: report.runtimeDomSnapshot.url,
      sequenceLabel: 'Initial runtime DOM'
    })
  }

  return screenshots.map((item, index) => {
    const contexts = uniqueContexts(screenshotKeys(item.relativePath).flatMap((key) => contextByPath.get(key) ?? []))
    const primary = mergeContexts(contexts)
    const typeLabel = primary.typeLabel ?? typeFromScreenshot(item)
    const relatedIssues = contexts.map((context) => context.issue).filter((issue): issue is Issue => Boolean(issue))
    const relatedFixPacketIds = unique(contexts.map((context) => context.fixPacketId).filter((id): id is string => Boolean(id)))
    const contextAvailable = Boolean(
      primary.scenarioName ||
      primary.stepLabel ||
      primary.actionLabel ||
      primary.pageUrl ||
      primary.screenName ||
      primary.stateHash ||
      relatedIssues.length
    )
    const sequenceLabel = primary.sequenceLabel ?? `Screenshot ${index + 1}`
    const details = detailsForScreenshot({
      ...primary,
      typeLabel,
      sequenceLabel
    }, relatedIssues, relatedFixPacketIds, item)
    return {
      ...item,
      typeLabel,
      scenarioName: primary.scenarioName,
      stepLabel: primary.stepLabel,
      actionLabel: primary.actionLabel,
      pageUrl: primary.pageUrl,
      screenName: primary.screenName,
      stateHash: primary.stateHash,
      sequenceLabel,
      relatedIssues,
      relatedFixPacketIds,
      contextAvailable,
      contextSummary: contextAvailable ? summaryForContext(primary, typeLabel, sequenceLabel) : 'Context unavailable',
      details: contextAvailable ? details : ['Context unavailable', `File: ${item.relativePath}`, `Type: ${typeLabel}`]
    }
  })
}

function addScenarioEvidence(contextByPath: Map<string, ScreenshotEvidenceContext[]>, scenario: ScenarioRun): void {
  const add = (screenshotPath: string | undefined, context: ScreenshotEvidenceContext) => {
    if (!screenshotPath) return
    for (const key of screenshotKeys(screenshotPath)) {
      const existing = contextByPath.get(key) ?? []
      existing.push(context)
      contextByPath.set(key, existing)
    }
  }
  for (const trace of scenario.stepTraces ?? []) {
    add(trace.screenshotPath, {
      typeLabel: 'generated scenario',
      scenarioName: trace.scenarioName ?? scenario.name,
      stepLabel: trace.stepName,
      actionLabel: trace.actionLabel,
      pageUrl: trace.url,
      screenName: trace.screenName
    })
  }
  for (const assertion of scenario.assertions ?? []) {
    add(assertion.screenshotPath, {
      typeLabel: 'scenario',
      scenarioName: scenario.name,
      stepLabel: assertion.label,
      actionLabel: assertion.label,
      sequenceLabel: assertion.status
    })
  }
  for (const [index, screenshot] of (scenario.screenshots ?? []).entries()) {
    add(screenshot, {
      typeLabel: scenario.slug?.includes('generated') || screenshot.includes('/generated-scenarios/') ? 'generated scenario' : 'scenario',
      scenarioName: scenario.name,
      stepLabel: scenario.stepsAttempted?.[index],
      sequenceLabel: `Scenario screenshot ${index + 1}`
    })
  }
}

function detailsForScreenshot(
  context: ScreenshotEvidenceContext,
  issues: Issue[],
  fixPacketIds: string[],
  item: ScreenshotItem
): string[] {
  return [
    `Type: ${context.typeLabel ?? typeFromScreenshot(item)}`,
    context.scenarioName ? `Scenario: ${context.scenarioName}` : undefined,
    context.stepLabel ? `Step: ${context.stepLabel}` : undefined,
    context.actionLabel ? `Action: ${context.actionLabel}` : undefined,
    context.screenName ? `Screen: ${context.screenName}` : undefined,
    context.pageUrl ? `URL: ${context.pageUrl}` : undefined,
    context.stateHash ? `State hash: ${context.stateHash}` : undefined,
    context.sequenceLabel ? `Sequence: ${context.sequenceLabel}` : undefined,
    issues.length ? `Related issue: ${issues.map((issue) => issue.title).join('; ')}` : undefined,
    fixPacketIds.length ? `Related fix packet: ${fixPacketIds.join(', ')}` : undefined,
    `File: ${item.relativePath}`
  ].filter(Boolean) as string[]
}

function summaryForContext(context: ScreenshotEvidenceContext, typeLabel: string, sequenceLabel?: string): string {
  if (context.scenarioName && context.actionLabel) return `Scenario: ${context.scenarioName} · Action: ${context.actionLabel}`
  if (context.scenarioName && context.stepLabel) return `Scenario: ${context.scenarioName} · Step: ${context.stepLabel}`
  if (context.screenName && context.pageUrl) return `Screen: ${context.screenName} · URL: ${context.pageUrl}`
  if (context.actionLabel) return `Action: ${context.actionLabel}`
  if (context.screenName) return `Screen: ${context.screenName}`
  return `${typeLabel}${sequenceLabel ? ` · ${sequenceLabel}` : ''}`
}

function mergeContexts(contexts: ScreenshotEvidenceContext[]): ScreenshotEvidenceContext {
  return contexts.reduce<ScreenshotEvidenceContext>((acc, item) => ({
    typeLabel: acc.typeLabel ?? item.typeLabel,
    scenarioName: acc.scenarioName ?? item.scenarioName,
    stepLabel: acc.stepLabel ?? item.stepLabel,
    actionLabel: acc.actionLabel ?? item.actionLabel,
    pageUrl: acc.pageUrl ?? item.pageUrl,
    screenName: acc.screenName ?? item.screenName,
    stateHash: acc.stateHash ?? item.stateHash,
    sequenceLabel: acc.sequenceLabel ?? item.sequenceLabel
  }), {})
}

function typeFromScreenshot(item: ScreenshotItem): string {
  const path = `${item.group}/${item.relativePath}/${item.name}`.toLowerCase()
  if (path.includes('generated-scenarios')) return 'generated scenario'
  if (path.includes('scenario')) return 'scenario'
  if (path.includes('consistency')) return 'consistency'
  if (path.includes('ux')) return 'UX'
  if (path.includes('state-') || item.group === 'states') return 'state'
  return item.group || 'evidence'
}

function screenshotKeys(value: string): string[] {
  const normalized = normalizeScreenshotPath(value)
  const parts = normalized.split('/')
  const screenshotsIndex = parts.lastIndexOf('screenshots')
  const fromScreenshots = screenshotsIndex >= 0 ? parts.slice(screenshotsIndex).join('/') : normalized
  return unique([
    normalized,
    fromScreenshots,
    parts.slice(-2).join('/'),
    parts[parts.length - 1]
  ].filter(Boolean))
}

function normalizeScreenshotPath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/^\/api\/reports\/latest\/artifacts\//, '')
    .replace(/\?.*$/, '')
    .split('/')
    .map((part) => {
      try {
        return decodeURIComponent(part)
      } catch {
        return part
      }
    })
    .join('/')
}

function uniqueContexts(contexts: ScreenshotEvidenceContext[]): ScreenshotEvidenceContext[] {
  const seen = new Set<string>()
  return contexts.filter((context) => {
    const key = JSON.stringify(context)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}
