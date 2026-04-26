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
import type { LlmCriticProvider } from '../types.js'
import { executeNextSafeActions } from '../critic/nextActionExecutor.js'

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
    const graph = await crawlApp(url, { reportDir })
    await writeJson(path.join(reportDir, 'crawl_graph.json'), graph)
    console.log(`Wrote ${path.join(reportDir, 'crawl_graph.json')}`)
    return
  }

  if (command === 'audit') {
    const repo = requireArg(args, 'repo')
    const url = requireArg(args, 'url')
    const sourceGraph = await discoverSource(repo)
    const crawlGraph = await crawlApp(url, { reportDir })
    let appIntent = buildDeterministicIntent(sourceGraph)
    const providerName = typeof args.provider === 'string' ? args.provider : args['use-llm'] ? 'auto' : 'auto'
    const provider = args['use-llm'] || args['critic-mode'] === 'llm' || providerName === 'mock'
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
        activeCrawlGraph = await crawlApp(url, { reportDir })
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
    await writeAuditReports(reportDir, { sourceGraph, crawlGraph: activeCrawlGraph, appIntent, runtimeWorkflowVerifications, ...critic })
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
    const result = await runRepairLoop({
      repo,
      url,
      maxIterations,
      agentName: typeof args.agent === 'string' ? args.agent : undefined,
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

function printHelp(): void {
  console.log(`sniffer

Commands:
  sniffer discover --repo <path>
  sniffer crawl --url <url>
  sniffer audit --repo <path> --url <url> [--use-llm] [--provider mock|openai|auto] [--critic-mode deterministic|llm|auto] [--max-iterations 0]
  sniffer generate-fixes --report <path>
  sniffer apply-fix --issue <issue_id> --report <path> [--agent manual|mock|codex]
  sniffer verify --issue <issue_id> --url <url> --report <path>
  sniffer repair-loop --repo <path> --url <url> [--agent manual|mock|codex] [--max-iterations 3]
  sniffer generate-tests --repo <path> --url <url> [--use-llm]
  sniffer run-tests [--use-llm]
`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
