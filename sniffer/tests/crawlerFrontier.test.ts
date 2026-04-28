import { describe, expect, it } from 'vitest'
import { buildCrawlCandidates, selectNextCrawlCandidate } from '../src/runtime/crawler.js'
import type { CrawlState } from '../src/types.js'

describe('crawl frontier', () => {
  it('prioritizes unvisited navigation over the current route', () => {
    const state = crawlState('#workspaces', [
      { kind: 'button', text: 'Workspaces' },
      { kind: 'button', text: 'Repositories' },
      { kind: 'button', text: 'Settings' }
    ])
    const candidate = selectNextCrawlCandidate(state, context())
    expect(candidate?.label).toBe('Repositories')
    expect(candidate?.targetRoute).toBe('#repositories')
  })

  it('does not repeat actions that already failed to change state', () => {
    const state = crawlState('#workspaces', [
      { kind: 'button', text: 'Workspaces' },
      { kind: 'button', text: 'Repositories' }
    ])
    const ctx = context()
    ctx.ineffectiveActionKeys.set('#workspaces:#workspaces:button:Workspaces:', 1)
    const { next, skipped } = buildCrawlCandidates(state, ctx)
    expect(next?.label).toBe('Repositories')
    expect(skipped.some((item) => item.label === 'Workspaces' && /already on route|did not change state/.test(item.reason))).toBe(true)
  })

  it('types a safe sample prompt before generating from the prompt route', () => {
    const state = crawlState('#prompt', [
      { kind: 'input', name: 'Feature request', selectorHint: 'textarea' },
      { kind: 'button', text: 'Generate Plan Bundle' }
    ])
    const candidate = selectNextCrawlCandidate(state, context())
    expect(candidate?.actionType).toBe('type')
    expect(candidate?.label).toBe('Feature request')
  })
})

function crawlState(route: string, visible: CrawlState['visible']): CrawlState {
  return {
    id: 'state-1',
    sequenceNumber: 1,
    url: `http://127.0.0.1:5173/${route}`,
    hashRoute: route,
    title: 'Workspace Control',
    hash: `hash-${route}`,
    visible
  }
}

function context() {
  return {
    attemptedActionKeys: new Set<string>(),
    ineffectiveActionKeys: new Map<string, number>(),
    routeVisitCounts: new Map<string, number>(),
    maxPerRoute: 8,
    maxDuplicateActions: 1
  }
}
