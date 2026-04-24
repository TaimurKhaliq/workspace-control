# Workspace-Control Planner Demo

Prompt: "Add a phone number field to the profile screen and persist it for each customer"
Fixture: tests/fixtures/mixed_source_stack
Discovery target: mixed-source-demo

## 1. Discover Architecture

Command: `python3 main.py discover-architecture --target-id mixed-source-demo`

```text
Architecture Discovery

repo: service-a
  mode: source-discovered
  confidence: high
  discovered frameworks: flyway, openapi, spring_boot
  hinted frameworks: spring_boot
  discovered api: src/main/resources/openapi.yaml, src/main/java/com/example/servicea/controller, src/main/java/com/example/servicea/dto
  discovered service/business logic: src/main/java/com/example/servicea/service
  discovered persistence/migration: src/main/resources/db/migration, src/main/java/com/example/servicea/repository, src/main/java/com/example/servicea/entity
  discovered ui/components: -
  hinted locations:
    api: src/main/java/**/controller, src/main/java/**/dto
    service/business logic: src/main/java/**/service
    persistence/migration: src/main/java/**/entity, src/main/java/**/repository, src/main/resources/db/migration
    ui/components: -

repo: service-b
  mode: mixed
  confidence: medium
  missing_evidence: no service/business logic path found, no persistence/migration path found
  discovered frameworks: spring_boot
  hinted frameworks: spring_boot
  discovered api: -
  discovered service/business logic: -
  discovered persistence/migration: -
  discovered ui/components: -
  discovered events/integrations: src/main/java/com/example/serviceb/events, src/main/java/com/example/serviceb/integration
  hinted locations:
    api: src/main/java/**/controller, src/main/java/**/dto
    service/business logic: src/main/java/**/service
    persistence/migration: src/main/java/**/entity, src/main/java/**/repository, src/main/resources/db/migration
    ui/components: -
    events/integrations: src/main/java/**/events, src/main/java/**/integration

repo: web-ui
  mode: source-discovered
  confidence: high
  discovered frameworks: react
  hinted frameworks: react
  discovered api: src/api, src/services
  discovered service/business logic: src/services
  discovered persistence/migration: -
  discovered ui/components: src/pages, src/components, src/forms
  hinted locations:
    api: src/api, src/services
    service/business logic: src/services
    persistence/migration: -
    ui/components: src/pages, src/components, src/forms
```

## 2. Analyze Feature

Command: `python3 main.py analyze-feature "Add a phone number field to the profile screen and persist it for each customer" --target-id mixed-source-demo`

```text
Feature: "Add a phone number field to the profile screen and persist it for each customer"
repo      | role                | score | reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 
----------+---------------------+-------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
service-a | primary-owner       | 62    | stackpilot.yml: domain match (customer, profile); adapter_discovery: adapter discovery (flyway, openapi, spring_boot; paths: src/main/resources/db/migration, src/main/java/com/example/servicea/repository, src/main/java/com/example/servicea/entity); backend ownership (stackpilot.yml: owns_tables: tokens: customer profile, user profile | stackpilot.yml: api_keywords: phone number; tokens: account profile, customer profile, profile details | adapter_discovery: source-backed ownership (owns_tables: customer profile, user profile; discovered controller/dto, service, entity/repository, migration)); stackpilot.yml: keyword overlap (number, phone)
web-ui    | direct-dependent    | 25    | stackpilot.yml: domain match (customer, profile); deterministic_intent: frontend signals (keywords: screen; repo type; manifest: frontend, ui); adapter_discovery: adapter discovery (react; paths: src/pages, src/components, src/forms); stackpilot.yml: keyword overlap (number, phone)                                                                                                                                                                                                                                                                                                                                                                             
service-b | possible-downstream | 11    | stackpilot.yml: domain match (profile); backend ownership (stackpilot.yml: api_keywords: tokens: customer notifications, profile events); stackpilot.yml: keyword overlap (customer)
```

## 3. Plan Feature

Command: `python3 main.py plan-feature "Add a phone number field to the profile screen and persist it for each customer" --target-id mixed-source-demo`

```json
{
  "feature_request": "Add a phone number field to the profile screen and persist it for each customer",
  "feature_intents": [
    "ui",
    "persistence",
    "api"
  ],
  "confidence": "high",
  "missing_evidence": [],
  "primary_owner": "service-a",
  "implementation_owner": "web-ui",
  "domain_owner": "service-a",
  "direct_dependents": [
    "web-ui"
  ],
  "possible_downstreams": [],
  "db_change_needed": true,
  "api_change_needed": true,
  "ui_change_needed": true,
  "likely_paths_by_repo": {
    "service-a": [
      "src/main/resources/openapi.yaml",
      "src/main/java/com/example/servicea/controller",
      "src/main/java/com/example/servicea/dto",
      "src/main/java/com/example/servicea/service",
      "src/main/resources/db/migration",
      "src/main/java/com/example/servicea/repository",
      "src/main/java/com/example/servicea/entity",
      "src/main/resources"
    ],
    "web-ui": [
      "src/pages",
      "src/components",
      "src/forms",
      "src/api",
      "src/services"
    ]
  },
  "validation_commands": [
    "./gradlew build",
    "./gradlew test",
    "npm run build",
    "npm test"
  ],
  "ordered_steps": [
    "In service-a (primary-owner, score=62), update API request/response contracts, implement service/controller validation logic, and adjust entity/repository + migration handling using discovered API/service paths: src/main/resources/openapi.yaml, src/main/java/com/example/servicea/controller, src/main/java/com/example/servicea/dto and persistence/schema paths: src/main/resources/db/migration, src/main/java/com/example/servicea/repository, src/main/java/com/example/servicea/entity.",
    "In web-ui (direct-dependent, score=25), update pages/components/forms, client request payload handling, and submission/error states using discovered UI/client paths: src/pages, src/components, src/forms.",
    "Run validation commands in impacted repos: ./gradlew build ; ./gradlew test ; npm run build ; npm test."
  ],
  "requires_human_approval": true
}
```

## 4. Propose Changes

Command: `python3 main.py propose-changes "Add a phone number field to the profile screen and persist it for each customer" --target-id mixed-source-demo`

```json
{
  "feature_request": "Add a phone number field to the profile screen and persist it for each customer",
  "feature_intents": [
    "ui",
    "persistence",
    "api"
  ],
  "confidence": "high",
  "missing_evidence": [],
  "implementation_owner": "web-ui",
  "domain_owner": "service-a",
  "proposed_changes": [
    {
      "repo_name": "service-a",
      "role": "primary-owner",
      "likely_files_to_inspect": [
        "src/main/java/com/example/servicea/controller/ProfileController.java",
        "src/main/java/com/example/servicea/dto/ProfileRequest.java",
        "src/main/resources/openapi.yaml",
        "src/main/java/com/example/servicea/service/ProfileService.java",
        "src/main/java/com/example/servicea/repository/UserProfileRepository.java",
        "src/main/java/com/example/servicea/entity/UserProfile.java",
        "src/main/java/com/example/servicea/controller",
        "src/main/java/com/example/servicea/dto",
        "src/main/java/com/example/servicea/service",
        "src/main/resources/db/migration",
        "src/main/java/com/example/servicea/repository",
        "src/main/java/com/example/servicea/entity",
        "src/main/resources"
      ],
      "likely_changes": [
        "Update API request/response contract and DTO mapping.",
        "Update controller/service validation flow.",
        "Update entity and repository persistence mappings.",
        "Add or update migration/changelog files for schema changes."
      ],
      "possible_new_files": [
        "src/main/java/com/example/servicea/dto/AddPhoneNumberFieldProfileRequest.java",
        "src/main/java/com/example/servicea/dto/AddPhoneNumberFieldProfileResponse.java",
        "src/main/resources/db/migration/V000__add-phone-number-field-profile.sql"
      ],
      "rationale": "Selected as primary-owner by plan-feature for intents: ui, persistence, api; strongest signals: score=62, backend ownership (stackpilot.yml: owns_tables: tokens: customer profile, user profile | stackpilot.yml: api_keywords: phone number; tokens: account profile, customer profile, profile details | adapter_discovery: source-backed ownership (owns_tables: customer profile, user profile; discovered controller/dto, service, entity/repository, migration), stackpilot.yml: domain match (customer, profile), discovered frameworks=flyway, openapi, spring_boot, hinted frameworks=spring_boot; Concrete files were inferred from discovered naming conventions. confidence=high."
    },
    {
      "repo_name": "web-ui",
      "role": "direct-dependent",
      "likely_files_to_inspect": [
        "src/components/ProfileForm.tsx",
        "src/pages",
        "src/components",
        "src/forms",
        "src/api",
        "src/services"
      ],
      "likely_changes": [
        "Update the relevant page/form UI and validation states.",
        "Update client API request wiring and submit/error handling."
      ],
      "possible_new_files": [
        "src/pages/add-phone-number-field-profile.tsx",
        "src/forms/add-phone-number-field-profile-form.tsx",
        "src/api/add-phone-number-field-profile.ts"
      ],
      "rationale": "Selected as direct-dependent by plan-feature for intents: ui, persistence, api; strongest signals: score=25, deterministic_intent: frontend signals (keywords: screen; repo type; manifest: frontend, ui), stackpilot.yml: domain match (customer, profile), discovered frameworks=react, hinted frameworks=react; Concrete files were inferred from discovered naming conventions. confidence=high."
    }
  ]
}
```
