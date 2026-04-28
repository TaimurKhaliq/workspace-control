import type { Issue, RuntimeWorkflowVerification, SourceGraph } from '../types.js'

export interface TriageInput {
  rawFindings: Issue[]
  sourceGraph: SourceGraph
  workflowVerifications: RuntimeWorkflowVerification[]
}

export function triageIssues(input: TriageInput): Issue[] {
  const raw = markInconclusiveScenarioFindings(input.rawFindings, input.workflowVerifications)
  const groups: Issue[] = []
  groups.push(...raw.filter((issue) => ['api_error', 'console_error', 'network_error', 'functional_bug'].includes(issue.type)))
  groups.push(...raw.filter((issue) => ['semantic_mismatch', 'stale_output'].includes(issue.type)))
  const addRepo = scenarioGroup(raw, /add repo target/i, 'Add repo target workflow is not reliably discoverable', 'The Add repo scenario failed to expose expected controls consistently.', 'Improve Add repo modal/form labels, role names, and visibility.')
  if (addRepo) groups.push(addRepo)
  const planOutput = scenarioGroup(raw, /review plan bundle tabs|copy handoff prompt|inspect raw json/i, 'Plan output review/copy workflow is incomplete or not discoverable', 'Plan output review, handoff copy, or raw JSON access failed during scenario execution.', 'Make generated plan output clearly navigable with Overview, Change Set, Recipes, Graph Evidence, Validation, Handoff, and Raw JSON tabs plus accessible copy actions.')
  if (planOutput) groups.push(planOutput)
  const layout = groupedByTypes(raw, ['layout_issue', 'visual_clutter'], 'Repository/workspace lists are hard to scan due to cramped text and overflow', 'List and metadata surfaces have readability/layout problems that make the UI hard to scan.', 'Use a clearer card/table layout with separated metadata, wrapping/truncation, badges, copy path buttons, and tooltips.')
  if (layout) groups.push(layout)
  const accessibility = groupedByTypes(raw, ['accessibility_issue'], 'Key form and generated-output controls need accessible labels/copy affordances', 'Forms and generated-output areas have accessibility/copy affordance gaps.', 'Add explicit labels, aria-labels, dialog names, and accessible copy buttons for generated text and raw JSON.')
  if (accessibility) groups.push(accessibility)
  const loading = groupedByTitle(raw, /loading|error states/i, 'Loading and error states need clearer user feedback', 'Async workflows do not consistently expose visible loading/error guidance.', 'Add localized loading and error states for validation, discovery, learning, and plan generation actions.')
  if (loading) groups.push(loading)
  const productIntent = groupedByTypes(raw, ['product_intent_gap'], 'Plan run history is not usable for repeated prompt workflows', 'Product-intent evidence indicates repeated prompt workflows need browseable/reopenable plan runs.', 'Improve plan run browsing so users can see prior prompts by time/target/status, reopen previous plan bundles, and copy handoff prompts from prior runs.')
  if (productIntent) groups.push(productIntent)

  const groupedIds = new Set(groups.flatMap((group) => childIds(group)))
  const ungrouped = raw.filter((issue) => !issue.issue_id || !groupedIds.has(issue.issue_id))
    .filter((issue) => !['workflow_confusion', 'layout_issue', 'visual_clutter', 'accessibility_issue', 'usability_issue', 'product_intent_gap', 'semantic_mismatch', 'stale_output', 'api_error', 'console_error', 'network_error', 'functional_bug', 'inconclusive', 'test_bug'].includes(issue.type))
  return [...groups, ...ungrouped]
}

export function markInconclusiveScenarioFindings(rawFindings: Issue[], verifications: RuntimeWorkflowVerification[]): Issue[] {
  return rawFindings.map((issue) => {
    if (issue.type !== 'workflow_confusion' || !/^Scenario failed:/i.test(issue.title)) return issue
    const failedControl = failedControlFrom(issue)
    if (!failedControl) return issue
    const matched = verifications.find((verification) =>
      verification.controls.some((control) => control.status === 'found' && sameControl(control.label, failedControl))
    )
    if (!matched) return issue
    return {
      ...issue,
      type: 'inconclusive',
      severity: 'low',
      status: 'inconclusive',
      evidence: [
        ...issue.evidence,
        `Workflow verification found this control earlier in "${matched.name}"; scenario locator may be too strict.`
      ],
      suggestedFixPrompt: `Review the scenario locator and UI accessible names for "${failedControl}". Workflow verification found this control earlier, so this may be a Sniffer test/locator issue rather than an app bug.`
    }
  })
}

function scenarioGroup(raw: Issue[], titlePattern: RegExp, title: string, description: string, suggestedFixPrompt: string): Issue | undefined {
  const items = raw.filter((issue) => titlePattern.test(issue.title))
  if (items.length === 0) return undefined
  const controls = items.map(failedControlFrom).filter(Boolean) as string[]
  const inconclusiveNotes = items.flatMap((issue) => issue.evidence.filter((item) => /scenario locator may be too strict/i.test(item)))
  return groupIssue({
    title,
    description: [
      description,
      controls.length ? `Missing/failed controls: ${[...new Set(controls)].join(', ')}.` : '',
      inconclusiveNotes.length ? 'Some raw findings are inconclusive because runtime workflow verification found matching controls earlier.' : ''
    ].filter(Boolean).join('\n'),
    severity: items.some((issue) => issue.severity === 'medium' || issue.severity === 'high' || issue.severity === 'critical') ? 'medium' : 'low',
    type: 'workflow_confusion',
    items,
    suggestedFixPrompt
  })
}

function groupedByTypes(raw: Issue[], types: Issue['type'][], title: string, description: string, suggestedFixPrompt: string): Issue | undefined {
  const items = raw.filter((issue) => types.includes(issue.type))
  if (items.length === 0) return undefined
  return groupIssue({ title, description, severity: strongest(items), type: types[0], items, suggestedFixPrompt })
}

function groupedByTitle(raw: Issue[], titlePattern: RegExp, title: string, description: string, suggestedFixPrompt: string): Issue | undefined {
  const items = raw.filter((issue) => titlePattern.test(issue.title))
  if (items.length === 0) return undefined
  return groupIssue({ title, description, severity: strongest(items), type: 'usability_issue', items, suggestedFixPrompt })
}

function groupIssue(input: {
  title: string
  description: string
  severity: Issue['severity']
  type: Issue['type']
  items: Issue[]
  suggestedFixPrompt: string
}): Issue {
  const screenshots = input.items.map((issue) => issue.screenshotPath).filter(Boolean) as string[]
  return {
    severity: input.severity,
    type: input.type,
    title: input.title,
    description: input.description,
    evidence: [
      `raw_findings: ${input.items.length}`,
      ...input.items.map((issue) => `raw_finding: ${issue.issue_id ?? issue.title}`),
      ...input.items.flatMap((issue) => issue.evidence).slice(0, 18)
    ],
    suspected_files: [...new Set(input.items.flatMap((issue) => issue.suspected_files ?? []))],
    screenshotPath: screenshots[0],
    suggestedFixPrompt: [
      input.suggestedFixPrompt,
      '',
      'Grouped raw findings:',
      ...input.items.map((issue) => `- ${issue.title}: ${firstEvidence(issue)}`)
    ].join('\n')
  }
}

function failedControlFrom(issue: Issue): string | undefined {
  const evidence = issue.evidence.find((item) => /Missing expected scenario control\/result:/i.test(item))
  return evidence?.replace(/^Missing expected scenario control\/result:\s*/i, '').trim()
}

function sameControl(left: string, right: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const a = normalize(left)
  const b = normalize(right)
  return a === b || a.includes(b) || b.includes(a)
}

function childIds(issue: Issue): string[] {
  return issue.evidence
    .filter((item) => item.startsWith('raw_finding: '))
    .map((item) => item.slice('raw_finding: '.length))
}

function firstEvidence(issue: Issue): string {
  return issue.evidence[0] ?? issue.description
}

function strongest(items: Issue[]): Issue['severity'] {
  const order = { critical: 4, high: 3, medium: 2, low: 1 }
  return items.reduce<Issue['severity']>((strongestSoFar, item) => order[item.severity] > order[strongestSoFar] ? item.severity : strongestSoFar, 'low')
}
