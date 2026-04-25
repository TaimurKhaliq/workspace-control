# Replay Case Debug

- case id: `ui_form_validation_6e73c96_add_visual_feedback_for_invalid_fields`
- archetype: `ui_form_validation`
- commit: `6e73c96`
- prompt: Add visual feedback for invalid fields
- candidate quality: `good`
- prompt quality: `high`

## Diagnosis

- labels: `domain_light_but_archetype_clear`, `graph_found_surface_but_proposal_missed`, `planner_underpredicted`
- likely cause: Relevant graph surfaces were found, but proposal emitted no useful file predictions.
- recommended fix area: `propose-changes`
- why: Prompt lacks a strong domain token but has clear archetype terms. No predicted files were emitted. Plan produced null primary and implementation owners. propose-changes emitted no proposed changes. Source graph found relevant surfaces, but propose-changes emitted no files.

## Metrics

- exact_precision: 0.0
- exact_recall: 0.0
- category_precision: 0.0
- category_recall: 0.0
- high_signal_precision: 0.0
- high_signal_recall: 0.0

## Recipe Sidecar

- recipe exact_precision: 0.3333
- recipe exact_recall: 0.5
- recipe category_precision: 0.5
- recipe category_recall: 0.5
- recipe high_signal_precision: 0.3333
- recipe high_signal_recall: 0.5
- matched recipes:
  - `petclinic_react_ui_form_validation` (ui_form_validation, structural=0.9555, planner=0.0)
- suggested actions:
  - `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx` action=modify node=page_component exists_in_parent=True matched_actual=True
  - `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx` action=modify node=page_component exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/client/src/types/index.ts` action=inspect node=frontend_type exists_in_parent=True matched_actual=False

## Combined Prediction Metrics

- combined exact_precision: 0.3333
- combined exact_recall: 0.5
- combined category_precision: 0.5
- combined category_recall: 0.5
- combined high_signal_precision: 0.3333
- combined high_signal_recall: 0.5

## Predicted Files

-

## Actual Files

- `spring-petclinic-reactjs/client/TODO.md`
- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`

## High-Signal Actual Files

- `spring-petclinic-reactjs/client/TODO.md`
- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`

## New Actual Files

-

## Modified Actual Files

- `spring-petclinic-reactjs/client/TODO.md`
- `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`

## Plan/Proposal

- plan primary_owner: `None`
- plan implementation_owner: `None`
- plan domain_owner: `None`
- plan feature_intents: `[]`
- plan unsupported_intents: `[]`
- plan missing_evidence: `['no primary owner identified from strong evidence']`
- proposed change count: 0

## Discovery / Source Graph

- graph edge count: 125
- graph node counts: `{'api_controller': 9, 'api_dto': 5, 'app_shell': 1, 'domain_model': 16, 'event_consumer': 1, 'frontend_entrypoint': 1, 'frontend_type': 1, 'landing_page': 1, 'migration': 4, 'page_component': 6, 'public_html': 1, 'repository': 4, 'service_layer': 2, 'shared_component': 6, 'static_asset': 1}`
- relevant tokens: `add`, `feedback`, `for`, `invalid`, `new`, `owner`, `owners`, `reactj`, `reactjs`, `todo`, `visual`

## Query/Search Surface Nodes

- `src/main/java/org/springframework/samples/petclinic/repository/OwnerRepository.java` (repository) terms=`owner` methods=`findByLastName`, `findById` indicators=`@query`, `like`, `findby`, `where`, `select`
- `src/main/resources/db/hsqldb/schema.sql` (migration) terms=`owner`, `owners` methods=- indicators=`create_table`, `create_index`, `varchar_ignorecase`, `varchar_ignorecase`
- `src/main/resources/db/mysql/schema.sql` (migration) terms=- methods=- indicators=`create_table`
- `src/main/java/org/springframework/samples/petclinic/web/api/OwnerResource.java` (api_dto) terms=`owner`, `owners`, `todo` methods=`findOwner`, `findOwnerCollection` indicators=-
- `src/main/java/org/springframework/samples/petclinic/web/OwnerController.java` (api_controller) terms=`owner`, `owners` methods=`initFindForm`, `processFindForm` indicators=-
- `src/main/java/org/springframework/samples/petclinic/web/api/PetResource.java` (api_dto) terms=`owner`, `owners` methods=`findPet` indicators=-
- `src/main/java/org/springframework/samples/petclinic/service/ClinicService.java` (service_layer) terms=`owner` methods=`findPetTypes`, `findOwnerById`, `findPetById`, `findVets` indicators=-
- `src/main/java/org/springframework/samples/petclinic/service/ClinicServiceImpl.java` (service_layer) terms=`owner` methods=`findPetTypes`, `findOwnerById`, `findOwnerByLastName`, `findPetById` indicators=`findby`
- `src/main/java/org/springframework/samples/petclinic/web/PetController.java` (api_controller) terms=`owner` methods=`findOwner` indicators=-

## Relevant Graph Nodes

- `src/main/java/org/springframework/samples/petclinic/web/api/OwnerResource.java` (api_dto) terms=`owner`, `owners`, `todo`
- `client/src/components/owners/NewOwnerPage.tsx` (page_component) terms=`new`, `owner`, `owners`
- `src/main/java/org/springframework/samples/petclinic/web/OwnerController.java` (api_controller) terms=`owner`, `owners`
- `src/main/java/org/springframework/samples/petclinic/web/api/PetResource.java` (api_dto) terms=`owner`, `owners`
- `src/main/resources/db/hsqldb/schema.sql` (migration) terms=`owner`, `owners`
- `client/src/components/owners/FindOwnersPage.tsx` (page_component) terms=`owner`, `owners`
- `client/src/components/owners/OwnersPage.tsx` (page_component) terms=`owner`, `owners`
- `client/src/components/owners/types.ts` (shared_component) terms=`owner`, `owners`
- `src/main/java/org/springframework/samples/petclinic/web/PetController.java` (api_controller) terms=`owner`
- `src/main/java/org/springframework/samples/petclinic/model/Owner.java` (domain_model) terms=`owner`
- `src/main/java/org/springframework/samples/petclinic/model/Pet.java` (domain_model) terms=`owner`
- `src/main/java/org/springframework/samples/petclinic/web/PetTypeFormatter.java` (domain_model) terms=`for`
