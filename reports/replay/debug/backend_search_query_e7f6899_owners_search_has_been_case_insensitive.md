# Replay Case Debug

- case id: `backend_search_query_e7f6899_owners_search_has_been_case_insensitive`
- archetype: `backend_search_query`
- commit: `e7f6899`
- prompt: owners search has been case insensitive
- candidate quality: `good`
- prompt quality: `high`

## Diagnosis

- labels: `graph_found_surface_but_proposal_missed`, `planner_underpredicted`, `recipe_application_gap`
- likely cause: A learned recipe matched, but its node/path pattern application missed the actual changed surfaces.
- recommended fix area: `recipe application`
- why: No predicted files were emitted. Plan produced null primary and implementation owners. propose-changes emitted no proposed changes. Recipe sidecar emitted suggestions, but they did not match actual files or categories. Source graph found relevant surfaces, but propose-changes emitted no files.

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
  - `petclinic_react_backend_search_query` (backend_search_query, structural=0.71, planner=0.0)
  - `petclinic_react_backend_api_change` (backend_api_change, structural=0.8267, planner=0.125)
- suggested actions:
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CrashController.java` action=modify node=api_controller exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/OwnerController.java` action=modify node=api_controller exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicService.java` action=modify node=service_layer exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicServiceImpl.java` action=modify node=service_layer exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository/OwnerRepository.java` action=modify node=repository exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcOwnerRepositoryImpl.java` action=modify node=repository exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/CrashController.java` action=inspect node=api_controller exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/OwnerController.java` action=inspect node=api_controller exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicService.java` action=modify node=service_layer exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicServiceImpl.java` action=modify node=service_layer exists_in_parent=True matched_actual=False

## Combined Prediction Metrics

- combined exact_precision: 0.0
- combined exact_recall: 0.0
- combined category_precision: 0.0
- combined category_recall: 0.0
- combined high_signal_precision: 0.0
- combined high_signal_recall: 0.0

## Predicted Files

-

## Actual Files

- `spring-petclinic-reactjs/src/main/resources/db/hsqldb/initDB.sql`

## High-Signal Actual Files

- `spring-petclinic-reactjs/src/main/resources/db/hsqldb/initDB.sql`

## New Actual Files

-

## Modified Actual Files

- `spring-petclinic-reactjs/src/main/resources/db/hsqldb/initDB.sql`

## Plan/Proposal

- plan primary_owner: `None`
- plan implementation_owner: `None`
- plan domain_owner: `None`
- plan feature_intents: `[]`
- plan unsupported_intents: `[]`
- plan missing_evidence: `['no primary owner identified from strong evidence']`
- proposed change count: 0

## Discovery / Source Graph

- graph edge count: 72
- graph node counts: `{'api_controller': 5, 'domain_model': 15, 'mapper': 2, 'repository': 20, 'service_layer': 2, 'shared_component': 151}`
- relevant tokens: `been`, `case`, `has`, `hsqldb`, `init`, `insensitive`, `owner`, `owners`, `reactj`, `reactjs`, `search`, `sql`

## Relevant Graph Nodes

- `src/main/java/org/springframework/samples/petclinic/web/OwnerController.java` (api_controller) terms=`owner`
- `src/main/java/org/springframework/samples/petclinic/model/Owner.java` (domain_model) terms=`owner`
- `src/main/java/org/springframework/samples/petclinic/model/Pet.java` (domain_model) terms=`owner`
- `src/main/java/org/springframework/samples/petclinic/repository/OwnerRepository.java` (repository) terms=`owner`
- `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcOwnerRepositoryImpl.java` (repository) terms=`owner`
- `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPet.java` (repository) terms=`owner`
- `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetRepositoryImpl.java` (repository) terms=`owner`
- `src/main/java/org/springframework/samples/petclinic/repository/jpa/JpaOwnerRepositoryImpl.java` (repository) terms=`owner`
- `src/main/java/org/springframework/samples/petclinic/repository/springdatajpa/SpringDataOwnerRepository.java` (repository) terms=`owner`
- `src/main/java/org/springframework/samples/petclinic/service/ClinicServiceImpl.java` (service_layer) terms=`owner`
- `src/main/webapp/vendors/bootstrap/docs/assets/js/bootstrap-popover.js` (shared_component) terms=`has`
- `src/main/webapp/vendors/bootstrap/docs/assets/js/bootstrap-tooltip.js` (shared_component) terms=`init`
