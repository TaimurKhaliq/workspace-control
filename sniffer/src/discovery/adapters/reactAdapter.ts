import path from 'node:path'
import type { DiscoveryAdapter, AdapterDetection, DiscoveryContext, FrameworkDiscoveryResult } from './types.js'
import { emptyDiscoveryResult } from './types.js'
import { discoverReactUi } from '../reactUiDiscovery.js'

export class ReactDiscoveryAdapter implements DiscoveryAdapter {
  id = 'react'
  name = 'React JSX/TSX discovery'

  detect(context: DiscoveryContext): AdapterDetection {
    const evidence: string[] = []
    if (context.dependencies.react) evidence.push('package.json dependency: react')
    if (context.files.some((file) => ['.tsx', '.jsx'].includes(path.extname(file.file)))) evidence.push('JSX/TSX source files present')
    return {
      adapterId: this.id,
      framework: 'react',
      confidence: context.dependencies.react ? 0.95 : evidence.length ? 0.45 : 0,
      evidence
    }
  }

  discover(context: DiscoveryContext): FrameworkDiscoveryResult {
    const detection = this.detect(context)
    if (detection.confidence <= 0) return emptyDiscoveryResult(this.id, 'react', 0, [])
    const pairs = context.files.map((file) => [file.file, file.content] as const)
    const result = discoverReactUi(context.repoPath, pairs)
    return {
      ...emptyDiscoveryResult(this.id, 'react', detection.confidence, detection.evidence),
      uiSurfaces: result.uiSurfaces.map((item) => ({ ...item, sourceScope: scopeForFile(context, item.file), discoveredBy: [this.id], framework: 'react' })),
      sourceWorkflows: result.sourceWorkflows.map((item) => ({ ...item, sourceScope: scopeForFile(context, item.sourceFiles[0]), discoveredBy: [this.id], framework: 'react' })),
      apiCalls: result.apiCalls.map((item) => ({ ...item, sourceScope: scopeForFile(context, item.sourceFile), discoveredBy: [this.id], framework: 'react', confidence: 0.8 })),
      stateActions: result.stateActions.map((item) => ({ ...item, sourceScope: scopeForFile(context, item.file), discoveredBy: [this.id], framework: 'react', confidence: 0.8 }))
    }
  }
}

function scopeForFile(context: DiscoveryContext, relative: string) {
  return context.files.find((file) => file.relative === relative)?.sourceScope
}
