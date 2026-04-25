# Plan Bundle

## Feature Request
Add OwnersPage (no actions yet)

## Summary
- detected intents: ui
- implementation owner: `spring-petclinic-reactjs`
- domain owner: `-`
- confidence: `high`
- planning mode: `planner+recipe`
- planner native available: `True`
- recipe assisted: `True`

## Ownership
- primary owner: `spring-petclinic-reactjs`
- implementation owner: `spring-petclinic-reactjs`
- domain owner: `-`
- direct dependents: -
- possible downstreams: -

## Recommended Change Set

| priority | repo | path | action | confidence | source | reason |
|---:|---|---|---|---|---|---|
| 1 | `spring-petclinic-reactjs` | `client/src/components/owners/OwnersPage.tsx` | inspect | medium | recipe | requested page/component already exists in the current source graph |
| 2 | `spring-petclinic-reactjs` | `client/src/configureRoutes.tsx` | modify | high | recipe | recipe commonly modifies routing/configuration when adding pages |
| 3 | `spring-petclinic-reactjs` | `client/src/components/owners/EditOwnerPage.tsx` | inspect | medium | planner | Nearby same-domain frontend file can provide the page and routing pattern. |
| 4 | `spring-petclinic-reactjs` | `client/src/components/owners/NewOwnerPage.tsx` | inspect | medium | planner | Nearby same-domain frontend file can provide the page and routing pattern. |
| 5 | `spring-petclinic-reactjs` | `client/src/components/owners/OwnerEditor.tsx` | inspect | medium | planner | Nearby same-domain frontend file can provide the page and routing pattern. |
| 6 | `spring-petclinic-reactjs` | `client/src/types/index.ts` | inspect | medium | recipe | recipe often updates frontend types for page additions |

## Recipe Evidence

### `petclinic_react_ui_page_add`
- type: `ui_page_add`
- structural confidence: `0.98`
- planner effectiveness: `0.05`
- why matched: source graph contains related domain token(s): add, owner, owners, request verb includes add, identifier normalization exposes page-style term(s): add, owner, owners, page, request looks like UI page creation, feature intent includes ui, structural confidence 0.98
- created node types: page_component
- modified node types: frontend_type, route_config, frontend_component, unknown, page_component
- cochange patterns: frontend_type + page_component, frontend_type + route_config, page_component + route_config, frontend_component + unknown

## Source Graph Evidence
- `spring-petclinic-reactjs` `client/src/components/owners/OwnersPage.tsx` (page_component, high): Recommended change-set item 1 maps to source graph node `page_component`.; tokens=owners, owner, props, prop, state, params, param
- `spring-petclinic-reactjs` `client/src/configureRoutes.tsx` (shared_component, medium): Recommended change-set item 2 maps to source graph node `shared_component`.; tokens=configure, routes, route
- `spring-petclinic-reactjs` `client/src/components/owners/EditOwnerPage.tsx` (edit_surface, high): Recommended change-set item 3 maps to source graph node `edit_surface`.; tokens=owners, owner, props, prop, state, params, param
- `spring-petclinic-reactjs` `client/src/components/owners/NewOwnerPage.tsx` (page_component, high): Recommended change-set item 4 maps to source graph node `page_component`.; tokens=owners, owner, new, first, last, address, city, telephone
- `spring-petclinic-reactjs` `client/src/components/owners/OwnerEditor.tsx` (form_component, high): Recommended change-set item 5 maps to source graph node `form_component`.; tokens=owners, owner, props, prop, state, initial, context, router
- `spring-petclinic-reactjs` `client/src/types/index.ts` (frontend_type, high): Recommended change-set item 6 maps to source graph node `frontend_type`.; tokens=router, context, constraint, select, option, person, visit, pet

## Validation Commands
- `./mvnw test`
- `cd client && npm test`

## Risks / Missing Evidence
- **info** `recipe`: Recipe suggestions are deterministic repo-local guidance; planner-native output remains visible separately.

## Coding Agent Handoff Prompt

### spring-petclinic-reactjs

```text
You are working in repo: spring-petclinic-reactjs.

Task:
Add OwnersPage (no actions yet)

Context:
This repo has matched learned recipe evidence:
- petclinic_react_ui_page_add (ui_page_add, structural=0.98, planner=0.05)

Inspect first:
1. client/src/components/owners/OwnersPage.tsx (inspect, medium, source=recipe)
2. client/src/configureRoutes.tsx (modify, high, source=recipe)
3. client/src/components/owners/EditOwnerPage.tsx (inspect, medium, source=planner)
4. client/src/components/owners/NewOwnerPage.tsx (inspect, medium, source=planner)
5. client/src/components/owners/OwnerEditor.tsx (inspect, medium, source=planner)
6. client/src/types/index.ts (inspect, medium, source=recipe)

Expected change:
- Modify the high-confidence files that directly own the requested flow or behavior.
- Keep frontend/UI work focused on the requested screen, page, route, or component.
- Keep this UI-only; do not add backend/API behavior unless new code evidence requires it.

Constraints:
- Keep the change scoped to the requested feature.
- Do not overreach into unrelated domains or broad refactors.
- Treat inspect-only or low-confidence files as reference material unless code evidence says otherwise.

Validation:
- ./mvnw test
- cd client && npm test
```

