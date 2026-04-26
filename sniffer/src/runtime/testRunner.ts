import { spawnSync } from 'node:child_process'
import type { ClassifiedFailure, TestRunResult } from '../types.js'

export interface RunGeneratedTestsOptions {
  testDir: string
  useLlm?: boolean
  maxRepairIterations?: number
}

export function runGeneratedTests(options: RunGeneratedTestsOptions): TestRunResult {
  const result = spawnSync('npx', ['playwright', 'test', options.testDir, '--reporter=line'], {
    encoding: 'utf8'
  })

  if (result.status === 0) return { status: 'passed', failures: [] }

  const output = `${result.stdout}\n${result.stderr}`
  return {
    status: 'failed',
    failures: [classifyFailure(output)]
  }
}

export function classifyFailure(output: string): ClassifiedFailure {
  const normalized = output.toLowerCase()
  if (normalized.includes('strict mode violation') || normalized.includes('locator') || normalized.includes('timeout')) {
    return {
      testTitle: extractTitle(output),
      classification: 'test_bug',
      reason: 'Failure appears related to selector ambiguity, missing locator, or timing.'
    }
  }
  if (normalized.includes('500') || normalized.includes('pageerror') || normalized.includes('net::err') || normalized.includes('expect(')) {
    return {
      testTitle: extractTitle(output),
      classification: 'app_bug',
      reason: 'Failure appears tied to app runtime behavior or a failed user-visible assertion.'
    }
  }
  return {
    testTitle: extractTitle(output),
    classification: 'inconclusive',
    reason: 'Failure did not match deterministic app-bug or test-bug heuristics.'
  }
}

function extractTitle(output: string): string {
  return output.match(/✘\s+\d+\s+(.+?)\s+\(/)?.[1]?.trim() ?? 'generated test'
}
