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
import { OpenAICompatibleProvider } from '../llm/openAICompatibleProvider.js'
import { MockLlmProvider } from '../llm/mockProvider.js'
import type { LlmProvider, LlmProviderCheckResult } from '../llm/provider.js'
import { classifyRuntimeIssues, classifyTestFailures } from '../heuristics/issueClassifier.js'
import { writeAuditReports } from '../reporting/reportWriter.js'
import { generatePlaywrightSpecs, writeGeneratedSpecs } from '../testgen/specWriter.js'
import { runGeneratedTests } from '../runtime/testRunner.js'
import { verifyRuntimeIntent } from '../runtime/workflowVerifier.js'
import { generateFixPackets, loadFixPacket } from '../repair/fixPackets.js'
import { applyFix } from '../repair/applyFix.js'
import { verifyIssue } from '../repair/verify.js'
import { runRepairLoop } from '../repair/repairLoop.js'
import { critiqueFindings, type CriticMode } from '../critic/workflowCritic.js'
import type { AppProfile, CrawlAction, CrawlGraph, CrawlState, Issue, LlmCriticProvider, ScenarioRun, SnifferProject, SourceGraph, VisibleElement } from '../types.js'
import { executeNextSafeActions } from '../critic/nextActionExecutor.js'
import { runScenarios, scenarioIssues } from '../runtime/scenarios.js'
import { runUxHeuristicAudit } from '../heuristics/uxHeuristics.js'
import { critiqueUx, type UxCriticMode } from '../critic/uxCritic.js'
import type { ProductIntentMode, ScenarioSlug } from '../types.js'
import { triageIssues } from '../heuristics/issueTriage.js'
import { synthesizeProductIntent } from '../heuristics/productIntent.js'
import { analyzeRuntimeDomQuality } from '../heuristics/runtimeDomQuality.js'
import { runPromptConsistencyCheck } from '../runtime/promptConsistency.js'
import { initProject, getProject, listProjects, removeProject, upsertProject, createProjectFromSource, normalizeAppUrl } from '../projects/registry.js'
import { applyScenarioPackProfileGate, augmentAppProfileWithProductIntent, inferAppProfile } from '../profile/appProfile.js'
import { generateGenericScenarios } from '../runtime/genericScenarios.js'
import { executeGeneratedScenarios } from '../runtime/generatedScenarioExecutor.js'
import { selectScenarioPack, shouldRunBuiltInScenarioPack, shouldRunPromptConsistency, sourceGraphForRuntimeValidation } from '../runtime/scenarioSelection.js'
import { inspectUrl, writeRuntimeDomArtifacts } from '../runtime/domSnapshot.js'
import { buildRuntimeAppModel, buildRuntimeIntentContext } from '../runtime/runtimeAppModel.js'
import type { DiscoveryMode, RuntimeAppModel, RuntimeDomSnapshot, RuntimeLlmIntent } from '../types.js'
import { runVerificationMatrix } from '../verification/matrix.js'
import { runProductExperienceCalibration, runProductExperienceModelComparison } from '../verification/productExperienceCalibration.js'
import { runProductExperienceCritic } from '../critic/productExperienceCritic.js'
import type { GraphRefinerMode, ProductExperienceCriticMode } from '../types.js'
import { runGraphStructureRefiner } from '../evidence/graphRefiner.js'

loadSnifferEnv()

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  const args = parseArgs(rest)

  if (command === 'projects') {
    await handleProjectsCommand(rest)
    return
  }

  if (command === 'providers') {
    await handleProvidersCommand(rest)
    return
  }

  if (command === 'llm-check') {
    await handleProviderCheck(typeof args.provider === 'string' ? args.provider : 'openai-compatible')
    return
  }

  if (command === 'verify-matrix') {
    const matrix = await runVerificationMatrix(process.cwd())
    console.log(`Verification matrix ${matrix.status.toUpperCase()}`)
    for (const target of matrix.targets) {
      const detail = target.status === 'skipped'
        ? target.skipReason
        : `${target.framework ?? 'unknown'} / ${target.profile ?? 'unknown'} · source=${target.sourceWorkflows} runtime=${target.runtimeWorkflows} generated=${target.generatedScenarios} runs=${target.scenarioRuns} issues=${target.realIssues} groups=${target.triagedRepairGroups} fixes=${target.fixPackets} screenshots=${target.screenshotsCaptured}`
      console.log(`- ${target.status.toUpperCase()} ${target.id}: ${detail}`)
    }
    console.log(`- ${matrix.dogfood.status.toUpperCase()} dogfood: ${matrix.dogfood.appUrl ?? matrix.dogfood.skipReason ?? ''}`)
    console.log(`Wrote ${matrix.reportMarkdownPath}`)
    if (matrix.status === 'failed') process.exitCode = 1
    return
  }

  if (command === 'audit-product-calibration') {
    const providerName = typeof args.provider === 'string' ? args.provider : 'auto'
    const mode = typeof args['product-experience-critic'] === 'string'
      ? args['product-experience-critic'] as ProductExperienceCriticMode
      : typeof args['critic-mode'] === 'string'
        ? args['critic-mode'] as ProductExperienceCriticMode
      : undefined
    const fixtureIds = typeof args.fixture === 'string'
      ? args.fixture.split(',').map((item) => item.trim()).filter(Boolean)
      : undefined
    if (typeof args.models === 'string') {
      const models = args.models.split(',').map((item) => item.trim()).filter(Boolean)
      if (!models.length) throw new Error('--models must include at least one model name')
      const comparison = await runProductExperienceModelComparison({
        snifferRoot: process.cwd(),
        models,
        providerName,
        mode,
        fixtureIds,
        includeGood: boolArg(args, 'include-good')
      })
      console.log(`Product Experience Model Comparison ${comparison.status.toUpperCase()}`)
      for (const model of comparison.models) {
        console.log(`- ${model.status.toUpperCase()} ${model.model}: passRate=${(model.passRate * 100).toFixed(1)}% missed=${model.missedFindings.length} falsePositives=${model.falsePositives.length}`)
      }
      console.log(`Wrote ${comparison.reportMarkdownPath}`)
      if (comparison.status === 'failed') process.exitCode = 1
      return
    }
    const provider = createLlmProvider(providerName)
    const calibration = await runProductExperienceCalibration({
      snifferRoot: process.cwd(),
      provider,
      mode,
      fixtureIds,
      includeGood: boolArg(args, 'include-good')
    })
    console.log(`Product Experience Calibration ${calibration.status.toUpperCase()}`)
    for (const target of calibration.targets) {
      const missing = target.missingFindings.length
        ? ` missing=${target.missingFindings.map((finding) => finding.titleIncludes).join('; ')}`
        : ''
      const unexpected = target.unexpectedFindings.length
        ? ` unexpected=${target.unexpectedFindings.map((finding) => finding.title).join('; ')}`
        : ''
      console.log(`- ${target.status.toUpperCase()} ${target.fixture}: expected=${target.expectedFindings.length} detected=${target.detectedFindings.length}${missing}${unexpected}`)
    }
    console.log(`Wrote ${calibration.reportMarkdownPath}`)
    if (calibration.status === 'failed') process.exitCode = 1
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
    let graph = await discoverSource(ctx.repo, sourceDiscoveryOptions(args))
    const graphRefinerMode = graphRefinerModeArg(args)
    const provider = graphRefinerProvider(args, graphRefinerMode)
    const refined = await runGraphStructureRefiner({ sourceGraph: graph, mode: graphRefinerMode, provider })
    graph = refined.sourceGraph
    const profile = inferAppProfile({ sourceGraph: graph, productGoal: productGoalArg(args) })
    await writeJson(path.join(ctx.reportDir, 'source_graph.json'), graph)
    await writeJson(path.join(ctx.reportDir, 'graph_refinement.json'), refined.refinement)
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
    const runtimeAppModel = buildRuntimeAppModel({ snapshot, sourceGraph: ctx.repo ? await discoverSource(ctx.repo, sourceDiscoveryOptions(args)).catch(() => undefined) : undefined, appProfile: ctx.project?.profile })
    await writeRuntimeDomArtifacts(ctx.reportDir, snapshot)
    await writeJson(path.join(ctx.reportDir, 'runtime_app_model.json'), runtimeAppModel)
    await mirrorReportDirs(ctx)
    await updateProjectRuntime(ctx, snapshot, runtimeAppModel, discoveryModeArg(args))
    console.log(`Wrote ${path.join(ctx.reportDir, 'runtime_dom_snapshot.json')}`)
    return
  }

  if (command === 'audit') {
    const discoveryMode = discoveryModeArg(args)
    emitProgress('phase_started', 'source discovery', 'Resolving target and discovering source context.')
    const ctx = await resolveTarget(args, { needRepo: discoveryMode !== 'runtime', needUrl: true })
    const repo = ctx.repo
    const url = ctx.url
    const reportDir = ctx.reportDir
    let sourceGraph = discoveryMode === 'runtime' ? emptySourceGraph(repo || url, ctx.project) : await discoverSource(repo, sourceDiscoveryOptions(args))
    emitProgress('phase_completed', 'source discovery', 'Source discovery completed.')
    emitProgress('phase_started', 'crawl', 'Crawling the running UI.')
    const crawlGraph = await crawlApp(url, crawlOptions(args, reportDir))
    emitProgress('phase_completed', 'crawl', 'Runtime crawl completed.')
    emitProgress('phase_started', 'runtime DOM discovery', 'Capturing runtime DOM snapshot.')
    const runtimeDomSnapshot = discoveryMode === 'source' ? undefined : await inspectUrl({ url, reportDir })
    emitProgress('phase_completed', 'runtime DOM discovery', runtimeDomSnapshot ? 'Runtime DOM snapshot captured.' : 'Runtime DOM discovery skipped in source-only mode.')
    const productGoal = typeof args['product-goal'] === 'string' ? args['product-goal'] : undefined
    const intentMode = (typeof args['intent-mode'] === 'string' ? args['intent-mode'] : 'deterministic') as ProductIntentMode
    const productExperienceMode = productExperienceCriticModeArg(args)
    const graphRefinerMode = graphRefinerModeArg(args)
    const providerName = typeof args.provider === 'string' ? args.provider : args['use-llm'] ? 'auto' : 'auto'
    const provider = args['use-llm'] || args['critic-mode'] === 'llm' || args['ux-critic'] === 'llm' || productExperienceMode === 'llm' || productExperienceMode === 'auto' || graphRefinerMode === 'llm' || graphRefinerMode === 'auto' || intentMode === 'llm' || intentMode === 'auto' || providerName === 'mock'
      ? createLlmProvider(providerName)
      : undefined
    emitProgress('phase_started', 'graph refinement', 'Refining source graph structure.')
    const refinement = await runGraphStructureRefiner({ sourceGraph, mode: graphRefinerMode, provider, runtimeDomSnapshot })
    sourceGraph = refinement.sourceGraph
    emitProgress('phase_completed', 'graph refinement', 'Source graph refinement completed.')
    const sourceOnlyAppProfile = inferAppProfile({ sourceGraph, productGoal })
    const deterministicAppProfile = inferAppProfile({ sourceGraph, crawlGraph, productGoal })
    const scenarioSlug = (typeof args.scenario === 'string' ? args.scenario : undefined) as ScenarioSlug | undefined
    const scenarioSelection = selectScenarioPack({
      scenarioSlug,
      appProfile: sourceOnlyAppProfile,
      sourceGraph,
      runtimeDomSnapshot,
      productGoal
    })
    emitProgress('phase_started', 'scenario execution', 'Selecting and running built-in scenarios when applicable.')
    let scenarioRuns = shouldRunBuiltInScenarioPack({ scenarioSlug, appProfile: sourceOnlyAppProfile, scenarioSelection })
      ? await runScenarios({ url, reportDir, scenario: scenarioSlug as ScenarioSlug })
      : []
    emitProgress('phase_completed', 'scenario execution', `Built-in scenario execution completed with ${scenarioRuns.length} run(s).`)
    let appIntent = buildDeterministicIntent(sourceGraph)
    const runtimeValidationSourceGraph = sourceGraphForRuntimeValidation(sourceGraph, scenarioSelection)
    emitProgress('phase_started', 'product intent modeling', 'Building deterministic and optional LLM intent context.')
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
    let runtimeWorkflowVerifications = await verifyRuntimeIntent({ url, sourceGraph: runtimeValidationSourceGraph })
    let candidateIssues = classifyRuntimeIssues(runtimeValidationSourceGraph, activeCrawlGraph, runtimeWorkflowVerifications)
    emitProgress('phase_completed', 'product intent modeling', 'Initial product and runtime intent context prepared.')
    emitProgress('phase_started', 'workflow critic', 'Running workflow critic and safe-action loop.')
    const criticMode = (typeof args['critic-mode'] === 'string' ? args['critic-mode'] : args['use-llm'] ? 'llm' : 'deterministic') as CriticMode
    const criticProvider: LlmCriticProvider | undefined = provider?.critiqueWorkflow ? provider as LlmCriticProvider : undefined
    let critic = await critiqueFindings({
      sourceGraph: runtimeValidationSourceGraph,
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
        runtimeWorkflowVerifications = await verifyRuntimeIntent({ url, sourceGraph: runtimeValidationSourceGraph })
        candidateIssues = classifyRuntimeIssues(runtimeValidationSourceGraph, activeCrawlGraph, runtimeWorkflowVerifications)
        critic = await critiqueFindings({
          sourceGraph: runtimeValidationSourceGraph,
          crawlGraph: activeCrawlGraph,
          workflowVerifications: runtimeWorkflowVerifications,
          candidateIssues,
          appUrl: url,
          mode: criticMode,
          provider: criticProvider
        })
      }
    }
    emitProgress('phase_completed', 'workflow critic', `Workflow critic completed with ${critic.issues.length} issue(s).`)
    emitProgress('phase_started', 'UX critic', 'Running deterministic UX/accessibility checks and optional UX critic.')
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
    emitProgress('phase_completed', 'UX critic', `UX critic completed with ${uxCritic.issues.length + uxCandidateIssues.length} candidate issue(s).`)
    const consistencyCheckEnabled = boolArg(args, 'consistency-check') || scenarioSlug === 'prompt-output-consistency'
    const promptsSource = typeof args['consistency-prompts'] === 'string' ? args['consistency-prompts'] : 'built-in'
    const promptConsistency = shouldRunPromptConsistency({ consistencyCheckEnabled, scenarioSlug, promptsSource, appProfile: sourceOnlyAppProfile, scenarioSelection })
      ? await runPromptConsistencyCheck({
        url,
        reportDir,
        sourceGraph,
        promptsSource,
        provider,
        useLlm: Boolean(provider?.critiquePromptConsistency && (criticMode === 'llm' || uxMode === 'llm' || args['use-llm']))
      })
      : undefined
    emitProgress('phase_started', 'product intent modeling', 'Synthesizing product intent model.')
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
    const appProfile = applyScenarioPackProfileGate(
      augmentAppProfileWithProductIntent(deterministicAppProfile, productIntent.productIntent),
      scenarioSelection
    )
    const runtimeAppModel = runtimeDomSnapshot
      ? buildRuntimeAppModel({ snapshot: runtimeDomSnapshot, sourceGraph, appProfile, llmIntent: llmRuntimeIntent })
      : undefined
    const runtimeDomQualityIssues = runtimeDomSnapshot ? analyzeRuntimeDomQuality(runtimeDomSnapshot) : []
    emitProgress('phase_completed', 'product intent modeling', 'Product intent model synthesized.')
    emitProgress('phase_started', 'scenario generation', 'Generating generic/runtime scenarios.')
    const generatedScenarios = generateGenericScenarios({ appProfile, sourceGraph, runtimeAppModel, scenarioSelection })
    emitProgress('phase_completed', 'scenario generation', `Generated ${generatedScenarios.length} scenario(s).`)
    if (shouldExecuteGeneratedScenarios(args, scenarioSlug, generatedScenarios.length)) {
      emitProgress('phase_started', 'scenario execution', 'Executing generated scenarios.')
      const executedGenericRuns = await executeGeneratedScenarios({ url, reportDir, scenarios: generatedScenarios })
      const existingSlugs = new Set(scenarioRuns.map((run) => run.slug))
      scenarioRuns = [...scenarioRuns, ...executedGenericRuns.filter((run) => !existingSlugs.has(run.slug))]
      activeCrawlGraph = mergeScenarioTracesIntoCrawlGraph(activeCrawlGraph, scenarioRuns)
      emitProgress('phase_completed', 'scenario execution', `Generated scenario execution completed with ${executedGenericRuns.length} run(s).`)
    }
    emitProgress('phase_started', 'product experience critic', 'Running Product Experience Critic.')
    const productExperiencePreflight = productExperienceMode === 'llm'
      ? await productExperienceProviderPreflight(provider)
      : undefined
    const productExperience = await runProductExperienceCritic({
      mode: productExperienceMode,
      provider,
      providerPreflightError: productExperiencePreflight?.error,
      sourceGraph,
      crawlGraph: activeCrawlGraph,
      appProfile,
      appSubtype: scenarioSelection.appSubtype,
      productIntent: productIntent.productIntent,
      runtimeDomSnapshot,
      runtimeAppModel,
      scenarioRuns,
      productGoal,
      reportDir,
      projectId: ctx.projectId
    })
    emitProgress('phase_completed', 'product experience critic', `Product Experience Critic completed with ${productExperience.issues.length} issue(s).`)
    const scenarioRuntimeIssues = scenarioIssues(scenarioRuns)
    const auditIntegrityIssues = scenarioPackAuditIntegrityIssues(scenarioSelection, generatedScenarios, scenarioRuns, activeCrawlGraph)
    const rawFindings = [...critic.issues, ...scenarioRuntimeIssues, ...runtimeDomQualityIssues, ...uxCandidateIssues, ...uxCritic.issues, ...(promptConsistency?.issues ?? []), ...productIntent.issues, ...productExperience.issues, ...auditIntegrityIssues]
    emitProgress('phase_started', 'issue grouping', `Grouping ${rawFindings.length} raw finding(s).`)
    const shouldUseLlmTriage = (criticMode === 'llm' || uxMode === 'llm' || productExperienceMode === 'llm') && provider?.triageIssues
    let triagedIssues = shouldUseLlmTriage
      ? await provider.triageIssues!({
        sourceGraph,
        crawlGraph: activeCrawlGraph,
        runtimeWorkflowVerifications,
        rawFindings,
        question_for_triage: 'Group raw findings into repair-sized themes and preserve severe API issues.'
      }).catch(() => triageIssues({ rawFindings, sourceGraph, workflowVerifications: runtimeWorkflowVerifications }))
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
    emitProgress('phase_completed', 'issue grouping', `Issue grouping completed with ${triagedIssues.length} repair group(s).`)
    emitProgress('phase_started', 'report writing', 'Writing latest report artifacts.')
    await writeAuditReports(reportDir, {
      sourceGraph,
      crawlGraph: activeCrawlGraph,
      appIntent,
      appProfile,
      appSubtype: scenarioSelection.appSubtype,
      scenarioSelection,
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
      productExperience,
      ...critic,
      rawFindings,
      issues: triagedIssues,
      uxCriticFindings: uxCritic.uxCriticFindings
    })
    if (runtimeDomSnapshot) await writeRuntimeDomArtifacts(reportDir, runtimeDomSnapshot)
    await mirrorReportDirs(ctx)
    await updateProjectFromDiscovery(ctx, sourceGraph, appProfile, { discoveryMode, runtimeDomSnapshot, runtimeAppModel, generatedScenarios, crawlGraph: activeCrawlGraph })
    emitProgress('phase_completed', 'report writing', 'Latest report artifacts written.')
    console.log(`Wrote ${path.join(reportDir, 'latest_report.md')}`)
    return
  }

  if (command === 'generate-tests') {
    const ctx = await resolveTarget(args, { needRepo: true, needUrl: true })
    const repo = ctx.repo
    const url = ctx.url
    const sourceGraph = await discoverSource(repo, sourceDiscoveryOptions(args))
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

  if (command === 'repair-proof') {
    const issueId = requireArg(args, 'issue')
    const report = requireArg(args, 'report')
    const agent = typeof args.agent === 'string' ? args.agent : 'manual'
    if (agent !== 'manual') throw new Error('repair-proof is a dry-run proof command and only supports --agent manual.')
    const packet = await loadFixPacket(report, issueId)
    const result = await applyFix({
      issueId,
      reportPath: report,
      agentName: 'manual',
      allowDestructive: false
    })
    console.log(`Repair proof written for ${issueId}`)
    console.log(`agent_invoked=false`)
    console.log(`changed_files=[]`)
    console.log(`Repair root: ${packet.repair_root}`)
    console.log(`Allowed paths: ${packet.allowed_paths.join(', ') || 'none'}`)
    console.log(`Fix packet: ${path.join(path.dirname(path.resolve(report)), 'fix_packets', `${issueId}.md`)}`)
    console.log(`Verification command: ${packet.verification_command}`)
    console.log(`Repair result: ${path.join(result.attemptDir, 'repair_result.md')}`)
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

async function handleProvidersCommand(rest: string[]): Promise<void> {
  const [subcommand, ...subRest] = rest
  const args = parseArgs(subRest)
  if (subcommand === 'check') {
    await handleProviderCheck(typeof args.provider === 'string' ? args.provider : 'openai-compatible')
    return
  }
  throw new Error('Usage: sniffer providers check --provider openai-compatible')
}

async function handleProviderCheck(providerName: string): Promise<void> {
  const provider = providerForCheck(providerName)
  const result = provider.checkConnection
    ? await provider.checkConnection()
    : unsupportedProviderCheck(provider.name)
  printProviderCheck(result)
  if (result.realProvider && !result.request.success) process.exitCode = 1
}

function providerForCheck(providerName: string): LlmProvider {
  if (providerName === 'mock') return new MockLlmProvider()
  if (providerName === 'openai-compatible' || providerName === 'auto') return new OpenAICompatibleProvider()
  throw new Error(`Unsupported provider for check: ${providerName}`)
}

function unsupportedProviderCheck(provider: string): LlmProviderCheckResult {
  return {
    provider,
    authConfigured: false,
    configSource: {},
    env: {
      SNIFFER_LLM_BASE_URL: false,
      SNIFFER_LLM_API_KEY: false,
      SNIFFER_LLM_MODEL: false,
      SNIFFER_LLM_API_STYLE: false,
      STACKPILOT_SEMANTIC_BASE_URL: false,
      STACKPILOT_SEMANTIC_API_KEY: false,
      STACKPILOT_SEMANTIC_MODEL: false,
      STACKPILOT_SEMANTIC_API_STYLE: false,
      OPENAI_API_KEY: false
    },
    request: {
      attempted: false,
      success: false,
      errorSummary: 'Provider does not implement a connection check.'
    },
    realProvider: false
  }
}

function printProviderCheck(result: LlmProviderCheckResult): void {
  const lines = [
    `Provider: ${result.provider}`,
    result.baseUrlHost ? `Base URL host: ${result.baseUrlHost}` : undefined,
    `Model: ${result.model ?? 'missing'}`,
    `API style: ${result.apiStyle ?? 'missing'}`,
    `Auth configured: ${result.authConfigured ? 'yes' : 'no'}`,
    `Config source: baseUrl=${result.configSource.baseUrl ?? 'missing'} apiKey=${result.configSource.apiKey ?? 'missing'} model=${result.configSource.model ?? 'missing'} apiStyle=${result.configSource.apiStyle ?? 'missing'}`,
    `Env present: ${Object.entries(result.env).map(([key, present]) => `${key}=${present ? 'yes' : 'no'}`).join(' ')}`,
    `Request attempted: ${result.request.attempted ? 'yes' : 'no'}`,
    `Request success: ${result.request.success ? 'yes' : 'no'}`,
    result.request.statusCode ? `Status code: ${result.request.statusCode}` : undefined,
    result.request.responseTextExtracted !== undefined ? `Response text extracted: ${result.request.responseTextExtracted ? 'yes' : 'no'}` : undefined,
    result.request.errorSummary ? `Error: ${result.request.errorSummary}` : undefined
  ].filter(Boolean)
  console.log(lines.join('\n'))
}

async function productExperienceProviderPreflight(provider: LlmProvider | undefined): Promise<{ error?: string }> {
  if (!provider?.checkConnection) {
    return { error: 'LLM provider does not implement a preflight check. Set SNIFFER_LLM_API_KEY or run sniffer providers check --provider openai-compatible.' }
  }
  const result = await provider.checkConnection()
  if (result.request.success) return {}
  const status = result.request.statusCode ? ` status ${result.request.statusCode}` : ''
  return {
    error: `LLM provider preflight failed${status}: ${result.request.errorSummary ?? 'unknown provider error'}. Set SNIFFER_LLM_API_KEY, SNIFFER_LLM_MODEL, and SNIFFER_LLM_BASE_URL, or run sniffer providers check --provider openai-compatible.`
  }
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

function emitProgress(type: 'phase_started' | 'phase_completed' | 'log' | 'error', phase: string, message: string): void {
  console.log(`[sniffer-progress] ${JSON.stringify({ type, phase, message, timestamp: new Date().toISOString() })}`)
}

function discoveryModeArg(args: Record<string, string | boolean>): DiscoveryMode {
  const value = typeof args['discovery-mode'] === 'string' ? args['discovery-mode'] : undefined
  return value === 'source' || value === 'runtime' || value === 'hybrid' ? value : 'hybrid'
}

function productExperienceCriticModeArg(args: Record<string, string | boolean>): ProductExperienceCriticMode {
  const value = typeof args['product-experience-critic'] === 'string' ? args['product-experience-critic'] : undefined
  return value === 'deterministic' || value === 'llm' || value === 'auto' || value === 'off' ? value : 'auto'
}

function graphRefinerModeArg(args: Record<string, string | boolean>): GraphRefinerMode {
  const value = typeof args['graph-refiner'] === 'string' ? args['graph-refiner'] : undefined
  return value === 'llm' || value === 'auto' || value === 'off' ? value : 'auto'
}

function graphRefinerProvider(args: Record<string, string | boolean>, mode: GraphRefinerMode): LlmProvider | undefined {
  if (mode === 'off') return undefined
  const providerName = typeof args.provider === 'string' ? args.provider : 'auto'
  return createLlmProvider(providerName)
}

function sourceDiscoveryOptions(args: Record<string, string | boolean>) {
  return {
    includeTestSources: boolArg(args, 'include-test-sources') || boolArg(args, 'include-tests'),
    includeFixtures: boolArg(args, 'include-fixtures')
  }
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

function mergeScenarioTracesIntoCrawlGraph(crawlGraph: CrawlGraph, scenarioRuns: ScenarioRun[]): CrawlGraph {
  const states: CrawlState[] = [...crawlGraph.states]
  const actions: CrawlAction[] = [...crawlGraph.actions]
  const seen = new Set(states.map((state) => `${state.url}|${state.inferredScreenName ?? ''}|${state.screenshotPath ?? ''}`))
  let previousState = states.at(-1)
  for (const run of scenarioRuns) {
    for (const trace of run.stepTraces ?? []) {
      const key = `${trace.url}|${trace.screenName ?? ''}|${trace.screenshotPath ?? ''}`
      let state = states.find((item) => `${item.url}|${item.inferredScreenName ?? ''}|${item.screenshotPath ?? ''}` === key)
      if (!state && !seen.has(key)) {
        const route = routeFromUrl(trace.url)
        const visible = trace.visibleControls.slice(0, 40).map((label): VisibleElement => ({ kind: 'button', text: label }))
        state = {
          id: `state-${states.length + 1}`,
          sequenceNumber: states.length + 1,
          url: trace.url,
          hashRoute: route,
          title: trace.scenarioName,
          hash: `scenario-${run.slug}-${states.length + 1}`,
          stateHash: `scenario-${run.slug}-${states.length + 1}`,
          inferredScreenName: trace.screenName,
          inferredPageType: 'scenario_step',
          screenshotPath: trace.screenshotPath,
          primaryVisibleText: trace.domSummary,
          matchedSourceWorkflows: [trace.scenarioName],
          visible
        }
        states.push(state)
        seen.add(key)
      }
      if (previousState && state && previousState.id !== state.id) {
        const sequenceNumber = actions.length + 1
        actions.push({
          id: `action-${sequenceNumber}`,
          sequenceNumber,
          type: 'click',
          actionType: 'click',
          label: trace.actionLabel ?? trace.stepName,
          target: trace.navLabel ?? trace.screenName ?? trace.stepName,
          urlBefore: previousState.url,
          urlAfter: state.url,
          stateHashBefore: previousState.hash,
          stateHashAfter: state.hash,
          changedState: previousState.hash !== state.hash || previousState.url !== state.url,
          safe: true,
          safeReason: 'Recorded from generated scenario execution.',
          screenshotBefore: previousState.screenshotPath,
          screenshotAfter: state.screenshotPath,
          workflowContext: trace.scenarioName,
          scenarioContext: trace.scenarioName,
          reason: 'Generated scenario step reached this screen.'
        })
      }
      if (state) previousState = state
    }
  }
  return {
    ...crawlGraph,
    states,
    actions,
    screenshots: [...new Set([...crawlGraph.screenshots, ...states.map((state) => state.screenshotPath).filter((value): value is string => Boolean(value))])],
    finalUrl: states.at(-1)?.url ?? crawlGraph.finalUrl,
    coverage: crawlGraph.coverage
      ? {
        ...crawlGraph.coverage,
        visitedRoutes: [...new Set([...crawlGraph.coverage.visitedRoutes, ...states.map((state) => state.hashRoute ?? routeFromUrl(state.url))])],
        scenariosPassed: scenarioRuns.filter((run) => run.status === 'passed').length,
        scenariosFailed: scenarioRuns.filter((run) => run.status === 'failed').length,
        scenariosSkipped: scenarioRuns.filter((run) => run.status === 'blocked').length,
        workflowsExercised: scenarioRuns.length
      }
      : crawlGraph.coverage
  }
}

function scenarioPackAuditIntegrityIssues(
  selection: { scenarioPack: string; appSubtype: string },
  generatedScenarios: Array<{ id: string; scenarioPack?: string }>,
  scenarioRuns: ScenarioRun[],
  crawlGraph: CrawlGraph
): Issue[] {
  if (selection.scenarioPack !== 'sniffer_dashboard' || selection.appSubtype !== 'sniffer_dashboard') return []
  const dashboardScenarioCount = generatedScenarios.filter((scenario) => scenario.scenarioPack === 'sniffer_dashboard' || scenario.id.startsWith('sniffer-')).length
  const dashboardRunCount = scenarioRuns.filter((run) => run.slug.startsWith('sniffer-')).length
  const issues: Issue[] = []
  if (dashboardScenarioCount <= 5 || dashboardRunCount <= 5) {
    issues.push({
      severity: 'high',
      type: 'test_bug',
      title: 'Sniffer dashboard scenario pack was selected but not executed',
      description: 'The audit selected the sniffer_dashboard subtype but generated or executed too few Sniffer-dashboard-specific scenarios.',
      evidence: [
        `generated_sniffer_dashboard_scenarios:${dashboardScenarioCount}`,
        `executed_sniffer_dashboard_scenarios:${dashboardRunCount}`,
        `total_generated_scenarios:${generatedScenarios.length}`,
        `total_scenario_runs:${scenarioRuns.length}`
      ],
      suggestedFixPrompt: 'Ensure high-confidence sniffer_dashboard subtype controls scenario generation and execution before generic CRUD scenarios are considered.'
    })
  }
  if (crawlGraph.states.length <= 1 || crawlGraph.actions.length <= 1) {
    issues.push({
      severity: 'medium',
      type: 'test_bug',
      title: 'Sniffer dashboard audit did not capture enough executed screen states',
      description: 'A dashboard audit should record multiple reached screens and actions from crawl or scenario execution.',
      evidence: [
        `states_captured:${crawlGraph.states.length}`,
        `actions_attempted:${crawlGraph.actions.length}`,
        `scenario_runs:${scenarioRuns.length}`
      ],
      suggestedFixPrompt: 'Merge generated scenario step traces into the runtime journey or improve crawl frontier coverage for dashboard navigation.'
    })
  }
  return issues
}

function routeFromUrl(value: string): string {
  try {
    const url = new URL(value)
    return url.hash || url.pathname || '/'
  } catch {
    return value.startsWith('#') ? value : '/'
  }
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
  sniffer providers check --provider openai-compatible
  sniffer llm-check [--provider openai-compatible]
  sniffer inspect-url --url <url> | --project <id>
  sniffer discover --repo <path> | --project <id> [--include-test-sources|--include-tests] [--include-fixtures] [--graph-refiner off|llm|auto] [--provider mock|openai-compatible|auto]
  sniffer crawl --url <url> | --project <id> [--max-actions 36] [--max-states 24] [--max-per-route 8] [--max-duplicate-actions 1]
  sniffer audit --repo <path> --url <url> | --project <id> [--discovery-mode source|runtime|hybrid] [--scenario all|auto|generate-plan-bundle|review-plan-output|prompt-output-consistency] [--execute-generated-scenarios] [--include-test-sources|--include-tests] [--include-fixtures] [--consistency-check] [--consistency-prompts built-in|path] [--graph-refiner off|llm|auto] [--ux-critic off|deterministic|llm] [--product-experience-critic off|llm|deterministic|auto] [--intent-mode deterministic|llm|auto] [--product-goal "<text>"] [--use-llm] [--provider mock|openai-compatible|auto] [--critic-mode deterministic|llm|auto] [--max-iterations 0] [--max-actions 36] [--max-states 24]
  sniffer generate-fixes --report <path>
  sniffer repair-proof --issue <issue_id> --report <path> --agent manual
  sniffer apply-fix [--issue <issue_id>] [--report <path>] [--agent manual|mock|codex]
  sniffer verify --issue <issue_id> --url <url> --report <path>
  sniffer repair-loop --repo <path> --url <url> | --project <id> [--agent manual|mock|codex] [--intent-mode deterministic|llm|auto] [--product-goal "<text>"] [--provider mock|openai-compatible|auto] [--max-iterations 3]
  sniffer generate-tests --repo <path> --url <url> | --project <id> [--use-llm] [--include-test-sources|--include-tests] [--include-fixtures]
  sniffer run-tests [--project <id>] [--use-llm]
  sniffer verify-matrix
  sniffer audit-product-calibration [--product-experience-critic deterministic|llm|auto] [--critic-mode deterministic|llm|auto] [--provider mock|openai-compatible|auto] [--fixture id[,id]] [--include-good] [--models gpt-4.1-mini,gpt-5.5]
`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
