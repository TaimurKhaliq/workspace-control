export interface ArtifactContext {
  projectId?: string
}

interface ParsedArtifactPath {
  relativePath: string
  projectId?: string
  isProjectScoped: boolean
}

export function artifactUrl(inputPath: string, context?: string | ArtifactContext): string {
  if (/^https?:\/\//.test(inputPath) || inputPath.startsWith('/api/')) return inputPath
  const parsed = parseArtifactPath(inputPath)
  const fallbackProject = typeof context === 'string' ? context : context?.projectId
  const projectId = parsed.isProjectScoped ? parsed.projectId : fallbackProject
  const query = projectId ? `?project=${encodeURIComponent(projectId)}` : ''
  return `/api/reports/latest/artifacts/${encodeURIComponent(parsed.relativePath)}${query}`
}

export function projectIdFromReportArtifacts(paths: Array<string | undefined>, fallback?: string): string | undefined {
  for (const candidate of paths) {
    if (!candidate) continue
    const parsed = parseArtifactPath(candidate)
    if (parsed.isProjectScoped) return parsed.projectId
  }
  return fallback
}

export function parseArtifactPath(inputPath: string): ParsedArtifactPath {
  const normalized = inputPath.replace(/\\/g, '/')
  const latestMatch = normalized.match(/\/reports\/sniffer\/latest\/(.+)$/)
  if (latestMatch) {
    return {
      relativePath: sanitizeRelativeArtifactPath(latestMatch[1]),
      isProjectScoped: false
    }
  }

  const projectMatch = normalized.match(/\/reports\/sniffer\/([^/]+)\/latest\/(.+)$/)
  if (projectMatch) {
    return {
      projectId: projectMatch[1],
      relativePath: sanitizeRelativeArtifactPath(projectMatch[2]),
      isProjectScoped: true
    }
  }

  return {
    relativePath: sanitizeRelativeArtifactPath(normalized),
    isProjectScoped: false
  }
}

function sanitizeRelativeArtifactPath(value: string): string {
  return value
    .replace(/^\/+/, '')
    .replace(/^(\.\.\/)+/, '')
    .replace(/\/+/g, '/')
}
