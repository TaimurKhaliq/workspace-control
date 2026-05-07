#!/usr/bin/env node
import { loadSnifferEnv } from '../config/env.js'
import path from 'node:path'
import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import { discoverSource } from '../discovery/sourceDiscovery.js'
import { AD_HOC_PROJECT_ID, generatedTestsDir, latestReportDir, projectLatestReportDir, projectRunReportDir, safeProjectId } from '../reporting/paths.js'
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
import type { AppProfile, Issue, LlmCriticProvider, SnifferProject, SourceGraph } from '../types.js'
import { executeNextSafeActions } from '../critic/nextActionExecutor.js'
import { runScenarios, scenarioIssues } from '../runtime/scenarios.js'
import { runUxHeuristicAudit } from '../heuristics/uxHeuristics.js'
import { critiqueUx, type UxCriticMode } from '../critic/uxCritic.js'
import type { ProductIntentMode, ScenarioSlug } from '../types.js'
import { triageIssues } from '../heuristics/issueTriage.js'
import { synthesizeProductIntent } from '../heuristics/productIntent.js'
import { runPromptConsistencyCheck } from '../runtime/promptConsistency.js'
import { initProject, getProject, listProjects, removeProject, upsertProject, createProjectFromSource, normalizeAppUrl } from '../projects/registry.js'
import { augmentAppProfileWithProductIntent, inferAppProfile } from '../profile/appProfile.js'
import { generateGenericScenarios } from '../runtime/genericScenarios.js'
import { executeGeneratedScenarios } from '../runtime/generatedScenarioExecutor.js'
import { shouldRunBuiltInScenarioPack, shouldRunPromptConsistency } from '../runtime/scenarioSelection.js'
import { inspectUrl, writeRuntimeDomArtifacts } from '../runtime/domSnapshot.js'
import { buildRuntimeAppModel, buildRuntimeIntentContext } from '../runtime/runtimeAppModel.js'
import type { DiscoveryMode, RuntimeAppModel, RuntimeDomSnapshot, RuntimeLlmIntent } from '../types.js'
import { runVerificationMatrix } from '../verification/matrix.js'

loadSnifferEnv()

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  const args = parseArgs(rest)

  if (command === 'projects') {
    await handleProjectsCommand(rest)
    return
  }

  if (command === 'verify-matrix') {
    const matrix = await runVerificationMatrix(process.cwd())
    console.log(`Verification matrix ${matrix.status.toUpperCase()}`)
    for (const target of matrix.targets) {
      const detail = target.status === 'skipped'
        ? target.skipReason
        : `${target.framework ?? 'unknown'} / ${target.profile ?? 'unknown'} · source=${target.sourceWorkflows} runtime=${target.runtimeWorkflows} generated=${target.generatedScenarios} runs=${target.scenarioRuns}`
      console.log(`- ${target.status.toUpperCase()} ${target.id}: ${detail}`)
    }
    console.log(`- ${matrix.dogfood.status.toUpperCase()} dogfood: ${matrix.dogfood.appUrl ?? matrix.dogfood.skipReason ?? ''}`)
    console.log(`Wrote ${matrix.reportMarkdownPath}`)
    if (matrix.status === 'failed') process.exitCode = 1
    return
  }

  if (command === 'init-project') {
    const project = await initProject({
      id: typeof args.id === 'string' ? args.id : undefined,
      name: requireArg(args, 'name'),
      repoPath: requireArg(args, 'repo'),
      appUrl: requireArg(args, 'url'),
      devCommand: typeof args['dev-command'] === 'string' ? args['dev-command'] : undefined,
      buildCommand: typeof args['build-command'] === 'string' ? args['build-command'] : undefined,
      testCommand: typeof args['test-command'] === 'string' ? args['test-command'] : undefined,
      productGoal: typeof args['product-goal'] === 'string' ? args['product-goal'] : undefined
    })
    console.log(JSON.stringify(project, null, 2))
    return
  }

  if (command === 'discover') {
    const ctx = await resolveTarget(args, { needRepo: true, needUrl: false })
    const graph = await discoverSource(ctx.repo)
    const profile = inferAppProfile({ sourceGraph: graph, productGoal: productGoalArg(args) })
    await writeJson(path.join(ctx.reportDir, 'source_graph.json'), graph)
    await writeJson(path.join(ctx.reportDir, 'app_profile.json'), profile)
    await mirrorReportDirs(ctx)
    await updateProjectFromDiscovery(ctx, graph, profile)
    console.log(`Wrote ${path.join(ctx.reportDir, 'source_graph.json')}`)
    return
  }

  if (command === 'crawl') {
    const ctx = await resolveTarget(args, { needRepo: false, needUrl: true })
    const graph = await crawlApp(ctx.url, crawlOptions(args, ctx.reportDir))
    await writeJson(path.join(ctx.reportDir, 'crawl_graph.json'), graph)
    await mirrorReportDirs(ctx)
    console.log(`Wrote ${path.join(ctx.reportDir, 'crawl_graph.json')}`)
    return
  }

  if (command === 'inspect-url') {
    const ctx = await resolveTarget(args, { needRepo: false, needUrl: true })
    const snapshot = await inspectUrl({ url: ctx.url, reportDir: ctx.reportDir })
    const runtimeAppModel = buildRuntimeAppModel({ snapshot, sourceGraph: ctx.repo ? await discoverSource(ctx.repo).catch(() => undefined) : undefined, appProfile: ctx.project?.profile })
    await writeRuntimeDomArtifacts(ctx.reportDir, snapshot)
    await writeJson(path.join(ctx.reportDir, 'runtime_app_model.json'), runtimeAppModel)
    await mirrorReportDirs(ctx)
    await updateProjectRuntime(ctx, snapshot, runtimeAppModel, discoveryModeArg(args))
    console.log(`Wrote ${path.join(ctx.reportDir, 'runtime_dom_snapshot.json')}`)
    return
  }

  if (command === 'audit') {
    const discoveryMode = discoveryModeArg(args)
    const ctx = await resolveTarget(args, { needRepo: discoveryMode !== 'runtime', needUrl: true })
    const repo = ctx.repo
    const url = ctx.url
    const reportDir = ctx.reportDir
    const sourceGraph = discoveryMode === 'runtime' ? emptySourceGraph(repo || url, ctx.project) : await discoverSource(repo)
    const crawlGraph = await crawlApp(url, crawlOptions(args, reportDir))
    const runtimeDomSnapshot = discoveryMode === 'source' ? undefined : await inspectUrl({ url, reportDir })
    const productGoal = typeof args['product-goal'] === 'string' ? args['product-goal'] : undefined
    const sourceOnlyAppProfile = inferAppProfile({ sourceGraph, productGoal })
    const deterministicAppProfile = inferAppProfile({ sourceGraph, crawlGraph, productGoal })
    const scenarioSlug = (typeof args.scenario === 'string' ? args.scenario : undefined) as ScenarioSlug | undefined
    let scenarioRuns = shouldRunBuiltInScenarioPack({ scenarioSlug, appProfile: sourceOnlyAppProfile })
      ? await runScenarios({ url, reportDir, scenario: scenarioSlug as ScenarioSlug })
      : []
    let appIntent = buildDeterministicIntent(sourceGraph)
    const intentMode = (typeof args['intent-mode'] === 'string' ? args['intent-mode'] : 'deterministic') as ProductIntentMode
    const providerName = typeof args.provider === 'string' ? args.provider : args['use-llm'] ? 'auto' : 'auto'
    const provider = args['use-llm'] || args['critic-mode'] === 'llm' || args['ux-critic'] === 'llm' || intentMode === 'llm' || intentMode === 'auto' || providerName === 'mock'
      ? createLlmProvider(providerName)
      : undefined
    if (args['use-llm']) {
      if (provider) appIntent = await provider.inferIntent({ sourceGraph, deterministicIntent: appIntent })
    }
    let llmRuntimeIntent: RuntimeLlmIntent | undefined
    const shouldUseRuntimeLlm = runtimeDomSnapshot && provider?.inferRuntimeIntent && (args['use-llm'] || intentMode === 'llm' || intentMode === 'auto')
    if (shouldUseRuntimeLlm) {
      llmRuntimeIntent = await provider.inferRuntimeIntent!(buildRuntimeIntentContext({
        snapshot: runtimeDomSnapshot,
        sourceGraph,
        appProfile: deterministicAppProfile,
        project: ctx.project ? {
          id: ctx.project.id,
          name: ctx.project.name,
          repoPath: ctx.project.repoPath,
          appUrl: ctx.project.appUrl,
          framework: ctx.project.framework,
          buildTool: ctx.project.buildTool,
          packageName: ctx.project.packageName
        } : { appUrl: url, repoPath: repo, framework: sourceGraph.framework, buildTool: sourceGraph.buildTool, packageName: sourceGraph.packageName }
      })).catch(() => undefined)
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
    const promptsSource = typeof args['consistency-prompts'] === 'string' ? args['consistency-prompts'] : 'built-in'
    const promptConsistency = shouldRunPromptConsistency({ consistencyCheckEnabled, scenarioSlug, promptsSource, appProfile: sourceOnlyAppProfile })
      ? await runPromptConsistencyCheck({
        url,
        reportDir,
        sourceGraph,
        promptsSource,
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
    const appProfile = augmentAppProfileWithProductIntent(deterministicAppProfile, productIntent.productIntent)
    const runtimeAppModel = runtimeDomSnapshot
      ? buildRuntimeAppModel({ snapshot: runtimeDomSnapshot, sourceGraph, appProfile, llmIntent: llmRuntimeIntent })
      : undefined
    const generatedScenarios = generateGenericScenarios({ appProfile, sourceGraph, runtimeAppModel })
    if (shouldExecuteGeneratedScenarios(args, scenarioSlug, generatedScenarios.length)) {
      const executedGenericRuns = await executeGeneratedScenarios({ url, reportDir, scenarios: generatedScenarios })
      const existingSlugs = new Set(scenarioRuns.map((run) => run.slug))
      scenarioRuns = [...scenarioRuns, ...executedGenericRuns.filter((run) => !existingSlugs.has(run.slug))]
    }
    const scenarioRuntimeIssues = scenarioIssues(scenarioRuns)
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
      appProfile,
      discoveryMode,
      runtimeDomSnapshot,
      runtimeAppModel,
      llmRuntimeIntent,
      generatedScenarios,
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
    if (runtimeDomSnapshot) await writeRuntimeDomArtifacts(reportDir, runtimeDomSnapshot)
    await mirrorReportDirs(ctx)
    await updateProjectFromDiscovery(ctx, sourceGraph, appProfile, { discoveryMode, runtimeDomSnapshot, runtimeAppModel, generatedScenarios, crawlGraph: activeCrawlGraph })
    console.log(`Wrote ${path.join(reportDir, 'latest_report.md')}`)
    return
  }

  if (command === 'generate-tests') {
    const ctx = await resolveTarget(args, { needRepo: true, needUrl: true })
    const repo = ctx.repo
    const url = ctx.url
    const sourceGraph = await discoverSource(repo)
    let appIntent = buildDeterministicIntent(sourceGraph)
    if (args['use-llm']) {
      const provider = createLlmProvider(typeof args.provider === 'string' ? args.provider : 'auto')
      if (provider) appIntent = await provider.inferIntent({ sourceGraph, deterministicIntent: appIntent })
    }
    const specs = generatePlaywrightSpecs(appIntent, url)
    const testDir = generatedTestsDir(process.cwd(), ctx.projectId)
    const written = await writeGeneratedSpecs(specs, testDir)
    await mirrorReportDirs(ctx)
    console.log(`Wrote ${written.length} generated test(s) to ${testDir}`)
    return
  }

  if (command === 'run-tests') {
    const projectId = typeof args.project === 'string' ? safeProjectId(args.project) : undefined
    const testDir = generatedTestsDir(process.cwd(), projectId)
    const reportDir = projectId ? projectLatestReportDir(projectId) : latestReportDir()
    const result = runGeneratedTests({ testDir, useLlm: Boolean(args['use-llm']) })
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
    const { issueId, report } = await resolveApplyFixArgs(args)
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
    const ctx = await resolveTarget(args, { needRepo: true, needUrl: true })
    const repo = ctx.repo
    const url = ctx.url
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

interface TargetContext {
  projectId: string
  project?: SnifferProject
  repo: string
  url: string
  reportDir: string
  runReportDir: string
  runId: string
}

async function handleProjectsCommand(rest: string[]): Promise<void> {
  const [subcommand, ...subRest] = rest
  const args = parseArgs(subRest)
  if (subcommand === 'list') {
    console.log(JSON.stringify(await listProjects(), null, 2))
    return
  }
  if (subcommand === 'inspect') {
    const project = await getProject(requireArg(args, 'id'))
    if (!project) throw new Error(`Project not found: ${String(args.id)}`)
    console.log(JSON.stringify(project, null, 2))
    return
  }
  if (subcommand === 'add') {
    const project = await initProject({
      id: typeof args.id === 'string' ? args.id : undefined,
      name: requireArg(args, 'name'),
      repoPath: requireArg(args, 'repo'),
      appUrl: requireArg(args, 'url'),
      devCommand: typeof args['dev-command'] === 'string' ? args['dev-command'] : undefined,
      buildCommand: typeof args['build-command'] === 'string' ? args['build-command'] : undefined,
      testCommand: typeof args['test-command'] === 'string' ? args['test-command'] : undefined,
      productGoal: typeof args['product-goal'] === 'string' ? args['product-goal'] : undefined
    })
    console.log(JSON.stringify(project, null, 2))
    return
  }
  if (subcommand === 'remove') {
    const removed = await removeProject(requireArg(args, 'id'))
    console.log(removed ? `Removed ${String(args.id)}` : `Project not found: ${String(args.id)}`)
    return
  }
  throw new Error('Usage: sniffer projects list|add|remove|inspect')
}

async function resolveTarget(args: Record<string, string | boolean>, options: { needRepo: boolean; needUrl: boolean }): Promise<TargetContext> {
  const runId = new Date().toISOString().replace(/[:.]/g, '-')
  if (typeof args.project === 'string') {
    const project = await getProject(args.project)
    if (!project) throw new Error(`Project not found: ${args.project}`)
    return {
      projectId: project.id,
      project,
      repo: project.repoPath,
      url: normalizeAppUrl(project.appUrl),
      reportDir: projectLatestReportDir(project.id),
      runReportDir: projectRunReportDir(project.id, runId),
      runId
    }
  }
  const projectId = AD_HOC_PROJECT_ID
  const repo = options.needRepo ? requireArg(args, 'repo') : typeof args.repo === 'string' ? args.repo : ''
  const rawUrl = options.needUrl ? requireArg(args, 'url') : typeof args.url === 'string' ? args.url : ''
  const url = rawUrl ? normalizeAppUrl(rawUrl) : ''
  return {
    projectId,
    repo,
    url,
    reportDir: projectLatestReportDir(projectId),
    runReportDir: projectRunReportDir(projectId, runId),
    runId
  }
}

async function mirrorReportDirs(ctx: TargetContext): Promise<void> {
  await mkdir(ctx.reportDir, { recursive: true })
  await replaceDirectory(ctx.reportDir, ctx.runReportDir)
  await replaceDirectory(ctx.reportDir, latestReportDir())
}

async function replaceDirectory(source: string, destination: string): Promise<void> {
  const resolvedSource = path.resolve(source)
  const resolvedDestination = path.resolve(destination)
  if (resolvedSource === resolvedDestination || resolvedSource.startsWith(`${resolvedDestination}${path.sep}`)) return
  await rm(destination, { recursive: true, force: true })
  await mkdir(path.dirname(destination), { recursive: true })
  await cp(source, destination, { recursive: true, force: true })
}

async function updateProjectFromDiscovery(ctx: TargetContext, sourceGraph: SourceGraph, appProfile: AppProfile, runtime?: {
  discoveryMode?: DiscoveryMode
  runtimeDomSnapshot?: RuntimeDomSnapshot
  runtimeAppModel?: RuntimeAppModel
  generatedScenarios?: ReturnType<typeof generateGenericScenarios>
  crawlGraph?: Awaited<ReturnType<typeof crawlApp>>
}): Promise<void> {
  if (!ctx.project && !ctx.url) return
  const project = ctx.project ?? createProjectFromSource({
    id: ctx.projectId,
    name: ctx.projectId === AD_HOC_PROJECT_ID ? 'Ad hoc' : ctx.projectId,
    repoPath: ctx.repo,
    appUrl: ctx.url
  }, sourceGraph, appProfile)
  await upsertProject({
    ...project,
    repoPath: ctx.repo || project.repoPath,
    appUrl: ctx.url || project.appUrl,
    framework: sourceGraph.framework,
    buildTool: sourceGraph.buildTool,
    packageName: sourceGraph.packageName,
    profile: appProfile,
    latestReportPath: path.join(ctx.reportDir, 'latest_report.json'),
    latestRunId: ctx.runId,
    discoveryMode: runtime?.discoveryMode ?? project.discoveryMode,
    lastRuntimeDomSnapshotPath: runtime?.runtimeDomSnapshot ? path.join(ctx.reportDir, 'runtime_dom_snapshot.json') : project.lastRuntimeDomSnapshotPath,
    inferredAppProfile: appProfile,
    generatedScenarioPack: runtime?.generatedScenarios ?? project.generatedScenarioPack,
    lastCrawlCoverage: runtime?.crawlGraph?.coverage ?? project.lastCrawlCoverage
  })
}

async function updateProjectRuntime(ctx: TargetContext, snapshot: RuntimeDomSnapshot, model: RuntimeAppModel, discoveryMode: DiscoveryMode): Promise<void> {
  if (!ctx.project) return
  await upsertProject({
    ...ctx.project,
    appUrl: ctx.url || ctx.project.appUrl,
    discoveryMode,
    lastRuntimeDomSnapshotPath: path.join(ctx.reportDir, 'runtime_dom_snapshot.json'),
    inferredAppProfile: ctx.project.profile,
    latestReportPath: path.join(ctx.reportDir, 'latest_report.json'),
    latestRunId: ctx.runId,
    generatedScenarioPack: generateGenericScenarios({ appProfile: ctx.project.profile, sourceGraph: emptySourceGraph(ctx.repo || snapshot.url) }),
    lastCrawlCoverage: undefined,
    profile: {
      ...ctx.project.profile,
      profile_type: model.inferred_app_type,
      evidence: [...ctx.project.profile.evidence, ...model.evidence].slice(0, 20)
    }
  })
}

function productGoalArg(args: Record<string, string | boolean>): string | undefined {
  return typeof args['product-goal'] === 'string' ? args['product-goal'] : undefined
}

function discoveryModeArg(args: Record<string, string | boolean>): DiscoveryMode {
  const value = typeof args['discovery-mode'] === 'string' ? args['discovery-mode'] : undefined
  return value === 'source' || value === 'runtime' || value === 'hybrid' ? value : 'hybrid'
}

function emptySourceGraph(identity: string, project?: SnifferProject): SourceGraph {
  return {
    repoPath: identity,
    packageName: project?.packageName,
    framework: project?.framework ?? 'unknown',
    buildTool: project?.buildTool ?? 'unknown',
    routes: [],
    pages: [],
    components: [],
    forms: [],
    uiSurfaces: [],
    sourceWorkflows: [],
    apiCalls: [],
    stateActions: [],
    packageScripts: {},
    generatedAt: new Date().toISOString()
  }
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

async function resolveApplyFixArgs(args: Record<string, string | boolean>): Promise<{ issueId: string; report: string }> {
  const report = typeof args.report === 'string'
    ? args.report
    : path.join(latestReportDir(), 'latest_report.json')
  const issueId = typeof args.issue === 'string'
    ? args.issue
    : await firstFixPacketIssueId(report)
  return { issueId, report }
}

async function firstFixPacketIssueId(reportPath: string): Promise<string> {
  const packetDir = path.join(path.dirname(path.resolve(reportPath)), 'fix_packets')
  const packets = await readdir(packetDir).catch(() => [])
  const first = packets.find((entry) => entry.endsWith('.json')) ?? packets.find((entry) => entry.endsWith('.md'))
  if (!first) {
    throw new Error(`Missing --issue and no fix packets found in ${packetDir}. Run generate-fixes first or pass --issue <issue_id>.`)
  }
  return first.replace(/\.(json|md)$/i, '')
}

function boolArg(args: Record<string, string | boolean>, key: string): boolean {
  const value = args[key]
  return value === true || value === 'true'
}

function shouldExecuteGeneratedScenarios(args: Record<string, string | boolean>, scenarioSlug: ScenarioSlug | undefined, scenarioCount: number): boolean {
  if (scenarioCount === 0) return false
  if (boolArg(args, 'execute-generated-scenarios')) return true
  return scenarioSlug === 'auto' || scenarioSlug === 'all'
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
  sniffer init-project --id <id> --name <name> --repo <path> --url <url>
  sniffer projects list
  sniffer projects add --id <id> --name <name> --repo <path> --url <url>
  sniffer projects inspect --id <id>
  sniffer projects remove --id <id>
  sniffer inspect-url --url <url> | --project <id>
  sniffer discover --repo <path> | --project <id>
  sniffer crawl --url <url> | --project <id> [--max-actions 36] [--max-states 24] [--max-per-route 8] [--max-duplicate-actions 1]
  sniffer audit --repo <path> --url <url> | --project <id> [--discovery-mode source|runtime|hybrid] [--scenario all|auto|generate-plan-bundle|review-plan-output|prompt-output-consistency] [--execute-generated-scenarios] [--consistency-check] [--consistency-prompts built-in|path] [--ux-critic off|deterministic|llm] [--intent-mode deterministic|llm|auto] [--product-goal "<text>"] [--use-llm] [--provider mock|openai-compatible|auto] [--critic-mode deterministic|llm|auto] [--max-iterations 0] [--max-actions 36] [--max-states 24]
  sniffer generate-fixes --report <path>
  sniffer apply-fix [--issue <issue_id>] [--report <path>] [--agent manual|mock|codex]
  sniffer verify --issue <issue_id> --url <url> --report <path>
  sniffer repair-loop --repo <path> --url <url> | --project <id> [--agent manual|mock|codex] [--intent-mode deterministic|llm|auto] [--product-goal "<text>"] [--provider mock|openai-compatible|auto] [--max-iterations 3]
  sniffer generate-tests --repo <path> --url <url> | --project <id> [--use-llm]
  sniffer run-tests [--project <id>] [--use-llm]
  sniffer verify-matrix
`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
