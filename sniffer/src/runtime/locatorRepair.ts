import type { Locator, Page } from 'playwright'
import type { LocatorCandidate, LocatorRepairResult, RuntimeDomSnapshot } from '../types.js'

export async function resolveLocatorCandidate(page: Page, candidates: LocatorCandidate[]): Promise<LocatorRepairResult> {
  const attempted: LocatorCandidate[] = []
  for (const candidate of candidates) {
    attempted.push(candidate)
    const locator = locatorFromCandidate(page, candidate)
    if (await locator.first().isVisible({ timeout: 500 }).catch(() => false)) {
      return {
        status: 'resolved',
        locator: candidate,
        attempted,
        reason: `Resolved using ${candidate.strategy} locator.`
      }
    }
  }
  return {
    status: candidates.length > 0 ? 'bad_locator' : 'missing_control',
    attempted,
    reason: candidates.length > 0
      ? 'No locator candidates matched a visible element.'
      : 'No locator candidates were available for the intended target.'
  }
}

export function deterministicLocatorRepair(input: {
  failedLocator?: LocatorCandidate
  intendedTarget: string
  snapshot: RuntimeDomSnapshot
}): LocatorCandidate[] {
  const target = normalize(input.intendedTarget)
  const controls = input.snapshot.controls
    .map((control) => ({
      control,
      score: Math.max(
        overlap(target, normalize(control.accessibleName ?? '')),
        overlap(target, normalize(control.visibleText ?? '')),
        overlap(target, normalize(control.labelText ?? '')),
        overlap(target, normalize(control.placeholder ?? '')),
        overlap(target, normalize(control.dataTestId ?? ''))
      )
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
  const candidates = controls.flatMap((item) => item.control.locatorCandidates)
  return dedupe([
    ...candidates,
    ...(input.failedLocator ? [input.failedLocator] : [])
  ]).sort((left, right) => right.confidence - left.confidence)
}

export function classifyLocatorFailure(input: {
  candidates: LocatorCandidate[]
  snapshot: RuntimeDomSnapshot
  intendedTarget: string
}): LocatorRepairResult['status'] {
  if (input.snapshot.controls.length === 0) return 'blocked_by_state'
  if (deterministicLocatorRepair({ intendedTarget: input.intendedTarget, snapshot: input.snapshot }).length === 0) return 'missing_control'
  return input.candidates.length > 0 ? 'bad_locator' : 'inconclusive'
}

function locatorFromCandidate(page: Page, candidate: LocatorCandidate): Locator {
  if (candidate.strategy === 'role') {
    const [role, ...nameParts] = candidate.value.split(':')
    const name = nameParts.join(':')
    return name ? page.getByRole(role as never, { name }) : page.getByRole(role as never)
  }
  if (candidate.strategy === 'label') return page.getByLabel(candidate.value)
  if (candidate.strategy === 'placeholder') return page.getByPlaceholder(candidate.value)
  if (candidate.strategy === 'testid') return page.getByTestId(candidate.value)
  if (candidate.strategy === 'text') return page.getByText(candidate.value)
  return page.locator(candidate.value)
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function overlap(left: string, right: string): number {
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.includes(right) || right.includes(left)) return 0.8
  const leftTokens = new Set(left.split(/\s+/).filter((item) => item.length > 2))
  const rightTokens = new Set(right.split(/\s+/).filter((item) => item.length > 2))
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length
  return shared / Math.max(leftTokens.size, rightTokens.size)
}

function dedupe(candidates: LocatorCandidate[]): LocatorCandidate[] {
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const key = `${candidate.strategy}:${candidate.value}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
