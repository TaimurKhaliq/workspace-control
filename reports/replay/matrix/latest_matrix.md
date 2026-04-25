# Replay Matrix

- total cases: 8
- succeeded: 8
- failed: 0
- recipe helped cases: 5

## Average Metrics By Prediction Mode

| mode | exact P/R | category P/R | high-signal P/R |
|---|---|---|---|
| planner/propose only | 0.38/0.29 | 0.50/0.34 | 0.38/0.37 |
| recipe suggestions only | 0.32/0.54 | 0.51/0.84 | 0.32/0.62 |
| combined | 0.31/0.60 | 0.50/0.84 | 0.31/0.67 |

## Archetype Summary

- backend_search_query: total=1, succeeded=1, failed=0
- backend_validation_change: total=2, succeeded=2, failed=0
- full_stack_ui_api: total=1, succeeded=1, failed=0
- ui_form_validation: total=2, succeeded=2, failed=0
- ui_page_add: total=1, succeeded=1, failed=0
- ui_shell: total=1, succeeded=1, failed=0

## Cases

| id | archetype | quality | commit | succeeded | actual | planner exact P/R | recipe exact P/R | combined exact P/R | planner category P/R | recipe category P/R | combined category P/R | planner high-signal P/R | recipe high-signal P/R | combined high-signal P/R | recipe helped | recipe matched files |
|---|---|---|---|---:|---:|---|---|---|---|---|---|---|---|---|---|---|
| `backend_search_query_e7f6899_owners_search_has_been_case_insensitive` | backend_search_query | good | `e7f6899` | True | 1 | 0.00/0.00 | 0.14/1.00 | 0.14/1.00 | 0.00/0.00 | 0.25/1.00 | 0.25/1.00 | 0.00/0.00 | 0.14/1.00 | 0.14/1.00 | True (improved_recall) | `spring-petclinic-reactjs/src/main/resources/db/hsqldb/initDB.sql` |
| `backend_validation_change_af31104_add_max_range_and_not_null_validation_for_adding_new_pet` | backend_validation_change | good | `af31104` | True | 1 | 0.00/0.00 | 0.09/1.00 | 0.05/1.00 | 0.00/0.00 | 0.17/1.00 | 0.12/1.00 | 0.00/0.00 | 0.09/1.00 | 0.05/1.00 | True (improved_recall) | `spring-petclinic-reactjs/src/main/java/org/springframework/samples/petclinic/web/api/PetRequest.java` |
| `backend_validation_change_c758321_add_regex_validation_for_string_input` | backend_validation_change | good | `c758321` | True | 1 | 0.00/0.00 | 0.00/0.00 | 0.00/0.00 | 0.00/0.00 | 0.17/1.00 | 0.12/1.00 | 0.00/0.00 | 0.00/0.00 | 0.00/0.00 | False (same) | - |
| `full_stack_ui_api_49ca65b_add_newownerpage_missing_error_handling` | full_stack_ui_api | good | `49ca65b` | True | 11 | 0.75/0.27 | 0.33/0.27 | 0.36/0.36 | 1.00/0.40 | 0.50/0.40 | 0.50/0.40 | 0.75/0.27 | 0.33/0.27 | 0.36/0.36 | True (improved_recall) | `spring-petclinic-reactjs/client/src/components/owners/FindOwnersPage.tsx`<br>`spring-petclinic-reactjs/client/src/configureRoutes.tsx`<br>`spring-petclinic-reactjs/client/src/types/index.ts` |
| `ui_form_validation_339ee36_add_error_handling_to_newownerpage` | ui_form_validation | good | `339ee36` | True | 3 | 0.67/0.67 | 0.22/0.67 | 0.30/1.00 | 1.00/0.50 | 0.50/1.00 | 0.50/1.00 | 0.67/0.67 | 0.22/0.67 | 0.30/1.00 | True (improved_recall) | `spring-petclinic-reactjs/client/src/components/owners/NewOwnerPage.tsx`<br>`spring-petclinic-reactjs/client/src/types/index.ts` |
| `ui_form_validation_6e73c96_add_visual_feedback_for_invalid_fields` | ui_form_validation | good | `6e73c96` | True | 2 | 0.00/0.00 | 0.00/0.00 | 0.00/0.00 | 0.00/0.00 | 0.50/0.50 | 0.50/0.50 | 0.00/0.00 | 0.00/0.00 | 0.00/0.00 | False (same) | - |
| `ui_page_add_0a36a33_add_ownerspage_no_actions_yet` | ui_page_add | good | `0a36a33` | True | 3 | 0.60/1.00 | 0.75/1.00 | 0.60/1.00 | 1.00/1.00 | 1.00/1.00 | 1.00/1.00 | 0.60/1.00 | 0.75/1.00 | 0.60/1.00 | True (improved_precision) | `spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx`<br>`spring-petclinic-reactjs/client/src/configureRoutes.tsx`<br>`spring-petclinic-reactjs/client/src/types/index.ts` |
| `ui_shell_f710ba8_add_layout_and_welcome_page` | ui_shell | good | `f710ba8` | True | 10 | 1.00/0.40 | 1.00/0.40 | 1.00/0.40 | 1.00/0.80 | 1.00/0.80 | 1.00/0.80 | 1.00/1.00 | 1.00/1.00 | 1.00/1.00 | False (same) | `spring-petclinic-reactjs/client/public/index.html`<br>`spring-petclinic-reactjs/client/src/components/App.tsx`<br>`spring-petclinic-reactjs/client/src/components/WelcomePage.tsx`<br>`spring-petclinic-reactjs/client/src/main.tsx` |
