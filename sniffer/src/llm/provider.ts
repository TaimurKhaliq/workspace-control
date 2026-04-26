import type { AppIntent, SourceGraph } from '../types.js'

export interface LlmProvider {
  name: string
  inferIntent(input: { sourceGraph: SourceGraph; deterministicIntent: AppIntent }): Promise<AppIntent>
  repairTest?(input: { testFile: string; failure: string }): Promise<string | undefined>
}
