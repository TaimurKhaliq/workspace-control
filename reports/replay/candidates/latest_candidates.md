# Replay Candidates

- repo: `eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs`
- candidates found: 300
- included cases: 8
- max files: 25

## Candidate Quality Counts

- good: 9
- questionable: 56
- reject: 235

## Archetype Counts

- backend_api: 14
- config_build: 146
- docs_comments: 36
- full_stack_ui_api: 11
- infra_deployment: 3
- persistence_data: 32
- refactor_move: 12
- reject: 28
- ui_form_validation: 7
- ui_page_add: 7
- ui_shell: 4

## backend_api

### `af31104` add max range and not null validation for adding new pet

- score: 60
- archetype: backend_api
- candidate quality: good
- candidate quality reason: Candidate has a useful feature archetype and descriptive prompt.
- prompt quality: high
- prompt quality reason: Subject is descriptive and feature-like.
- included in generated cases: True
- changed files: 1
- categories: backend_api
- prompt: add max range and not null validation for adding new pet
- needs manual prompt: False
- suggested matrix case id: `backend_api_af31104_add_max_range_and_not_null_validation_for_adding_new_pet`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit af31104 --prompt "add max range and not null validation for adding new pet"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/web/api/PetRequest.java`

### `5cfd482` removed default profile and replaced with "jpa"

- score: 50
- archetype: backend_api
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 3
- categories: backend_service, other, tests
- prompt: removed default profile and replaced with "jpa"
- needs manual prompt: False
- suggested matrix case id: `backend_api_5cfd482_removed_default_profile_and_replaced_with_jpa`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 5cfd482 --prompt "removed default profile and replaced with \"jpa\""`
- first changed files:
  - `src/main/resources/spring/business-config.xml`
  - `src/main/webapp/WEB-INF/web.xml`
  - `src/test/java/org/springframework/samples/petclinic/service/ClinicServiceJpaTests.java`

### `2637f65` Upgrade to Spring Boot 1.4.0

- score: 42
- archetype: backend_api
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 9
- categories: backend_service, config_build, other, tests
- prompt: Upgrade to Spring Boot 1.4.0
- needs manual prompt: False
- suggested matrix case id: `backend_api_2637f65_upgrade_to_spring_boot_1_4_0`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 2637f65 --prompt "Upgrade to Spring Boot 1.4.0"`
- first changed files:
  - `pom.xml`
  - `src/main/java/org/springframework/samples/petclinic/PetClinicApplication.java`
  - `src/main/java/org/springframework/samples/petclinic/config/DandelionConfig.java`
  - `src/test/java/org/springframework/samples/petclinic/service/ClinicServiceSpringDataJpaTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/CrashControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/OwnerControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/PetControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/VetControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/VisitControllerTests.java`

### `4c40375` Include petId in error message instead of null value

- score: 40
- archetype: backend_api
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: backend_api
- prompt: Include petId in error message instead of null value
- needs manual prompt: False
- suggested matrix case id: `backend_api_4c40375_include_petid_in_error_message_instead_of_null_value`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 4c40375 --prompt "Include petId in error message instead of null value"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/web/api/VisitResource.java`

### `67ae72f` Remove public to methods from the ClinicService

- score: 40
- archetype: backend_api
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: backend_service
- prompt: Remove public to methods from the ClinicService
- needs manual prompt: False
- suggested matrix case id: `backend_api_67ae72f_remove_public_to_methods_from_the_clinicservice`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 67ae72f --prompt "Remove public to methods from the ClinicService"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/service/ClinicService.java`

### `e4ca172` handle non existing owner  from get request

- score: 40
- archetype: backend_api
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: backend_api
- prompt: handle non existing owner from get request
- needs manual prompt: False
- suggested matrix case id: `backend_api_e4ca172_handle_non_existing_owner_from_get_request`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit e4ca172 --prompt "handle non existing owner from get request"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/web/api/OwnerResource.java`

### `1080006` Merging AbstractClinicServiceTests and ClinicServiceSpringDataJpaTests then using the Spring Boot @DataJpaTest annotation

- score: 30
- archetype: backend_api
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: backend_service, tests
- prompt: Merging AbstractClinicServiceTests and ClinicServiceSpringDataJpaTests then using the Spring Boot @DataJpaTest annotation
- needs manual prompt: False
- suggested matrix case id: `backend_api_1080006_merging_abstractclinicservicetests_and_clinicservicespringdatajpatests_then_usin`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 1080006 --prompt "Merging AbstractClinicServiceTests and ClinicServiceSpringDataJpaTests then using the Spring Boot @DataJpaTest annotation"`
- first changed files:
  - `src/test/java/org/springframework/samples/petclinic/service/ClinicServiceSpringDataJpaTests.java`

### `55359a4` remove unnecessary code

- score: 30
- archetype: backend_api
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: backend_api, tests
- prompt: remove unnecessary code
- needs manual prompt: False
- suggested matrix case id: `backend_api_55359a4_remove_unnecessary_code`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 55359a4 --prompt "remove unnecessary code"`
- first changed files:
  - `src/test/java/org/springframework/samples/petclinic/web/api/OwnerResourceTests.java`

### `72afd1a` Enable CORS

- score: 30
- archetype: backend_api
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: backend_api
- prompt: Enable CORS
- needs manual prompt: False
- suggested matrix case id: `backend_api_72afd1a_enable_cors`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 72afd1a --prompt "Enable CORS"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/web/api/AbstractResourceController.java`

### `3f2d3ba` fix typo

- score: 20
- archetype: backend_api
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: backend_service, tests
- prompt: fix typo
- needs manual prompt: False
- suggested matrix case id: `backend_api_3f2d3ba_fix_typo`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 3f2d3ba --prompt "fix typo"`
- first changed files:
  - `src/test/java/org/springframework/samples/petclinic/service/AbstractClinicServiceTests.java`

### `a49eaf8` Add Api Tests

- score: 0
- archetype: backend_api
- candidate quality: reject
- candidate quality reason: Prompt quality is too low for an automatic replay benchmark case.
- prompt quality: low
- prompt quality reason: Subject focuses on tests, docs, comments, or build tooling.
- included in generated cases: False
- changed files: 4
- categories: backend_api, tests
- prompt: Add Api Tests
- needs manual prompt: False
- suggested matrix case id: `backend_api_a49eaf8_add_api_tests`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit a49eaf8 --prompt "Add Api Tests"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/web/api/VetResource.java`
  - `src/test/java/org/springframework/samples/petclinic/web/api/OwnerResourceTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/api/PetResourceTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/api/VetResourceTests.java`

### `00c9ef4` add unit test for non existing owner by id request

- score: -20
- archetype: backend_api
- candidate quality: reject
- candidate quality reason: Prompt quality is too low for an automatic replay benchmark case.
- prompt quality: low
- prompt quality reason: Subject focuses on tests, docs, comments, or build tooling.
- included in generated cases: False
- changed files: 1
- categories: backend_api, tests
- prompt: add unit test for non existing owner by id request
- needs manual prompt: False
- suggested matrix case id: `backend_api_00c9ef4_add_unit_test_for_non_existing_owner_by_id_request`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 00c9ef4 --prompt "add unit test for non existing owner by id request"`
- first changed files:
  - `src/test/java/org/springframework/samples/petclinic/web/api/OwnerResourceTests.java`

### `1b4d425` Fix typo into javadoc

- score: -40
- archetype: backend_api
- candidate quality: reject
- candidate quality reason: Prompt quality is too low for an automatic replay benchmark case.
- prompt quality: low
- prompt quality reason: Subject focuses on tests, docs, comments, or build tooling.
- included in generated cases: False
- changed files: 1
- categories: backend_service, tests
- prompt: Fix typo into javadoc
- needs manual prompt: False
- suggested matrix case id: `backend_api_1b4d425_fix_typo_into_javadoc`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 1b4d425 --prompt "Fix typo into javadoc"`
- first changed files:
  - `src/test/java/org/springframework/samples/petclinic/service/AbstractClinicServiceTests.java`

### `d8a2b5c` cleanup on tests

- score: -40
- archetype: backend_api
- candidate quality: reject
- candidate quality reason: Prompt quality is too low for an automatic replay benchmark case.
- prompt quality: low
- prompt quality reason: Subject focuses on tests, docs, comments, or build tooling.
- included in generated cases: False
- changed files: 1
- categories: backend_service, tests
- prompt: cleanup on tests
- needs manual prompt: False
- suggested matrix case id: `backend_api_d8a2b5c_cleanup_on_tests`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit d8a2b5c --prompt "cleanup on tests"`
- first changed files:
  - `src/test/java/org/springframework/samples/petclinic/service/AbstractClinicServiceTests.java`


## config_build

### `1e412c6` Add some missing trimDirectiveWhitespaces on JSPs

- score: 10
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 5
- categories: other
- prompt: Add some missing trimDirectiveWhitespaces on JSPs
- needs manual prompt: False
- suggested matrix case id: `config_build_1e412c6_add_some_missing_trimdirectivewhitespaces_on_jsps`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 1e412c6 --prompt "Add some missing trimDirectiveWhitespaces on JSPs"`
- first changed files:
  - `src/main/webapp/WEB-INF/jsp/owners/createOrUpdateOwnerForm.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/findOwners.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/ownerDetails.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/ownersList.jsp`
  - `src/main/webapp/WEB-INF/jsp/pets/createOrUpdatePetForm.jsp`

### `bbc1c8b` Add some missing trimDirectiveWhitespaces on JSPs

- score: 10
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 5
- categories: other
- prompt: Add some missing trimDirectiveWhitespaces on JSPs
- needs manual prompt: False
- suggested matrix case id: `config_build_bbc1c8b_add_some_missing_trimdirectivewhitespaces_on_jsps`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit bbc1c8b --prompt "Add some missing trimDirectiveWhitespaces on JSPs"`
- first changed files:
  - `src/main/webapp/WEB-INF/jsp/owners/createOrUpdateOwnerForm.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/findOwners.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/ownerDetails.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/ownersList.jsp`
  - `src/main/webapp/WEB-INF/jsp/pets/createOrUpdatePetForm.jsp`

### `aa8cc43` simplify jsp layout management

- score: 10
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 12
- categories: other
- prompt: simplify jsp layout management
- needs manual prompt: False
- suggested matrix case id: `config_build_aa8cc43_simplify_jsp_layout_management`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit aa8cc43 --prompt "simplify jsp layout management"`
- first changed files:
  - `src/main/webapp/WEB-INF/jsp/exception.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/createOrUpdateOwnerForm.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/findOwners.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/ownerDetails.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/ownersList.jsp`
  - `src/main/webapp/WEB-INF/jsp/pets/createOrUpdatePetForm.jsp`
  - `src/main/webapp/WEB-INF/jsp/pets/createOrUpdateVisitForm.jsp`
  - `src/main/webapp/WEB-INF/jsp/vets/vetList.jsp`
  - `src/main/webapp/WEB-INF/jsp/welcome.jsp`
  - `src/main/webapp/WEB-INF/tags/layout.tag`

### `a2849f7` Simplify jsp layout management abstract the page layout into “layout.tag”

- score: 10
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 14
- categories: other
- prompt: Simplify jsp layout management abstract the page layout into “layout.tag”
- needs manual prompt: False
- suggested matrix case id: `config_build_a2849f7_simplify_jsp_layout_management_abstract_the_page_layout_into_layout_tag`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit a2849f7 --prompt "Simplify jsp layout management abstract the page layout into \u201clayout.tag\u201d"`
- first changed files:
  - `src/main/webapp/WEB-INF/jsp/exception.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/createOrUpdateOwnerForm.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/findOwners.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/ownerDetails.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/ownersList.jsp`
  - `src/main/webapp/WEB-INF/jsp/pets/createOrUpdatePetForm.jsp`
  - `src/main/webapp/WEB-INF/jsp/pets/createOrUpdateVisitForm.jsp`
  - `src/main/webapp/WEB-INF/jsp/vets/vetList.jsp`
  - `src/main/webapp/WEB-INF/jsp/welcome.jsp`
  - `src/main/webapp/WEB-INF/tags/footer.tag`

### `0d044ba` Add bin folder to gitignore

- score: -10
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Add bin folder to gitignore
- needs manual prompt: False
- suggested matrix case id: `config_build_0d044ba_add_bin_folder_to_gitignore`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 0d044ba --prompt "Add bin folder to gitignore"`
- first changed files:
  - `.gitignore`

### `6a1e885` Add travis for reactjs branch

- score: -10
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Add travis for reactjs branch
- needs manual prompt: False
- suggested matrix case id: `config_build_6a1e885_add_travis_for_reactjs_branch`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 6a1e885 --prompt "Add travis for reactjs branch"`
- first changed files:
  - `.travis.yml`

### `6be7ec5` Add the generated/ directory for easier switching between master and develop branches

- score: -10
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Add the generated/ directory for easier switching between master and develop branches
- needs manual prompt: False
- suggested matrix case id: `config_build_6be7ec5_add_the_generated_directory_for_easier_switching_between_master_and_develop_bran`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 6be7ec5 --prompt "Add the generated/ directory for easier switching between master and develop branches"`
- first changed files:
  - `.gitignore`

### `6f349ec` Update link navigation title to make it consistent

- score: -10
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Update link navigation title to make it consistent
- needs manual prompt: False
- suggested matrix case id: `config_build_6f349ec_update_link_navigation_title_to_make_it_consistent`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 6f349ec --prompt "Update link navigation title to make it consistent"`
- first changed files:
  - `src/main/webapp/WEB-INF/jsp/vets/vetList.jsp`

### `cb6bd87` Putting encoding filter first per #80

- score: -10
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Putting encoding filter first per #80
- needs manual prompt: False
- suggested matrix case id: `config_build_cb6bd87_putting_encoding_filter_first_per_80`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit cb6bd87 --prompt "Putting encoding filter first per #80"`
- first changed files:
  - `src/main/webapp/WEB-INF/web.xml`

### `dd552f4` Fix #108 owner update

- score: -10
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Fix #108 owner update
- needs manual prompt: False
- suggested matrix case id: `config_build_dd552f4_fix_108_owner_update`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit dd552f4 --prompt "Fix #108 owner update"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/web/OwnerController.java`

### `4aa89ae` Fix #110 owner and pet validators failed

- score: -10
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: other
- prompt: Fix #110 owner and pet validators failed
- needs manual prompt: False
- suggested matrix case id: `config_build_4aa89ae_fix_110_owner_and_pet_validators_failed`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 4aa89ae --prompt "Fix #110 owner and pet validators failed"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/web/OwnerController.java`
  - `src/main/java/org/springframework/samples/petclinic/web/PetController.java`

### `80ff54a` Fix #89 Web layer: use @Valid whenever possible

- score: -10
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: other
- prompt: Fix #89 Web layer: use @Valid whenever possible
- needs manual prompt: False
- suggested matrix case id: `config_build_80ff54a_fix_89_web_layer_use_valid_whenever_possible`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 80ff54a --prompt "Fix #89 Web layer: use @Valid whenever possible"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/web/PetController.java`
  - `src/main/java/org/springframework/samples/petclinic/web/PetValidator.java`

### `f7498c7` Removed HTTP PUT method - it is not supported in JSP 2.3

- score: -10
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 5
- categories: other
- prompt: Removed HTTP PUT method - it is not supported in JSP 2.3
- needs manual prompt: False
- suggested matrix case id: `config_build_f7498c7_removed_http_put_method_it_is_not_supported_in_jsp_2_3`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit f7498c7 --prompt "Removed HTTP PUT method - it is not supported in JSP 2.3"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/web/OwnerController.java`
  - `src/main/java/org/springframework/samples/petclinic/web/PetController.java`
  - `src/main/webapp/WEB-INF/jsp/owners/createOrUpdateOwnerForm.jsp`
  - `src/main/webapp/WEB-INF/jsp/pets/createOrUpdatePetForm.jsp`
  - `src/main/webapp/WEB-INF/web.xml`

### `cb0504e` #92 add some comments to switch from HSQLDB to MySQL

- score: -13
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 3
- categories: config_build, docs, other
- prompt: #92 add some comments to switch from HSQLDB to MySQL
- needs manual prompt: False
- suggested matrix case id: `config_build_cb0504e_92_add_some_comments_to_switch_from_hsqldb_to_mysql`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit cb0504e --prompt "#92 add some comments to switch from HSQLDB to MySQL"`
- first changed files:
  - `pom.xml`
  - `readme.md`
  - `src/main/resources/spring/data-access.properties`

### `d6697d8` Add Maven Wrapper with mvn -N io.takari:maven:wrapper

- score: -13
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 4
- categories: config_build, docs, other
- prompt: Add Maven Wrapper with mvn -N io.takari:maven:wrapper
- needs manual prompt: False
- suggested matrix case id: `config_build_d6697d8_add_maven_wrapper_with_mvn_n_io_takari_maven_wrapper`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit d6697d8 --prompt "Add Maven Wrapper with mvn -N io.takari:maven:wrapper"`
- first changed files:
  - `.gitignore`
  - `mvnw`
  - `mvnw.cmd`
  - `readme.md`

### `475f5f5` migrated to Spring 4.1.1.RELEASE

- score: -18
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: config_build, other
- prompt: migrated to Spring 4.1.1.RELEASE
- needs manual prompt: False
- suggested matrix case id: `config_build_475f5f5_migrated_to_spring_4_1_1_release`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 475f5f5 --prompt "migrated to Spring 4.1.1.RELEASE"`
- first changed files:
  - `pom.xml`
  - `src/main/java/org/springframework/samples/petclinic/web/VetsAtomView.java`

### `6163868` Revert "Make jar not war"

- score: -18
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: config_build, other
- prompt: Revert "Make jar not war"
- needs manual prompt: False
- suggested matrix case id: `config_build_6163868_revert_make_jar_not_war`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 6163868 --prompt "Revert \"Make jar not war\""`
- first changed files:
  - `pom.xml`
  - `src/main/java/org/springframework/samples/petclinic/PetClinicApplication.java`

### `a41b83a` Upgrade to Ehcache 3

- score: -18
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: config_build, other
- prompt: Upgrade to Ehcache 3
- needs manual prompt: False
- suggested matrix case id: `config_build_a41b83a_upgrade_to_ehcache_3`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit a41b83a --prompt "Upgrade to Ehcache 3"`
- first changed files:
  - `pom.xml`
  - `src/main/java/org/springframework/samples/petclinic/config/CacheConfig.java`

### `be048ae` Make jar not war

- score: -18
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: config_build, other
- prompt: Make jar not war
- needs manual prompt: False
- suggested matrix case id: `config_build_be048ae_make_jar_not_war`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit be048ae --prompt "Make jar not war"`
- first changed files:
  - `pom.xml`
  - `src/main/java/org/springframework/samples/petclinic/PetClinicApplication.java`

### `c4b9b0b` migrated to the latest version of jquery and jquery-ui

- score: -18
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: config_build, other
- prompt: migrated to the latest version of jquery and jquery-ui
- needs manual prompt: False
- suggested matrix case id: `config_build_c4b9b0b_migrated_to_the_latest_version_of_jquery_and_jquery_ui`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit c4b9b0b --prompt "migrated to the latest version of jquery and jquery-ui"`
- first changed files:
  - `pom.xml`
  - `src/main/webapp/WEB-INF/jsp/fragments/headTag.jsp`

### `ce7e6e8` updated URL on cloud foundry

- score: -18
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: config_build, docs
- prompt: updated URL on cloud foundry
- needs manual prompt: False
- suggested matrix case id: `config_build_ce7e6e8_updated_url_on_cloud_foundry`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit ce7e6e8 --prompt "updated URL on cloud foundry"`
- first changed files:
  - `pom.xml`
  - `readme.md`

### `df1596b` using latest versions of hibernate, spring-data, joda...

- score: -18
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: config_build, other
- prompt: using latest versions of hibernate, spring-data, joda...
- needs manual prompt: False
- suggested matrix case id: `config_build_df1596b_using_latest_versions_of_hibernate_spring_data_joda`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit df1596b --prompt "using latest versions of hibernate, spring-data, joda..."`
- first changed files:
  - `.springBeans`
  - `pom.xml`

### `c193916` started changes to migrate to Bootstrap 3 (work in progress)

- score: -18
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 3
- categories: config_build, other
- prompt: started changes to migrate to Bootstrap 3 (work in progress)
- needs manual prompt: False
- suggested matrix case id: `config_build_c193916_started_changes_to_migrate_to_bootstrap_3_work_in_progress`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit c193916 --prompt "started changes to migrate to Bootstrap 3 (work in progress)"`
- first changed files:
  - `pom.xml`
  - `src/main/webapp/WEB-INF/jsp/fragments/bodyHeader.jsp`
  - `src/main/webapp/WEB-INF/jsp/fragments/headTag.jsp`

### `e99c67a` Upgraded Dandelion-Datatables to the latest release (v0.10.0)

- score: -18
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 5
- categories: config_build, other
- prompt: Upgraded Dandelion-Datatables to the latest release (v0.10.0)
- needs manual prompt: False
- suggested matrix case id: `config_build_e99c67a_upgraded_dandelion_datatables_to_the_latest_release_v0_10_0`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit e99c67a --prompt "Upgraded Dandelion-Datatables to the latest release (v0.10.0)"`
- first changed files:
  - `pom.xml`
  - `src/main/resources/dandelion/datatables/datatables.properties`
  - `src/main/webapp/WEB-INF/jsp/owners/ownersList.jsp`
  - `src/main/webapp/WEB-INF/jsp/vets/vetList.jsp`
  - `src/main/webapp/WEB-INF/web.xml`

### `eb6f934` migrate to webjars for frontend resource management

- score: -18
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 7
- categories: config_build, other
- prompt: migrate to webjars for frontend resource management
- needs manual prompt: False
- suggested matrix case id: `config_build_eb6f934_migrate_to_webjars_for_frontend_resource_management`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit eb6f934 --prompt "migrate to webjars for frontend resource management"`
- first changed files:
  - `pom.xml`
  - `src/main/webapp/WEB-INF/tags/footer.tag`
  - `src/main/webapp/WEB-INF/tags/htmlHeader.tag`
  - `src/main/webapp/bower_components/bower.json`
  - `src/main/webapp/resources/.gitignore`
  - `src/main/webapp/resources/css/jquery-ui.theme.min.css`
  - `src/main/webapp/resources/less/petclinic.less`

### `3f0bfbb` updates logo

- score: -20
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: other
- prompt: updates logo
- needs manual prompt: False
- suggested matrix case id: `config_build_3f0bfbb_updates_logo`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 3f0bfbb --prompt "updates logo"`
- first changed files:
  - `src/main/webapp/WEB-INF/jsp/fragments/footer.jsp`
  - `src/main/webapp/resources/images/spring-pivotal-logo.png`

### `858a501` Add travis config for maven and node

- score: -25
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Add travis config for maven and node
- needs manual prompt: False
- suggested matrix case id: `config_build_858a501_add_travis_config_for_maven_and_node`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 858a501 --prompt "Add travis config for maven and node"`
- first changed files:
  - `.travis.yml`

### `e9f5f7b` #164 Add main class required by the spring-boot-maven-plugin

- score: -25
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: #164 Add main class required by the spring-boot-maven-plugin
- needs manual prompt: False
- suggested matrix case id: `config_build_e9f5f7b_164_add_main_class_required_by_the_spring_boot_maven_plugin`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit e9f5f7b --prompt "#164 Add main class required by the spring-boot-maven-plugin"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/PetClinicApplication.java`

### `3185ed4` added missing .mvn folder needed for maven wrapper

- score: -25
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 3
- categories: other
- prompt: added missing .mvn folder needed for maven wrapper
- needs manual prompt: False
- suggested matrix case id: `config_build_3185ed4_added_missing_mvn_folder_needed_for_maven_wrapper`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 3185ed4 --prompt "added missing .mvn folder needed for maven wrapper"`
- first changed files:
  - `.gitignore`
  - `.mvn/wrapper/maven-wrapper.jar`
  - `.mvn/wrapper/maven-wrapper.properties`

### `0fef5c1` Git ignore npm.debug

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Git ignore npm.debug
- needs manual prompt: False
- suggested matrix case id: `config_build_0fef5c1_git_ignore_npm_debug`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 0fef5c1 --prompt "Git ignore npm.debug"`
- first changed files:
  - `.gitignore`

### `157d1c5` Customize GitHub language detection - Solves Issue#5

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Customize GitHub language detection - Solves Issue#5
- needs manual prompt: False
- suggested matrix case id: `config_build_157d1c5_customize_github_language_detection_solves_issue_5`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 157d1c5 --prompt "Customize GitHub language detection - Solves Issue#5"`
- first changed files:
  - `.gitattributes`

### `1c9b401` cleaned up if statement in controller

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: cleaned up if statement in controller
- needs manual prompt: False
- suggested matrix case id: `config_build_1c9b401_cleaned_up_if_statement_in_controller`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 1c9b401 --prompt "cleaned up if statement in controller"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/web/OwnerController.java`

### `1f42b76` #164 Set Dandelion active profile to "prod" when Spring production profile is enabled

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: #164 Set Dandelion active profile to "prod" when Spring production profile is enabled
- needs manual prompt: False
- suggested matrix case id: `config_build_1f42b76_164_set_dandelion_active_profile_to_prod_when_spring_production_profile_is_enabl`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 1f42b76 --prompt "#164 Set Dandelion active profile to \"prod\" when Spring production profile is enabled"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/config/DandelionConfig.java`

### `216db91` Adding Travis configuration file

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Adding Travis configuration file
- needs manual prompt: False
- suggested matrix case id: `config_build_216db91_adding_travis_configuration_file`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 216db91 --prompt "Adding Travis configuration file"`
- first changed files:
  - `travis.yml`

### `34d8ca4` chaining validation so we can see multiple error messages when there are multiple validation errors

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: chaining validation so we can see multiple error messages when there are multiple validation errors
- needs manual prompt: False
- suggested matrix case id: `config_build_34d8ca4_chaining_validation_so_we_can_see_multiple_error_messages_when_there_are_multipl`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 34d8ca4 --prompt "chaining validation so we can see multiple error messages when there are multiple validation errors"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/web/PetValidator.java`

### `3e45127` Sonar review: made code more readable

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Sonar review: made code more readable
- needs manual prompt: False
- suggested matrix case id: `config_build_3e45127_sonar_review_made_code_more_readable`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 3e45127 --prompt "Sonar review: made code more readable"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/util/CallMonitoringAspect.java`

### `3e8829f` adding explicit reference to default profile because it doesn't seem to work on on some environments

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: adding explicit reference to default profile because it doesn't seem to work on on some environments
- needs manual prompt: False
- suggested matrix case id: `config_build_3e8829f_adding_explicit_reference_to_default_profile_because_it_doesn_t_seem_to_work_on_`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 3e8829f --prompt "adding explicit reference to default profile because it doesn't seem to work on on some environments"`
- first changed files:
  - `src/main/webapp/WEB-INF/web.xml`

### `54b7d87` Fixing log back warning per #59

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Fixing log back warning per #59
- needs manual prompt: False
- suggested matrix case id: `config_build_54b7d87_fixing_log_back_warning_per_59`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 54b7d87 --prompt "Fixing log back warning per #59"`
- first changed files:
  - `src/main/resources/logback.xml`

### `615c860` Adicionando client no gitignore

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Adicionando client no gitignore
- needs manual prompt: False
- suggested matrix case id: `config_build_615c860_adicionando_client_no_gitignore`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 615c860 --prompt "Adicionando client no gitignore"`
- first changed files:
  - `.gitignore`

### `6a7167c` Customize GitHub language detection - Solves Issue#5

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Customize GitHub language detection - Solves Issue#5
- needs manual prompt: False
- suggested matrix case id: `config_build_6a7167c_customize_github_language_detection_solves_issue_5`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 6a7167c --prompt "Customize GitHub language detection - Solves Issue#5"`
- first changed files:
  - `.gitattributes`

### `6e079b2` Error control on description was missing

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Error control on description was missing
- needs manual prompt: False
- suggested matrix case id: `config_build_6e079b2_error_control_on_description_was_missing`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 6e079b2 --prompt "Error control on description was missing"`
- first changed files:
  - `src/main/webapp/WEB-INF/jsp/pets/createOrUpdateVisitForm.jsp`

### `7eeff06` Eliminando código desnecessário

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Eliminando código desnecessário
- needs manual prompt: False
- suggested matrix case id: `config_build_7eeff06_eliminando_c_digo_desnecess_rio`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 7eeff06 --prompt "Eliminando c\u00f3digo desnecess\u00e1rio"`
- first changed files:
  - `client/server.js`

### `817fabd` Fix #155 Fix logback + JMX memory leak on web application reload

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Fix #155 Fix logback + JMX memory leak on web application reload
- needs manual prompt: False
- suggested matrix case id: `config_build_817fabd_fix_155_fix_logback_jmx_memory_leak_on_web_application_reload`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 817fabd --prompt "Fix #155 Fix logback + JMX memory leak on web application reload"`
- first changed files:
  - `src/main/resources/logback.xml`

### `81fac33` #96 change EditorConfig in order to  impact other files than Java and XML (i.e.. jsp and html pages)

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: #96 change EditorConfig in order to impact other files than Java and XML (i.e.. jsp and html pages)
- needs manual prompt: False
- suggested matrix case id: `config_build_81fac33_96_change_editorconfig_in_order_to_impact_other_files_than_java_and_xml_i_e_jsp_`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 81fac33 --prompt "#96 change EditorConfig in order to impact other files than Java and XML (i.e.. jsp and html pages)"`
- first changed files:
  - `.editorconfig`

### `87d025f` fixed url for jquery-ui. There was typo "query" instaed of "jquery" and file cannot be loaded

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: fixed url for jquery-ui. There was typo "query" instaed of "jquery" and file cannot be loaded
- needs manual prompt: False
- suggested matrix case id: `config_build_87d025f_fixed_url_for_jquery_ui_there_was_typo_query_instaed_of_jquery_and_file_cannot_b`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 87d025f --prompt "fixed url for jquery-ui. There was typo \"query\" instaed of \"jquery\" and file cannot be loaded"`
- first changed files:
  - `src/main/webapp/WEB-INF/jsp/fragments/staticFiles.jsp`

### `91ed548` removing xdd version number

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: removing xdd version number
- needs manual prompt: False
- suggested matrix case id: `config_build_91ed548_removing_xdd_version_number`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 91ed548 --prompt "removing xdd version number"`
- first changed files:
  - `src/main/resources/spring/mvc-view-config.xml`

### `c8e3602` fixed bug: vets.html did not display properly

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: fixed bug: vets.html did not display properly
- needs manual prompt: False
- suggested matrix case id: `config_build_c8e3602_fixed_bug_vets_html_did_not_display_properly`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit c8e3602 --prompt "fixed bug: vets.html did not display properly"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/web/VetController.java`

### `cc53f63` travis.ml -> .travis.yml

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: travis.ml -> .travis.yml
- needs manual prompt: False
- suggested matrix case id: `config_build_cc53f63_travis_ml_travis_yml`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit cc53f63 --prompt "travis.ml -> .travis.yml"`
- first changed files:
  - `.travis.yml`

### `d77f31c` Fix Jetty 9 startup

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Fix Jetty 9 startup
- needs manual prompt: False
- suggested matrix case id: `config_build_d77f31c_fix_jetty_9_startup`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit d77f31c --prompt "Fix Jetty 9 startup"`
- first changed files:
  - `src/main/webapp/WEB-INF/jetty-web.xml`

### `d7b100f` Removed 'Help' from menu

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Removed 'Help' from menu
- needs manual prompt: False
- suggested matrix case id: `config_build_d7b100f_removed_help_from_menu`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit d7b100f --prompt "Removed 'Help' from menu"`
- first changed files:
  - `src/main/webapp/WEB-INF/jsp/fragments/bodyHeader.jsp`

### `db2bd96` Launcher for Eclipse with Ansi Console

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Launcher for Eclipse with Ansi Console
- needs manual prompt: False
- suggested matrix case id: `config_build_db2bd96_launcher_for_eclipse_with_ansi_console`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit db2bd96 --prompt "Launcher for Eclipse with Ansi Console"`
- first changed files:
  - `Run PetClinicApplication.launch`

### `dbd1e54` responsive menu fix

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: responsive menu fix
- needs manual prompt: False
- suggested matrix case id: `config_build_dbd1e54_responsive_menu_fix`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit dbd1e54 --prompt "responsive menu fix"`
- first changed files:
  - `src/main/webapp/WEB-INF/tags/menu.tag`

### `e15e45b` Spring MVC should server static resources (*.html, ...) located in src/main/webapp instead of returning "404 Not Found"

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Spring MVC should server static resources (*.html, ...) located in src/main/webapp instead of returning "404 Not Found"
- needs manual prompt: False
- suggested matrix case id: `config_build_e15e45b_spring_mvc_should_server_static_resources_html_located_in_src_main_webapp_instea`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit e15e45b --prompt "Spring MVC should server static resources (*.html, ...) located in src/main/webapp instead of returning \"404 Not Found\""`
- first changed files:
  - `src/main/resources/spring/mvc-core-config.xml`

### `e298739` updating a link

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: updating a link
- needs manual prompt: False
- suggested matrix case id: `config_build_e298739_updating_a_link`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit e298739 --prompt "updating a link"`
- first changed files:
  - `client/server.js`

### `e30321e` Build only master in Travis

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Build only master in Travis
- needs manual prompt: False
- suggested matrix case id: `config_build_e30321e_build_only_master_in_travis`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit e30321e --prompt "Build only master in Travis"`
- first changed files:
  - `.travis.yml`

### `e6ca8a3` fix issue #144: remove redundant less-than sign

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: fix issue #144: remove redundant less-than sign
- needs manual prompt: False
- suggested matrix case id: `config_build_e6ca8a3_fix_issue_144_remove_redundant_less_than_sign`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit e6ca8a3 --prompt "fix issue #144: remove redundant less-than sign"`
- first changed files:
  - `src/main/webapp/WEB-INF/jsp/exception.jsp`

### `f0bf692` Moving "visit" object to request scope

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Moving "visit" object to request scope
- needs manual prompt: False
- suggested matrix case id: `config_build_f0bf692_moving_visit_object_to_request_scope`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit f0bf692 --prompt "Moving \"visit\" object to request scope"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/web/VisitController.java`

### `fa46685` responsive menu fix

- score: -30
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: responsive menu fix
- needs manual prompt: False
- suggested matrix case id: `config_build_fa46685_responsive_menu_fix`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit fa46685 --prompt "responsive menu fix"`
- first changed files:
  - `src/main/webapp/WEB-INF/tags/menu.tag`

### `5a6c108` Added comments when CallMonitoringAspect called

- score: -33
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 3
- categories: config_build, other
- prompt: Added comments when CallMonitoringAspect called
- needs manual prompt: False
- suggested matrix case id: `config_build_5a6c108_added_comments_when_callmonitoringaspect_called`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 5a6c108 --prompt "Added comments when CallMonitoringAspect called"`
- first changed files:
  - `pom.xml`
  - `src/main/java/org/springframework/samples/petclinic/util/CallMonitoringAspect.java`
  - `src/main/webapp/WEB-INF/web.xml`

### `00dc3d2` Source Map

- score: -40
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Source Map
- needs manual prompt: False
- suggested matrix case id: `config_build_00dc3d2_source_map`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 00dc3d2 --prompt "Source Map"`
- first changed files:
  - `client/webpack.config.js`

### `266ec91` Fix publicPath

- score: -40
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Fix publicPath
- needs manual prompt: False
- suggested matrix case id: `config_build_266ec91_fix_publicpath`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 266ec91 --prompt "Fix publicPath"`
- first changed files:
  - `client/webpack.config.js`

### `83301cb` Centering content

- score: -40
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Centering content
- needs manual prompt: False
- suggested matrix case id: `config_build_83301cb_centering_content`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 83301cb --prompt "Centering content"`
- first changed files:
  - `src/main/webapp/resources/css/petclinic.css`

### `482eeb1` Revert "Jetty 9.3 support"

- score: -43
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Revert "Jetty 9.3 support"
- needs manual prompt: False
- suggested matrix case id: `config_build_482eeb1_revert_jetty_9_3_support`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 482eeb1 --prompt "Revert \"Jetty 9.3 support\""`
- first changed files:
  - `pom.xml`

### `4b1f7a7` Jetty 9.3 support

- score: -43
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Jetty 9.3 support
- needs manual prompt: False
- suggested matrix case id: `config_build_4b1f7a7_jetty_9_3_support`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 4b1f7a7 --prompt "Jetty 9.3 support"`
- first changed files:
  - `pom.xml`

### `63d8f12` Update of Dandelion to 1.1.1

- score: -43
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Update of Dandelion to 1.1.1
- needs manual prompt: False
- suggested matrix case id: `config_build_63d8f12_update_of_dandelion_to_1_1_1`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 63d8f12 --prompt "Update of Dandelion to 1.1.1"`
- first changed files:
  - `pom.xml`

### `c18c845` Add missing json-simple dependency

- score: -43
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Add missing json-simple dependency
- needs manual prompt: False
- suggested matrix case id: `config_build_c18c845_add_missing_json_simple_dependency`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit c18c845 --prompt "Add missing json-simple dependency"`
- first changed files:
  - `pom.xml`

### `e49ed43` Add Spring Boot devtools

- score: -43
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Add Spring Boot devtools
- needs manual prompt: False
- suggested matrix case id: `config_build_e49ed43_add_spring_boot_devtools`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit e49ed43 --prompt "Add Spring Boot devtools"`
- first changed files:
  - `pom.xml`

### `3298f1c` fix test command

- score: -45
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: fix test command
- needs manual prompt: False
- suggested matrix case id: `config_build_3298f1c_fix_test_command`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 3298f1c --prompt "fix test command"`
- first changed files:
  - `.travis.yml`

### `85c8237` added comment on <mvc:default-servlet-handler />

- score: -45
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: added comment on <mvc:default-servlet-handler />
- needs manual prompt: False
- suggested matrix case id: `config_build_85c8237_added_comment_on_mvc_default_servlet_handler`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 85c8237 --prompt "added comment on <mvc:default-servlet-handler />"`
- first changed files:
  - `src/main/resources/spring/mvc-core-config.xml`

### `92e7ab4` Simplified ContentNegoViewResolver config

- score: -45
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Simplified ContentNegoViewResolver config
- needs manual prompt: False
- suggested matrix case id: `config_build_92e7ab4_simplified_contentnegoviewresolver_config`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 92e7ab4 --prompt "Simplified ContentNegoViewResolver config"`
- first changed files:
  - `src/main/resources/spring/mvc-view-config.xml`

### `a8f8df4` SPR-0: run maven test on build

- score: -45
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: SPR-0: run maven test on build
- needs manual prompt: False
- suggested matrix case id: `config_build_a8f8df4_spr_0_run_maven_test_on_build`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit a8f8df4 --prompt "SPR-0: run maven test on build"`
- first changed files:
  - `.travis.yml`

### `b7764e3` Added comments to explain how database dialect is configured #33

- score: -45
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Added comments to explain how database dialect is configured #33
- needs manual prompt: False
- suggested matrix case id: `config_build_b7764e3_added_comments_to_explain_how_database_dialect_is_configured_33`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit b7764e3 --prompt "Added comments to explain how database dialect is configured #33"`
- first changed files:
  - `src/main/resources/spring/business-config.xml`

### `74d61b3` update libraries

- score: -53
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: update libraries
- needs manual prompt: False
- suggested matrix case id: `config_build_74d61b3_update_libraries`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 74d61b3 --prompt "update libraries"`
- first changed files:
  - `pom.xml`

### `c2c404b` JSon support

- score: -53
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: JSon support
- needs manual prompt: False
- suggested matrix case id: `config_build_c2c404b_json_support`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit c2c404b --prompt "JSon support"`
- first changed files:
  - `pom.xml`

### `3268afe` Bump loader-utils, babel-loader, css-loader, extract-text-webpack-plugin, file-loader, less-loader, ts-loader, tslint-loader and webpack

- score: -58
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: config_build
- prompt: Bump loader-utils, babel-loader, css-loader, extract-text-webpack-plugin, file-loader, less-loader, ts-loader, tslint-loader and webpack
- needs manual prompt: False
- suggested matrix case id: `config_build_3268afe_bump_loader_utils_babel_loader_css_loader_extract_text_webpack_plugin_file_loade`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 3268afe --prompt "Bump loader-utils, babel-loader, css-loader, extract-text-webpack-plugin, file-loader, less-loader, ts-loader, tslint-loader and webpack"`
- first changed files:
  - `client/package-lock.json`
  - `client/package.json`

### `73fd0a8` Bump merge, jest and ts-jest in /client

- score: -58
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: config_build
- prompt: Bump merge, jest and ts-jest in /client
- needs manual prompt: False
- suggested matrix case id: `config_build_73fd0a8_bump_merge_jest_and_ts_jest_in_client`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 73fd0a8 --prompt "Bump merge, jest and ts-jest in /client"`
- first changed files:
  - `client/package-lock.json`
  - `client/package.json`

### `e6d590e` Bump webpack from 5.91.0 to 5.94.0 in /client

- score: -58
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: config_build
- prompt: Bump webpack from 5.91.0 to 5.94.0 in /client
- needs manual prompt: False
- suggested matrix case id: `config_build_e6d590e_bump_webpack_from_5_91_0_to_5_94_0_in_client`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit e6d590e --prompt "Bump webpack from 5.91.0 to 5.94.0 in /client"`
- first changed files:
  - `client/package-lock.json`
  - `client/package.json`

### `0445c8a` Remove m2e configuration (does not work in eclipse neon)

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Remove m2e configuration (does not work in eclipse neon)
- needs manual prompt: False
- suggested matrix case id: `config_build_0445c8a_remove_m2e_configuration_does_not_work_in_eclipse_neon`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 0445c8a --prompt "Remove m2e configuration (does not work in eclipse neon)"`
- first changed files:
  - `pom.xml`

### `053c84e` migrated to Spring 4.0.1

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: migrated to Spring 4.0.1
- needs manual prompt: False
- suggested matrix case id: `config_build_053c84e_migrated_to_spring_4_0_1`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 053c84e --prompt "migrated to Spring 4.0.1"`
- first changed files:
  - `pom.xml`

### `0a03a05` moved to AspectJ 1.8.2 and Dandelion 0.10.1

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: moved to AspectJ 1.8.2 and Dandelion 0.10.1
- needs manual prompt: False
- suggested matrix case id: `config_build_0a03a05_moved_to_aspectj_1_8_2_and_dandelion_0_10_1`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 0a03a05 --prompt "moved to AspectJ 1.8.2 and Dandelion 0.10.1"`
- first changed files:
  - `pom.xml`

### `0adaea9` Upgrade to Spring IO Platform to 2.0.7

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Upgrade to Spring IO Platform to 2.0.7
- needs manual prompt: False
- suggested matrix case id: `config_build_0adaea9_upgrade_to_spring_io_platform_to_2_0_7`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 0adaea9 --prompt "Upgrade to Spring IO Platform to 2.0.7"`
- first changed files:
  - `pom.xml`

### `11af3ae` #90 Reduce the POM size by inheriting from the spring.io BOM

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: #90 Reduce the POM size by inheriting from the spring.io BOM
- needs manual prompt: False
- suggested matrix case id: `config_build_11af3ae_90_reduce_the_pom_size_by_inheriting_from_the_spring_io_bom`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 11af3ae --prompt "#90 Reduce the POM size by inheriting from the spring.io BOM"`
- first changed files:
  - `pom.xml`

### `122c8a7` Upgrade to Spring IO platform v1.1.3.

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Upgrade to Spring IO platform v1.1.3.
- needs manual prompt: False
- suggested matrix case id: `config_build_122c8a7_upgrade_to_spring_io_platform_v1_1_3`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 122c8a7 --prompt "Upgrade to Spring IO platform v1.1.3."`
- first changed files:
  - `pom.xml`

### `18c3dac` updated to latest version of AspectJ and Dandelion datatables

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: updated to latest version of AspectJ and Dandelion datatables
- needs manual prompt: False
- suggested matrix case id: `config_build_18c3dac_updated_to_latest_version_of_aspectj_and_dandelion_datatables`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 18c3dac --prompt "updated to latest version of AspectJ and Dandelion datatables"`
- first changed files:
  - `pom.xml`

### `1aef94d` #95 Downgrade to AssertJ 2.2.0 to be compatible with Java 7

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: #95 Downgrade to AssertJ 2.2.0 to be compatible with Java 7
- needs manual prompt: False
- suggested matrix case id: `config_build_1aef94d_95_downgrade_to_assertj_2_2_0_to_be_compatible_with_java_7`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 1aef94d --prompt "#95 Downgrade to AssertJ 2.2.0 to be compatible with Java 7"`
- first changed files:
  - `pom.xml`

### `1e1a149` migrated to ehcache 2.6.8

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: migrated to ehcache 2.6.8
- needs manual prompt: False
- suggested matrix case id: `config_build_1e1a149_migrated_to_ehcache_2_6_8`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 1e1a149 --prompt "migrated to ehcache 2.6.8"`
- first changed files:
  - `pom.xml`

### `203d20e` Upgrade to Spring IO Platform 2.0.3

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Upgrade to Spring IO Platform 2.0.3
- needs manual prompt: False
- suggested matrix case id: `config_build_203d20e_upgrade_to_spring_io_platform_2_0_3`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 203d20e --prompt "Upgrade to Spring IO Platform 2.0.3"`
- first changed files:
  - `pom.xml`

### `31b6022` migrated to latest version of Spring Data and HSQLDB

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: migrated to latest version of Spring Data and HSQLDB
- needs manual prompt: False
- suggested matrix case id: `config_build_31b6022_migrated_to_latest_version_of_spring_data_and_hsqldb`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 31b6022 --prompt "migrated to latest version of Spring Data and HSQLDB"`
- first changed files:
  - `pom.xml`

### `377bc63` migrated pom to Spring 4 and Servlet 3

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: migrated pom to Spring 4 and Servlet 3
- needs manual prompt: False
- suggested matrix case id: `config_build_377bc63_migrated_pom_to_spring_4_and_servlet_3`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 377bc63 --prompt "migrated pom to Spring 4 and Servlet 3"`
- first changed files:
  - `pom.xml`

### `39ab836` moved spring-data dependency to boot-starter

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: moved spring-data dependency to boot-starter
- needs manual prompt: False
- suggested matrix case id: `config_build_39ab836_moved_spring_data_dependency_to_boot_starter`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 39ab836 --prompt "moved spring-data dependency to boot-starter"`
- first changed files:
  - `pom.xml`

### `3a9e0f3` Align petclinic version to the Spring Framework one

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Align petclinic version to the Spring Framework one
- needs manual prompt: False
- suggested matrix case id: `config_build_3a9e0f3_align_petclinic_version_to_the_spring_framework_one`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 3a9e0f3 --prompt "Align petclinic version to the Spring Framework one"`
- first changed files:
  - `pom.xml`

### `3dc8a34` Bump follow-redirects from 1.15.5 to 1.15.6 in /client

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Bump follow-redirects from 1.15.5 to 1.15.6 in /client
- needs manual prompt: False
- suggested matrix case id: `config_build_3dc8a34_bump_follow_redirects_from_1_15_5_to_1_15_6_in_client`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 3dc8a34 --prompt "Bump follow-redirects from 1.15.5 to 1.15.6 in /client"`
- first changed files:
  - `client/package-lock.json`

### `43216fb` migrated to Hibernate 4.3.1

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: migrated to Hibernate 4.3.1
- needs manual prompt: False
- suggested matrix case id: `config_build_43216fb_migrated_to_hibernate_4_3_1`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 43216fb --prompt "migrated to Hibernate 4.3.1"`
- first changed files:
  - `pom.xml`

### `4d90e7e` Display build-related information into the /manage/info endpoint

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Display build-related information into the /manage/info endpoint
- needs manual prompt: False
- suggested matrix case id: `config_build_4d90e7e_display_build_related_information_into_the_manage_info_endpoint`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 4d90e7e --prompt "Display build-related information into the /manage/info endpoint"`
- first changed files:
  - `pom.xml`

### `50f0bc9` migrated to LogBack 1.1.0

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: migrated to LogBack 1.1.0
- needs manual prompt: False
- suggested matrix case id: `config_build_50f0bc9_migrated_to_logback_1_1_0`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 50f0bc9 --prompt "migrated to LogBack 1.1.0"`
- first changed files:
  - `pom.xml`

### `515f8d9` Fix jQuery version

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Fix jQuery version
- needs manual prompt: False
- suggested matrix case id: `config_build_515f8d9_fix_jquery_version`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 515f8d9 --prompt "Fix jQuery version"`
- first changed files:
  - `pom.xml`

### `53abaf5` upgrading jadira-usertype

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: upgrading jadira-usertype
- needs manual prompt: False
- suggested matrix case id: `config_build_53abaf5_upgrading_jadira_usertype`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 53abaf5 --prompt "upgrading jadira-usertype"`
- first changed files:
  - `pom.xml`

### `5e56bc2` Using JSP and JSTL version from the <properties> section

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Using JSP and JSTL version from the <properties> section
- needs manual prompt: False
- suggested matrix case id: `config_build_5e56bc2_using_jsp_and_jstl_version_from_the_properties_section`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 5e56bc2 --prompt "Using JSP and JSTL version from the <properties> section"`
- first changed files:
  - `pom.xml`

### `657b868` migrated to Spring 3.2.4

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: migrated to Spring 3.2.4
- needs manual prompt: False
- suggested matrix case id: `config_build_657b868_migrated_to_spring_3_2_4`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 657b868 --prompt "migrated to Spring 3.2.4"`
- first changed files:
  - `pom.xml`

### `6902cb8` migrated to latest version of Spring Data, tomcat-jdbc and hsqldb

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: migrated to latest version of Spring Data, tomcat-jdbc and hsqldb
- needs manual prompt: False
- suggested matrix case id: `config_build_6902cb8_migrated_to_latest_version_of_spring_data_tomcat_jdbc_and_hsqldb`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 6902cb8 --prompt "migrated to latest version of Spring Data, tomcat-jdbc and hsqldb"`
- first changed files:
  - `pom.xml`

### `7001beb` Bump cookie and express in /client

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Bump cookie and express in /client
- needs manual prompt: False
- suggested matrix case id: `config_build_7001beb_bump_cookie_and_express_in_client`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 7001beb --prompt "Bump cookie and express in /client"`
- first changed files:
  - `client/package-lock.json`

### `71fa089` Spring IO platform 2.0.1

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Spring IO platform 2.0.1
- needs manual prompt: False
- suggested matrix case id: `config_build_71fa089_spring_io_platform_2_0_1`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 71fa089 --prompt "Spring IO platform 2.0.1"`
- first changed files:
  - `pom.xml`

### `729275b` migrating to Spring  Data 1.4.1

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: migrating to Spring Data 1.4.1
- needs manual prompt: False
- suggested matrix case id: `config_build_729275b_migrating_to_spring_data_1_4_1`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 729275b --prompt "migrating to Spring Data 1.4.1"`
- first changed files:
  - `pom.xml`

### `7326267` #90 Remove the json-path version which be inherited from the spring.io BOM

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: #90 Remove the json-path version which be inherited from the spring.io BOM
- needs manual prompt: False
- suggested matrix case id: `config_build_7326267_90_remove_the_json_path_version_which_be_inherited_from_the_spring_io_bom`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 7326267 --prompt "#90 Remove the json-path version which be inherited from the spring.io BOM"`
- first changed files:
  - `pom.xml`

### `74abfb1` migrated to Spring 3.2.5

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: migrated to Spring 3.2.5
- needs manual prompt: False
- suggested matrix case id: `config_build_74abfb1_migrated_to_spring_3_2_5`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 74abfb1 --prompt "migrated to Spring 3.2.5"`
- first changed files:
  - `pom.xml`

### `835f53d` Remove spring-boot dependencies

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Remove spring-boot dependencies
- needs manual prompt: False
- suggested matrix case id: `config_build_835f53d_remove_spring_boot_dependencies`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 835f53d --prompt "Remove spring-boot dependencies"`
- first changed files:
  - `pom.xml`

### `843ce28` Upgrade to Spring IO Platform 2.0.2

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Upgrade to Spring IO Platform 2.0.2
- needs manual prompt: False
- suggested matrix case id: `config_build_843ce28_upgrade_to_spring_io_platform_2_0_2`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 843ce28 --prompt "Upgrade to Spring IO Platform 2.0.2"`
- first changed files:
  - `pom.xml`

### `85a2be1` adding spring boot starter and removing spring-aop

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: adding spring boot starter and removing spring-aop
- needs manual prompt: False
- suggested matrix case id: `config_build_85a2be1_adding_spring_boot_starter_and_removing_spring_aop`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 85a2be1 --prompt "adding spring boot starter and removing spring-aop"`
- first changed files:
  - `pom.xml`

### `8929d37` upgraded to Spring Data 1.7.0

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: upgraded to Spring Data 1.7.0
- needs manual prompt: False
- suggested matrix case id: `config_build_8929d37_upgraded_to_spring_data_1_7_0`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 8929d37 --prompt "upgraded to Spring Data 1.7.0"`
- first changed files:
  - `pom.xml`

### `8a67145` migrated to dandelion 0.9.3

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: migrated to dandelion 0.9.3
- needs manual prompt: False
- suggested matrix case id: `config_build_8a67145_migrated_to_dandelion_0_9_3`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 8a67145 --prompt "migrated to dandelion 0.9.3"`
- first changed files:
  - `pom.xml`

### `8b5d980` Fix #95 migrate to AssertJ 3.2.0

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Fix #95 migrate to AssertJ 3.2.0
- needs manual prompt: False
- suggested matrix case id: `config_build_8b5d980_fix_95_migrate_to_assertj_3_2_0`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 8b5d980 --prompt "Fix #95 migrate to AssertJ 3.2.0"`
- first changed files:
  - `pom.xml`

### `8e3848f` upgraded to latest version of Dandelion

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: upgraded to latest version of Dandelion
- needs manual prompt: False
- suggested matrix case id: `config_build_8e3848f_upgraded_to_latest_version_of_dandelion`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 8e3848f --prompt "upgraded to latest version of Dandelion"`
- first changed files:
  - `pom.xml`

### `8ee6c79` updated lib versions

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: updated lib versions
- needs manual prompt: False
- suggested matrix case id: `config_build_8ee6c79_updated_lib_versions`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 8ee6c79 --prompt "updated lib versions"`
- first changed files:
  - `pom.xml`

### `91b61f4` migrated to joda-time 2.3

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: migrated to joda-time 2.3
- needs manual prompt: False
- suggested matrix case id: `config_build_91b61f4_migrated_to_joda_time_2_3`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 91b61f4 --prompt "migrated to joda-time 2.3"`
- first changed files:
  - `pom.xml`

### `95de1d9` Using Mockito and Hamcrest version from the Spring.IO Platform

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Using Mockito and Hamcrest version from the Spring.IO Platform
- needs manual prompt: False
- suggested matrix case id: `config_build_95de1d9_using_mockito_and_hamcrest_version_from_the_spring_io_platform`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 95de1d9 --prompt "Using Mockito and Hamcrest version from the Spring.IO Platform"`
- first changed files:
  - `pom.xml`

### `9f6814d` updated versions of Spring Data and AspectJ

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: updated versions of Spring Data and AspectJ
- needs manual prompt: False
- suggested matrix case id: `config_build_9f6814d_updated_versions_of_spring_data_and_aspectj`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 9f6814d --prompt "updated versions of Spring Data and AspectJ"`
- first changed files:
  - `pom.xml`

### `a07cf69` Fix #88 upgrading to Hibernate Validator 5.1.3

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Fix #88 upgrading to Hibernate Validator 5.1.3
- needs manual prompt: False
- suggested matrix case id: `config_build_a07cf69_fix_88_upgrading_to_hibernate_validator_5_1_3`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit a07cf69 --prompt "Fix #88 upgrading to Hibernate Validator 5.1.3"`
- first changed files:
  - `pom.xml`

### `a4f18cb` migrating to Hibernate 4.3.3.Final

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: migrating to Hibernate 4.3.3.Final
- needs manual prompt: False
- suggested matrix case id: `config_build_a4f18cb_migrating_to_hibernate_4_3_3_final`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit a4f18cb --prompt "migrating to Hibernate 4.3.3.Final"`
- first changed files:
  - `pom.xml`

### `a595058` removed unused dependency to spring-jms

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: removed unused dependency to spring-jms
- needs manual prompt: False
- suggested matrix case id: `config_build_a595058_removed_unused_dependency_to_spring_jms`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit a595058 --prompt "removed unused dependency to spring-jms"`
- first changed files:
  - `pom.xml`

### `a768e87` fixed ehcache dependency

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: fixed ehcache dependency
- needs manual prompt: False
- suggested matrix case id: `config_build_a768e87_fixed_ehcache_dependency`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit a768e87 --prompt "fixed ehcache dependency"`
- first changed files:
  - `pom.xml`

### `ab5de19` Bump express from 4.18.3 to 4.19.2 in /client

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Bump express from 4.18.3 to 4.19.2 in /client
- needs manual prompt: False
- suggested matrix case id: `config_build_ab5de19_bump_express_from_4_18_3_to_4_19_2_in_client`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit ab5de19 --prompt "Bump express from 4.18.3 to 4.19.2 in /client"`
- first changed files:
  - `client/package-lock.json`

### `bc9682c` #87 Downgrade to AssertJ 2.1.0 in order to build Petclinic with the JDK 7

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: #87 Downgrade to AssertJ 2.1.0 in order to build Petclinic with the JDK 7
- needs manual prompt: False
- suggested matrix case id: `config_build_bc9682c_87_downgrade_to_assertj_2_1_0_in_order_to_build_petclinic_with_the_jdk_7`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit bc9682c --prompt "#87 Downgrade to AssertJ 2.1.0 in order to build Petclinic with the JDK 7"`
- first changed files:
  - `pom.xml`

### `be7acc5` Upgrade Spring IO Platform to 2.0.5

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Upgrade Spring IO Platform to 2.0.5
- needs manual prompt: False
- suggested matrix case id: `config_build_be7acc5_upgrade_spring_io_platform_to_2_0_5`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit be7acc5 --prompt "Upgrade Spring IO Platform to 2.0.5"`
- first changed files:
  - `pom.xml`

### `c8759c4` upgraded version of SLF4J

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: upgraded version of SLF4J
- needs manual prompt: False
- suggested matrix case id: `config_build_c8759c4_upgraded_version_of_slf4j`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit c8759c4 --prompt "upgraded version of SLF4J"`
- first changed files:
  - `pom.xml`

### `e0be3a3` added temporary fix for json-simple

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: added temporary fix for json-simple
- needs manual prompt: False
- suggested matrix case id: `config_build_e0be3a3_added_temporary_fix_for_json_simple`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit e0be3a3 --prompt "added temporary fix for json-simple"`
- first changed files:
  - `pom.xml`

### `e60a64d` Lock down TypeScript to version 2.0.x

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Lock down TypeScript to version 2.0.x
- needs manual prompt: False
- suggested matrix case id: `config_build_e60a64d_lock_down_typescript_to_version_2_0_x`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit e60a64d --prompt "Lock down TypeScript to version 2.0.x"`
- first changed files:
  - `client/package.json`

### `e8c944f` remove version number

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: remove version number
- needs manual prompt: False
- suggested matrix case id: `config_build_e8c944f_remove_version_number`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit e8c944f --prompt "remove version number"`
- first changed files:
  - `pom.xml`

### `ea81fe0` Spring Data JPA: migrated to 1.4.3.RELEASE

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Spring Data JPA: migrated to 1.4.3.RELEASE
- needs manual prompt: False
- suggested matrix case id: `config_build_ea81fe0_spring_data_jpa_migrated_to_1_4_3_release`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit ea81fe0 --prompt "Spring Data JPA: migrated to 1.4.3.RELEASE"`
- first changed files:
  - `pom.xml`

### `ecd9ccb` fixed POM configuration issue for Spring Data

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: fixed POM configuration issue for Spring Data
- needs manual prompt: False
- suggested matrix case id: `config_build_ecd9ccb_fixed_pom_configuration_issue_for_spring_data`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit ecd9ccb --prompt "fixed POM configuration issue for Spring Data"`
- first changed files:
  - `pom.xml`

### `ecefae2` Upgraded to latest Spring Data and AspectJ

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Upgraded to latest Spring Data and AspectJ
- needs manual prompt: False
- suggested matrix case id: `config_build_ecefae2_upgraded_to_latest_spring_data_and_aspectj`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit ecefae2 --prompt "Upgraded to latest Spring Data and AspectJ"`
- first changed files:
  - `pom.xml`

### `ed0ab2a` Use build finalName instead of warName in pom.xml

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Use build finalName instead of warName in pom.xml
- needs manual prompt: False
- suggested matrix case id: `config_build_ed0ab2a_use_build_finalname_instead_of_warname_in_pom_xml`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit ed0ab2a --prompt "Use build finalName instead of warName in pom.xml"`
- first changed files:
  - `pom.xml`

### `eddc72c` Upgrade Spring IO Platform to 2.0.6

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Upgrade Spring IO Platform to 2.0.6
- needs manual prompt: False
- suggested matrix case id: `config_build_eddc72c_upgrade_spring_io_platform_to_2_0_6`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit eddc72c --prompt "Upgrade Spring IO Platform to 2.0.6"`
- first changed files:
  - `pom.xml`

### `f5cf426` upgraded to Joda Time 2.5

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: upgraded to Joda Time 2.5
- needs manual prompt: False
- suggested matrix case id: `config_build_f5cf426_upgraded_to_joda_time_2_5`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit f5cf426 --prompt "upgraded to Joda Time 2.5"`
- first changed files:
  - `pom.xml`

### `f653895` migrating to Dandelion 0.9.1

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: migrating to Dandelion 0.9.1
- needs manual prompt: False
- suggested matrix case id: `config_build_f653895_migrating_to_dandelion_0_9_1`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit f653895 --prompt "migrating to Dandelion 0.9.1"`
- first changed files:
  - `pom.xml`

### `f760aaf` removing unneeded dependency-management block

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: removing unneeded dependency-management block
- needs manual prompt: False
- suggested matrix case id: `config_build_f760aaf_removing_unneeded_dependency_management_block`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit f760aaf --prompt "removing unneeded dependency-management block"`
- first changed files:
  - `pom.xml`

### `f958964` moving to Java 1.8 by default

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: moving to Java 1.8 by default
- needs manual prompt: False
- suggested matrix case id: `config_build_f958964_moving_to_java_1_8_by_default`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit f958964 --prompt "moving to Java 1.8 by default"`
- first changed files:
  - `pom.xml`

### `fd524d0` Centralized framework versions to the properties section

- score: -63
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Centralized framework versions to the properties section
- needs manual prompt: False
- suggested matrix case id: `config_build_fd524d0_centralized_framework_versions_to_the_properties_section`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit fd524d0 --prompt "Centralized framework versions to the properties section"`
- first changed files:
  - `pom.xml`

### `271225c` libs upgrade

- score: -73
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: libs upgrade
- needs manual prompt: False
- suggested matrix case id: `config_build_271225c_libs_upgrade`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 271225c --prompt "libs upgrade"`
- first changed files:
  - `pom.xml`

### `3945cba` Fixing #54

- score: -73
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Fixing #54
- needs manual prompt: False
- suggested matrix case id: `config_build_3945cba_fixing_54`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 3945cba --prompt "Fixing #54"`
- first changed files:
  - `pom.xml`

### `a04d789` versions upgrade.

- score: -73
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: versions upgrade.
- needs manual prompt: False
- suggested matrix case id: `config_build_a04d789_versions_upgrade`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit a04d789 --prompt "versions upgrade."`
- first changed files:
  - `pom.xml`

### `2f3e035` The maven-war-plugin does not failed on missing web.xml

- score: -78
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: The maven-war-plugin does not failed on missing web.xml
- needs manual prompt: False
- suggested matrix case id: `config_build_2f3e035_the_maven_war_plugin_does_not_failed_on_missing_web_xml`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 2f3e035 --prompt "The maven-war-plugin does not failed on missing web.xml"`
- first changed files:
  - `pom.xml`

### `706b139` pom:xml: use <dependencyManagement> to force versions of spring-core, spring-context and spring-beans to 3.2.x. instead of exclusions on spring-data-jpa dependency because Maven sometimes pulls both versions 3.2.x and 3.1.x versions of coring-core, spring-beans and spring-context.

- score: -78
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: pom:xml: use <dependencyManagement> to force versions of spring-core, spring-context and spring-beans to 3.2.x. instead of exclusions on spring-data-jpa dependency because Maven sometimes pulls both versions 3.2.x and 3.1.x versions of coring-core, spring-beans and spring-context.
- needs manual prompt: False
- suggested matrix case id: `config_build_706b139_pom_xml_use_dependencymanagement_to_force_versions_of_spring_core_spring_context`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 706b139 --prompt "pom:xml: use <dependencyManagement> to force versions of spring-core, spring-context and spring-beans to 3.2.x. instead of exclusions on spring-data-jpa dependency because Maven sometimes pulls both versions 3.2.x and 3.1.x versions of coring-core, spring-beans and spring-context."`
- first changed files:
  - `pom.xml`

### `aeec710` Adding Maven config for Cobertura

- score: -78
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Adding Maven config for Cobertura
- needs manual prompt: False
- suggested matrix case id: `config_build_aeec710_adding_maven_config_for_cobertura`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit aeec710 --prompt "Adding Maven config for Cobertura"`
- first changed files:
  - `pom.xml`

### `b265fc8` Adding instruction to fix build on Maven 3.2.x

- score: -78
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Adding instruction to fix build on Maven 3.2.x
- needs manual prompt: False
- suggested matrix case id: `config_build_b265fc8_adding_instruction_to_fix_build_on_maven_3_2_x`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit b265fc8 --prompt "Adding instruction to fix build on Maven 3.2.x"`
- first changed files:
  - `pom.xml`

### `ef4a808` Fix #172 'mvn site' fails with cobertura-maven-plugin version 2.7

- score: -78
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Fix #172 'mvn site' fails with cobertura-maven-plugin version 2.7
- needs manual prompt: False
- suggested matrix case id: `config_build_ef4a808_fix_172_mvn_site_fails_with_cobertura_maven_plugin_version_2_7`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit ef4a808 --prompt "Fix #172 'mvn site' fails with cobertura-maven-plugin version 2.7"`
- first changed files:
  - `pom.xml`

### `f13a436` Disable jest cache for now

- score: -78
- archetype: config_build
- candidate quality: reject
- candidate quality reason: Build/dependency/config-only changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: config_build
- prompt: Disable jest cache for now
- needs manual prompt: False
- suggested matrix case id: `config_build_f13a436_disable_jest_cache_for_now`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit f13a436 --prompt "Disable jest cache for now"`
- first changed files:
  - `client/package.json`


## docs_comments

### `fb64465` Add some javadoc

- score: -5
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: persistence
- prompt: Add some javadoc
- needs manual prompt: False
- suggested matrix case id: `docs_comments_fb64465_add_some_javadoc`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit fb64465 --prompt "Add some javadoc"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetVisitExtractor.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcVisitRowMapper.java`

### `1a6572d` Replace web.xml by PetclinicInitializer

- score: -10
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: docs, other
- prompt: Replace web.xml by PetclinicInitializer
- needs manual prompt: False
- suggested matrix case id: `docs_comments_1a6572d_replace_web_xml_by_petclinicinitializer`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 1a6572d --prompt "Replace web.xml by PetclinicInitializer"`
- first changed files:
  - `readme.md`
  - `src/main/java/org/springframework/samples/petclinic/PetclinicInitializer.java`

### `099b848` Update JDBC file naming in MySQL steup instruction

- score: -25
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs, persistence
- prompt: Update JDBC file naming in MySQL steup instruction
- needs manual prompt: False
- suggested matrix case id: `docs_comments_099b848_update_jdbc_file_naming_in_mysql_steup_instruction`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 099b848 --prompt "Update JDBC file naming in MySQL steup instruction"`
- first changed files:
  - `src/main/resources/db/mysql/petclinic_db_setup_mysql.txt`

### `2270e24` Removal of redundant comments

- score: -25
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: persistence
- prompt: Removal of redundant comments
- needs manual prompt: False
- suggested matrix case id: `docs_comments_2270e24_removal_of_redundant_comments`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 2270e24 --prompt "Removal of redundant comments"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/model/Vets.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/OwnerRepository.java`

### `38a5b28` Improving/fixing comments

- score: -25
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: persistence
- prompt: Improving/fixing comments
- needs manual prompt: False
- suggested matrix case id: `docs_comments_38a5b28_improving_fixing_comments`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 38a5b28 --prompt "Improving/fixing comments"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcOwnerRepositoryImpl.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPet.java`

### `cdc024b` Update README and TODO

- score: -35
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: docs
- prompt: Update README and TODO
- needs manual prompt: False
- suggested matrix case id: `docs_comments_cdc024b_update_readme_and_todo`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit cdc024b --prompt "Update README and TODO"`
- first changed files:
  - `TODO.md`
  - `readme.md`

### `19d7767` #98 Add a contributing section

- score: -40
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: #98 Add a contributing section
- needs manual prompt: False
- suggested matrix case id: `docs_comments_19d7767_98_add_a_contributing_section`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 19d7767 --prompt "#98 Add a contributing section"`
- first changed files:
  - `readme.md`

### `4e75728` Update Travis Build Status

- score: -40
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: Update Travis Build Status
- needs manual prompt: False
- suggested matrix case id: `docs_comments_4e75728_update_travis_build_status`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 4e75728 --prompt "Update Travis Build Status"`
- first changed files:
  - `readme.md`

### `647985c` Add a reference to the Spring Boot branch

- score: -40
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: Add a reference to the Spring Boot branch
- needs manual prompt: False
- suggested matrix case id: `docs_comments_647985c_add_a_reference_to_the_spring_boot_branch`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 647985c --prompt "Add a reference to the Spring Boot branch"`
- first changed files:
  - `readme.md`

### `ca8781b` #129 add travis-ci "build status" badge

- score: -40
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: #129 add travis-ci "build status" badge
- needs manual prompt: False
- suggested matrix case id: `docs_comments_ca8781b_129_add_travis_ci_build_status_badge`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit ca8781b --prompt "#129 add travis-ci \"build status\" badge"`
- first changed files:
  - `readme.md`

### `08d84ed` added comment for welcome file

- score: -45
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: added comment for welcome file
- needs manual prompt: False
- suggested matrix case id: `docs_comments_08d84ed_added_comment_for_welcome_file`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 08d84ed --prompt "added comment for welcome file"`
- first changed files:
  - `src/main/webapp/WEB-INF/web.xml`

### `0fdd150` Removing deprecated javadoc

- score: -45
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: persistence
- prompt: Removing deprecated javadoc
- needs manual prompt: False
- suggested matrix case id: `docs_comments_0fdd150_removing_deprecated_javadoc`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 0fdd150 --prompt "Removing deprecated javadoc"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcVetRepositoryImpl.java`

### `de73bdc` Fixed some typos in comments

- score: -45
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Fixed some typos in comments
- needs manual prompt: False
- suggested matrix case id: `docs_comments_de73bdc_fixed_some_typos_in_comments`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit de73bdc --prompt "Fixed some typos in comments"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/web/PetValidator.java`

### `d485420` Update README

- score: -45
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: docs
- prompt: Update README
- needs manual prompt: False
- suggested matrix case id: `docs_comments_d485420_update_readme`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit d485420 --prompt "Update README"`
- first changed files:
  - `client/README.md`
  - `readme.md`

### `26abfc8` Update TODO

- score: -50
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: Update TODO
- needs manual prompt: False
- suggested matrix case id: `docs_comments_26abfc8_update_todo`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 26abfc8 --prompt "Update TODO"`
- first changed files:
  - `client/TODO.md`

### `87d2d8d` Update TODO

- score: -50
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: Update TODO
- needs manual prompt: False
- suggested matrix case id: `docs_comments_87d2d8d_update_todo`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 87d2d8d --prompt "Update TODO"`
- first changed files:
  - `client/TODO.md`

### `415d78b` #164 Update readme.md with Spring Boot configuration

- score: -55
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: #164 Update readme.md with Spring Boot configuration
- needs manual prompt: False
- suggested matrix case id: `docs_comments_415d78b_164_update_readme_md_with_spring_boot_configuration`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 415d78b --prompt "#164 Update readme.md with Spring Boot configuration"`
- first changed files:
  - `readme.md`

### `4222414` Update readme.md

- score: -55
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: Update readme.md
- needs manual prompt: False
- suggested matrix case id: `docs_comments_4222414_update_readme_md`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 4222414 --prompt "Update readme.md"`
- first changed files:
  - `readme.md`

### `5299ed4` Update readme.md

- score: -55
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: Update readme.md
- needs manual prompt: False
- suggested matrix case id: `docs_comments_5299ed4_update_readme_md`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 5299ed4 --prompt "Update readme.md"`
- first changed files:
  - `readme.md`

### `ae15df1` Update readme.md

- score: -55
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: Update readme.md
- needs manual prompt: False
- suggested matrix case id: `docs_comments_ae15df1_update_readme_md`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit ae15df1 --prompt "Update readme.md"`
- first changed files:
  - `readme.md`

### `1aa9360` fixed a broken link

- score: -60
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: fixed a broken link
- needs manual prompt: False
- suggested matrix case id: `docs_comments_1aa9360_fixed_a_broken_link`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 1aa9360 --prompt "fixed a broken link"`
- first changed files:
  - `readme.md`

### `31df5eb` Petclinic is now deployed to Cloudfoundry v2. Adding a link to it: http://gopetclinic.cfapps.io/

- score: -60
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: Petclinic is now deployed to Cloudfoundry v2. Adding a link to it: http://gopetclinic.cfapps.io/
- needs manual prompt: False
- suggested matrix case id: `docs_comments_31df5eb_petclinic_is_now_deployed_to_cloudfoundry_v2_adding_a_link_to_it_http_gopetclini`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 31df5eb --prompt "Petclinic is now deployed to Cloudfoundry v2. Adding a link to it: http://gopetclinic.cfapps.io/"`
- first changed files:
  - `readme.md`

### `46a0b72` fixed one more broken link

- score: -60
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: fixed one more broken link
- needs manual prompt: False
- suggested matrix case id: `docs_comments_46a0b72_fixed_one_more_broken_link`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 46a0b72 --prompt "fixed one more broken link"`
- first changed files:
  - `readme.md`

### `7304461` fixed the PetClinicApplication.java location

- score: -60
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: fixed the PetClinicApplication.java location
- needs manual prompt: False
- suggested matrix case id: `docs_comments_7304461_fixed_the_petclinicapplication_java_location`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 7304461 --prompt "fixed the PetClinicApplication.java location"`
- first changed files:
  - `readme.md`

### `ad423f5` Change javaconfig branch URL to spring-projects

- score: -60
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: Change javaconfig branch URL to spring-projects
- needs manual prompt: False
- suggested matrix case id: `docs_comments_ad423f5_change_javaconfig_branch_url_to_spring_projects`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit ad423f5 --prompt "Change javaconfig branch URL to spring-projects"`
- first changed files:
  - `readme.md`

### `b32cb10` adding more info about Eclipse validation issue

- score: -60
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: adding more info about Eclipse validation issue
- needs manual prompt: False
- suggested matrix case id: `docs_comments_b32cb10_adding_more_info_about_eclipse_validation_issue`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit b32cb10 --prompt "adding more info about Eclipse validation issue"`
- first changed files:
  - `readme.md`

### `e8ba735` updates on links

- score: -60
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: updates on links
- needs manual prompt: False
- suggested matrix case id: `docs_comments_e8ba735_updates_on_links`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit e8ba735 --prompt "updates on links"`
- first changed files:
  - `readme.md`

### `8b7714c` fixed typo

- score: -70
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: fixed typo
- needs manual prompt: False
- suggested matrix case id: `docs_comments_8b7714c_fixed_typo`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 8b7714c --prompt "fixed typo"`
- first changed files:
  - `readme.md`

### `c39ed81` Fixed typo

- score: -70
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: Fixed typo
- needs manual prompt: False
- suggested matrix case id: `docs_comments_c39ed81_fixed_typo`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit c39ed81 --prompt "Fixed typo"`
- first changed files:
  - `readme.md`

### `19ef3be` adding Java Config to links on github homepage

- score: -75
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: adding Java Config to links on github homepage
- needs manual prompt: False
- suggested matrix case id: `docs_comments_19ef3be_adding_java_config_to_links_on_github_homepage`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 19ef3be --prompt "adding Java Config to links on github homepage"`
- first changed files:
  - `readme.md`

### `546ba6b` minor presentation fix

- score: -75
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: minor presentation fix
- needs manual prompt: False
- suggested matrix case id: `docs_comments_546ba6b_minor_presentation_fix`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 546ba6b --prompt "minor presentation fix"`
- first changed files:
  - `readme.md`

### `597d29c` Fix of how to run Petclinic in readme

- score: -75
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: Fix of how to run Petclinic in readme
- needs manual prompt: False
- suggested matrix case id: `docs_comments_597d29c_fix_of_how_to_run_petclinic_in_readme`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 597d29c --prompt "Fix of how to run Petclinic in readme"`
- first changed files:
  - `readme.md`

### `9a75b8c` fixed broken links in readme

- score: -75
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: fixed broken links in readme
- needs manual prompt: False
- suggested matrix case id: `docs_comments_9a75b8c_fixed_broken_links_in_readme`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 9a75b8c --prompt "fixed broken links in readme"`
- first changed files:
  - `readme.md`

### `b3080cc` Updated instructions to switch into springboot branch

- score: -75
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: Updated instructions to switch into springboot branch
- needs manual prompt: False
- suggested matrix case id: `docs_comments_b3080cc_updated_instructions_to_switch_into_springboot_branch`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit b3080cc --prompt "Updated instructions to switch into springboot branch"`
- first changed files:
  - `readme.md`

### `fba9e78` Updated README with the Dandelion-Datatables configuration file

- score: -75
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: Updated README with the Dandelion-Datatables configuration file
- needs manual prompt: False
- suggested matrix case id: `docs_comments_fba9e78_updated_readme_with_the_dandelion_datatables_configuration_file`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit fba9e78 --prompt "Updated README with the Dandelion-Datatables configuration file"`
- first changed files:
  - `readme.md`

### `8d78f3a` typo

- score: -90
- archetype: docs_comments
- candidate quality: reject
- candidate quality reason: Docs, comments, or Javadoc changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs
- prompt: typo
- needs manual prompt: True
- suggested matrix case id: `docs_comments_8d78f3a_typo`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 8d78f3a --prompt "typo"`
- first changed files:
  - `readme.md`


## full_stack_ui_api

### `49ca65b` Add NewOwnerPage (missing error handling)

- score: 80
- archetype: full_stack_ui_api
- candidate quality: good
- candidate quality reason: Candidate has a useful feature archetype and descriptive prompt.
- prompt quality: high
- prompt quality reason: Subject is descriptive and feature-like.
- included in generated cases: True
- changed files: 11
- categories: backend_api, docs, frontend_ui
- prompt: Add NewOwnerPage (missing error handling)
- needs manual prompt: False
- suggested matrix case id: `full_stack_ui_api_49ca65b_add_newownerpage_missing_error_handling`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 49ca65b --prompt "Add NewOwnerPage (missing error handling)"`
- first changed files:
  - `client/TODO.md`
  - `client/src/components/owners/FindOwnersPage.tsx`
  - `client/src/components/owners/NewOwnerPage.tsx`
  - `client/src/configureRoutes.tsx`
  - `client/src/types/index.ts`
  - `client/src/util/index.tsx`
  - `src/main/java/org/springframework/samples/petclinic/web/api/ApiExceptionHandler.java`
  - `src/main/java/org/springframework/samples/petclinic/web/api/ErrorResource.java`
  - `src/main/java/org/springframework/samples/petclinic/web/api/FieldErrorResource.java`
  - `src/main/java/org/springframework/samples/petclinic/web/api/InvalidRequestException.java`

### `ab702ea` Add VisitsPage

- score: 70
- archetype: full_stack_ui_api
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 5
- categories: backend_api, frontend_ui, persistence
- prompt: Add VisitsPage
- needs manual prompt: False
- suggested matrix case id: `full_stack_ui_api_ab702ea_add_visitspage`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit ab702ea --prompt "Add VisitsPage"`
- first changed files:
  - `client/src/components/visits/PetDetails.tsx`
  - `client/src/components/visits/VisitsPage.tsx`
  - `client/src/configureRoutes.tsx`
  - `src/main/java/org/springframework/samples/petclinic/model/Visit.java`
  - `src/main/java/org/springframework/samples/petclinic/web/api/VisitResource.java`

### `7e3cd50` Add ErrorPage

- score: 70
- archetype: full_stack_ui_api
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 6
- categories: backend_api, frontend_ui
- prompt: Add ErrorPage
- needs manual prompt: False
- suggested matrix case id: `full_stack_ui_api_7e3cd50_add_errorpage`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 7e3cd50 --prompt "Add ErrorPage"`
- first changed files:
  - `client/src/components/App.tsx`
  - `client/src/components/ErrorPage.tsx`
  - `client/src/configureRoutes.tsx`
  - `src/main/java/org/springframework/samples/petclinic/web/api/ApiExceptionHandler.java`
  - `src/main/java/org/springframework/samples/petclinic/web/api/FailingApiController.java`
  - `src/main/java/org/springframework/samples/petclinic/web/api/SuperFatalErrorException.java`

### `4a71885` Add EditOwnerPage

- score: 70
- archetype: full_stack_ui_api
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 11
- categories: backend_api, docs, frontend_ui, persistence
- prompt: Add EditOwnerPage
- needs manual prompt: False
- suggested matrix case id: `full_stack_ui_api_4a71885_add_editownerpage`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 4a71885 --prompt "Add EditOwnerPage"`
- first changed files:
  - `client/TODO.md`
  - `client/src/components/form/Input.tsx`
  - `client/src/components/owners/EditOwnerPage.tsx`
  - `client/src/components/owners/NewOwnerPage.tsx`
  - `client/src/components/owners/OwnerEditor.tsx`
  - `client/src/components/owners/OwnersPage.tsx`
  - `client/src/configureRoutes.tsx`
  - `client/src/types/index.ts`
  - `client/src/util/index.tsx`
  - `src/main/java/org/springframework/samples/petclinic/model/BaseEntity.java`

### `d2017b8` Add FindOwnersPage

- score: 70
- archetype: full_stack_ui_api
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 11
- categories: backend_api, docs, frontend_ui, other
- prompt: Add FindOwnersPage
- needs manual prompt: False
- suggested matrix case id: `full_stack_ui_api_d2017b8_add_findownerspage`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit d2017b8 --prompt "Add FindOwnersPage"`
- first changed files:
  - `client/README.md`
  - `client/TODO.md`
  - `client/src/components/App.tsx`
  - `client/src/components/owners/FindOwnersPage.tsx`
  - `client/src/components/owners/types.ts`
  - `client/src/configureRoutes.tsx`
  - `client/src/middleware/api.ts`
  - `client/src/types/index.ts`
  - `client/src/util/index.tsx`
  - `client/typings.json`

### `3f55127` Add VetsPage

- score: 60
- archetype: full_stack_ui_api
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 8
- categories: backend_api, frontend_ui, persistence, tests
- prompt: Add VetsPage
- needs manual prompt: False
- suggested matrix case id: `full_stack_ui_api_3f55127_add_vetspage`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 3f55127 --prompt "Add VetsPage"`
- first changed files:
  - `client/src/components/App.tsx`
  - `client/src/components/vets/VetsPage.tsx`
  - `client/src/configureRoutes.tsx`
  - `client/src/types/index.ts`
  - `src/main/java/org/springframework/samples/petclinic/model/Vet.java`
  - `src/main/java/org/springframework/samples/petclinic/web/api/VetResource.java`
  - `src/main/java/org/springframework/samples/petclinic/web/api/petclinic.less`
  - `src/test/java/org/springframework/samples/petclinic/web/api/VetResourceTests.java`

### `497fe04` NewPetPage EditPetPage

- score: 50
- archetype: full_stack_ui_api
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 10
- categories: backend_api, docs, frontend_ui
- prompt: NewPetPage EditPetPage
- needs manual prompt: False
- suggested matrix case id: `full_stack_ui_api_497fe04_newpetpage_editpetpage`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 497fe04 --prompt "NewPetPage EditPetPage"`
- first changed files:
  - `client/README.md`
  - `client/src/components/owners/FindOwnersPage.tsx`
  - `client/src/components/pets/EditPetPage.tsx`
  - `client/src/components/pets/LoadingPanel.tsx`
  - `client/src/components/pets/NewPetPage.tsx`
  - `client/src/components/pets/PetEditor.tsx`
  - `client/src/components/pets/createPetEditorModel.tsx`
  - `client/src/configureRoutes.tsx`
  - `src/main/java/org/springframework/samples/petclinic/web/api/PetRequest.java`
  - `src/main/java/org/springframework/samples/petclinic/web/api/PetResource.java`

### `1d96669` Eliminando código desnecessário

- score: 40
- archetype: full_stack_ui_api
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: backend_api, frontend_ui
- prompt: Eliminando código desnecessário
- needs manual prompt: False
- suggested matrix case id: `full_stack_ui_api_1d96669_eliminando_c_digo_desnecess_rio`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 1d96669 --prompt "Eliminando c\u00f3digo desnecess\u00e1rio"`
- first changed files:
  - `client/src/middleware/api.ts`

### `bbd83e0` Eliminando código desnecessário

- score: 40
- archetype: full_stack_ui_api
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: backend_api, frontend_ui
- prompt: Eliminando código desnecessário
- needs manual prompt: False
- suggested matrix case id: `full_stack_ui_api_bbd83e0_eliminando_c_digo_desnecess_rio`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit bbd83e0 --prompt "Eliminando c\u00f3digo desnecess\u00e1rio"`
- first changed files:
  - `client/src/middleware/api.ts`

### `d57fb2b` Eliminando código desnecessário

- score: 40
- archetype: full_stack_ui_api
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: backend_api, frontend_ui
- prompt: Eliminando código desnecessário
- needs manual prompt: False
- suggested matrix case id: `full_stack_ui_api_d57fb2b_eliminando_c_digo_desnecess_rio`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit d57fb2b --prompt "Eliminando c\u00f3digo desnecess\u00e1rio"`
- first changed files:
  - `client/src/middleware/api.ts`

### `ef10999` Eliminando código desnecessário

- score: 40
- archetype: full_stack_ui_api
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: backend_api, frontend_ui
- prompt: Eliminando código desnecessário
- needs manual prompt: False
- suggested matrix case id: `full_stack_ui_api_ef10999_eliminando_c_digo_desnecess_rio`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit ef10999 --prompt "Eliminando c\u00f3digo desnecess\u00e1rio"`
- first changed files:
  - `client/src/middleware/api.ts`


## infra_deployment

### `beb46b2` support switching db init script at deployment

- score: -5
- archetype: infra_deployment
- candidate quality: reject
- candidate quality reason: Deployment or infrastructure changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 5
- categories: other, persistence
- prompt: support switching db init script at deployment
- needs manual prompt: False
- suggested matrix case id: `infra_deployment_beb46b2_support_switching_db_init_script_at_deployment`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit beb46b2 --prompt "support switching db init script at deployment"`
- first changed files:
  - `src/main/resources/application.properties`
  - `src/main/resources/db/hsqldb/data.sql`
  - `src/main/resources/db/hsqldb/schema.sql`
  - `src/main/resources/db/mysql/data.sql`
  - `src/main/resources/db/mysql/schema.sql`

### `b96e109` Add a Dockefile and configure the  docker-maven-plugin

- score: -13
- archetype: infra_deployment
- candidate quality: reject
- candidate quality reason: Deployment or infrastructure changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: config_build, other
- prompt: Add a Dockefile and configure the docker-maven-plugin
- needs manual prompt: False
- suggested matrix case id: `infra_deployment_b96e109_add_a_dockefile_and_configure_the_docker_maven_plugin`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit b96e109 --prompt "Add a Dockefile and configure the docker-maven-plugin"`
- first changed files:
  - `pom.xml`
  - `src/main/docker/Dockerfile`

### `7fe5184` Servlet 3.0, JSP 2.2 and EL 2.2 are the minimum required to deploy Petclinic

- score: -30
- archetype: infra_deployment
- candidate quality: reject
- candidate quality reason: Deployment or infrastructure changes are excluded by default.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: other
- prompt: Servlet 3.0, JSP 2.2 and EL 2.2 are the minimum required to deploy Petclinic
- needs manual prompt: False
- suggested matrix case id: `infra_deployment_7fe5184_servlet_3_0_jsp_2_2_and_el_2_2_are_the_minimum_required_to_deploy_petclinic`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 7fe5184 --prompt "Servlet 3.0, JSP 2.2 and EL 2.2 are the minimum required to deploy Petclinic"`
- first changed files:
  - `src/main/webapp/WEB-INF/web.xml`


## persistence_data

### `c758321` add regex validation for string input

- score: 60
- archetype: persistence_data
- candidate quality: good
- candidate quality reason: Candidate has a useful feature archetype and descriptive prompt.
- prompt quality: high
- prompt quality reason: Subject is descriptive and feature-like.
- included in generated cases: True
- changed files: 1
- categories: persistence
- prompt: add regex validation for string input
- needs manual prompt: False
- suggested matrix case id: `persistence_data_c758321_add_regex_validation_for_string_input`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit c758321 --prompt "add regex validation for string input"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/model/Person.java`

### `e7f6899` owners search has been case insensitive

- score: 60
- archetype: persistence_data
- candidate quality: good
- candidate quality reason: Candidate has a useful feature archetype and descriptive prompt.
- prompt quality: high
- prompt quality reason: Subject is descriptive and feature-like.
- included in generated cases: True
- changed files: 1
- categories: persistence
- prompt: owners search has been case insensitive
- needs manual prompt: False
- suggested matrix case id: `persistence_data_e7f6899_owners_search_has_been_case_insensitive`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit e7f6899 --prompt "owners search has been case insensitive"`
- first changed files:
  - `src/main/resources/db/hsqldb/initDB.sql`

### `91d19d1` #92 Fix column 'visits.id' not found on MySql

- score: 60
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 2
- categories: persistence
- prompt: #92 Fix column 'visits.id' not found on MySql
- needs manual prompt: False
- suggested matrix case id: `persistence_data_91d19d1_92_fix_column_visits_id_not_found_on_mysql`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 91d19d1 --prompt "#92 Fix column 'visits.id' not found on MySql"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcVisitRepositoryImpl.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcVisitRowMapper.java`

### `e00dfb3` Using jodatime LocalDate instead of DateTime for visits

- score: 60
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 2
- categories: persistence
- prompt: Using jodatime LocalDate instead of DateTime for visits
- needs manual prompt: False
- suggested matrix case id: `persistence_data_e00dfb3_using_jodatime_localdate_instead_of_datetime_for_visits`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit e00dfb3 --prompt "Using jodatime LocalDate instead of DateTime for visits"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/model/Visit.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcVisitRowMapper.java`

### `e74b1bc` #141 Configure Unicode and UTF-8 MySQL database for Chinese language

- score: 60
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 2
- categories: other, persistence
- prompt: #141 Configure Unicode and UTF-8 MySQL database for Chinese language
- needs manual prompt: False
- suggested matrix case id: `persistence_data_e74b1bc_141_configure_unicode_and_utf_8_mysql_database_for_chinese_language`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit e74b1bc --prompt "#141 Configure Unicode and UTF-8 MySQL database for Chinese language"`
- first changed files:
  - `src/main/resources/db/mysql/initDB.sql`
  - `src/main/resources/spring/data-access.properties`

### `06be7eb` #92 Use column alias

- score: 60
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 3
- categories: persistence
- prompt: #92 Use column alias
- needs manual prompt: False
- suggested matrix case id: `persistence_data_06be7eb_92_use_column_alias`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 06be7eb --prompt "#92 Use column alias"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcOwnerRepositoryImpl.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcVisitRepositoryImpl.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcVisitRowMapper.java`

### `735fb11` Remove explicit unboxing

- score: 60
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 3
- categories: other, persistence
- prompt: Remove explicit unboxing
- needs manual prompt: False
- suggested matrix case id: `persistence_data_735fb11_remove_explicit_unboxing`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 735fb11 --prompt "Remove explicit unboxing"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetRepositoryImpl.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcVetRepositoryImpl.java`
  - `src/main/java/org/springframework/samples/petclinic/util/EntityUtils.java`

### `cc4ae96` removed deprecated Mapper in Jdbc

- score: 60
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 5
- categories: persistence
- prompt: removed deprecated Mapper in Jdbc
- needs manual prompt: False
- suggested matrix case id: `persistence_data_cc4ae96_removed_deprecated_mapper_in_jdbc`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit cc4ae96 --prompt "removed deprecated Mapper in Jdbc"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcOwnerRepositoryImpl.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetRepositoryImpl.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetRowMapper.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcVetRepositoryImpl.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcVisitRepositoryImpl.java`

### `da38a76` Json formatting of JodaTime properties

- score: 52
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 3
- categories: config_build, other, persistence
- prompt: Json formatting of JodaTime properties
- needs manual prompt: False
- suggested matrix case id: `persistence_data_da38a76_json_formatting_of_jodatime_properties`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit da38a76 --prompt "Json formatting of JodaTime properties"`
- first changed files:
  - `pom.xml`
  - `src/main/java/org/springframework/samples/petclinic/model/Pet.java`
  - `src/main/resources/application.properties`

### `818529b` #64 Remove N+1 select by using the OneToManyResultSetExtractor of Spring Data Core JDBC Extensions

- score: 52
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 6
- categories: config_build, persistence
- prompt: #64 Remove N+1 select by using the OneToManyResultSetExtractor of Spring Data Core JDBC Extensions
- needs manual prompt: False
- suggested matrix case id: `persistence_data_818529b_64_remove_n_1_select_by_using_the_onetomanyresultsetextractor_of_spring_data_cor`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 818529b --prompt "#64 Remove N+1 select by using the OneToManyResultSetExtractor of Spring Data Core JDBC Extensions"`
- first changed files:
  - `pom.xml`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcOwnerRepositoryImpl.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetRowMapper.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetVisitExtractor.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcVisitRepositoryImpl.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcVisitRowMapper.java`

### `8b62561` #87 Petclinic should be compatible with Java 7 for the time being

- score: 52
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 8
- categories: config_build, persistence
- prompt: #87 Petclinic should be compatible with Java 7 for the time being
- needs manual prompt: False
- suggested matrix case id: `persistence_data_8b62561_87_petclinic_should_be_compatible_with_java_7_for_the_time_being`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 8b62561 --prompt "#87 Petclinic should be compatible with Java 7 for the time being"`
- first changed files:
  - `pom.xml`
  - `src/main/java/org/springframework/samples/petclinic/model/Owner.java`
  - `src/main/java/org/springframework/samples/petclinic/model/Pet.java`
  - `src/main/java/org/springframework/samples/petclinic/model/Vet.java`
  - `src/main/java/org/springframework/samples/petclinic/model/Vets.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcOwnerRepositoryImpl.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetRepositoryImpl.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcVetRepositoryImpl.java`

### `4bb829c` Fix #101 display the pet type when using the JDBC profile

- score: 50
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 3
- categories: backend_service, other, persistence, tests
- prompt: Fix #101 display the pet type when using the JDBC profile
- needs manual prompt: False
- suggested matrix case id: `persistence_data_4bb829c_fix_101_display_the_pet_type_when_using_the_jdbc_profile`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 4bb829c --prompt "Fix #101 display the pet type when using the JDBC profile"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcOwnerRepositoryImpl.java`
  - `src/main/java/org/springframework/samples/petclinic/web/PetValidator.java`
  - `src/test/java/org/springframework/samples/petclinic/service/AbstractClinicServiceTests.java`

### `92de655` Fix #111 For pet's birthday we are now using jodatime LocalDate instead of DateTime

- score: 50
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 3
- categories: backend_service, persistence, tests
- prompt: Fix #111 For pet's birthday we are now using jodatime LocalDate instead of DateTime
- needs manual prompt: False
- suggested matrix case id: `persistence_data_92de655_fix_111_for_pet_s_birthday_we_are_now_using_jodatime_localdate_instead_of_dateti`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 92de655 --prompt "Fix #111 For pet's birthday we are now using jodatime LocalDate instead of DateTime"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/model/Pet.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetRowMapper.java`
  - `src/test/java/org/springframework/samples/petclinic/service/AbstractClinicServiceTests.java`

### `ad3d322` Fising squid:S2970, squid:S1192, squid:S1488, squid:UselessParenthesesCheck

- score: 50
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 5
- categories: backend_service, other, persistence, tests
- prompt: Fising squid:S2970, squid:S1192, squid:S1488, squid:UselessParenthesesCheck
- needs manual prompt: False
- suggested matrix case id: `persistence_data_ad3d322_fising_squid_s2970_squid_s1192_squid_s1488_squid_uselessparenthesescheck`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit ad3d322 --prompt "Fising squid:S2970, squid:S1192, squid:S1488, squid:UselessParenthesesCheck"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/model/BaseEntity.java`
  - `src/main/java/org/springframework/samples/petclinic/web/OwnerController.java`
  - `src/main/java/org/springframework/samples/petclinic/web/PetController.java`
  - `src/main/java/org/springframework/samples/petclinic/web/PetValidator.java`
  - `src/test/java/org/springframework/samples/petclinic/service/AbstractClinicServiceTests.java`

### `ca755be` Improvements in VisitRepository.findByPetId implementation.

- score: 50
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 5
- categories: backend_service, persistence, tests
- prompt: Improvements in VisitRepository.findByPetId implementation.
- needs manual prompt: False
- suggested matrix case id: `persistence_data_ca755be_improvements_in_visitrepository_findbypetid_implementation`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit ca755be --prompt "Improvements in VisitRepository.findByPetId implementation."`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcVisitRepositoryImpl.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jpa/JpaVisitRepositoryImpl.java`
  - `src/main/java/org/springframework/samples/petclinic/service/ClinicService.java`
  - `src/main/java/org/springframework/samples/petclinic/service/ClinicServiceImpl.java`
  - `src/test/java/org/springframework/samples/petclinic/service/AbstractClinicServiceTests.java`

### `35a179f` latest versions and imports cleanup

- score: 42
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 4
- categories: backend_service, config_build, persistence, tests
- prompt: latest versions and imports cleanup
- needs manual prompt: False
- suggested matrix case id: `persistence_data_35a179f_latest_versions_and_imports_cleanup`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 35a179f --prompt "latest versions and imports cleanup"`
- first changed files:
  - `pom.xml`
  - `src/main/java/org/springframework/samples/petclinic/model/BaseEntity.java`
  - `src/test/java/org/springframework/samples/petclinic/model/ValidatorTests.java`
  - `src/test/java/org/springframework/samples/petclinic/service/AbstractClinicServiceTests.java`

### `078bdc6` #149 JdbcPetRepositoryImpl:: findById() simplification

- score: 40
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: persistence
- prompt: #149 JdbcPetRepositoryImpl:: findById() simplification
- needs manual prompt: False
- suggested matrix case id: `persistence_data_078bdc6_149_jdbcpetrepositoryimpl_findbyid_simplification`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 078bdc6 --prompt "#149 JdbcPetRepositoryImpl:: findById() simplification"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetRepositoryImpl.java`

### `1a85b44` fix regex validation issue for string input

- score: 40
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: persistence
- prompt: fix regex validation issue for string input
- needs manual prompt: False
- suggested matrix case id: `persistence_data_1a85b44_fix_regex_validation_issue_for_string_input`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 1a85b44 --prompt "fix regex validation issue for string input"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/model/Person.java`

### `4c01d60` removing Serializable because it creates a lot of warnings

- score: 40
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: persistence
- prompt: removing Serializable because it creates a lot of warnings
- needs manual prompt: False
- suggested matrix case id: `persistence_data_4c01d60_removing_serializable_because_it_creates_a_lot_of_warnings`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 4c01d60 --prompt "removing Serializable because it creates a lot of warnings"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/model/BaseEntity.java`

### `5570366` Use a simple RowMapper instead of a BeanPropertyRowMapper

- score: 40
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: persistence
- prompt: Use a simple RowMapper instead of a BeanPropertyRowMapper
- needs manual prompt: False
- suggested matrix case id: `persistence_data_5570366_use_a_simple_rowmapper_instead_of_a_beanpropertyrowmapper`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 5570366 --prompt "Use a simple RowMapper instead of a BeanPropertyRowMapper"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPetRowMapper.java`

### `6f6fa64` Remove unused VisitRepository from constructor

- score: 40
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: persistence
- prompt: Remove unused VisitRepository from constructor
- needs manual prompt: False
- suggested matrix case id: `persistence_data_6f6fa64_remove_unused_visitrepository_from_constructor`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 6f6fa64 --prompt "Remove unused VisitRepository from constructor"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcOwnerRepositoryImpl.java`

### `71f2424` Remove explicit unboxing

- score: 40
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: persistence
- prompt: Remove explicit unboxing
- needs manual prompt: False
- suggested matrix case id: `persistence_data_71f2424_remove_explicit_unboxing`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 71f2424 --prompt "Remove explicit unboxing"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcOwnerRepositoryImpl.java`

### `8d20340` removed unused attribute #64

- score: 40
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: persistence
- prompt: removed unused attribute #64
- needs manual prompt: False
- suggested matrix case id: `persistence_data_8d20340_removed_unused_attribute_64`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 8d20340 --prompt "removed unused attribute #64"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcOwnerRepositoryImpl.java`

### `dc0fb9a` removing unused method #85

- score: 40
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: persistence
- prompt: removing unused method #85
- needs manual prompt: False
- suggested matrix case id: `persistence_data_dc0fb9a_removing_unused_method_85`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit dc0fb9a --prompt "removing unused method #85"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcVisitRepositoryImpl.java`

### `076a124` Fixes #37 with other default locale than english

- score: 30
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: persistence, tests
- prompt: Fixes #37 with other default locale than english
- needs manual prompt: False
- suggested matrix case id: `persistence_data_076a124_fixes_37_with_other_default_locale_than_english`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 076a124 --prompt "Fixes #37 with other default locale than english"`
- first changed files:
  - `src/test/java/org/springframework/samples/petclinic/model/ValidatorTests.java`

### `694390d` migrated assertion to assertJ

- score: 30
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: persistence, tests
- prompt: migrated assertion to assertJ
- needs manual prompt: False
- suggested matrix case id: `persistence_data_694390d_migrated_assertion_to_assertj`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 694390d --prompt "migrated assertion to assertJ"`
- first changed files:
  - `src/test/java/org/springframework/samples/petclinic/model/ValidatorTests.java`

### `74f683a` Fixed typo

- score: 30
- archetype: persistence_data
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: persistence
- prompt: Fixed typo
- needs manual prompt: False
- suggested matrix case id: `persistence_data_74f683a_fixed_typo`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 74f683a --prompt "Fixed typo"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcPet.java`

### `0504ec9` Update petclinic_db_setup_mysql.txt

- score: 5
- archetype: persistence_data
- candidate quality: reject
- candidate quality reason: Prompt quality is too low for an automatic replay benchmark case.
- prompt quality: low
- prompt quality reason: Subject appears to describe a file/config/document update rather than product behavior.
- included in generated cases: False
- changed files: 1
- categories: docs, persistence
- prompt: Update petclinic_db_setup_mysql.txt
- needs manual prompt: False
- suggested matrix case id: `persistence_data_0504ec9_update_petclinic_db_setup_mysql_txt`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 0504ec9 --prompt "Update petclinic_db_setup_mysql.txt"`
- first changed files:
  - `src/main/resources/db/mysql/petclinic_db_setup_mysql.txt`

### `e50583f` Update BaseEntity.java

- score: 5
- archetype: persistence_data
- candidate quality: reject
- candidate quality reason: Prompt quality is too low for an automatic replay benchmark case.
- prompt quality: low
- prompt quality reason: Subject appears to describe a file/config/document update rather than product behavior.
- included in generated cases: False
- changed files: 1
- categories: persistence
- prompt: Update BaseEntity.java
- needs manual prompt: False
- suggested matrix case id: `persistence_data_e50583f_update_baseentity_java`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit e50583f --prompt "Update BaseEntity.java"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/model/BaseEntity.java`

### `5c9ab6b` test methods:used should/shouldNot

- score: -20
- archetype: persistence_data
- candidate quality: reject
- candidate quality reason: Prompt quality is too low for an automatic replay benchmark case.
- prompt quality: low
- prompt quality reason: Subject focuses on tests, docs, comments, or build tooling.
- included in generated cases: False
- changed files: 7
- categories: backend_service, other, persistence, tests
- prompt: test methods:used should/shouldNot
- needs manual prompt: False
- suggested matrix case id: `persistence_data_5c9ab6b_test_methods_used_should_shouldnot`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 5c9ab6b --prompt "test methods:used should/shouldNot"`
- first changed files:
  - `sonar-project.properties`
  - `src/main/java/org/springframework/samples/petclinic/model/PetType.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/jdbc/JdbcVetRepositoryImpl.java`
  - `src/main/java/org/springframework/samples/petclinic/service/ClinicService.java`
  - `src/test/java/org/springframework/samples/petclinic/model/ValidatorTests.java`
  - `src/test/java/org/springframework/samples/petclinic/service/AbstractClinicServiceTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/VisitsViewTests.java`

### `23824f2` Integrate Resource classes from 'angularjs' branch. Tests not working yet.

- score: -20
- archetype: persistence_data
- candidate quality: reject
- candidate quality reason: Prompt quality is too low for an automatic replay benchmark case.
- prompt quality: low
- prompt quality reason: Subject focuses on tests, docs, comments, or build tooling.
- included in generated cases: False
- changed files: 8
- categories: other, persistence, tests
- prompt: Integrate Resource classes from 'angularjs' branch. Tests not working yet.
- needs manual prompt: False
- suggested matrix case id: `persistence_data_23824f2_integrate_resource_classes_from_angularjs_branch_tests_not_working_yet`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 23824f2 --prompt "Integrate Resource classes from 'angularjs' branch. Tests not working yet."`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/model/Pet.java`
  - `src/main/java/org/springframework/samples/petclinic/model/Visit.java`
  - `src/main/java/org/springframework/samples/petclinic/web/OwnerResource.java`
  - `src/main/java/org/springframework/samples/petclinic/web/PetResource.java`
  - `src/main/java/org/springframework/samples/petclinic/web/VetResource.java`
  - `src/test/java/org/springframework/samples/petclinic/web/AbstractWebResourceTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/PetResourceTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/VetResourceTests.java`

### `1dfc3b7` Migrated test assertions to AssertJ

- score: -28
- archetype: persistence_data
- candidate quality: reject
- candidate quality reason: Prompt quality is too low for an automatic replay benchmark case.
- prompt quality: low
- prompt quality reason: Subject focuses on tests, docs, comments, or build tooling.
- included in generated cases: False
- changed files: 4
- categories: backend_service, config_build, persistence, tests
- prompt: Migrated test assertions to AssertJ
- needs manual prompt: False
- suggested matrix case id: `persistence_data_1dfc3b7_migrated_test_assertions_to_assertj`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 1dfc3b7 --prompt "Migrated test assertions to AssertJ"`
- first changed files:
  - `pom.xml`
  - `src/test/java/org/springframework/samples/petclinic/model/ValidatorTests.java`
  - `src/test/java/org/springframework/samples/petclinic/service/AbstractClinicServiceTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/VisitsViewTests.java`


## refactor_move

### `202ddf7` Move Resources to /api/* endpoint

- score: 10
- archetype: refactor_move
- candidate quality: reject
- candidate quality reason: Package moves and refactors are not feature-planning replay cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 3
- categories: backend_api
- prompt: Move Resources to /api/* endpoint
- needs manual prompt: False
- suggested matrix case id: `refactor_move_202ddf7_move_resources_to_api_endpoint`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 202ddf7 --prompt "Move Resources to /api/* endpoint"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/web/api/AbstractResourceController.java`
  - `src/main/java/org/springframework/samples/petclinic/web/api/OwnerResource.java`
  - `src/main/java/org/springframework/samples/petclinic/web/api/PetResource.java`

### `bf56f15` Move Resource RestController to web.api package

- score: 0
- archetype: refactor_move
- candidate quality: reject
- candidate quality reason: Package moves and refactors are not feature-planning replay cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 5
- categories: backend_api, tests
- prompt: Move Resource RestController to web.api package
- needs manual prompt: False
- suggested matrix case id: `refactor_move_bf56f15_move_resource_restcontroller_to_web_api_package`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit bf56f15 --prompt "Move Resource RestController to web.api package"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/web/api/OwnerResource.java`
  - `src/main/java/org/springframework/samples/petclinic/web/api/PetResource.java`
  - `src/test/java/org/springframework/samples/petclinic/web/api/AbstractWebResourceTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/api/PetResourceTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/api/VetResourceTests.java`

### `49c39b6` renamed headTag.jsp -> staticFiles.jsp

- score: -10
- archetype: refactor_move
- candidate quality: reject
- candidate quality reason: Package moves and refactors are not feature-planning replay cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 10
- categories: other
- prompt: renamed headTag.jsp -> staticFiles.jsp
- needs manual prompt: False
- suggested matrix case id: `refactor_move_49c39b6_renamed_headtag_jsp_staticfiles_jsp`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 49c39b6 --prompt "renamed headTag.jsp -> staticFiles.jsp"`
- first changed files:
  - `src/main/webapp/WEB-INF/jsp/exception.jsp`
  - `src/main/webapp/WEB-INF/jsp/fragments/staticFiles.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/createOrUpdateOwnerForm.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/findOwners.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/ownerDetails.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/ownersList.jsp`
  - `src/main/webapp/WEB-INF/jsp/pets/createOrUpdatePetForm.jsp`
  - `src/main/webapp/WEB-INF/jsp/pets/createOrUpdateVisitForm.jsp`
  - `src/main/webapp/WEB-INF/jsp/vets/vetList.jsp`
  - `src/main/webapp/WEB-INF/jsp/welcome.jsp`

### `3bcf845` #77 move Session scope attributes to the request scope instead

- score: -10
- archetype: refactor_move
- candidate quality: reject
- candidate quality reason: Package moves and refactors are not feature-planning replay cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 12
- categories: other
- prompt: #77 move Session scope attributes to the request scope instead
- needs manual prompt: False
- suggested matrix case id: `refactor_move_3bcf845_77_move_session_scope_attributes_to_the_request_scope_instead`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 3bcf845 --prompt "#77 move Session scope attributes to the request scope instead"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/web/OwnerController.java`
  - `src/main/java/org/springframework/samples/petclinic/web/PetController.java`
  - `src/main/java/org/springframework/samples/petclinic/web/PetValidator.java`
  - `src/main/webapp/WEB-INF/jsp/exception.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/createOrUpdateOwnerForm.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/findOwners.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/ownerDetails.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/ownersList.jsp`
  - `src/main/webapp/WEB-INF/jsp/pets/createOrUpdatePetForm.jsp`
  - `src/main/webapp/WEB-INF/jsp/pets/createOrUpdateVisitForm.jsp`

### `1d8e94e` Add prod build, make Api-URL configurable in webpack

- score: -13
- archetype: refactor_move
- candidate quality: reject
- candidate quality reason: Package moves and refactors are not feature-planning replay cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 5
- categories: config_build, frontend_ui, other
- prompt: Add prod build, make Api-URL configurable in webpack
- needs manual prompt: False
- suggested matrix case id: `refactor_move_1d8e94e_add_prod_build_make_api_url_configurable_in_webpack`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 1d8e94e --prompt "Add prod build, make Api-URL configurable in webpack"`
- first changed files:
  - `.travis.yml`
  - `client/package.json`
  - `client/src/util/index.tsx`
  - `client/webpack.config.js`
  - `client/webpack.config.prod.js`

### `52394f5` Add NewPetPage (WIP)

- score: -13
- archetype: refactor_move
- candidate quality: reject
- candidate quality reason: Package moves and refactors are not feature-planning replay cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 22
- categories: backend_api, config_build, docs, frontend_ui, other
- prompt: Add NewPetPage (WIP)
- needs manual prompt: False
- suggested matrix case id: `refactor_move_52394f5_add_newpetpage_wip`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 52394f5 --prompt "Add NewPetPage (WIP)"`
- first changed files:
  - `client/TODO.md`
  - `client/package.json`
  - `client/src/components/form/Constraints.ts`
  - `client/src/components/form/DateInput.tsx`
  - `client/src/components/form/Input.tsx`
  - `client/src/components/form/SelectInput.tsx`
  - `client/src/components/owners/OwnerEditor.tsx`
  - `client/src/components/pets/NewPetPage.tsx`
  - `client/src/configureRoutes.tsx`
  - `client/src/react-datepicker.d.ts`

### `9cf1612` Build styles with regular build

- score: -18
- archetype: refactor_move
- candidate quality: reject
- candidate quality reason: Package moves and refactors are not feature-planning replay cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 6
- categories: config_build, docs, frontend_public, frontend_ui, other
- prompt: Build styles with regular build
- needs manual prompt: False
- suggested matrix case id: `refactor_move_9cf1612_build_styles_with_regular_build`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 9cf1612 --prompt "Build styles with regular build"`
- first changed files:
  - `client/README.md`
  - `client/TODO.md`
  - `client/package.json`
  - `client/public/index.html`
  - `client/src/main.tsx`
  - `client/webpack.config.js`

### `fc97211` Add Jest, Enzyme and first Test Case

- score: -23
- archetype: refactor_move
- candidate quality: reject
- candidate quality reason: Package moves and refactors are not feature-planning replay cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 4
- categories: config_build, frontend_ui, tests
- prompt: Add Jest, Enzyme and first Test Case
- needs manual prompt: False
- suggested matrix case id: `refactor_move_fc97211_add_jest_enzyme_and_first_test_case`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit fc97211 --prompt "Add Jest, Enzyme and first Test Case"`
- first changed files:
  - `client/package.json`
  - `client/src/__tests__/fetch-mock.js`
  - `client/src/__tests__/util.test.tsx`
  - `client/src/util/index.tsx`

### `8ab5975` Add more tests

- score: -23
- archetype: refactor_move
- candidate quality: reject
- candidate quality reason: Package moves and refactors are not feature-planning replay cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 6
- categories: config_build, frontend_ui, other, tests
- prompt: Add more tests
- needs manual prompt: False
- suggested matrix case id: `refactor_move_8ab5975_add_more_tests`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 8ab5975 --prompt "Add more tests"`
- first changed files:
  - `client/package.json`
  - `client/src/__tests__/util.test.tsx`
  - `client/src/components/form/Input.tsx`
  - `client/src/components/form/__tests__/Constraints.test.tsx`
  - `client/src/components/form/__tests__/Input.test.tsx`
  - `client/tsconfig.json`

### `1341c12` update db_readme.txt to reflect properties rename

- score: -25
- archetype: refactor_move
- candidate quality: reject
- candidate quality reason: Package moves and refactors are not feature-planning replay cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: docs, persistence
- prompt: update db_readme.txt to reflect properties rename
- needs manual prompt: False
- suggested matrix case id: `refactor_move_1341c12_update_db_readme_txt_to_reflect_properties_rename`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 1341c12 --prompt "update db_readme.txt to reflect properties rename"`
- first changed files:
  - `src/main/resources/db_readme.txt`

### `e5b7f58` Rename project

- score: -28
- archetype: refactor_move
- candidate quality: reject
- candidate quality reason: Package moves and refactors are not feature-planning replay cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 3
- categories: config_build, other
- prompt: Rename project
- needs manual prompt: False
- suggested matrix case id: `refactor_move_e5b7f58_rename_project`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit e5b7f58 --prompt "Rename project"`
- first changed files:
  - `Run PetClinicApplication.launch`
  - `client/package.json`
  - `pom.xml`

### `06b95f4` Make both app and tests compile now. For tests, Node 6.9 needed

- score: -43
- archetype: refactor_move
- candidate quality: reject
- candidate quality reason: Package moves and refactors are not feature-planning replay cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 8
- categories: config_build, frontend_ui, other, tests
- prompt: Make both app and tests compile now. For tests, Node 6.9 needed
- needs manual prompt: False
- suggested matrix case id: `refactor_move_06b95f4_make_both_app_and_tests_compile_now_for_tests_node_6_9_needed`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 06b95f4 --prompt "Make both app and tests compile now. For tests, Node 6.9 needed"`
- first changed files:
  - `client/package.json`
  - `client/src/components/form/SelectInput.tsx`
  - `client/tests/__tests__/fetch-mock.js`
  - `client/tests/__tests__/util.test.tsx`
  - `client/tests/components/form/__tests__/Constraints.test.tsx`
  - `client/tests/components/form/__tests__/Input.test.tsx`
  - `client/tsconfig.json`
  - `client/typings.json`


## reject

### `4c72246` Update vetsXml test using xpath

- score: -15
- archetype: reject
- candidate quality: reject
- candidate quality reason: Candidate does not match a useful product-feature archetype.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: other, tests
- prompt: Update vetsXml test using xpath
- needs manual prompt: False
- suggested matrix case id: `reject_4c72246_update_vetsxml_test_using_xpath`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 4c72246 --prompt "Update vetsXml test using xpath"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/web/VetController.java`
  - `src/test/java/org/springframework/samples/petclinic/web/VetControllerTests.java`

### `4c859ed` minor update on comment

- score: -23
- archetype: reject
- candidate quality: reject
- candidate quality reason: Candidate does not match a useful product-feature archetype.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: config_build, tests
- prompt: minor update on comment
- needs manual prompt: False
- suggested matrix case id: `reject_4c859ed_minor_update_on_comment`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 4c859ed --prompt "minor update on comment"`
- first changed files:
  - `pom.xml`
  - `src/test/java/org/springframework/samples/petclinic/web/VetControllerTests.java`

### `35a94ea` migrating to Spring 4.0.2

- score: -28
- archetype: reject
- candidate quality: reject
- candidate quality reason: Candidate does not match a useful product-feature archetype.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 2
- categories: config_build, tests
- prompt: migrating to Spring 4.0.2
- needs manual prompt: False
- suggested matrix case id: `reject_35a94ea_migrating_to_spring_4_0_2`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 35a94ea --prompt "migrating to Spring 4.0.2"`
- first changed files:
  - `pom.xml`
  - `src/main/java/test.html`

### `077f4eb` simplify content negotiation setup

- score: -28
- archetype: reject
- candidate quality: reject
- candidate quality reason: Candidate does not match a useful product-feature archetype.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 4
- categories: config_build, other, tests
- prompt: simplify content negotiation setup
- needs manual prompt: False
- suggested matrix case id: `reject_077f4eb_simplify_content_negotiation_setup`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 077f4eb --prompt "simplify content negotiation setup"`
- first changed files:
  - `pom.xml`
  - `src/main/java/org/springframework/samples/petclinic/PetClinicApplication.java`
  - `src/main/java/org/springframework/samples/petclinic/web/VetController.java`
  - `src/test/java/org/springframework/samples/petclinic/web/VetControllerTests.java`

### `80c1d24` Removed RSS/rome and added JSon

- score: -28
- archetype: reject
- candidate quality: reject
- candidate quality reason: Candidate does not match a useful product-feature archetype.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 5
- categories: config_build, other, tests
- prompt: Removed RSS/rome and added JSon
- needs manual prompt: False
- suggested matrix case id: `reject_80c1d24_removed_rss_rome_and_added_json`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 80c1d24 --prompt "Removed RSS/rome and added JSon"`
- first changed files:
  - `pom.xml`
  - `src/main/java/org/springframework/samples/petclinic/web/VetController.java`
  - `src/main/resources/spring/mvc-view-config.xml`
  - `src/main/webapp/WEB-INF/jsp/vets/vetList.jsp`
  - `src/test/java/org/springframework/samples/petclinic/web/VetControllerTest.java`

### `540d31e` moving from Webjars to Bower #83

- score: -28
- archetype: reject
- candidate quality: reject
- candidate quality reason: Candidate does not match a useful product-feature archetype.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 6
- categories: config_build, other, tests
- prompt: moving from Webjars to Bower #83
- needs manual prompt: False
- suggested matrix case id: `reject_540d31e_moving_from_webjars_to_bower_83`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 540d31e --prompt "moving from Webjars to Bower #83"`
- first changed files:
  - `.bowerrc`
  - `bower.json`
  - `pom.xml`
  - `src/main/resources/spring/mvc-core-config.xml`
  - `src/main/webapp/WEB-INF/jsp/fragments/staticFiles.jsp`
  - `src/test/jmeter/petclinic_test_plan.jmx`

### `4da41db` #164 Disable cache configuration for unit tests

- score: -35
- archetype: reject
- candidate quality: reject
- candidate quality reason: Candidate does not match a useful product-feature archetype.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 7
- categories: other, tests
- prompt: #164 Disable cache configuration for unit tests
- needs manual prompt: False
- suggested matrix case id: `reject_4da41db_164_disable_cache_configuration_for_unit_tests`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 4da41db --prompt "#164 Disable cache configuration for unit tests"`
- first changed files:
  - `src/main/java/org/springframework/samples/petclinic/PetClinicApplication.java`
  - `src/main/java/org/springframework/samples/petclinic/config/CacheConfig.java`
  - `src/main/resources/application.properties`
  - `src/test/java/org/springframework/samples/petclinic/web/OwnerControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/PetControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/VetControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/VisitControllerTests.java`

### `845d31e` Added test class for Controllers plus a test for PetTypeFormatter

- score: -43
- archetype: reject
- candidate quality: reject
- candidate quality reason: Candidate does not match a useful product-feature archetype.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 7
- categories: config_build, tests
- prompt: Added test class for Controllers plus a test for PetTypeFormatter
- needs manual prompt: False
- suggested matrix case id: `reject_845d31e_added_test_class_for_controllers_plus_a_test_for_pettypeformatter`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 845d31e --prompt "Added test class for Controllers plus a test for PetTypeFormatter"`
- first changed files:
  - `pom.xml`
  - `src/test/java/org/springframework/samples/petclinic/web/CrashControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/OwnerControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/PetControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/PetTypeFormatterTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/VetControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/VisitControllerTests.java`

### `8645807` Remove unused properties

- score: -45
- archetype: reject
- candidate quality: reject
- candidate quality reason: Test-only changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 4
- categories: tests
- prompt: Remove unused properties
- needs manual prompt: False
- suggested matrix case id: `reject_8645807_remove_unused_properties`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 8645807 --prompt "Remove unused properties"`
- first changed files:
  - `src/test/java/org/springframework/samples/petclinic/web/OwnerControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/PetControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/VetControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/VisitControllerTests.java`

### `50f46fd` Remove outdated HTML files

- score: -55
- archetype: reject
- candidate quality: reject
- candidate quality reason: Candidate does not match a useful product-feature archetype.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 0
- categories: -
- prompt: Remove outdated HTML files
- needs manual prompt: False
- suggested matrix case id: `reject_50f46fd_remove_outdated_html_files`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 50f46fd --prompt "Remove outdated HTML files"`
- first changed files:
  - -

### `6638099` Eliminando arquivo desnecessário

- score: -55
- archetype: reject
- candidate quality: reject
- candidate quality reason: Candidate does not match a useful product-feature archetype.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 0
- categories: -
- prompt: Eliminando arquivo desnecessário
- needs manual prompt: False
- suggested matrix case id: `reject_6638099_eliminando_arquivo_desnecess_rio`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 6638099 --prompt "Eliminando arquivo desnecess\u00e1rio"`
- first changed files:
  - -

### `620141d` Convert Controler's integration test to unit test

- score: -60
- archetype: reject
- candidate quality: reject
- candidate quality reason: Test-only changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 4
- categories: tests
- prompt: Convert Controler's integration test to unit test
- needs manual prompt: False
- suggested matrix case id: `reject_620141d_convert_controler_s_integration_test_to_unit_test`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 620141d --prompt "Convert Controler's integration test to unit test"`
- first changed files:
  - `src/test/java/org/springframework/samples/petclinic/web/OwnerControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/PetControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/VetControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/VisitControllerTests.java`

### `e525415` Convert Controler's integration test to unit test

- score: -60
- archetype: reject
- candidate quality: reject
- candidate quality reason: Test-only changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 6
- categories: tests
- prompt: Convert Controler's integration test to unit test
- needs manual prompt: False
- suggested matrix case id: `reject_e525415_convert_controler_s_integration_test_to_unit_test`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit e525415 --prompt "Convert Controler's integration test to unit test"`
- first changed files:
  - `src/test/java/org/springframework/samples/petclinic/web/CrashControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/OwnerControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/PetControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/VetControllerTests.java`
  - `src/test/java/org/springframework/samples/petclinic/web/VisitControllerTests.java`
  - `src/test/resources/spring/mvc-test-config.xml`

### `04d0e2d` Eliminando código desnecessário

- score: -65
- archetype: reject
- candidate quality: reject
- candidate quality reason: Test-only changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: tests
- prompt: Eliminando código desnecessário
- needs manual prompt: False
- suggested matrix case id: `reject_04d0e2d_eliminando_c_digo_desnecess_rio`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 04d0e2d --prompt "Eliminando c\u00f3digo desnecess\u00e1rio"`
- first changed files:
  - `client/tests/__tests__/fetch-mock.js`

### `5e11b4b` JMeter script from Julien Dubois

- score: -65
- archetype: reject
- candidate quality: reject
- candidate quality reason: Test-only changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: tests
- prompt: JMeter script from Julien Dubois
- needs manual prompt: False
- suggested matrix case id: `reject_5e11b4b_jmeter_script_from_julien_dubois`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 5e11b4b --prompt "JMeter script from Julien Dubois"`
- first changed files:
  - `src/test/jmeter/petclinic_test_plan.jmx`

### `6a94d7e` Remove uncessary _method=put parameter and enable the "POST new visit" HTTP request

- score: -65
- archetype: reject
- candidate quality: reject
- candidate quality reason: Test-only changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: tests
- prompt: Remove uncessary _method=put parameter and enable the "POST new visit" HTTP request
- needs manual prompt: False
- suggested matrix case id: `reject_6a94d7e_remove_uncessary_method_put_parameter_and_enable_the_post_new_visit_http_request`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 6a94d7e --prompt "Remove uncessary _method=put parameter and enable the \"POST new visit\" HTTP request"`
- first changed files:
  - `src/test/jmeter/petclinic_test_plan.jmx`

### `7080682` workaround because there seems to be a conflict

- score: -65
- archetype: reject
- candidate quality: reject
- candidate quality reason: Test-only changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: tests
- prompt: workaround because there seems to be a conflict
- needs manual prompt: False
- suggested matrix case id: `reject_7080682_workaround_because_there_seems_to_be_a_conflict`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 7080682 --prompt "workaround because there seems to be a conflict"`
- first changed files:
  - `src/test/java/org/springframework/samples/petclinic/web/VisitsViewTests.java`

### `98d9bbb` Removing reference to the unknown UserResource class

- score: -65
- archetype: reject
- candidate quality: reject
- candidate quality reason: Test-only changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: tests
- prompt: Removing reference to the unknown UserResource class
- needs manual prompt: False
- suggested matrix case id: `reject_98d9bbb_removing_reference_to_the_unknown_userresource_class`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 98d9bbb --prompt "Removing reference to the unknown UserResource class"`
- first changed files:
  - `src/test/java/org/springframework/samples/petclinic/web/VetControllerTests.java`

### `ca3bb07` Remove unused WebApplicationContext property

- score: -65
- archetype: reject
- candidate quality: reject
- candidate quality reason: Test-only changes are not product-feature planning cases.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1
- categories: tests
- prompt: Remove unused WebApplicationContext property
- needs manual prompt: False
- suggested matrix case id: `reject_ca3bb07_remove_unused_webapplicationcontext_property`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit ca3bb07 --prompt "Remove unused WebApplicationContext property"`
- first changed files:
  - `src/test/java/org/springframework/samples/petclinic/web/VetControllerTests.java`

### `9914056` removing test that causes lots if issues

- score: -70
- archetype: reject
- candidate quality: reject
- candidate quality reason: Candidate does not match a useful product-feature archetype.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 0
- categories: -
- prompt: removing test that causes lots if issues
- needs manual prompt: False
- suggested matrix case id: `reject_9914056_removing_test_that_causes_lots_if_issues`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 9914056 --prompt "removing test that causes lots if issues"`
- first changed files:
  - -

### `7dcf82a` Fix #78 Migrate to Bootstrap 3.x

- score: -98
- archetype: reject
- candidate quality: reject
- candidate quality reason: Commit changes too many files for a focused replay case.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 37
- categories: config_build, other
- prompt: Fix #78 Migrate to Bootstrap 3.x
- needs manual prompt: True
- suggested matrix case id: `reject_7dcf82a_fix_78_migrate_to_bootstrap_3_x`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 7dcf82a --prompt "Fix #78 Migrate to Bootstrap 3.x"`
- first changed files:
  - `.travis.yml`
  - `bower.json`
  - `pom.xml`
  - `src/main/resources/spring/mvc-core-config.xml`
  - `src/main/webapp/WEB-INF/jsp/exception.jsp`
  - `src/main/webapp/WEB-INF/jsp/fragments/footer.jsp`
  - `src/main/webapp/WEB-INF/jsp/fragments/htmlHeader.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/createOrUpdateOwnerForm.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/findOwners.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/ownerDetails.jsp`

### `7f0abc4` Initial import client code

- score: -98
- archetype: reject
- candidate quality: reject
- candidate quality reason: Commit changes too many files for a focused replay case.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 40
- categories: backend_api, config_build, docs, frontend_public, frontend_ui, other
- prompt: Initial import client code
- needs manual prompt: True
- suggested matrix case id: `reject_7f0abc4_initial_import_client_code`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 7f0abc4 --prompt "Initial import client code"`
- first changed files:
  - `client/.babelrc`
  - `client/.gitignore`
  - `client/.vscode/settings.json`
  - `client/README.md`
  - `client/package.json`
  - `client/public/index.html`
  - `client/run.sh`
  - `client/server.js`
  - `client/src/Root.tsx`
  - `client/src/components/App.tsx`

### `34e699f` Remove JSP pages and static resources from the Spring Boot backend

- score: -98
- archetype: reject
- candidate quality: reject
- candidate quality reason: Commit changes too many files for a focused replay case.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 75
- categories: config_build, docs, other
- prompt: Remove JSP pages and static resources from the Spring Boot backend
- needs manual prompt: True
- suggested matrix case id: `reject_34e699f_remove_jsp_pages_and_static_resources_from_the_spring_boot_backend`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 34e699f --prompt "Remove JSP pages and static resources from the Spring Boot backend"`
- first changed files:
  - `TODO.md`
  - `pom.xml`
  - `src/main/docker/Dockerfile`
  - `src/main/java/org/springframework/samples/petclinic/PetClinicApplication.java`
  - `src/main/webapp/resources/generated/META-INF/resources/webjars/bootstrap/3.3.6/less/alerts.less`
  - `src/main/webapp/resources/generated/META-INF/resources/webjars/bootstrap/3.3.6/less/badges.less`
  - `src/main/webapp/resources/generated/META-INF/resources/webjars/bootstrap/3.3.6/less/bootstrap.less`
  - `src/main/webapp/resources/generated/META-INF/resources/webjars/bootstrap/3.3.6/less/breadcrumbs.less`
  - `src/main/webapp/resources/generated/META-INF/resources/webjars/bootstrap/3.3.6/less/button-groups.less`
  - `src/main/webapp/resources/generated/META-INF/resources/webjars/bootstrap/3.3.6/less/buttons.less`

### `44b591f` Using Spring Boot Dataflow UI graphic theme

- score: -98
- archetype: reject
- candidate quality: reject
- candidate quality reason: Commit changes too many files for a focused replay case.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 105
- categories: config_build, other
- prompt: Using Spring Boot Dataflow UI graphic theme
- needs manual prompt: True
- suggested matrix case id: `reject_44b591f_using_spring_boot_dataflow_ui_graphic_theme`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 44b591f --prompt "Using Spring Boot Dataflow UI graphic theme"`
- first changed files:
  - `pom.xml`
  - `src/main/webapp/WEB-INF/jsp/exception.jsp`
  - `src/main/webapp/WEB-INF/jsp/fragments/footer.jsp`
  - `src/main/webapp/WEB-INF/jsp/fragments/htmlHeader.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/createOrUpdateOwnerForm.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/findOwners.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/ownerDetails.jsp`
  - `src/main/webapp/WEB-INF/jsp/owners/ownersList.jsp`
  - `src/main/webapp/WEB-INF/jsp/pets/createOrUpdatePetForm.jsp`
  - `src/main/webapp/WEB-INF/jsp/pets/createOrUpdateVisitForm.jsp`

### `c65cfb6` moving from Webjars to Bower #83: renaming bower_components to vendor, update readme.md

- score: -103
- archetype: reject
- candidate quality: reject
- candidate quality reason: Commit changes too many files for a focused replay case.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 1082
- categories: config_build, docs, other, persistence, tests
- prompt: moving from Webjars to Bower #83: renaming bower_components to vendor, update readme.md
- needs manual prompt: True
- suggested matrix case id: `reject_c65cfb6_moving_from_webjars_to_bower_83_renaming_bower_components_to_vendor_update_readm`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit c65cfb6 --prompt "moving from Webjars to Bower #83: renaming bower_components to vendor, update readme.md"`
- first changed files:
  - `.bowerrc`
  - `readme.md`
  - `src/main/resources/spring/mvc-core-config.xml`
  - `src/main/webapp/WEB-INF/jsp/fragments/staticFiles.jsp`
  - `src/main/webapp/vendors/bootstrap/.bower.json`
  - `src/main/webapp/vendors/bootstrap/.gitignore`
  - `src/main/webapp/vendors/bootstrap/.travis.yml`
  - `src/main/webapp/vendors/bootstrap/CHANGELOG.md`
  - `src/main/webapp/vendors/bootstrap/CONTRIBUTING.md`
  - `src/main/webapp/vendors/bootstrap/LICENSE`

### `a6e81a5` #164 Spring Boot version of Petclinic ready to deploy to an external web container (ie Tomcat)

- score: -108
- archetype: reject
- candidate quality: reject
- candidate quality reason: Commit changes too many files for a focused replay case.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 35
- categories: backend_service, config_build, docs, other, persistence, tests
- prompt: #164 Spring Boot version of Petclinic ready to deploy to an external web container (ie Tomcat)
- needs manual prompt: True
- suggested matrix case id: `reject_a6e81a5_164_spring_boot_version_of_petclinic_ready_to_deploy_to_an_external_web_containe`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit a6e81a5 --prompt "#164 Spring Boot version of Petclinic ready to deploy to an external web container (ie Tomcat)"`
- first changed files:
  - `pom.xml`
  - `src/main/java/org/springframework/samples/petclinic/PetClinicApplication.java`
  - `src/main/java/org/springframework/samples/petclinic/config/CustomViewsConfiguration.java`
  - `src/main/java/org/springframework/samples/petclinic/config/DandelionConfig.java`
  - `src/main/java/org/springframework/samples/petclinic/model/Owner.java`
  - `src/main/java/org/springframework/samples/petclinic/model/Pet.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/OwnerRepository.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/PetRepository.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/VetRepository.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/VisitRepository.java`

### `09ed33a` #96 Reformat code with EditorConfig

- score: -108
- archetype: reject
- candidate quality: reject
- candidate quality reason: Commit changes too many files for a focused replay case.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 56
- categories: backend_service, config_build, other, persistence, tests
- prompt: #96 Reformat code with EditorConfig
- needs manual prompt: True
- suggested matrix case id: `reject_09ed33a_96_reformat_code_with_editorconfig`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 09ed33a --prompt "#96 Reformat code with EditorConfig"`
- first changed files:
  - `.editorconfig`
  - `pom.xml`
  - `src/main/java/org/springframework/samples/petclinic/model/BaseEntity.java`
  - `src/main/java/org/springframework/samples/petclinic/model/NamedEntity.java`
  - `src/main/java/org/springframework/samples/petclinic/model/Owner.java`
  - `src/main/java/org/springframework/samples/petclinic/model/Pet.java`
  - `src/main/java/org/springframework/samples/petclinic/model/PetType.java`
  - `src/main/java/org/springframework/samples/petclinic/model/Vet.java`
  - `src/main/java/org/springframework/samples/petclinic/model/package-info.java`
  - `src/main/java/org/springframework/samples/petclinic/repository/OwnerRepository.java`

### `06aaaac` Upgrade to latest https://github.com/spring-petclinic/spring-petclinic-rest

- score: -108
- archetype: reject
- candidate quality: reject
- candidate quality reason: Commit changes too many files for a focused replay case.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 131
- categories: backend_api, backend_service, config_build, docs, frontend_ui, other, persistence, tests
- prompt: Upgrade to latest https://github.com/spring-petclinic/spring-petclinic-rest
- needs manual prompt: True
- suggested matrix case id: `reject_06aaaac_upgrade_to_latest_https_github_com_spring_petclinic_spring_petclinic_rest`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 06aaaac --prompt "Upgrade to latest https://github.com/spring-petclinic/spring-petclinic-rest"`
- first changed files:
  - `.github/workflows/docker-build.yml`
  - `.github/workflows/maven-build.yml`
  - `.gitignore`
  - `.mvn/wrapper/MavenWrapperDownloader.java`
  - `.mvn/wrapper/maven-wrapper.jar`
  - `.mvn/wrapper/maven-wrapper.properties`
  - `LICENSE.txt`
  - `client/package-lock.json`
  - `client/src/components/owners/FindOwnersPage.tsx`
  - `client/src/components/owners/OwnerEditor.tsx`


## ui_form_validation

### `6e73c96` Add visual feedback for invalid fields

- score: 80
- archetype: ui_form_validation
- candidate quality: good
- candidate quality reason: Candidate has a useful feature archetype and descriptive prompt.
- prompt quality: high
- prompt quality reason: Subject is descriptive and feature-like.
- included in generated cases: True
- changed files: 2
- categories: docs, frontend_ui
- prompt: Add visual feedback for invalid fields
- needs manual prompt: False
- suggested matrix case id: `ui_form_validation_6e73c96_add_visual_feedback_for_invalid_fields`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 6e73c96 --prompt "Add visual feedback for invalid fields"`
- first changed files:
  - `client/TODO.md`
  - `client/src/components/owners/NewOwnerPage.tsx`

### `339ee36` Add error handling to NewOwnerPage

- score: 80
- archetype: ui_form_validation
- candidate quality: good
- candidate quality reason: Candidate has a useful feature archetype and descriptive prompt.
- prompt quality: high
- prompt quality reason: Subject is descriptive and feature-like.
- included in generated cases: True
- changed files: 3
- categories: frontend_ui
- prompt: Add error handling to NewOwnerPage
- needs manual prompt: False
- suggested matrix case id: `ui_form_validation_339ee36_add_error_handling_to_newownerpage`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 339ee36 --prompt "Add error handling to NewOwnerPage"`
- first changed files:
  - `client/src/components/owners/NewOwnerPage.tsx`
  - `client/src/components/owners/OwnersPage.tsx`
  - `client/src/types/index.ts`

### `4f42902` Add FieldFeedbackPanel to show status indication on Fields

- score: 80
- archetype: ui_form_validation
- candidate quality: good
- candidate quality reason: Candidate has a useful feature archetype and descriptive prompt.
- prompt quality: high
- prompt quality reason: Subject is descriptive and feature-like.
- included in generated cases: False
- changed files: 5
- categories: docs, frontend_ui
- prompt: Add FieldFeedbackPanel to show status indication on Fields
- needs manual prompt: False
- suggested matrix case id: `ui_form_validation_4f42902_add_fieldfeedbackpanel_to_show_status_indication_on_fields`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 4f42902 --prompt "Add FieldFeedbackPanel to show status indication on Fields"`
- first changed files:
  - `client/TODO.md`
  - `client/src/components/form/DateInput.tsx`
  - `client/src/components/form/FieldFeedbackPanel.tsx`
  - `client/src/components/form/Input.tsx`
  - `client/src/components/form/SelectInput.tsx`

### `a3ba04a` Fix errors

- score: 50
- archetype: ui_form_validation
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 3
- categories: frontend_ui
- prompt: Fix errors
- needs manual prompt: False
- suggested matrix case id: `ui_form_validation_a3ba04a_fix_errors`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit a3ba04a --prompt "Fix errors"`
- first changed files:
  - `client/src/components/form/DateInput.tsx`
  - `client/src/components/form/FieldFeedbackPanel.tsx`
  - `client/src/components/owners/PetsTable.tsx`

### `409415b` fix initial validation feedback

- score: 40
- archetype: ui_form_validation
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: frontend_ui
- prompt: fix initial validation feedback
- needs manual prompt: False
- suggested matrix case id: `ui_form_validation_409415b_fix_initial_validation_feedback`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 409415b --prompt "fix initial validation feedback"`
- first changed files:
  - `client/src/components/form/Input.tsx`

### `6137def` Fix validation feedback on forms

- score: 40
- archetype: ui_form_validation
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: frontend_ui
- prompt: Fix validation feedback on forms
- needs manual prompt: False
- suggested matrix case id: `ui_form_validation_6137def_fix_validation_feedback_on_forms`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 6137def --prompt "Fix validation feedback on forms"`
- first changed files:
  - `client/src/components/form/Input.tsx`

### `f726ae7` undo unused change

- score: 40
- archetype: ui_form_validation
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: frontend_ui
- prompt: undo unused change
- needs manual prompt: False
- suggested matrix case id: `ui_form_validation_f726ae7_undo_unused_change`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit f726ae7 --prompt "undo unused change"`
- first changed files:
  - `client/src/components/form/Input.tsx`


## ui_page_add

### `0a36a33` Add OwnersPage (no actions yet)

- score: 80
- archetype: ui_page_add
- candidate quality: good
- candidate quality reason: Candidate has a useful feature archetype and descriptive prompt.
- prompt quality: high
- prompt quality reason: Subject is descriptive and feature-like.
- included in generated cases: True
- changed files: 3
- categories: frontend_ui
- prompt: Add OwnersPage (no actions yet)
- needs manual prompt: False
- suggested matrix case id: `ui_page_add_0a36a33_add_ownerspage_no_actions_yet`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 0a36a33 --prompt "Add OwnersPage (no actions yet)"`
- first changed files:
  - `client/src/components/owners/OwnersPage.tsx`
  - `client/src/configureRoutes.tsx`
  - `client/src/types/index.ts`

### `42c0bd2` Add createPetEditorModel

- score: 70
- archetype: ui_page_add
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 2
- categories: docs, frontend_ui
- prompt: Add createPetEditorModel
- needs manual prompt: False
- suggested matrix case id: `ui_page_add_42c0bd2_add_createpeteditormodel`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 42c0bd2 --prompt "Add createPetEditorModel"`
- first changed files:
  - `client/README.md`
  - `client/src/components/pets/createPetEditorModel.ts`

### `521fe86` Eliminando código desnecessário

- score: 40
- archetype: ui_page_add
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: frontend_ui
- prompt: Eliminando código desnecessário
- needs manual prompt: False
- suggested matrix case id: `ui_page_add_521fe86_eliminando_c_digo_desnecess_rio`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 521fe86 --prompt "Eliminando c\u00f3digo desnecess\u00e1rio"`
- first changed files:
  - `client/src/components/owners/NewOwnerPage.tsx`

### `a269070` Eliminando código desnecessário

- score: 40
- archetype: ui_page_add
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: frontend_ui
- prompt: Eliminando código desnecessário
- needs manual prompt: False
- suggested matrix case id: `ui_page_add_a269070_eliminando_c_digo_desnecess_rio`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit a269070 --prompt "Eliminando c\u00f3digo desnecess\u00e1rio"`
- first changed files:
  - `client/src/components/owners/NewOwnerPage.tsx`

### `c9e1c7c` Eliminando código desnecessário

- score: 40
- archetype: ui_page_add
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: frontend_ui
- prompt: Eliminando código desnecessário
- needs manual prompt: False
- suggested matrix case id: `ui_page_add_c9e1c7c_eliminando_c_digo_desnecess_rio`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit c9e1c7c --prompt "Eliminando c\u00f3digo desnecess\u00e1rio"`
- first changed files:
  - `client/src/components/owners/NewOwnerPage.tsx`

### `d841a4b` Eliminando código desnecessário

- score: 40
- archetype: ui_page_add
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: frontend_ui
- prompt: Eliminando código desnecessário
- needs manual prompt: False
- suggested matrix case id: `ui_page_add_d841a4b_eliminando_c_digo_desnecess_rio`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit d841a4b --prompt "Eliminando c\u00f3digo desnecess\u00e1rio"`
- first changed files:
  - `client/src/components/owners/NewOwnerPage.tsx`

### `f188ea9` Eliminando código desnecessário

- score: 40
- archetype: ui_page_add
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 1
- categories: frontend_ui
- prompt: Eliminando código desnecessário
- needs manual prompt: False
- suggested matrix case id: `ui_page_add_f188ea9_eliminando_c_digo_desnecess_rio`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit f188ea9 --prompt "Eliminando c\u00f3digo desnecess\u00e1rio"`
- first changed files:
  - `client/src/components/owners/NewOwnerPage.tsx`


## ui_shell

### `f710ba8` Add Layout and Welcome page

- score: 105
- archetype: ui_shell
- candidate quality: good
- candidate quality reason: Candidate has a useful feature archetype and descriptive prompt.
- prompt quality: high
- prompt quality reason: Subject is descriptive and feature-like.
- included in generated cases: True
- changed files: 10
- categories: frontend_public, frontend_ui
- prompt: Add Layout and Welcome page
- needs manual prompt: False
- suggested matrix case id: `ui_shell_f710ba8_add_layout_and_welcome_page`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit f710ba8 --prompt "Add Layout and Welcome page"`
- first changed files:
  - `client/public/images/favicon.png`
  - `client/public/images/pets.png`
  - `client/public/images/platform-bg.png`
  - `client/public/images/spring-logo-dataflow-mobile.png`
  - `client/public/images/spring-logo-dataflow.png`
  - `client/public/images/spring-pivotal-logo.png`
  - `client/public/index.html`
  - `client/src/components/App.tsx`
  - `client/src/components/WelcomePage.tsx`
  - `client/src/main.tsx`

### `2bebdd0` Split larger components and clean up styling

- score: 65
- archetype: ui_shell
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 7
- categories: frontend_ui
- prompt: Split larger components and clean up styling
- needs manual prompt: False
- suggested matrix case id: `ui_shell_2bebdd0_split_larger_components_and_clean_up_styling`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 2bebdd0 --prompt "Split larger components and clean up styling"`
- first changed files:
  - `client/src/components/App.tsx`
  - `client/src/components/owners/FindOwnersPage.tsx`
  - `client/src/components/owners/OwnerInformation.tsx`
  - `client/src/components/owners/OwnersPage.tsx`
  - `client/src/components/owners/OwnersTable.tsx`
  - `client/src/components/owners/PetsTable.tsx`
  - `client/src/styles/less/petclinic.less`

### `ac27330` Fix Menu

- score: 55
- archetype: ui_shell
- candidate quality: questionable
- candidate quality reason: Candidate is feature-like but the generated prompt may need review.
- prompt quality: medium
- prompt quality reason: Subject is usable but not strongly feature-like.
- included in generated cases: False
- changed files: 2
- categories: frontend_ui
- prompt: Fix Menu
- needs manual prompt: False
- suggested matrix case id: `ui_shell_ac27330_fix_menu`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit ac27330 --prompt "Fix Menu"`
- first changed files:
  - `client/src/components/App.tsx`
  - `client/src/components/Menu.tsx`

### `563e2a0` Clean up

- score: -20
- archetype: ui_shell
- candidate quality: reject
- candidate quality reason: Prompt quality is too low for an automatic replay benchmark case.
- prompt quality: low
- prompt quality reason: Subject is vague or describes config/docs/refactor/infra work rather than a product feature.
- included in generated cases: False
- changed files: 12
- categories: frontend_ui
- prompt: Clean up
- needs manual prompt: True
- suggested matrix case id: `ui_shell_563e2a0_clean_up`
- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path eval_repos/spring-petclinic-reactjs/spring-petclinic-reactjs --commit 563e2a0 --prompt "Clean up"`
- first changed files:
  - `client/src/components/ErrorPage.tsx`
  - `client/src/components/Menu.tsx`
  - `client/src/components/NotFoundPage.tsx`
  - `client/src/components/WelcomePage.tsx`
  - `client/src/components/owners/EditOwnerPage.tsx`
  - `client/src/components/owners/FindOwnersPage.tsx`
  - `client/src/components/owners/OwnersTable.tsx`
  - `client/src/components/pets/EditPetPage.tsx`
  - `client/src/components/pets/LoadingPanel.tsx`
  - `client/src/components/pets/NewPetPage.tsx`

