import type { AppIntent, SourceGraph, Workflow } from '../types.js'

export function buildDeterministicIntent(sourceGraph: SourceGraph): AppIntent {
  const workflows: Workflow[] = sourceGraph.routes.slice(0, 12).map((route) => ({
    name: `Visit ${route.path}`,
    route: route.path,
    steps: [`Open ${route.path}`, 'Verify the page renders without console or network errors'],
    confidence: route.source === 'filesystem' ? 0.8 : 0.55
  }))

  for (const form of sourceGraph.forms) {
    workflows.push({
      name: `Complete ${form.name} form`,
      steps: ['Open form surface', ...form.inputs.map((input) => `Fill ${input}`), 'Verify validation or success feedback'],
      confidence: 0.65
    })
  }

  for (const workflow of sourceGraph.sourceWorkflows) {
    workflows.push({
      name: workflow.name,
      steps: workflow.likelyUserActions,
      confidence: workflow.confidence
    })
  }

  return {
    summary: `Detected ${sourceGraph.framework} app with ${sourceGraph.routes.length} route signals, ${sourceGraph.components.length} components, ${sourceGraph.forms.length} forms, ${sourceGraph.uiSurfaces.length} UI surfaces, ${sourceGraph.sourceWorkflows.length} source workflows, and ${sourceGraph.apiCalls.length} API calls.`,
    likelyWorkflows: workflows,
    sourceSignals: [
      `framework:${sourceGraph.framework}`,
      `buildTool:${sourceGraph.buildTool}`,
      `routes:${sourceGraph.routes.length}`,
      `forms:${sourceGraph.forms.length}`,
      `uiSurfaces:${sourceGraph.uiSurfaces.length}`,
      `sourceWorkflows:${sourceGraph.sourceWorkflows.length}`,
      `apiCalls:${sourceGraph.apiCalls.length}`
    ],
    llmUsed: false
  }
}
