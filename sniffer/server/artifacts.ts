import path from 'node:path'

export interface ArtifactResolution {
  file?: string
  error?: 'invalid_path'
}

export function resolveReportArtifact(reportDir: string, encodedRelativePath: string): ArtifactResolution {
  let decoded: string
  try {
    decoded = decodeURIComponent(encodedRelativePath)
  } catch {
    return { error: 'invalid_path' }
  }

  const normalized = path.posix.normalize(decoded.replace(/\\/g, '/'))
  if (
    !normalized ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    path.isAbsolute(normalized) ||
    normalized.includes('\0')
  ) {
    return { error: 'invalid_path' }
  }

  const root = path.resolve(reportDir)
  const file = path.resolve(root, normalized)
  if (file !== root && !file.startsWith(root + path.sep)) return { error: 'invalid_path' }
  return { file }
}
