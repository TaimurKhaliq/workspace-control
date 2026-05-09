import { describe, expect, it } from 'vitest'
import { buildCrawlCandidates, inferScreen, selectNextCrawlCandidate } from '../src/runtime/crawler.js'
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

  it('does not follow external links by default', () => {
    const state = crawlState('/', [
      { kind: 'link', text: 'GitHub', href: 'https://github.com/example/repo' },
      { kind: 'link', text: 'Sign in', href: 'http://127.0.0.1:5173/login' }
    ])
    const { next, skipped } = buildCrawlCandidates(state, context())
    expect(next?.label).toBe('Sign in')
    expect(skipped.some((item) => item.label === 'GitHub' && /external origin skipped/.test(item.reason))).toBe(true)
  })

  it('infers Create workspace dialog from current dialog text', () => {
    const inferred = inferScreen('http://127.0.0.1:5173/', [
      { kind: 'dialog', text: 'Create workspace × Workspace name Cancel Create workspace' },
      { kind: 'button', text: 'Add repository' }
    ], [
      'WORKSPACES Add repository Create workspace × Workspace name Cancel Create workspace'
    ])

    expect(inferred).toEqual({ name: 'Create workspace dialog', pageType: 'dialog' })
  })

  it('infers Add repository dialog from current dialog text', () => {
    const inferred = inferScreen('http://127.0.0.1:5173/', [
      { kind: 'dialog', text: 'Add repository × Target id Source type Path or URL Cancel Add repo' },
      { kind: 'button', text: 'Create workspace' }
    ], [
      'WORKSPACES Create workspace Add repository × Target id Source type Path or URL Cancel Add repo'
    ])

    expect(inferred).toEqual({ name: 'Add repository dialog', pageType: 'dialog' })
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
    maxDuplicateActions: 1,
    allowedOrigin: 'http://127.0.0.1:5173'
  }
}
