---
name: metadata-planning
description: Analyze a feature request against stackpilot.yml manifests and produce a conservative implementation plan when source code is missing or incomplete.
---

Use this skill when:
- the workspace contains little or no real source code
- stackpilot.yml files are present
- the goal is to infer ownership, intent, and likely change areas conservatively

Workflow:
1. Run architecture discovery and determine repository evidence mode
2. If repositories are metadata-only, treat stackpilot.yml and AGENTS.md as hints, not source truth
3. Run feature analysis to identify:
   - primary owner
   - implementation owner
   - domain owner
   - direct dependents
   - possible downstreams
4. Run planning to identify:
   - feature intents
   - confidence
   - missing evidence
   - likely paths by repo
   - ordered steps
5. Run propose-changes conservatively:
   - prefer folders over invented files
   - avoid concrete filenames unless naming evidence exists
6. Clearly state when outputs are based on metadata hints rather than discovered source structure

Rules:
- Be deterministic
- Do not assume source code exists
- Do not invent concrete file names unless supported by naming evidence
- Prefer conservative implementation suggestions
- Surface missing evidence explicitly
- For mutable domain-field updates such as phone number, email, preferred language, or marketing opt-in, do not treat screen/page/form wording as UI-only when manifest metadata shows strong backend ownership.
- In metadata-only mode, distinguish the UI implementation owner from the backend domain owner when both are supported by manifest hints.
- Infer API intent for mutable domain-field updates that flow from UI to a backend owner, but keep database change flags false unless the request explicitly mentions adding, storing, persisting, a new field/column, or migrations.
