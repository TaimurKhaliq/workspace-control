import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { SnifferReport, VerificationResult } from '../types.js'
import { discoverSource } from '../discovery/sourceDiscovery.js'
import { crawlApp } from '../runtime/crawler.js'
import { buildDeterministicIntent } from '../heuristics/intent.js'
import { verifyRuntimeIntent } from '../runtime/workflowVerifier.js'
import { classifyRuntimeIssues } from '../heuristics/issueClassifier.js'
import { writeAuditReports } from '../reporting/reportWriter.js'
import { writeJson } from '../reporting/json.js'
import { loadReport } from './fixPackets.js'
import { critiqueFindings } from '../critic/workflowCritic.js'

export async function verifyIssue(input: {
  issueId: string
  reportPath: string
  url: string
}): Promise<VerificationResult> {
  const before = await loadReport(input.reportPath)
  const beforeIssue = before.issues.find((issue) => issue.issue_id === input.issueId)
  if (!beforeIssue) throw new Error(`Issue not found: ${input.issueId}`)

  const reportDir = path.dirname(path.resolve(input.reportPath))
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const verificationDir = path.join(reportDir, 'repair_attempts', input.issueId, timestamp, 'verification')
  await mkdir(verificationDir, { recursive: true })

  const sourceGraph = await discoverSource(before.sourceGraph.repoPath)
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
  const afterReport = await writeAuditReports(reportDir, {
    sourceGraph,
    crawlGraph,
    appIntent: buildDeterministicIntent(sourceGraph),
    runtimeWorkflowVerifications,
    ...critic
  })

  const matchingAfter = findMatchingIssue(beforeIssue, afterReport)
  const result: VerificationResult = {
    issue_id: input.issueId,
    status: matchingAfter ? 'still_failing' : 'fixed',
    beforeEvidence: beforeIssue.evidence,
    afterEvidence: matchingAfter?.evidence ?? [],
    verificationCommand: `npm run sniffer -- verify --issue ${input.issueId} --url ${input.url} --report ${path.resolve(input.reportPath)}`,
    reportPath: path.join(verificationDir, 'verification_result.json')
  }
  await writeJson(result.reportPath, result)
  return result
}

export function findMatchingIssue(beforeIssue: SnifferReport['issues'][number], afterReport: SnifferReport): SnifferReport['issues'][number] | undefined {
  return afterReport.issues.find((issue) =>
    issue.type === beforeIssue.type &&
    (issue.title === beforeIssue.title || overlaps(issue.evidence, beforeIssue.evidence))
  )
}

function overlaps(left: string[], right: string[]): boolean {
  return left.some((value) => right.some((other) => value === other || value.includes(other) || other.includes(value)))
}
