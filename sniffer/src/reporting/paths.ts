import path from 'node:path'

export const AD_HOC_PROJECT_ID = 'ad_hoc'

export function reportsRoot(baseDir = process.cwd()): string {
  return path.join(baseDir, 'reports', 'sniffer')
}

export function latestReportDir(baseDir = process.cwd()): string {
  return path.join(reportsRoot(baseDir), 'latest')
}

export function projectReportDir(projectId: string, baseDir = process.cwd()): string {
  return path.join(reportsRoot(baseDir), safeProjectId(projectId))
}

export function projectLatestReportDir(projectId: string, baseDir = process.cwd()): string {
  return path.join(projectReportDir(projectId, baseDir), 'latest')
}

export function projectRunReportDir(projectId: string, runId: string, baseDir = process.cwd()): string {
  return path.join(projectReportDir(projectId, baseDir), 'runs', safeRunId(runId))
}

export function generatedTestsDir(baseDir = process.cwd(), projectId?: string): string {
  const root = projectId ? projectLatestReportDir(projectId, baseDir) : latestReportDir(baseDir)
  return path.join(root, 'generated_tests')
}

export function safeProjectId(value: string): string {
  return (value || AD_HOC_PROJECT_ID)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || AD_HOC_PROJECT_ID
}

function safeRunId(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || new Date().toISOString().replace(/[:.]/g, '-')
}
