# Plan Bundle

## Feature Request
add the ability to upload a picture of your pet

## Summary
- detected intents: ui, persistence, api, storage, file_upload, media_upload, retrieval, display, validation, backend_model
- new domain candidates: -
- implementation owner: `spring-petclinic-reactjs`
- domain owner: `-`
- confidence: `high`
- planning mode: `planner+semantic`
- planner native available: `True`
- recipe assisted: `False`
- backend required: `True`
- backend available: `True`
- missing backend required: `False`
- selected path: `/Users/taimurkhaliq/ai_projects/stackpilot-workspace/workspace-control/eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- suggested root path: `-`
- detected repo type: `full-stack/monorepo`

## Ownership
- primary owner: `spring-petclinic-reactjs`
- implementation owner: `spring-petclinic-reactjs`
- domain owner: `-`
- direct dependents: -
- possible downstreams: -

## Recommended Change Set

| priority | repo | path | action | confidence | source | reason |
|---:|---|---|---|---|---|---|
| 1 | `spring-petclinic-reactjs` | `client/src/components/pets/EditPetPage.tsx` | modify | high | both | Frontend page component is related to the requested UI change. |
| 2 | `spring-petclinic-reactjs` | `client/src/components/pets/NewPetPage.tsx` | modify | high | both | Frontend page component is related to the requested UI change. |
| 3 | `spring-petclinic-reactjs` | `client/src/components/pets/PetEditor.tsx` | inspect | high | semantic_enrichment | semantic_enrichment: pet form component, pet edit input surface, candidate upload UI integration point |
| 4 | `spring-petclinic-reactjs` | `client/src/components/pets/createPetEditorModel.ts` | modify | high | both | Likely pet/pets form component where requested input and validation are handled. |
| 5 | `spring-petclinic-reactjs` | `client/src/types/index.ts` | inspect | high | semantic_enrichment | semantic_enrichment: frontend type definitions, pet interface definition area, candidate pet picture type extension point |
| 6 | `spring-petclinic-reactjs` | `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetRepositoryImpl.java` | inspect | high | semantic_enrichment | semantic_enrichment: JDBC pet repository implementation, pet SQL persistence implementation, candidate schema/query update point for picture metadata |
| 7 | `spring-petclinic-reactjs` | `src/main/java/org/springframework/samples/petclinic/rest/controller/PetRestController.java` | modify | high | both | Pet/pets REST controller likely handles API requests for the requested fields. |
| 8 | `spring-petclinic-reactjs` | `client/src/components/owners/PetsTable.tsx` | inspect | medium | semantic_enrichment | semantic_enrichment: owner pets table, pet list display component, candidate pet picture display point |
| 9 | `spring-petclinic-reactjs` | `client/src/components/visits/PetDetails.tsx` | inspect | medium | semantic_enrichment | semantic_enrichment: pet detail component, visit-related pet display component, candidate pet picture display point |
| 10 | `spring-petclinic-reactjs` | `src/main/java/org/springframework/samples/petclinic/mapper/PetMapper.java` | inspect | medium | semantic_enrichment | semantic_enrichment: pet mapper, pet DTO/domain translation boundary, candidate picture metadata mapping point |
| 11 | `spring-petclinic-reactjs` | `src/main/java/org/springframework/samples/petclinic/repository/PetRepository.java` | inspect | medium | semantic_enrichment | semantic_enrichment: pet repository interface, backend pet persistence abstraction, candidate picture metadata persistence point |
| 12 | `spring-petclinic-reactjs` | `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPet.java` | inspect | medium | semantic_enrichment | semantic_enrichment: JDBC pet data object, pet persistence representation, candidate persisted picture field location |
| 13 | `spring-petclinic-reactjs` | `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetRowMapper.java` | inspect | medium | semantic_enrichment | semantic_enrichment: JDBC pet row mapper, database row to pet object mapping, candidate picture column mapping point |
| 14 | `spring-petclinic-reactjs` | `src/main/java/org/springframework/samples/petclinic/rest/controller/OwnerRestController.java` | inspect | medium | semantic_enrichment | semantic_enrichment: owner REST controller, owner-pet API boundary, candidate pet picture retrieval surface |

## Recipe Evidence

No matched recipes.

## Source Graph Evidence
- `spring-petclinic-reactjs` `client/src/components/pets/EditPetPage.tsx` (edit_surface, high): Recommended change-set item 1 maps to source graph node `edit_surface`.; tokens=pets, pet, props, prop, state, params, param, owner
- `spring-petclinic-reactjs` `client/src/components/pets/NewPetPage.tsx` (page_component, high): Recommended change-set item 2 maps to source graph node `page_component`.; tokens=pets, new, pet, props, prop, state, params, param
- `spring-petclinic-reactjs` `client/src/components/pets/PetEditor.tsx` (form_component, high): Recommended change-set item 3 maps to source graph node `form_component`.; tokens=pets, pet, props, prop, state, owner, pettypes, pettype
- `spring-petclinic-reactjs` `client/src/components/pets/createPetEditorModel.ts` (form_component, high): Recommended change-set item 4 maps to source graph node `form_component`.; tokens=pets, create, pet, pettypes, pettype, owner, loader, promise
- `spring-petclinic-reactjs` `client/src/types/index.ts` (frontend_type, high): Recommended change-set item 5 maps to source graph node `frontend_type`.; tokens=router, context, constraint, select, option, person, visit, pet
- `spring-petclinic-reactjs` `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetRepositoryImpl.java` (repository, high): Recommended change-set item 6 maps to source graph node `repository`.; tokens=pet, parameter, template, insert, owner, visit, pets, find
- `spring-petclinic-reactjs` `src/main/java/org/springframework/samples/petclinic/rest/controller/PetRestController.java` (api_controller, high): Recommended change-set item 7 maps to source graph node `api_controller`.; tokens=pet, owner, pets, get
- `spring-petclinic-reactjs` `client/src/components/owners/PetsTable.tsx` (list_component, high): Recommended change-set item 8 maps to source graph node `list_component`.; tokens=owners, owner, pets, table, visits, visit, pet
- `spring-petclinic-reactjs` `client/src/components/visits/PetDetails.tsx` (detail_component, high): Recommended change-set item 9 maps to source graph node `detail_component`.; tokens=visits, visit, pet, details, detail, owner
- `spring-petclinic-reactjs` `src/main/java/org/springframework/samples/petclinic/mapper/PetMapper.java` (mapper, high): Recommended change-set item 10 maps to source graph node `mapper`.; tokens=pet
- `spring-petclinic-reactjs` `src/main/java/org/springframework/samples/petclinic/repository/PetRepository.java` (repository, high): Recommended change-set item 11 maps to source graph node `repository`.; tokens=pet, here, owners, owner, find, all, findby
- `spring-petclinic-reactjs` `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPet.java` (repository, high): Recommended change-set item 12 maps to source graph node `repository`.; tokens=pet, owner, get

## Semantic Missing Details
- No provided source graph node explicitly mentions image, picture, photo, upload, multipart, file storage, blob storage, or media handling.
- No OpenAPI source slice was provided for existing pet endpoints or request/response schemas.
- No source snippets were provided, so exact method signatures, route paths, DTO fields, form field names, and persistence schema are unknown.
- The request does not specify whether the picture should be stored in the database, filesystem, object storage, or as an external URL.
- The request does not specify allowed file types, maximum file size, validation behavior, or replacement/deletion behavior.
- The request does not specify where pet pictures should be displayed after upload.

## Semantic Clarifying Questions
- Should the picture be uploaded as a binary file, stored as a URL, or both?
- Should each pet have only one picture or multiple pictures?
- Should pictures be added during pet creation, pet editing, or from a separate pet details screen?
- Where should the uploaded picture be displayed: owner pet table, pet details, visit details, or all pet-related views?
- What file formats and size limits should be accepted?
- Should unauthenticated users be allowed to upload or view pet pictures?

## Validation Commands
- `./mvnw test`
- `cd client && npm test`

## Risks / Missing Evidence
- **warning** `planner`: semantic_enrichment technical intent labels: ui, api, persistence, storage, file_upload, media_upload, retrieval, display, validation, backend_model
- **warning** `planner`: semantic_enrichment has structured missing details; see semantic_missing_details
- **warning** `planner`: semantic_enrichment has clarifying questions; see semantic_clarifying_questions
- **warning** `semantic_enrichment`: No provided source graph node explicitly mentions image, picture, photo, upload, multipart, file storage, blob storage, or media handling.
- **warning** `semantic_enrichment`: No OpenAPI source slice was provided for existing pet endpoints or request/response schemas.
- **warning** `semantic_enrichment`: No source snippets were provided, so exact method signatures, route paths, DTO fields, form field names, and persistence schema are unknown.
- **warning** `semantic_enrichment`: The request does not specify whether the picture should be stored in the database, filesystem, object storage, or as an external URL.
- **warning** `semantic_enrichment`: The request does not specify allowed file types, maximum file size, validation behavior, or replacement/deletion behavior.
- **warning** `semantic_enrichment`: The request does not specify where pet pictures should be displayed after upload.
- **info** `semantic_enrichment`: The annotations identify likely integration points, not existing image upload functionality.
- **info** `semantic_enrichment`: No provided graph node directly establishes current support for multipart requests, binary file handling, image preview, media serving, or storage.
- **info** `semantic_enrichment`: Because snippets are null for all provided source slices, exact implementation details such as route paths, component props, state shape, and SQL columns cannot be verified.
- **info** `semantic_enrichment`: The source graph did not include a deterministic OpenAPI node, so API contract changes for upload cannot be grounded beyond the presence of the openapi framework pack.
- **info** `semantic_enrichment`: Pet type nodes were present but are less directly relevant to uploading a picture of an individual pet and were not emphasized.

## Coding Agent Handoff Prompt

### spring-petclinic-reactjs

```text
You are working in repo: spring-petclinic-reactjs.

Task:
add the ability to upload a picture of your pet

Context:
Use the planner-native recommendations and source graph evidence below.
This feature likely requires UI + backend API + storage/persistence work.

Inspect first:
1. client/src/components/pets/EditPetPage.tsx (modify, high, source=both)
2. client/src/components/pets/NewPetPage.tsx (modify, high, source=both)
3. client/src/components/pets/PetEditor.tsx (inspect, high, source=semantic_enrichment)
4. client/src/components/pets/createPetEditorModel.ts (modify, high, source=both)
5. client/src/types/index.ts (inspect, high, source=semantic_enrichment)
6. src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetRepositoryImpl.java (inspect, high, source=semantic_enrichment)
7. src/main/java/org/springframework/samples/petclinic/rest/controller/PetRestController.java (modify, high, source=both)
8. client/src/components/owners/PetsTable.tsx (inspect, medium, source=semantic_enrichment)
9. client/src/components/visits/PetDetails.tsx (inspect, medium, source=semantic_enrichment)
10. src/main/java/org/springframework/samples/petclinic/mapper/PetMapper.java (inspect, medium, source=semantic_enrichment)
11. src/main/java/org/springframework/samples/petclinic/repository/PetRepository.java (inspect, medium, source=semantic_enrichment)
12. src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPet.java (inspect, medium, source=semantic_enrichment)
13. src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetRowMapper.java (inspect, medium, source=semantic_enrichment)
14. src/main/java/org/springframework/samples/petclinic/rest/controller/OwnerRestController.java (inspect, medium, source=semantic_enrichment)

Expected change:
- Add file input and preview behavior in the pet editor/create/edit surfaces.
- Decide storage strategy before implementation: DB metadata + filesystem/object storage vs DB blob vs external URL.
- Update backend pet API behavior to accept or reference picture uploads.
- Persist image metadata or storage references only if the chosen storage design requires it.
- Update display surfaces only where the product requires the pet picture to appear.
- Frontend candidates include `client/src/components/pets/EditPetPage.tsx`, `client/src/components/pets/NewPetPage.tsx`, `client/src/components/pets/PetEditor.tsx`, `client/src/components/pets/createPetEditorModel.ts`, `client/src/types/index.ts`.
- Backend/API/persistence candidates include `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetRepositoryImpl.java`, `src/main/java/org/springframework/samples/petclinic/rest/controller/PetRestController.java`, `src/main/java/org/springframework/samples/petclinic/mapper/PetMapper.java`, `src/main/java/org/springframework/samples/petclinic/repository/PetRepository.java`, `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPet.java`, `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetRowMapper.java`.
- Modify the high-confidence files that directly own the requested flow or behavior.
- Keep frontend/UI work focused on the requested screen, page, route, or component.
- Keep backend/API work limited to the relevant controller/service/query surface.

Constraints:
- Keep the change scoped to the requested feature.
- Do not overreach into unrelated domains or broad refactors.
- Treat inspect-only or low-confidence files as reference material unless code evidence says otherwise.
- Decide storage strategy before implementation: DB metadata + filesystem/object storage vs DB blob vs external URL.

Validation:
- ./mvnw test
- cd client && npm test

Caveats:
- semantic_enrichment technical intent labels: ui, api, persistence, storage, file_upload, media_upload, retrieval, display, validation, backend_model
- semantic_enrichment has structured missing details; see semantic_missing_details
- semantic_enrichment has clarifying questions; see semantic_clarifying_questions
- No provided source graph node explicitly mentions image, picture, photo, upload, multipart, file storage, blob storage, or media handling.
```

