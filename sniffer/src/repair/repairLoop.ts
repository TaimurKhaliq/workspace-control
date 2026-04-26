import path from 'node:path'
import { discoverSource } from '../discovery/sourceDiscovery.js'
import { crawlApp } from '../runtime/crawler.js'
import { buildDeterministicIntent } from '../heuristics/intent.js'
import { classifyRuntimeIssues } from '../heuristics/issueClassifier.js'
import { writeAuditReports } from '../reporting/reportWriter.js'
import { latestReportDir } from '../reporting/paths.js'
import { verifyRuntimeIntent } from '../runtime/workflowVerifier.js'
import { applyFix } from './applyFix.js'
import { generateFixPackets } from './fixPackets.js'
import { isActionableIssue } from './safety.js'
import { verifyIssue } from './verify.js'
import { critiqueFindings } from '../critic/workflowCritic.js'

export async function runRepairLoop(input: {
  repo: string
  url: string
  agentName?: string
  maxIterations: number
  allowDestructive?: boolean
}): Promise<{ iterations: number; fixed: string[]; remaining: string[]; reportPath: string }> {
  const fixed: string[] = []
  let remaining: string[] = []
  const reportDir = latestReportDir()
  const reportPath = path.join(reportDir, 'latest_report.json')

  for (let iteration = 1; iteration <= input.maxIterations; iteration += 1) {
    const sourceGraph = await discoverSource(input.repo)
    const crawlGraph = await crawlApp(input.url, { reportDir })
    const runtimeWorkflowVerifications = await verifyRuntimeIntent({ url: input.url, sourceGraph })
    const candidateIssues = classifyRuntimeIssues(sourceGraph, crawlGraph, runtimeWorkflowVerifications)
    const critic = await critiqueFindings({
      sourceGraph,
      crawlGraph,
      workflowVerifications: runtimeWorkflowVerifications,
      candidateIssues,
      appUrl: input.url,
      mode: 'deterministic'
    })
    const report = await writeAuditReports(reportDir, {
      sourceGraph,
      crawlGraph,
      appIntent: buildDeterministicIntent(sourceGraph),
      runtimeWorkflowVerifications,
      ...critic
    })

    const actionable = report.issues.filter(isActionableIssue)
    remaining = actionable.map((issue) => issue.issue_id).filter(Boolean) as string[]
    if (actionable.length === 0) return { iterations: iteration, fixed, remaining: [], reportPath }

    await generateFixPackets(reportPath, input.allowDestructive)
    const issue = actionable[0]
    if (!issue.issue_id) throw new Error(`Actionable issue missing issue_id: ${issue.title}`)
    await applyFix({
      issueId: issue.issue_id,
      reportPath,
      agentName: input.agentName,
      allowDestructive: input.allowDestructive,
      iteration
    })
    const verification = await verifyIssue({ issueId: issue.issue_id, reportPath, url: input.url })
    if (verification.status === 'fixed') fixed.push(issue.issue_id)
  }

  return { iterations: input.maxIterations, fixed, remaining, reportPath }
}
