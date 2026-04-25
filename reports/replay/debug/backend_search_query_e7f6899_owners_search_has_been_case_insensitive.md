# Replay Case Debug

- case id: `backend_search_query_e7f6899_owners_search_has_been_case_insensitive`
- archetype: `backend_search_query`
- commit: `e7f6899`
- prompt: owners search has been case insensitive
- candidate quality: `good`
- prompt quality: `high`

## Diagnosis

- labels: `graph_found_surface_but_proposal_missed`, `planner_underpredicted`
- likely cause: Relevant graph surfaces were found, but proposal emitted no useful file predictions.
- recommended fix area: `propose-changes`
- why: No predicted files were emitted. Plan produced null primary and implementation owners. propose-changes emitted no proposed changes. Source graph found relevant surfaces, but propose-changes emitted no files.

## Metrics

- exact_precision: 0.0
- exact_recall: 0.0
- category_precision: 0.0
- category_recall: 0.0
- high_signal_precision: 0.0
- high_signal_recall: 0.0

## Recipe Sidecar

- recipe exact_precision: 0.1429
- recipe exact_recall: 1.0
- recipe category_precision: 0.25
- recipe category_recall: 1.0
- recipe high_signal_precision: 0.1429
- recipe high_signal_recall: 1.0
- matched recipes:
  - `petclinic_react_backend_search_query` (backend_search_query, structural=0.48, planner=0.0)
- suggested actions:
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository/OwnerRepository.java` action=modify node=repository exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcOwnerRepositoryImpl.java` action=modify node=repository exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/repository/jpa/JpaOwnerRepositoryImpl.java` action=modify node=repository exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/src/main/resources/db/hsqldb/initDB.sql` action=modify node=migration exists_in_parent=True matched_actual=True
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicServiceImpl.java` action=modify node=service_layer exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/service/ClinicService.java` action=modify node=service_layer exists_in_parent=True matched_actual=False
  - `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/OwnerController.java` action=inspect node=api_controller exists_in_parent=True matched_actual=False

## Combined Prediction Metrics

- combined exact_precision: 0.1429
- combined exact_recall: 1.0
- combined category_precision: 0.25
- combined category_recall: 1.0
- combined high_signal_precision: 0.1429
- combined high_signal_recall: 1.0

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

- graph edge count: 253
- graph node counts: `{'api_controller': 5, 'domain_model': 15, 'mapper': 2, 'migration': 4, 'repository': 20, 'service_layer': 2, 'shared_component': 151}`
- relevant tokens: `been`, `case`, `has`, `hsqldb`, `init`, `insensitive`, `owner`, `owners`, `reactj`, `reactjs`, `search`, `sql`

## Query/Search Surface Nodes

- `src/main/java/org/springframework/samples/petclinic/repository/OwnerRepository.java` (repository) terms=`owner`, `owners` methods=`findByLastName`, `findById` indicators=`findby`
- `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcOwnerRepositoryImpl.java` (repository) terms=`owner`, `owners` methods=`findByLastName`, `findById`, `getPetTypes` indicators=`like`, `findby`, `where`, `select`
- `src/main/java/org/springframework/samples/petclinic/repository/jpa/JpaOwnerRepositoryImpl.java` (repository) terms=`owner`, `owners` methods=`findByLastName`, `findById` indicators=`like`, `findby`, `where`, `select`
- `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPet.java` (repository) terms=`owner` methods=`getTypeId`, `getOwnerId` indicators=-
- `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetRepositoryImpl.java` (repository) terms=`owner` methods=`findPetTypes`, `findById` indicators=`findby`, `where`, `select`
- `src/main/java/org/springframework/samples/petclinic/repository/springdatajpa/SpringDataOwnerRepository.java` (repository) terms=`owner` methods=`findByLastName`, `findById` indicators=`@query`, `like`, `findby`, `where`, `select`
- `src/main/resources/db/hsqldb/initDB.sql` (migration) terms=`hsqldb`, `init`, `owner`, `owners`, `sql` methods=- indicators=`create_table`, `create_index`
- `src/main/resources/db/mysql/initDB.sql` (migration) terms=`init`, `sql` methods=- indicators=`create_table`
- `src/main/java/org/springframework/samples/petclinic/web/OwnerController.java` (api_controller) terms=`init`, `owner`, `owners` methods=`initFindForm`, `processFindForm` indicators=-
- `src/main/java/org/springframework/samples/petclinic/service/ClinicService.java` (service_layer) terms=`owner` methods=`findPetTypes`, `findOwnerById`, `findPetById`, `findVets` indicators=-
- `src/main/java/org/springframework/samples/petclinic/service/ClinicServiceImpl.java` (service_layer) terms=`owner` methods=`findPetTypes`, `findOwnerById`, `findOwnerByLastName`, `findPetById` indicators=`findby`
- `src/main/java/org/springframework/samples/petclinic/web/PetController.java` (api_controller) terms=`owner` methods=`findOwner` indicators=-

## Relevant Graph Nodes

- `src/main/resources/db/hsqldb/initDB.sql` (migration) terms=`hsqldb`, `init`, `owner`, `owners`, `sql`
- `src/main/java/org/springframework/samples/petclinic/web/OwnerController.java` (api_controller) terms=`init`, `owner`, `owners`
- `src/main/resources/db/hsqldb/populateDB.sql` (migration) terms=`hsqldb`, `sql`
- `src/main/resources/db/mysql/initDB.sql` (migration) terms=`init`, `sql`
- `src/main/java/org/springframework/samples/petclinic/repository/OwnerRepository.java` (repository) terms=`owner`, `owners`
- `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcOwnerRepositoryImpl.java` (repository) terms=`owner`, `owners`
- `src/main/java/org/springframework/samples/petclinic/repository/jpa/JpaOwnerRepositoryImpl.java` (repository) terms=`owner`, `owners`
- `src/main/java/org/springframework/samples/petclinic/web/PetController.java` (api_controller) terms=`owner`
- `src/main/java/org/springframework/samples/petclinic/model/Owner.java` (domain_model) terms=`owner`
- `src/main/java/org/springframework/samples/petclinic/model/Pet.java` (domain_model) terms=`owner`
- `src/main/resources/db/mysql/populateDB.sql` (migration) terms=`sql`
- `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPet.java` (repository) terms=`owner`
