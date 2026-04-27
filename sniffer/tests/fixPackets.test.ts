import { describe, expect, it } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { generateFixPackets } from '../src/repair/fixPackets.js'
import type { SnifferReport } from '../src/types.js'

describe('generateFixPackets', () => {
  it('writes json and markdown packets for actionable issues', async () => {
    const dir = await tempDir()
    const reportPath = path.join(dir, 'latest_report.json')
    await writeFile(reportPath, JSON.stringify(report(), null, 2))

    const packets = await generateFixPackets(reportPath)

    expect(packets).toHaveLength(1)
    expect(packets[0]).toMatchObject({
      issue_id: 'issue-1',
      title: 'Learning status fails',
      suspected_files: expect.arrayContaining(['src/api.ts'])
    })
    await expect(readFile(path.join(dir, 'fix_packets', 'issue-1.md'), 'utf8')).resolves.toContain('Codex')
    await expect(readFile(path.join(dir, 'fix_packets', 'issue-1.json'), 'utf8')).resolves.toContain('verification_command')
  })

  it('generates frontend-scoped packets for UX issues', async () => {
    const dir = await tempDir()
    const reportPath = path.join(dir, 'latest_report.json')
    const uxReport = report()
    uxReport.sourceGraph.uiSurfaces = [{
      file: 'src/App.tsx',
      surface_type: 'workspace_list',
      display_name: 'Workspace list',
      evidence: ['Workspaces'],
      relatedButtons: [],
      relatedInputs: [],
      confidence: 0.9
    }]
    uxReport.issues = [{
      issue_id: 'ux-1',
      severity: 'medium',
      type: 'layout_issue',
      title: 'Text appears jammed together',
      description: 'Workspace card metadata is concatenated.',
      evidence: ['PetClinic local4/25/2026'],
      suggestedFixPrompt: 'Separate workspace names and dates.'
    }]
    await writeFile(reportPath, JSON.stringify(uxReport, null, 2))

    const packets = await generateFixPackets(reportPath)

    expect(packets).toHaveLength(1)
    expect(packets[0].title).toBe('Repository/workspace lists are hard to scan due to cramped text and overflow')
    expect(packets[0].allowed_paths).toContain('src/')
    expect(packets[0].suspected_files).toContain('src/App.tsx')
    await expect(readFile(path.join(dir, 'fix_packets', `${packets[0].issue_id}.md`), 'utf8')).resolves.toContain('card/table layout')
  })
})

function report(): SnifferReport {
  return {
    sourceGraph: {
      repoPath: '/tmp/repo',
      framework: 'react',
      buildTool: 'vite',
      routes: [],
      pages: [],
      components: [],
      forms: [],
      uiSurfaces: [],
      sourceWorkflows: [],
      apiCalls: [],
      stateActions: [],
      packageScripts: {},
      generatedAt: ''
    },
    crawlGraph: {
      startUrl: 'http://localhost:5173',
      title: 'Demo',
      finalUrl: 'http://localhost:5173',
      states: [],
      actions: [],
      consoleErrors: [],
      networkFailures: [],
      screenshots: ['/tmp/screen.png'],
      generatedAt: ''
    },
    appIntent: { summary: '', likelyWorkflows: [], sourceSignals: [], llmUsed: false },
    runtimeSurfaceMatches: [],
    runtimeWorkflowVerifications: [],
    criticDecisions: [],
    deferredFindings: [],
    blockedChecks: [],
    needsMoreCrawling: [],
    issues: [{
      issue_id: 'issue-1',
      severity: 'medium',
      type: 'console_error',
      title: 'Learning status fails',
      description: 'GET /api/repos/demo/learning-status failed',
      evidence: ['/api/repos/demo/learning-status'],
      suspected_files: ['src/api.ts'],
      fix_prompt: 'Codex: fix the learning status request handling.',
      verification_steps: ['Run audit'],
      pass_conditions: ['No learning-status issue remains'],
      status: 'open',
      attempts: 0,
      suggestedFixPrompt: 'Fix it'
    }],
    generatedAt: ''
  }
}

async function tempDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), `sniffer-fix-packet-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  return dir
}
