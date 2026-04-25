# Replay Case Debug

- case id: `persistence_data_c758321_add_regex_validation_for_string_input`
- archetype: `persistence_data`
- commit: `c758321`
- prompt: add regex validation for string input
- candidate quality: `good`
- prompt quality: `high`

## Diagnosis

- labels: `planner_overpredicted`, `planner_underpredicted`, `recipe_application_gap`
- likely cause: A learned recipe matched, but its node/path pattern application missed the actual changed surfaces.
- recommended fix area: `recipe application`
- why: Predicted files did not exactly match actual changed files. Predicted more files than actually changed. Recipe sidecar emitted suggestions, but they did not match actual files or categories.

## Metrics

- exact_precision: 0.0
- exact_recall: 0.0
- category_precision: 0.0
- category_recall: 0.0
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
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CrashController.java` action=modify node=api_controller exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CustomErrorController.java` action=modify node=api_controller exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/client/src/components/form/DateInput.tsx` action=modify node=form_component exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/client/src/components/form/Input.tsx` action=modify node=form_component exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/client/src/types/index.ts` action=inspect node=frontend_type exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicService.java` action=modify node=service_layer exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicServiceImpl.java` action=modify node=service_layer exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/client/src/components/form/DateInput.tsx` action=modify node=form_component exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/client/src/components/form/Input.tsx` action=modify node=form_component exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/client/src/types/index.ts` action=inspect node=frontend_type exists_in_parent=True matched_actual=False

## Combined Prediction Metrics

- combined exact_precision: 0.0
- combined exact_recall: 0.0
- combined category_precision: 0.0
- combined category_recall: 0.0
- combined high_signal_precision: 0.0
- combined high_signal_recall: 0.0

## Predicted Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web`
- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api`

## Actual Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/model/Person.java`

## High-Signal Actual Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/model/Person.java`

## New Actual Files

-

## Modified Actual Files

- `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/model/Person.java`

## Plan/Proposal

- plan primary_owner: `spring-petclinic-reactjs`
- plan implementation_owner: `spring-petclinic-reactjs`
- plan domain_owner: `spring-petclinic-reactjs`
- plan feature_intents: `['api']`
- plan unsupported_intents: `[]`
- plan missing_evidence: `['primary owner inferred from generic intent alignment']`
- proposed change count: 1

## Discovery / Source Graph

- graph edge count: 128
- graph node counts: `{'api_controller': 15, 'app_shell': 1, 'detail_component': 1, 'domain_model': 18, 'edit_surface': 2, 'event_consumer': 1, 'form_component': 9, 'frontend_entrypoint': 1, 'frontend_type': 1, 'landing_page': 1, 'list_component': 2, 'page_component': 8, 'public_html': 1, 'repository': 4, 'service_layer': 2, 'shared_component': 8, 'static_asset': 1}`
- relevant tokens: `add`, `for`, `input`, `person`, `reactj`, `reactjs`, `regex`, `string`, `validation`

## Relevant Graph Nodes

- `client/src/components/form/DateInput.tsx` (form_component) terms=`for`, `input`
- `client/src/components/form/Input.tsx` (form_component) terms=`for`, `input`
- `client/src/components/form/SelectInput.tsx` (form_component) terms=`for`, `input`
- `src/main/java/org/springframework/samples/petclinic/model/Person.java` (domain_model) terms=`person`
- `src/main/java/org/springframework/samples/petclinic/web/PetTypeFormatter.java` (domain_model) terms=`for`
- `client/src/components/form/Constraints.ts` (form_component) terms=`for`
- `client/src/components/form/FieldFeedbackPanel.tsx` (form_component) terms=`for`
- `client/src/components/owners/OwnerInformation.tsx` (form_component) terms=`for`
- `client/src/types/index.ts` (frontend_type) terms=`person`
