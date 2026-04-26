import path from 'node:path'
import type { FixPacket } from '../types.js'

export interface RepairPathPolicy {
  repairRoot: string
  allowedPaths: string[]
  normalizedSuspectedFiles: string[]
}

export function resolveRepairPathPolicy(input: {
  repoPath: string
  suspectedFiles: string[]
  reportDir?: string
}): RepairPathPolicy {
  const repoPath = path.resolve(input.repoPath)
  const absoluteSuspects = input.suspectedFiles.map((file) => path.resolve(repoPath, file))
  const escapesRepo = absoluteSuspects.some((file) => !isInside(repoPath, file))
  const repairRoot = escapesRepo ? path.dirname(repoPath) : repoPath
  const normalizedSuspectedFiles = absoluteSuspects.map((file) => path.relative(repairRoot, file))
  const allowed = new Set<string>()

  for (const file of normalizedSuspectedFiles) {
    const first = file.split(path.sep)[0]
    const second = file.split(path.sep)[1]
    if (first === 'server') allowed.add('server/')
    else if (first === 'web' && second === 'src') allowed.add('web/src/')
    else if (first === 'src') allowed.add('src/')
    else if (first && !file.startsWith('..')) allowed.add(`${first}/`)
  }

  if (input.reportDir) {
    const reportsRelative = path.relative(repairRoot, path.join(input.reportDir, 'repair_attempts'))
    if (!reportsRelative.startsWith('..')) allowed.add(`${reportsRelative.split(path.sep).join('/')}/`)
  }

  return {
    repairRoot,
    allowedPaths: [...allowed].sort(),
    normalizedSuspectedFiles: normalizedSuspectedFiles.map((file) => file.split(path.sep).join('/')).sort()
  }
}

export function assertChangedFilesAllowed(changedFiles: string[], packet: FixPacket): void {
  const repairRoot = path.resolve(packet.repair_root)
  for (const file of changedFiles) {
    const absolute = path.resolve(repairRoot, file)
    if (!isInside(repairRoot, absolute)) {
      throw new Error(`Repair modified file outside repair root: ${file}`)
    }
    const normalized = path.relative(repairRoot, absolute).split(path.sep).join('/')
    if (!packet.allowed_paths.some((allowed) => normalized === allowed.replace(/\/$/, '') || normalized.startsWith(allowed))) {
      throw new Error(`Repair modified file outside allowed paths: ${normalized}`)
    }
  }
}

export function isInside(root: string, file: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(file))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
