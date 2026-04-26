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
    if (args['use-llm']) {
      const provider = createLlmProvider()
      if (provider) appIntent = await provider.inferIntent({ sourceGraph, deterministicIntent: appIntent })
    }
    const issues = classifyRuntimeIssues(sourceGraph, crawlGraph)
    await writeAuditReports(reportDir, { sourceGraph, crawlGraph, appIntent, issues })
    console.log(`Wrote ${path.join(reportDir, 'latest_report.md')}`)
    return
  }

  if (command === 'generate-tests') {
    const repo = requireArg(args, 'repo')
    const url = requireArg(args, 'url')
    const sourceGraph = await discoverSource(repo)
    let appIntent = buildDeterministicIntent(sourceGraph)
    if (args['use-llm']) {
      const provider = createLlmProvider()
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

function printHelp(): void {
  console.log(`sniffer

Commands:
  sniffer discover --repo <path>
  sniffer crawl --url <url>
  sniffer audit --repo <path> --url <url> [--use-llm]
  sniffer generate-tests --repo <path> --url <url> [--use-llm]
  sniffer run-tests [--use-llm]
`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
