import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ScreenshotGallery } from '../src/components/ScreenshotGallery'
import type { ScreenshotItem, SnifferReport } from '../src/api'

afterEach(() => cleanup())

describe('ScreenshotGallery', () => {
  it('renders scenario and action context on screenshot cards', () => {
    render(<ScreenshotGallery report={report()} screenshots={screenshots()} projectId="ad_hoc" projectName="Ad hoc" />)

    expect(screen.getByText('Dashboard navigation smoke test')).toBeInTheDocument()
    expect(screen.getByText('sniffer-9-screenshots')).toBeInTheDocument()
    expect(screen.getByText('click Screenshots')).toBeInTheDocument()
    expect(screen.getAllByText('Screenshots').length).toBeGreaterThan(0)
  })

  it('shows URL and screen context in the screenshot modal', () => {
    render(<ScreenshotGallery report={report()} screenshots={screenshots()} projectId="ad_hoc" projectName="Ad hoc" />)

    fireEvent.click(screen.getByRole('button', { name: /sniffer-dashboard-navigation-sniffer-9-screenshots\.png/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Screen: Screenshots')).toBeInTheDocument()
    expect(screen.getByText('URL: http://127.0.0.1:4877/')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy path' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open artifact' })).toBeInTheDocument()
  })

  it('shows fallback text when screenshot context is unavailable', () => {
    render(<ScreenshotGallery report={{ ...report(), scenarioRuns: [], issues: [] }} screenshots={[{
      name: 'orphan.png',
      relativePath: 'screenshots/orphan.png',
      group: 'states',
      url: '/api/reports/latest/artifacts/screenshots%2Forphan.png'
    }]} />)

    expect(screen.getAllByText('Context unavailable').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /orphan\.png/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getAllByText('Context unavailable').length).toBeGreaterThan(0)
  })
})

function screenshots(): ScreenshotItem[] {
  return [{
    name: 'sniffer-dashboard-navigation-sniffer-9-screenshots.png',
    relativePath: 'screenshots/generated-scenarios/sniffer-dashboard-navigation-sniffer-9-screenshots.png',
    group: 'generated-scenarios',
    url: '/api/reports/latest/artifacts/screenshots%2Fgenerated-scenarios%2Fsniffer-dashboard-navigation-sniffer-9-screenshots.png'
  }]
}

function report(): SnifferReport {
  const screenshotPath = '/tmp/sniffer/reports/sniffer/ad_hoc/latest/screenshots/generated-scenarios/sniffer-dashboard-navigation-sniffer-9-screenshots.png'
  return {
    generatedAt: '2026-05-11T18:04:14.050Z',
    issues: [{
      issue_id: 'issue-screenshots',
      severity: 'medium',
      type: 'product_experience_gap',
      title: 'Screenshots view does not explain screenshot context',
      description: 'Missing screenshot metadata.',
      evidence: ['screenshot evidence'],
      screenshotPath
    }],
    scenarioRuns: [{
      slug: 'sniffer-dashboard-navigation',
      name: 'Dashboard navigation smoke test',
      status: 'passed',
      stepsAttempted: ['Open dashboard sidebar sections'],
      screenshots: [screenshotPath],
      stepTraces: [{
        scenarioName: 'Dashboard navigation smoke test',
        scenarioSlug: 'sniffer-dashboard-navigation',
        stepName: 'sniffer-9-screenshots',
        actionLabel: 'click Screenshots',
        url: 'http://127.0.0.1:4877/',
        screenName: 'Screenshots',
        screenshotPath
      }]
    }],
    crawlGraph: {
      startUrl: 'http://127.0.0.1:4877',
      finalUrl: 'http://127.0.0.1:4877',
      states: [],
      actions: [],
      consoleErrors: [],
      networkFailures: [],
      screenshots: [screenshotPath]
    },
    sourceGraph: {
      repoPath: '/tmp/sniffer',
      framework: 'react',
      buildTool: 'vite'
    }
  }
}
