import type { Issue, RuntimeDomControl, RuntimeDomSnapshot } from '../types.js'

export function analyzeRuntimeDomQuality(snapshot: RuntimeDomSnapshot): Issue[] {
  if (!hasPlanRunItems(snapshot)) return []
  return groupIssues([
    ...duplicateButtonNameIssues(snapshot),
    ...planRunRepeatedTextIssues(snapshot),
    ...suspiciousBoundingBoxIssues(snapshot)
  ])
}

function duplicateButtonNameIssues(snapshot: RuntimeDomSnapshot): Issue[] {
  const groups = groupBy(snapshot.buttons.filter((button) => !button.disabled), (button) => normalizeLabel(labelOf(button)))
  const issues: Issue[] = []
  for (const [name, buttons] of groups) {
    if (!name || buttons.length < 2) continue
    if (!isPlanRunReopenGroup(name, buttons, snapshot)) continue
    issues.push(issue(
      'medium',
      'locator_quality_issue',
      'Repeated Reopen buttons have ambiguous accessible names',
      `The accessible name "${labelOf(buttons[0])}" appears on ${buttons.length} plan-run buttons, which makes unscoped Playwright locators ambiguous and gives screen reader users less context.`,
      [
        `button_name: ${labelOf(buttons[0])}`,
        `count: ${buttons.length}`,
        `current_locator: getByRole('button', { name: ${JSON.stringify(labelOf(buttons[0]))} })`,
        'recommended_scoped_locator: getByTestId("plan-run-item").nth(0).getByRole("button", { name: "Reopen" })',
        'recommended_accessible_name: aria-label="Reopen plan run: <prompt>, <date>"'
      ],
      snapshot.screenshotPath,
      'Give each Reopen button a unique accessible name using the prompt/date/target, or ensure generated tests scope Reopen locators to the nearest plan-run item container.'
    ))
  }
  return issues
}

function planRunRepeatedTextIssues(snapshot: RuntimeDomSnapshot): Issue[] {
  const planRunCards = snapshot.controls.filter((control) => control.dataTestId === 'plan-run-item')
  const evidence = planRunCards
    .map((control) => repeatedTextEvidence(control.visibleText ?? control.accessibleName ?? ''))
    .filter(Boolean) as string[]
  if (evidence.length === 0) return []
  return [issue(
    'medium',
    'scanability_issue',
    'Plan run card repeats status/chip text',
    'One or more plan-run cards repeat adjacent status or semantic-chip labels, which can make the list harder to scan and may be read twice by accessibility APIs.',
    evidence.slice(0, 8),
    snapshot.screenshotPath,
    'Review plan-run card markup so status and semantic chips are rendered once. If duplicate text exists only for screen readers, hide visual duplicates with aria-hidden or use a single clear accessible label.'
  )]
}

function suspiciousBoundingBoxIssues(snapshot: RuntimeDomSnapshot): Issue[] {
  const suspicious = snapshot.controls
    .filter((control) => control.visible)
    .filter((control) => {
      const box = control.boundingBox
      if (!box || box.width > 1 || box.height > 1) return false
      const label = labelOf(control)
      return Boolean(label) && (
        /plan-run-status|plan-run-semantic-chip/i.test(control.dataTestId ?? '') ||
        /completed|failed|running|semantic\s+(on|off)/i.test(label)
      )
    })
    .slice(0, 8)
  if (suspicious.length === 0) return []
  return [issue(
    'low',
    'visibility_issue',
    'Visible status/chip text has suspicious 1px bounding box',
    'Runtime DOM marked meaningful plan-run status/chip text as visible even though its bounding box is only 1x1 pixels. This can mean the UI is visually hiding meaningful text, or the collector needs to classify it as hidden/screen-reader-only.',
    suspicious.map((control) => `${control.dataTestId ?? control.selectorHint ?? control.id}: "${labelOf(control)}" box=${control.boundingBox?.width}x${control.boundingBox?.height}`),
    snapshot.screenshotPath,
    'Make visible status/chip labels have plausible dimensions, or mark screen-reader-only text with a recognizable hidden class/aria pattern so Sniffer does not treat it as visible visual evidence.'
  )]
}

function isPlanRunReopenGroup(name: string, buttons: RuntimeDomControl[], snapshot: RuntimeDomSnapshot): boolean {
  if (!/^reopen$/i.test(name)) return false
  const hasPlanRunCards = hasPlanRunItems(snapshot)
  const buttonsArePlanRunReopen = buttons.some((button) => button.dataTestId === 'reopen-plan-run-button')
  return hasPlanRunCards && buttonsArePlanRunReopen
}

function hasPlanRunItems(snapshot: RuntimeDomSnapshot): boolean {
  return snapshot.controls.some((control) => control.dataTestId === 'plan-run-item')
}

function repeatedTextEvidence(text: string): string | undefined {
  const tokens = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (tokens.length < 2) return undefined
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (normalizeToken(tokens[index]) && normalizeToken(tokens[index]) === normalizeToken(tokens[index + 1])) {
      return `adjacent repeated token: "${tokens[index]} ${tokens[index + 1]}" in "${truncate(text)}"`
    }
  }
  for (let index = 0; index < tokens.length - 3; index += 1) {
    const first = `${normalizeToken(tokens[index])} ${normalizeToken(tokens[index + 1])}`
    const second = `${normalizeToken(tokens[index + 2])} ${normalizeToken(tokens[index + 3])}`
    if (first.trim() && first === second) {
      return `adjacent repeated phrase: "${tokens[index]} ${tokens[index + 1]} ${tokens[index + 2]} ${tokens[index + 3]}" in "${truncate(text)}"`
    }
  }
  return undefined
}

function issue(severity: Issue['severity'], type: Issue['type'], title: string, description: string, evidence: string[], screenshotPath: string | undefined, suggestedFixPrompt: string): Issue {
  return { severity, type, title, description, evidence, screenshotPath, suggestedFixPrompt }
}

function groupIssues(issues: Issue[]): Issue[] {
  const grouped = new Map<string, Issue>()
  for (const item of issues) {
    const key = `${item.type}:${item.title}`
    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, item)
      continue
    }
    existing.evidence = [...new Set([...existing.evidence, ...item.evidence])].slice(0, 12)
    existing.screenshotPath ||= item.screenshotPath
    existing.severity = strongerSeverity(existing.severity, item.severity)
  }
  return [...grouped.values()]
}

function groupBy<T>(items: T[], keyFor: (item: T) => string): Map<string, T[]> {
  return items.reduce<Map<string, T[]>>((groups, item) => {
    const key = keyFor(item)
    groups.set(key, [...(groups.get(key) ?? []), item])
    return groups
  }, new Map())
}

function strongerSeverity(left: Issue['severity'], right: Issue['severity']): Issue['severity'] {
  const order = { critical: 4, high: 3, medium: 2, low: 1 }
  return order[right] > order[left] ? right : left
}

function labelOf(control: RuntimeDomControl): string {
  return (control.accessibleName ?? control.visibleText ?? control.labelText ?? control.placeholder ?? control.dataTestId ?? control.href ?? control.id).replace(/\s+/g, ' ').trim()
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function normalizeToken(value: string | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function truncate(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 180)
}
