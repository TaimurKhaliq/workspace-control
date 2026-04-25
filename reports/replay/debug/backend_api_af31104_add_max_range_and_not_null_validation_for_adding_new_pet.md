# Replay Case Debug

- case id: `backend_api_af31104_add_max_range_and_not_null_validation_for_adding_new_pet`
- archetype: `backend_api`
- commit: `af31104`
- prompt: add max range and not null validation for adding new pet
- candidate quality: `good`
- prompt quality: `high`

## Diagnosis

- labels: `exact_match_miss_but_category_match`, `planner_overpredicted`, `planner_underpredicted`
- likely cause: Planner/proposal underpredicted exact files for an otherwise supported change.
- recommended fix area: `planner`
- why: Predicted files did not exactly match actual changed files. Predicted more files than actually changed. Predictions matched at least one surface category but missed exact files.

## Metrics

- exact_precision: 0.0
- exact_recall: 0.0
- category_precision: 0.3333
- category_recall: 1.0
- high_signal_precision: 0.0
- high_signal_recall: 0.0

## Predicted Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api`

## Actual Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetRequest.java`

## High-Signal Actual Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetRequest.java`

## New Actual Files

-

## Plan/Proposal

- plan primary_owner: `spring-petclinic-reactjs`
- plan implementation_owner: `spring-petclinic-reactjs`
- plan domain_owner: `spring-petclinic-reactjs`
- plan feature_intents: `['api']`
- plan unsupported_intents: `[]`
- plan missing_evidence: `[]`
- proposed change count: 1

## Discovery / Source Graph

- graph edge count: 128
- graph node counts: `{'api_controller': 15, 'app_shell': 1, 'detail_component': 1, 'domain_model': 18, 'edit_surface': 2, 'event_consumer': 1, 'form_component': 9, 'frontend_entrypoint': 1, 'frontend_type': 1, 'landing_page': 1, 'list_component': 2, 'page_component': 8, 'public_html': 1, 'repository': 4, 'service_layer': 2, 'shared_component': 8, 'static_asset': 1}`
- relevant tokens: `add`, `adding`, `and`, `for`, `max`, `new`, `not`, `null`, `pet`, `range`, `reactj`, `reactjs`, `validation`

## Relevant Graph Nodes

- `src/main/java/org/springframework/samples/petclinic/web/PetTypeFormatter.java` (domain_model) terms=`for`, `pet`
- `src/main/java/org/springframework/samples/petclinic/web/api/ApiExceptionHandler.java` (event_consumer) terms=`and`, `pet`
- `client/src/components/form/Constraints.ts` (form_component) terms=`for`, `not`
- `client/src/components/pets/NewPetPage.tsx` (page_component) terms=`new`, `pet`
- `client/src/components/visits/VisitsPage.tsx` (page_component) terms=`new`, `pet`
- `src/main/java/org/springframework/samples/petclinic/web/CrashController.java` (api_controller) terms=`pet`
- `src/main/java/org/springframework/samples/petclinic/web/CustomErrorController.java` (api_controller) terms=`pet`
- `src/main/java/org/springframework/samples/petclinic/web/OwnerController.java` (api_controller) terms=`pet`
- `src/main/java/org/springframework/samples/petclinic/web/PetController.java` (api_controller) terms=`pet`
- `src/main/java/org/springframework/samples/petclinic/web/VetController.java` (api_controller) terms=`pet`
- `src/main/java/org/springframework/samples/petclinic/web/VisitController.java` (api_controller) terms=`pet`
- `src/main/java/org/springframework/samples/petclinic/web/WelcomeController.java` (api_controller) terms=`pet`
