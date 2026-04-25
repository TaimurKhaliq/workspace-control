# Replay Case Debug

- case id: `backend_api_af31104_add_max_range_and_not_null_validation_for_adding_new_pet`
- archetype: `backend_api`
- commit: `af31104`
- prompt: add max range and not null validation for adding new pet
- candidate quality: `good`
- prompt quality: `high`

## Diagnosis

- labels: `exact_match_miss_but_category_match`, `planner_overpredicted`, `planner_underpredicted`, `recipe_application_gap`
- likely cause: A learned recipe matched, but its node/path pattern application missed the actual changed surfaces.
- recommended fix area: `recipe application`
- why: Predicted files did not exactly match actual changed files. Predicted more files than actually changed. Predictions matched at least one surface category but missed exact files. Recipe sidecar emitted suggestions, but they did not match actual files or categories.

## Metrics

- exact_precision: 0.0
- exact_recall: 0.0
- category_precision: 0.25
- category_recall: 1.0
- high_signal_precision: 0.0
- high_signal_recall: 0.0

## Recipe Sidecar

- recipe exact_precision: 0.0
- recipe exact_recall: 0.0
- recipe category_precision: 0.0
- recipe category_recall: 0.0
- recipe high_signal_precision: 0.0
- recipe high_signal_recall: 0.0
- matched recipes:
  - `petclinic_react_ui_form_validation` (ui_form_validation, structural=0.9555, planner=0.0)
  - `petclinic_react_full_stack_ui_api` (full_stack_ui_api, structural=0.9118, planner=0.3182)
- suggested actions:
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/PetController.java` action=modify node=api_controller exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetResource.java` action=modify node=api_controller exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/client/src/components/form/Constraints.ts` action=modify node=form_component exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/client/src/types/index.ts` action=inspect node=frontend_type exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/client/src/components/NotFoundPage.tsx` action=modify node=page_component exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicService.java` action=modify node=service_layer exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicServiceImpl.java` action=modify node=service_layer exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/client/src/components/form/Constraints.ts` action=modify node=form_component exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/client/src/types/index.ts` action=inspect node=frontend_type exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/client/src/components/NotFoundPage.tsx` action=modify node=page_component exists_in_parent=True matched_actual=False

## Combined Prediction Metrics

- combined exact_precision: 0.0
- combined exact_recall: 0.0
- combined category_precision: 0.1667
- combined category_recall: 1.0
- combined high_signal_precision: 0.0
- combined high_signal_recall: 0.0

## Predicted Files

- `spring-petclinic-reactjs/Run PetClinicApplication.launch`
- `spring-petclinic-reactjs/client/src/components/owners/PetsTable.tsx`
- `spring-petclinic-reactjs/client/src/components/pets/EditPetPage.tsx`
- `spring-petclinic-reactjs/client/src/components/pets/NewPetPage.tsx`
- `spring-petclinic-reactjs/client/src/components/pets/PetEditor.tsx`
- `spring-petclinic-reactjs/client/src/components/pets/createPetEditorModel.ts`
- `spring-petclinic-reactjs/client/src/components/visits/PetDetails.tsx`
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

## Modified Actual Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetRequest.java`

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
