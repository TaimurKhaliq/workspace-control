import path from 'node:path'

export function regexMatches(value: string, regex: RegExp): string[] {
  return [...value.matchAll(regex)].map((match) => match[1]).filter(Boolean)
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))]
}

export function cleanText(value: string): string {
  return value
    .replace(/\{\{[\s\S]*?\}\}/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isHumanText(value: string): boolean {
  return /[A-Za-z]/.test(value) && value.length > 1 && !/^[(){}[\].,;:]+$/.test(value)
}

export function tagText(content: string, tags: string[]): string[] {
  return unique(tags.flatMap((tag) =>
    [...content.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))]
      .map((match) => cleanText(match[1]))
      .filter((text) => text && isHumanText(text))
  ))
}

export function attrValues(content: string, attr: string): string[] {
  return unique([...content.matchAll(new RegExp(`\\b${escapeRegex(attr)}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|\\[?["']([^"']+)["']\\]?)`, 'gi'))]
    .map((match) => cleanText(match[1] ?? match[2] ?? match[3] ?? ''))
    .filter(Boolean))
}

export function relativeName(file: string): string {
  return path.basename(file, path.extname(file))
}

export function endpointStrings(content: string): string[] {
  return unique([
    ...regexMatches(content, /['"`]((?:https?:\/\/[^'"`]+|\/[^'"`\s]+))['"`]/g),
    ...regexMatches(content, /(?:get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi)
  ])
    .map(normalizeEndpointReference)
    .filter((item) => item.startsWith('/') || item.startsWith('http'))
}

export function normalizeEndpointReference(endpoint: string): string {
  let value = endpoint.trim()
  value = value.replace(/\$\{[^}]*relativePath[^}]*\}/g, '{artifactPath}')
  value = value.replace(/\$\{[^}]*query[^}]*\}/g, '')
  value = value.replace(/\$\{([^}]*)\}/g, (_, expression: string) => {
    const name = expression.match(/\b([A-Za-z_][\w]*)\b(?!\s*\()/)?.[1] ?? 'param'
    return `{${name}}`
  })
  if (value.includes('/api/reports/latest/artifacts/')) {
    value = value.replace(/\/api\/reports\/latest\/artifacts\/(?:\{[^}]+\}|[^/?#'"]+).*/, '/api/reports/latest/artifacts/{artifactPath}')
  }
  value = value.replace(/\$\{[\s\S]*$/, '')
  value = value.replace(/[?#].*$/, '')
  value = value.replace(/\/+$/, '')
  if (value === '/api/reports/latest/artifacts') return '/api/reports/latest/artifacts/{artifactPath}'
  return value === '/api' ? '/api/' : value
}

export function isApiPrefixReference(endpoint: string): boolean {
  const value = normalizeEndpointReference(endpoint)
  if (/^https?:\/\//.test(value)) {
    try {
      const parsed = new URL(value)
      return parsed.pathname === '/api' || parsed.pathname === '/api/'
    } catch {
      return false
    }
  }
  return value === '/api' || value === '/api/' || /^\/api\/\{[^/}]+\}$/.test(value)
}

export function inferHttpMethod(content: string, fallback?: string): string | undefined {
  return content.match(/method\s*:\s*['"`]([A-Z]+)['"`]/)?.[1] ??
    content.match(/\.((?:get|post|put|patch|delete))\s*\(/i)?.[1]?.toUpperCase() ??
    fallback
}

export function wordsFromName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function roundConfidence(value: number): number {
  return Math.round(Math.max(0, Math.min(0.99, value)) * 100) / 100
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
