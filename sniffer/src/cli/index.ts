#!/usr/bin/env node
import path from 'node:path'
import { discoverSource } from '../discovery/sourceDiscovery.js'
import { latestReportDir, generatedTestsDir } from '../reporting/paths.js'
import { writeJson } from '../reporting/json.js'
import { crawlApp } from '../runtime/crawler.js'
import { buildDeterministicIntent } from '../heuristics/intent.js'
import { createLlmProvider } from '../llm/factory.js'
import { classifyRuntimeIssues, classifyTestFailures } from '../heuristics/issueClassifier.js'
import { writeAuditReports } from '../reporting/reportWriter.js'
import { generatePlaywrightSpecs, writeGeneratedSpecs } from '../testgen/specWriter.js'
import { runGeneratedTests } from '../runtime/testRunner.js'
import { verifyRuntimeIntent } from '../runtime/workflowVerifier.js'
import { generateFixPackets } from '../repair/fixPackets.js'
import { applyFix } from '../repair/applyFix.js'
import { verifyIssue } from '../repair/verify.js'
import { runRepairLoop } from '../repair/repairLoop.js'
import { critiqueFindings, type CriticMode } from '../critic/workflowCritic.js'
import type { Issue, LlmCriticProvider } from '../types.js'
import { executeNextSafeActions } from '../critic/nextActionExecutor.js'
import { runScenarios, scenarioIssues } from '../runtime/scenarios.js'
import { runUxHeuristicAudit } from '../heuristics/uxHeuristics.js'
import { critiqueUx, type UxCriticMode } from '../critic/uxCritic.js'
import type { ProductIntentMode, ScenarioSlug } from '../types.js'
import { triageIssues } from '../heuristics/issueTriage.js'
import { synthesizeProductIntent } from '../heuristics/productIntent.js'
import { runPromptConsistencyCheck } from '../runtime/promptConsistency.js'

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  const args = parseArgs(rest)
  const reportDir = latestReportDir()

  if (command === 'discover') {
    const repo = requireArg(args, 'repo')
    const graph = await discoverSource(repo)
    await writeJson(path.join(reportDir, 'source_graph.json'), graph)
    console.log(`Wrote ${path.join(reportDir, 'source_graph.json')}`)
    return
  }

  if (command === 'crawl') {
    const url = requireArg(args, 'url')
    const graph = await crawlApp(url, crawlOptions(args, reportDir))
    await writeJson(path.join(reportDir, 'crawl_graph.json'), graph)
    console.log(`Wrote ${path.join(reportDir, 'crawl_graph.json')}`)
    return
  }

  if (command === 'audit') {
    const repo = requireArg(args, 'repo')
    const url = requireArg(args, 'url')
    const sourceGraph = await discoverSource(repo)
    const crawlGraph = await crawlApp(url, crawlOptions(args, reportDir))
    const scenarioSlug = (typeof args.scenario === 'string' ? args.scenario : undefined) as ScenarioSlug | undefined
    const scenarioRuns = scenarioSlug && scenarioSlug !== 'prompt-output-consistency' ? await runScenarios({ url, reportDir, scenario: scenarioSlug }) : []
    let appIntent = buildDeterministicIntent(sourceGraph)
    const intentMode = (typeof args['intent-mode'] === 'string' ? args['intent-mode'] : 'deterministic') as ProductIntentMode
    const productGoal = typeof args['product-goal'] === 'string' ? args['product-goal'] : undefined
    const providerName = typeof args.provider === 'string' ? args.provider : args['use-llm'] ? 'auto' : 'auto'
    const provider = args['use-llm'] || args['critic-mode'] === 'llm' || args['ux-critic'] === 'llm' || intentMode === 'llm' || intentMode === 'auto' || providerName === 'mock'
      ? createLlmProvider(providerName)
      : undefined
    if (args['use-llm']) {
      if (provider) appIntent = await provider.inferIntent({ sourceGraph, deterministicIntent: appIntent })
    }
    let activeCrawlGraph = crawlGraph
    let runtimeWorkflowVerifications = await verifyRuntimeIntent({ url, sourceGraph })
    let candidateIssues = classifyRuntimeIssues(sourceGraph, activeCrawlGraph, runtimeWorkflowVerifications)
    const criticMode = (typeof args['critic-mode'] === 'string' ? args['critic-mode'] : args['use-llm'] ? 'llm' : 'deterministic') as CriticMode
    const criticProvider: LlmCriticProvider | undefined = provider?.critiqueWorkflow ? provider as LlmCriticProvider : undefined
    let critic = await critiqueFindings({
      sourceGraph,
      crawlGraph: activeCrawlGraph,
      workflowVerifications: runtimeWorkflowVerifications,
      candidateIssues,
      appUrl: url,
      mode: criticMode,
      provider: criticProvider
    })
    const maxIterations = Number(typeof args['max-iterations'] === 'string' ? args['max-iterations'] : 0)
    if (maxIterations > 0) {
      const executed = await executeNextSafeActions({ url, decisions: critic.criticDecisions, maxIterations })
      if (executed.length > 0) {
        activeCrawlGraph = await crawlApp(url, crawlOptions(args, reportDir))
        runtimeWorkflowVerifications = await verifyRuntimeIntent({ url, sourceGraph })
        candidateIssues = classifyRuntimeIssues(sourceGraph, activeCrawlGraph, runtimeWorkflowVerifications)
        critic = await critiqueFindings({
          sourceGraph,
          crawlGraph: activeCrawlGraph,
          workflowVerifications: runtimeWorkflowVerifications,
          candidateIssues,
          appUrl: url,
          mode: criticMode,
          provider: criticProvider
        })
      }
    }
    const scenarioRuntimeIssues = scenarioIssues(scenarioRuns)
    const uxMode = (typeof args['ux-critic'] === 'string'
      ? args['ux-critic']
      : scenarioSlug ? 'deterministic' : 'off') as UxCriticMode
    const uxHeuristicResult = uxMode === 'off'
      ? { uxIssues: [], accessibilityIssues: [] }
      : await runUxHeuristicAudit({ url, reportDir, sourceGraph, crawlGraph: activeCrawlGraph })
    const uxCandidateIssues = [...uxHeuristicResult.uxIssues, ...uxHeuristicResult.accessibilityIssues]
    const uxCritic = await critiqueUx({
      mode: uxMode,
      provider,
      sourceGraph,
      crawlGraph: activeCrawlGraph,
      candidateIssues: uxCandidateIssues
    })
    const consistencyCheckEnabled = boolArg(args, 'consistency-check') || scenarioSlug === 'prompt-output-consistency'
    const promptConsistency = consistencyCheckEnabled
      ? await runPromptConsistencyCheck({
        url,
        reportDir,
        sourceGraph,
        promptsSource: typeof args['consistency-prompts'] === 'string' ? args['consistency-prompts'] : 'built-in',
        provider,
        useLlm: Boolean(provider?.critiquePromptConsistency && (criticMode === 'llm' || uxMode === 'llm' || args['use-llm']))
      })
      : undefined
    const productIntent = await synthesizeProductIntent({
      sourceGraph,
      crawlGraph: activeCrawlGraph,
      appIntent,
      runtimeWorkflowVerifications,
      appUrl: url,
      productGoal,
      mode: intentMode,
      provider
    })
    const rawFindings = [...critic.issues, ...scenarioRuntimeIssues, ...uxCandidateIssues, ...uxCritic.issues, ...(promptConsistency?.issues ?? []), ...productIntent.issues]
    const shouldUseLlmTriage = (criticMode === 'llm' || uxMode === 'llm') && provider?.triageIssues
    let triagedIssues = shouldUseLlmTriage
      ? await provider.triageIssues!({
        sourceGraph,
        crawlGraph: activeCrawlGraph,
        runtimeWorkflowVerifications,
        rawFindings,
        question_for_triage: 'Group raw findings into repair-sized themes and preserve severe API issues.'
      })
      : triageIssues({ rawFindings, sourceGraph, workflowVerifications: runtimeWorkflowVerifications })
    if (shouldUseLlmTriage) {
      const supported = filterLlmTriagedIssues(triagedIssues, rawFindings)
      triagedIssues = supported.length > 0 || rawFindings.length === 0
        ? supported
        : triageIssues({ rawFindings, sourceGraph, workflowVerifications: runtimeWorkflowVerifications })
    }
    if (shouldUseLlmTriage && productIntent.issues.length > 0) {
      const existingProductTitles = new Set(triagedIssues.filter((issue) => issue.type === 'product_intent_gap').map((issue) => issue.title))
      triagedIssues = [
        ...triagedIssues,
        ...productIntent.issues.filter((issue) => !existingProductTitles.has(issue.title))
      ]
    }
    await writeAuditReports(reportDir, {
      sourceGraph,
      crawlGraph: activeCrawlGraph,
      appIntent,
      runtimeWorkflowVerifications,
      scenarioRuns,
      promptConsistency,
      productIntent: productIntent.productIntent,
      productIntentFindings: productIntent.productIntentFindings,
      ...critic,
      rawFindings,
      issues: triagedIssues,
      uxCriticFindings: uxCritic.uxCriticFindings
    })
    console.log(`Wrote ${path.join(reportDir, 'latest_report.md')}`)
    return
  }

  if (command === 'generate-tests') {
    const repo = requireArg(args, 'repo')
    const url = requireArg(args, 'url')
    const sourceGraph = await discoverSource(repo)
    let appIntent = buildDeterministicIntent(sourceGraph)
    if (args['use-llm']) {
      const provider = createLlmProvider(typeof args.provider === 'string' ? args.provider : 'auto')
      if (provider) appIntent = await provider.inferIntent({ sourceGraph, deterministicIntent: appIntent })
    }
    const specs = generatePlaywrightSpecs(appIntent, url)
    const written = await writeGeneratedSpecs(specs, generatedTestsDir())
    console.log(`Wrote ${written.length} generated test(s) to ${generatedTestsDir()}`)
    return
  }

  if (command === 'run-tests') {
    const result = runGeneratedTests({ testDir: generatedTestsDir(), useLlm: Boolean(args['use-llm']) })
    const issues = classifyTestFailures(result)
    await writeJson(path.join(reportDir, 'latest_test_run.json'), result)
    if (issues.length > 0) await writeJson(path.join(reportDir, 'latest_test_issues.json'), issues)
    console.log(result.status === 'passed' ? 'Generated tests passed' : `Generated tests failed: ${issues.length} classified issue(s)`)
    return
  }

  if (command === 'generate-fixes') {
    const report = requireArg(args, 'report')
    const packets = await generateFixPackets(report, boolArg(args, 'allow-destructive'))
    console.log(`Wrote ${packets.length} fix packet(s)`)
    return
  }

  if (command === 'apply-fix') {
    const issueId = requireArg(args, 'issue')
    const report = requireArg(args, 'report')
    const result = await applyFix({
      issueId,
      reportPath: report,
      agentName: typeof args.agent === 'string' ? args.agent : undefined,
      allowDestructive: boolArg(args, 'allow-destructive')
    })
    console.log(result.agentResult.stdout || `Agent ${result.agentResult.agent} returned ${result.agentResult.status}`)
    console.log(`Repair attempt: ${result.attemptDir}`)
    console.log(`Next: npm run sniffer -- verify --issue ${issueId} --url <url> --report ${report}`)
    return
  }

  if (command === 'verify') {
    const issueId = requireArg(args, 'issue')
    const report = requireArg(args, 'report')
    const url = requireArg(args, 'url')
    const result = await verifyIssue({ issueId, reportPath: report, url })
    console.log(`Verification ${result.status} for ${issueId}. Wrote ${result.reportPath}`)
    return
  }

  if (command === 'repair-loop') {
    const repo = requireArg(args, 'repo')
    const url = requireArg(args, 'url')
    const maxIterations = Number(typeof args['max-iterations'] === 'string' ? args['max-iterations'] : 3)
    const intentMode = (typeof args['intent-mode'] === 'string' ? args['intent-mode'] : 'deterministic') as ProductIntentMode
    const result = await runRepairLoop({
      repo,
      url,
      maxIterations,
      agentName: typeof args.agent === 'string' ? args.agent : undefined,
      providerName: typeof args.provider === 'string' ? args.provider : undefined,
      productGoal: typeof args['product-goal'] === 'string' ? args['product-goal'] : undefined,
      intentMode,
      allowDestructive: boolArg(args, 'allow-destructive')
    })
    console.log(`Repair loop ran ${result.iterations} iteration(s). Fixed: ${result.fixed.length}. Remaining: ${result.remaining.length}. Report: ${result.reportPath}`)
    return
  }

  printHelp()
  process.exitCode = command ? 1 : 0
}

function parseArgs(args: string[]): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {}
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const next = args[i + 1]
    if (!next || next.startsWith('--')) {
      parsed[key] = true
    } else {
      parsed[key] = next
      i += 1
    }
  }
  return parsed
}

function requireArg(args: Record<string, string | boolean>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing required --${key}`)
  return value
}

function boolArg(args: Record<string, string | boolean>, key: string): boolean {
  const value = args[key]
  return value === true || value === 'true'
}

function crawlOptions(args: Record<string, string | boolean>, reportDir: string) {
  return {
    reportDir,
    maxActions: numberArg(args, 'max-actions'),
    maxStates: numberArg(args, 'max-states'),
    maxDepth: numberArg(args, 'max-depth'),
    maxPerRoute: numberArg(args, 'max-per-route'),
    maxDuplicateActions: numberArg(args, 'max-duplicate-actions')
  }
}

function numberArg(args: Record<string, string | boolean>, key: string): number | undefined {
  const value = args[key]
  if (typeof value !== 'string') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function filterLlmTriagedIssues(issues: Issue[], rawFindings: Issue[]): Issue[] {
  if (rawFindings.length === 0) return []
  return issues.filter((issue) => rawFindings.some((raw) => hasRawSupport(issue, raw)))
}

function hasRawSupport(issue: Issue, raw: Issue): boolean {
  const issueText = normalizedIssueText(issue)
  const rawTitle = normalizeText(raw.title)
  const rawEvidence = raw.evidence.map(normalizeText).filter((item) => item.length >= 12)
  if (rawTitle.length >= 12 && issueText.includes(rawTitle)) return true
  if (rawEvidence.some((item) => issueText.includes(item))) return true
  if (issue.evidence.some((item) => raw.evidence.some((rawItem) => textOverlaps(item, rawItem)))) return true
  return issue.type === raw.type && tokenOverlap(issue.title, raw.title) >= 0.6
}

function normalizedIssueText(issue: Issue): string {
  return normalizeText([
    issue.title,
    issue.description,
    ...issue.evidence
  ].join('\n'))
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function textOverlaps(left: string, right: string): boolean {
  const a = normalizeText(left)
  const b = normalizeText(right)
  return a.length >= 12 && b.includes(a) || b.length >= 12 && a.includes(b)
}

function tokenOverlap(left: string, right: string): number {
  const a = new Set(normalizeText(left).split(/\s+/).filter((item) => item.length > 3))
  const b = new Set(normalizeText(right).split(/\s+/).filter((item) => item.length > 3))
  if (a.size === 0 || b.size === 0) return 0
  return [...a].filter((item) => b.has(item)).length / Math.min(a.size, b.size)
}

function printHelp(): void {
  console.log(`sniffer

Commands:
  sniffer discover --repo <path>
  sniffer crawl --url <url> [--max-actions 36] [--max-states 24] [--max-per-route 8] [--max-duplicate-actions 1]
  sniffer audit --repo <path> --url <url> [--scenario all|generate-plan-bundle|review-plan-output|prompt-output-consistency] [--consistency-check] [--consistency-prompts built-in|path] [--ux-critic off|deterministic|llm] [--intent-mode deterministic|llm|auto] [--product-goal "<text>"] [--use-llm] [--provider mock|openai-compatible|auto] [--critic-mode deterministic|llm|auto] [--max-iterations 0] [--max-actions 36] [--max-states 24]
  sniffer generate-fixes --report <path>
  sniffer apply-fix --issue <issue_id> --report <path> [--agent manual|mock|codex]
  sniffer verify --issue <issue_id> --url <url> --report <path>
  sniffer repair-loop --repo <path> --url <url> [--agent manual|mock|codex] [--intent-mode deterministic|llm|auto] [--product-goal "<text>"] [--provider mock|openai-compatible|auto] [--max-iterations 3]
  sniffer generate-tests --repo <path> --url <url> [--use-llm]
  sniffer run-tests [--use-llm]
`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
