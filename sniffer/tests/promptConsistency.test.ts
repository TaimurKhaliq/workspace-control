import { describe, expect, it } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { MockLlmProvider } from '../src/llm/mockProvider.js'
import { generateFixPackets } from '../src/repair/fixPackets.js'
import {
  BUILT_IN_CONSISTENCY_PROMPTS,
  consistencyIssueForRun,
  deterministicConsistencyDecision
} from '../src/runtime/promptConsistency.js'
import type { Issue, PromptConsistencyContext, PromptConsistencyRun, SnifferReport, SourceGraph } from '../src/types.js'

describe('prompt/output consistency', () => {
  it('flags pet-friends output containing stale upload/photo/storage concepts', () => {
    const prompt = BUILT_IN_CONSISTENCY_PROMPTS[1]
    const run = runFor(prompt.input_prompt, {
      rendered_text: 'Plan for pet friends includes file input preview and image metadata.',
      handoff_text: 'Add upload storage strategy with DB blob or filesystem object storage.',
      semantic_labels: ['file_upload', 'media_upload', 'storage']
    })

    const decision = deterministicConsistencyDecision(run, prompt)

    expect(decision.classification).toBe('semantic_mismatch')
    expect(decision.should_report).toBe(true)
    expect(decision.stale_concepts).toEqual(expect.arrayContaining(['file input', 'image', 'file_upload', 'storage strategy']))
  })

  it('does not flag upload/photo concepts for the pet-photo prompt', () => {
    const prompt = BUILT_IN_CONSISTENCY_PROMPTS[0]
    const run = runFor(prompt.input_prompt, {
      rendered_text: 'Add pet photo upload and image preview.',
      handoff_text: 'Use file_upload media_upload storage validation.',
      semantic_labels: ['file_upload', 'media_upload', 'storage'],
      response_feature_request: prompt.input_prompt
    })

    const decision = deterministicConsistencyDecision(run, prompt)

    expect(decision.classification).toBe('consistent')
    expect(decision.should_report).toBe(false)
  })

  it('flags feature_request mismatch as stale output', () => {
    const prompt = BUILT_IN_CONSISTENCY_PROMPTS[1]
    const run = runFor(prompt.input_prompt, {
      response_feature_request: BUILT_IN_CONSISTENCY_PROMPTS[0].input_prompt,
      rendered_text: 'Pet friends plan',
      handoff_text: 'Pet friends handoff'
    })

    const decision = deterministicConsistencyDecision(run, prompt)

    expect(decision.classification).toBe('stale_output')
    expect(decision.should_report).toBe(true)
  })

  it('creates a high severity issue for stale previous run text', () => {
    const prompt = BUILT_IN_CONSISTENCY_PROMPTS[1]
    const prior = runFor(BUILT_IN_CONSISTENCY_PROMPTS[0].input_prompt)
    const current = runFor(prompt.input_prompt, {
      rendered_text: 'Pet friends output with upload photo preview and storage strategy.',
      handoff_text: 'Use file input and object storage for image metadata.'
    })
    const decision = deterministicConsistencyDecision(current, prompt)

    const issues = consistencyIssueForRun(current, prompt, decision, prior, sourceGraph())

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      severity: 'high',
      type: 'semantic_mismatch',
      title: 'Generated handoff appears stale or unrelated to current prompt'
    })
    expect(issues[0].suspected_files).toEqual(expect.arrayContaining([
      'src/App.tsx',
      'src/api.ts',
      '../server/routes/plan_bundles.py',
      '../app/services/semantic_enrichment.py'
    ]))
  })

  it('mock LLM critic classifies stale output from deterministic stale concepts', async () => {
    const context: PromptConsistencyContext = {
      current_prompt: BUILT_IN_CONSISTENCY_PROMPTS[1].input_prompt,
      prior_prompt: BUILT_IN_CONSISTENCY_PROMPTS[0].input_prompt,
      rendered_output_excerpt: 'file input preview',
      handoff_excerpt: 'storage strategy',
      semantic_labels: ['file_upload', 'storage'],
      recommended_paths: [],
      forbidden_concepts_detected: ['file input', 'storage strategy'],
      question_for_critic: 'Does this look stale?'
    }

    const decision = await new MockLlmProvider().critiquePromptConsistency(context)

    expect(decision.classification).toBe('semantic_mismatch')
    expect(decision.should_report).toBe(true)
  })

  it('generates a fix packet for semantic mismatch', async () => {
    const dir = await tempDir()
    const reportPath = path.join(dir, 'latest_report.json')
    const issue: Issue = {
      issue_id: 'semantic-mismatch-1',
      severity: 'high',
      type: 'semantic_mismatch',
      title: 'Generated handoff appears stale or unrelated to current prompt',
      description: 'Output contains upload/photo terms for a pet-friends prompt.',
      evidence: ['input_prompt: the ability to add other pets as friends', 'stale_concepts: upload, photo, storage strategy'],
      suggestedFixPrompt: 'Fix stale generated output.'
    }
    await writeFile(reportPath, JSON.stringify(report([issue]), null, 2))

    const packets = await generateFixPackets(reportPath)

    expect(packets).toHaveLength(1)
    expect(packets[0].title).toBe('Generated handoff appears stale or unrelated to current prompt')
    expect(packets[0].suspected_files).toEqual(expect.arrayContaining(['web/src/App.tsx', 'web/src/api.ts']))
    await expect(readFile(path.join(dir, 'fix_packets', 'semantic-mismatch-1.md'), 'utf8')).resolves.toContain('prompt/output consistency')
  })
})

function runFor(inputPrompt: string, overrides: Partial<PromptConsistencyRun> = {}): PromptConsistencyRun {
  return {
    prompt_id: 'prompt',
    input_prompt: inputPrompt,
    response_feature_request: inputPrompt,
    rendered_text: 'Pet friends relationship plan',
    handoff_text: 'Pet friends relationship handoff',
    semantic_labels: [],
    recommended_paths: [],
    stale_concepts_detected: [],
    consistency_status: 'consistent',
    ...overrides
  }
}

function sourceGraph(): SourceGraph {
  return {
    repoPath: '/tmp/workspace-control/web',
    packageName: 'workspace-control-web',
    framework: 'react',
    buildTool: 'vite',
    routes: [],
    pages: [],
    components: [{ file: 'src/App.tsx', name: 'App' }],
    forms: [],
    uiSurfaces: [
      {
        file: 'src/App.tsx',
        surface_type: 'prompt_composer',
        display_name: 'Prompt composer',
        evidence: ['Feature request'],
        relatedButtons: ['Generate Plan Bundle'],
        relatedInputs: ['Feature request'],
        confidence: 0.9
      }
    ],
    sourceWorkflows: [],
    apiCalls: [
      { method: 'POST', endpoint: '/api/workspaces/${workspaceId}/plan-bundles', sourceFile: 'src/api.ts', functionName: 'generatePlanBundle' },
      { method: 'GET', endpoint: '/api/semantic/status', sourceFile: 'src/api.ts', functionName: 'getSemanticStatus' }
    ],
    stateActions: [],
    packageScripts: {},
    generatedAt: ''
  }
}

function report(issues: Issue[]): SnifferReport {
  return {
    sourceGraph: sourceGraph(),
    crawlGraph: {
      startUrl: 'http://localhost:5173',
      title: 'Demo',
      finalUrl: 'http://localhost:5173',
      states: [],
      actions: [],
      consoleErrors: [],
      networkFailures: [],
      screenshots: [],
      generatedAt: ''
    },
    appIntent: { summary: '', likelyWorkflows: [], sourceSignals: [], llmUsed: false },
    runtimeSurfaceMatches: [],
    runtimeWorkflowVerifications: [],
    criticDecisions: [],
    deferredFindings: [],
    blockedChecks: [],
    needsMoreCrawling: [],
    rawFindings: issues,
    issues,
    generatedAt: ''
  }
}

async function tempDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), `sniffer-consistency-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  return dir
}
