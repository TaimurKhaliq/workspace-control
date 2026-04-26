import path from 'node:path'

export function latestReportDir(baseDir = process.cwd()): string {
  return path.join(baseDir, 'reports', 'sniffer', 'latest')
}

export function generatedTestsDir(baseDir = process.cwd()): string {
  return path.join(latestReportDir(baseDir), 'generated_tests')
}
