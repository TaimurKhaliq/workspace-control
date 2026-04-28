import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, type Locator, type Page } from 'playwright'
import type { Issue, PromptConsistencyContext, PromptConsistencyDecision, PromptConsistencyPrompt, PromptConsistencyResult, PromptConsistencyRun, SourceGraph } from '../types.js'
import type { LlmProvider } from '../llm/provider.js'

export const BUILT_IN_CONSISTENCY_PROMPTS: PromptConsistencyPrompt[] = [
  {
    id: 'pet-photo-upload',
    input_prompt: 'add the ability to upload a picture of your pet',
    expected_concepts: ['upload', 'picture', 'photo', 'image', 'file_upload', 'media_upload', 'storage', 'backend_model'],
    forbidden_stale_concepts: []
  },
  {
    id: 'pet-friends',
    input_prompt: 'the ability to add other pets as friends',
    expected_concepts: ['pet', 'friend', 'friends', 'relationship', 'association', 'link', 'social', 'companion', 'related pets'],
    forbidden_stale_concepts: [
      'upload',
      'file input',
      'preview',
      'picture',
      'photo',
      'image',
      'media_upload',
      'file_upload',
      'storage strategy',
      'DB blob',
      'filesystem',
      'object storage',
      'image metadata'
    ]
  }
]

export async function runPromptConsistencyCheck(input: {
  url: string
  reportDir: string
  sourceGraph: SourceGraph
  promptsSource?: string
  provider?: LlmProvider
  useLlm?: boolean
}): Promise<PromptConsistencyResult> {
  const prompts = await loadConsistencyPrompts(input.promptsSource)
  const screenshotsDir = path.join(input.reportDir, 'screenshots', 'consistency')
  await mkdir(screenshotsDir, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const runs: PromptConsistencyRun[] = []
  const decisions: PromptConsistencyDecision[] = []
  const screenshots: string[] = []

  try {
    await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => undefined)
    await ensurePlanningContext(page)

    for (const prompt of prompts) {
      await generatePrompt(page, prompt.input_prompt)
      const screenshotPath = path.join(screenshotsDir, `${prompt.id}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined)
      screenshots.push(screenshotPath)
      const extracted = await extractPromptOutput(page, prompt, screenshotPath)
      const deterministic = deterministicConsistencyDecision(extracted, prompt)
      const decision = input.useLlm && input.provider?.critiquePromptConsistency
        ? await input.provider.critiquePromptConsistency(buildConsistencyContext({
          current: extracted,
          prior: runs.at(-1),
          deterministic,
          prompt
        })).catch(() => deterministic)
        : deterministic
      extracted.consistency_status = decision.classification
      extracted.stale_concepts_detected = decision.stale_concepts
      runs.push(extracted)
      decisions.push(decision)
    }
  } finally {
    await browser.close()
  }

  const issues = runs.flatMap((run, index) =>
    consistencyIssueForRun(run, prompts[index], decisions[index], runs[index - 1], input.sourceGraph)
  )
  return {
    enabled: true,
    prompts,
    runs,
    decisions,
    issues,
    screenshots
  }
}

export async function loadConsistencyPrompts(source = 'built-in'): Promise<PromptConsistencyPrompt[]> {
  if (!source || source === 'built-in') return BUILT_IN_CONSISTENCY_PROMPTS
  const parsed = JSON.parse(await readFile(source, 'utf8')) as { prompts?: PromptConsistencyPrompt[] } | PromptConsistencyPrompt[]
  const prompts = Array.isArray(parsed) ? parsed : parsed.prompts ?? []
  if (prompts.length < 2) throw new Error('--consistency-prompts must provide at least two prompts')
  return prompts.map((prompt, index) => ({
    id: prompt.id || `prompt-${index + 1}`,
    input_prompt: prompt.input_prompt,
    expected_concepts: prompt.expected_concepts ?? [],
    forbidden_stale_concepts: prompt.forbidden_stale_concepts ?? []
  }))
}

export function deterministicConsistencyDecision(run: PromptConsistencyRun, prompt: PromptConsistencyPrompt): PromptConsistencyDecision {
  const staleConcepts = detectStaleConcepts(run, prompt.forbidden_stale_concepts)
  const featureMismatch = Boolean(run.response_feature_request && !normalizedEquivalent(run.response_feature_request, run.input_prompt))
  if (featureMismatch) {
    return {
      classification: 'stale_output',
      confidence: 'high',
      reasoning_summary: `Plan Bundle feature_request did not match the current input prompt. Expected "${run.input_prompt}", got "${run.response_feature_request}".`,
      stale_concepts: staleConcepts,
      should_report: true
    }
  }
  if (staleConcepts.length >= 2) {
    return {
      classification: 'semantic_mismatch',
      confidence: 'high',
      reasoning_summary: `Output for "${run.input_prompt}" contains stale concepts from a different workflow: ${staleConcepts.join(', ')}.`,
      stale_concepts: staleConcepts,
      should_report: true
    }
  }
  if (staleConcepts.length === 1) {
    return {
      classification: 'inconclusive',
      confidence: 'low',
      reasoning_summary: `One potentially stale concept was detected (${staleConcepts[0]}), but a single term is not enough to prove stale output.`,
      stale_concepts: staleConcepts,
      should_report: false
    }
  }
  return {
    classification: 'consistent',
    confidence: 'medium',
    reasoning_summary: `Output appears consistent with "${run.input_prompt}".`,
    stale_concepts: [],
    should_report: false
  }
}

export function detectStaleConcepts(run: PromptConsistencyRun, forbiddenConcepts: string[]): string[] {
  const text = [
    run.rendered_text,
    run.handoff_text,
    run.semantic_labels.join(' '),
    run.recommended_paths.join(' ')
  ].join('\n')
  return forbiddenConcepts.filter((concept) => conceptPattern(concept).test(text))
}

export function consistencyIssueForRun(
  run: PromptConsistencyRun,
  prompt: PromptConsistencyPrompt,
  decision: PromptConsistencyDecision,
  priorRun: PromptConsistencyRun | undefined,
  sourceGraph: SourceGraph
): Issue[] {
  if (!decision.should_report || !['semantic_mismatch', 'stale_output'].includes(decision.classification)) return []
  const type: Issue['type'] = decision.classification === 'stale_output' ? 'stale_output' : 'semantic_mismatch'
  const title = type === 'stale_output'
    ? 'Generated plan bundle feature request does not match current prompt'
    : 'Generated handoff appears stale or unrelated to current prompt'
  return [{
    severity: 'high',
    type,
    title,
    description: [
      `Sniffer generated prompt "${run.input_prompt}" after${priorRun ? ` prior prompt "${priorRun.input_prompt}"` : ' a previous run'}.`,
      decision.reasoning_summary,
      'Generated output must be keyed to the current active prompt and plan run, not stale semantic or handoff content from another prompt.'
    ].join('\n'),
    evidence: [
      `input_prompt: ${run.input_prompt}`,
      run.response_feature_request ? `response_feature_request: ${run.response_feature_request}` : 'response_feature_request: unavailable',
      priorRun ? `prior_prompt: ${priorRun.input_prompt}` : undefined,
      `classification: ${decision.classification}`,
      `stale_concepts: ${decision.stale_concepts.join(', ') || 'none'}`,
      `semantic_labels: ${run.semantic_labels.join(', ') || 'none'}`,
      `recommended_paths: ${run.recommended_paths.slice(0, 8).join(', ') || 'none'}`,
      `handoff_excerpt: ${excerpt(run.handoff_text, 500)}`,
      `rendered_excerpt: ${excerpt(run.rendered_text, 500)}`
    ].filter(Boolean) as string[],
    suspected_files: consistencySuspectedFiles(sourceGraph),
    screenshotPath: run.screenshotPath,
    suggestedFixPrompt: [
      'Fix stale or semantically mismatched generated plan output.',
      '- Ensure the UI sends the current feature request, selected target id, and semantic flag for every generation request.',
      '- Ensure stale async responses cannot overwrite newer responses.',
      '- Ensure semantic cache or enrichment is keyed by feature_request + target_id where prompt-specific content is used.',
      '- Ensure Handoff and Raw JSON tabs render the current active plan bundle only.',
      '- Ensure plan run switching updates handoff, semantic labels, recommendations, and raw JSON together.',
      `Current prompt: ${run.input_prompt}`,
      priorRun ? `Prior prompt: ${priorRun.input_prompt}` : '',
      `Detected stale concepts: ${decision.stale_concepts.join(', ') || 'none'}`
    ].filter(Boolean).join('\n')
  }]
}

function buildConsistencyContext(input: {
  current: PromptConsistencyRun
  prior?: PromptConsistencyRun
  deterministic: PromptConsistencyDecision
  prompt: PromptConsistencyPrompt
}): PromptConsistencyContext {
  return {
    current_prompt: input.current.input_prompt,
    prior_prompt: input.prior?.input_prompt,
    rendered_output_excerpt: excerpt(input.current.rendered_text, 2500),
    handoff_excerpt: excerpt(input.current.handoff_text, 1800),
    semantic_labels: input.current.semantic_labels.slice(0, 24),
    recommended_paths: input.current.recommended_paths.slice(0, 24),
    response_feature_request: input.current.response_feature_request,
    forbidden_concepts_detected: input.deterministic.stale_concepts,
    question_for_critic: 'Does the output answer the current prompt, or does it appear stale/unrelated? Return structured JSON only.'
  }
}

async function ensurePlanningContext(page: Page): Promise<void> {
  await clickFirst(page, [page.getByRole('button', { name: /^Plan Runs$/i })])
  await selectFirstOption(page.getByTestId('workspace-selector'))
  await clickFirst(page, [page.getByRole('button', { name: /^Plan Runs$/i })])
  await selectFirstOption(page.getByTestId('target-repo-select'))
}

async function generatePrompt(page: Page, prompt: string): Promise<void> {
  await clickFirst(page, [page.getByRole('button', { name: /^Plan Runs$/i })])
  const promptField = page.getByTestId('feature-request-textarea')
    .or(page.getByLabel(/feature request|prompt/i))
    .or(page.locator('textarea').first())
  await promptField.first().fill(prompt, { timeout: 2_000 })
  await page.getByTestId('generate-plan-button').or(page.getByRole('button', { name: /generate.*plan/i })).first().click({ timeout: 2_000 })
  await page.getByTestId('plan-bundle-view').waitFor({ timeout: 20_000 }).catch(() => undefined)
  await page.waitForLoadState('networkidle', { timeout: 4_000 }).catch(() => undefined)
}

async function extractPromptOutput(page: Page, prompt: PromptConsistencyPrompt, screenshotPath: string): Promise<PromptConsistencyRun> {
  const renderedText = await page.getByTestId('plan-bundle-view').innerText({ timeout: 1_000 }).catch(() => '')
  await clickFirst(page, [page.getByTestId('plan-tab-handoff'), page.getByRole('tab', { name: /handoff/i })])
  const handoffText = await page.getByTestId('handoff-prompt-panel').or(page.locator('pre')).first().innerText({ timeout: 1_000 }).catch(() => '')
  await clickFirst(page, [page.getByTestId('plan-tab-json'), page.getByRole('tab', { name: /raw json|json/i })])
  const rawJsonText = await page.getByTestId('plan-json-viewer').locator('pre').first().innerText({ timeout: 1_000 }).catch(() => '')
  const raw = parseRawPlanBundle(rawJsonText)
  return {
    prompt_id: prompt.id,
    input_prompt: prompt.input_prompt,
    response_feature_request: stringValue(raw?.feature_request),
    rendered_text: renderedText,
    handoff_text: handoffText,
    semantic_labels: semanticLabels(raw, renderedText),
    recommended_paths: recommendedPaths(raw, renderedText),
    stale_concepts_detected: [],
    consistency_status: 'consistent',
    screenshotPath
  }
}

function parseRawPlanBundle(rawJsonText: string): Record<string, unknown> | undefined {
  if (!rawJsonText.trim()) return undefined
  try {
    return JSON.parse(rawJsonText) as Record<string, unknown>
  } catch {
    return undefined
  }
}

function semanticLabels(raw: Record<string, unknown> | undefined, renderedText: string): string[] {
  const enrichment = raw?.semantic_enrichment as Record<string, unknown> | undefined
  const spec = enrichment?.feature_spec as Record<string, unknown> | undefined
  const labels = [
    ...arrayStrings(enrichment?.technical_intent_labels),
    ...arrayStrings(enrichment?.technical_intents),
    ...arrayStrings(spec?.technical_intent_labels),
    ...arrayStrings(spec?.technical_intents)
  ]
  const known = ['file_upload', 'media_upload', 'storage', 'persistence', 'backend_model', 'retrieval', 'display', 'validation', 'relationship', 'association']
  for (const label of known) {
    if (new RegExp(`\\b${escapeRegex(label)}\\b`, 'i').test(renderedText)) labels.push(label)
  }
  return [...new Set(labels)]
}

function recommendedPaths(raw: Record<string, unknown> | undefined, renderedText: string): string[] {
  const changes = Array.isArray(raw?.recommended_change_set) ? raw.recommended_change_set as Record<string, unknown>[] : []
  const paths = changes.map((item) => stringValue(item.path)).filter(Boolean) as string[]
  const fromText = [...renderedText.matchAll(/\b(?:client\/src|src\/main|web\/src|server\/|src\/)[^\s,;)]+/g)].map((match) => match[0])
  return [...new Set([...paths, ...fromText])].slice(0, 40)
}

function consistencySuspectedFiles(sourceGraph: SourceGraph): string[] {
  const files = new Set<string>([
    'src/App.tsx',
    'src/api.ts',
    '../server/routes/plan_bundles.py',
    '../server/planner.py'
  ])
  if (sourceGraph.apiCalls.some((call) => /semantic/i.test(`${call.endpoint} ${call.functionName ?? ''} ${call.likelyWorkflow ?? ''}`))) {
    files.add('../app/services/semantic_enrichment.py')
  } else {
    files.add('../app/services/semantic_enrichment.py')
  }
  sourceGraph.uiSurfaces
    .filter((surface) => ['prompt_composer', 'plan_bundle_view', 'handoff_prompt_panel', 'raw_json_panel'].includes(surface.surface_type))
    .forEach((surface) => files.add(surface.file))
  return [...files].sort()
}

function conceptPattern(concept: string): RegExp {
  const normalized = concept.toLowerCase()
  if (normalized === 'db blob') return /\b(?:db|database)\s+blob\b|\bblob storage\b/i
  if (normalized === 'file input') return /\bfile\s+input\b|<input[^>]+type=["']file/i
  return new RegExp(`\\b${escapeRegex(concept).replace(/\\s+/g, '\\s+')}\\b`, 'i')
}

function normalizedEquivalent(left: string, right: string): boolean {
  return normalizeText(left) === normalizeText(right)
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function arrayStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function excerpt(text: string, length: number): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, length)
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function clickFirst(page: Page, locators: Locator[]): Promise<void> {
  for (const locator of locators) {
    if (await locator.first().isVisible({ timeout: 500 }).catch(() => false)) {
      await locator.first().click({ timeout: 1_500 }).catch(() => undefined)
      await page.waitForTimeout(150)
      return
    }
  }
}

async function selectFirstOption(locator: Locator): Promise<boolean> {
  const first = locator.first()
  if (!await first.isVisible({ timeout: 500 }).catch(() => false)) return false
  const values = await first.locator('option').evaluateAll((options) =>
    options
      .map((option) => (option as HTMLOptionElement).value)
      .filter((value) => value.length > 0)
  ).catch(() => [])
  if (!values[0]) return false
  await first.selectOption(values[0], { timeout: 1_500 }).catch(() => undefined)
  return true
}
