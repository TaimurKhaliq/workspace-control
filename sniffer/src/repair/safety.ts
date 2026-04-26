import type { FixPacket, Issue } from '../types.js'

const destructiveTerms = ['delete', 'remove', 'reset', 'drop', 'truncate', 'destroy', 'overwrite', 'force']
const protectedTerms = ['workspace', 'repo', 'baseline']

export function isActionableIssue(issue: Issue): boolean {
  return !['test_bug', 'inconclusive'].includes(issue.type) && issue.status !== 'fixed'
}

export function assertSafeFixPacket(packet: FixPacket, allowDestructive = false): void {
  const text = `${packet.title}\n${packet.prompt}`.toLowerCase()
  const destructive = destructiveTerms.some((term) => text.includes(term))
  const protectedTarget = protectedTerms.some((term) => text.includes(term))
  if (!allowDestructive && destructive && protectedTarget) {
    throw new Error(`Unsafe fix packet blocked for ${packet.issue_id}: destructive protected-data language detected`)
  }
}
