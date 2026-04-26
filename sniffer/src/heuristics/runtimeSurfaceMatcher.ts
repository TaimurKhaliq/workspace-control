import type { CrawlGraph, RuntimeSurfaceMatch, SourceGraph, UiSurface } from '../types.js'

export function matchRuntimeSurfaces(sourceGraph: SourceGraph, crawlGraph: CrawlGraph): RuntimeSurfaceMatch[] {
  if (crawlGraph.states.length === 0) {
    return sourceGraph.uiSurfaces.map((surface) => toMatch(surface, 'unknown', []))
  }

  const domEvidence = crawlGraph.states.flatMap((state) =>
    state.visible.flatMap((element) => [element.text, element.name, element.href, element.selectorHint].filter(Boolean) as string[])
  )
  const domText = domEvidence.join('\n').toLowerCase()

  return sourceGraph.uiSurfaces.map((surface) => {
    const sourceNeedles = [...surface.evidence, ...surface.relatedButtons, ...surface.relatedInputs]
      .filter((value) => value.length >= 3)
    const matches = sourceNeedles.filter((value) => domText.includes(value.toLowerCase()))
    return toMatch(surface, matches.length > 0 ? 'yes' : 'no', matches.slice(0, 8))
  })
}

function toMatch(surface: UiSurface, seenInRuntime: RuntimeSurfaceMatch['seenInRuntime'], matchingDomEvidence: string[]): RuntimeSurfaceMatch {
  return {
    surface_type: surface.surface_type,
    display_name: surface.display_name,
    file: surface.file,
    seenInRuntime,
    matchingDomEvidence
  }
}
