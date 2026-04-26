import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AppIntent, GeneratedSpec } from '../types.js'

export function generatePlaywrightSpecs(intent: AppIntent, url: string): GeneratedSpec[] {
  const workflows = intent.likelyWorkflows.length > 0
    ? intent.likelyWorkflows
    : [{ name: 'homepage renders', route: '/', steps: ['Open app'], confidence: 0.5 }]

  return workflows.slice(0, 12).map((workflow, index) => {
    const route = workflow.route ?? '/'
    const safeName = workflow.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `workflow-${index + 1}`
    const target = new URL(route, url).toString()
    return {
      fileName: `${String(index + 1).padStart(2, '0')}-${safeName}.spec.ts`,
      content: [
        "import { test, expect } from '@playwright/test'",
        '',
        `test(${JSON.stringify(workflow.name)}, async ({ page }) => {`,
        `  await page.goto(${JSON.stringify(target)})`,
        '  await expect(page).toHaveTitle(/.+/)',
        '  await expect(page.locator("body")).toBeVisible()',
        '})',
        ''
      ].join('\n')
    }
  })
}

export async function writeGeneratedSpecs(specs: GeneratedSpec[], outputDir: string): Promise<string[]> {
  await mkdir(outputDir, { recursive: true })
  const written: string[] = []
  for (const spec of specs) {
    const filePath = path.join(outputDir, spec.fileName)
    await writeFile(filePath, spec.content, 'utf8')
    written.push(filePath)
  }
  return written
}
