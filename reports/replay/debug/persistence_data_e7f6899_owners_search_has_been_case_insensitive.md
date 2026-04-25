# Replay Case Debug

- case id: `persistence_data_e7f6899_owners_search_has_been_case_insensitive`
- archetype: `persistence_data`
- commit: `e7f6899`
- prompt: owners search has been case insensitive
- candidate quality: `good`
- prompt quality: `high`

## Diagnosis

- labels: `graph_found_surface_but_proposal_missed`, `planner_underpredicted`, `prompt_too_vague`
- likely cause: The prompt did not provide enough actionable product/surface intent.
- recommended fix area: `prompt generation`
- why: Prompt did not produce clear feature intents or ownership. No predicted files were emitted. Plan produced null primary and implementation owners. propose-changes emitted no proposed changes. Source graph found relevant surfaces, but propose-changes emitted no files.

## Metrics

- exact_precision: 0.0
- exact_recall: 0.0
- category_precision: 0.0
- category_recall: 0.0
- high_signal_precision: 0.0
- high_signal_recall: 0.0

## Predicted Files

-

## Actual Files

- `spring-petclinic-reactjs/src/main/resources/db/hsqldb/initDB.sql`

## High-Signal Actual Files

- `spring-petclinic-reactjs/src/main/resources/db/hsqldb/initDB.sql`

## New Actual Files

-

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
