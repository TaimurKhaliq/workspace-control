const unsafeTerms = [
  'delete',
  'remove',
  'reset',
  'force',
  'overwrite',
  'destroy',
  'drop',
  'truncate',
  'archive',
  'deactivate',
  'disable',
  'confirm purchase',
  'submit payment'
]

const safeTerms = [
  'copy',
  'close',
  'open',
  'menu',
  'tab',
  'next',
  'previous',
  'back',
  'learn',
  'view',
  'details'
]

export interface SafeActionDecision {
  safe: boolean
  reason: string
}

export function classifyActionSafety(label: string, role?: string, allowUnsafe = false): SafeActionDecision {
  const normalized = `${role ?? ''} ${label}`.trim().toLowerCase()
  if (allowUnsafe) return { safe: true, reason: 'unsafe actions explicitly allowed' }
  if (unsafeTerms.some((term) => normalized.includes(term))) {
    return { safe: false, reason: 'label suggests destructive or permanent mutation' }
  }
  if (role === 'link' || role === 'tab') return { safe: true, reason: `${role} navigation is safe` }
  if (safeTerms.some((term) => normalized.includes(term))) return { safe: true, reason: 'label matches known safe interaction' }
  if (role === 'button') return { safe: true, reason: 'button is allowed unless destructive language is present' }
  return { safe: false, reason: 'interaction type is not in safe policy' }
}
