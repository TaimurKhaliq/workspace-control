# Replay Matrix

- total cases: 8
- succeeded: 8
- failed: 0
- average exact precision: 0.38
- average exact recall: 0.29
- average category precision: 0.53
- average category recall: 0.46
- average high-signal precision: 0.38
- average high-signal recall: 0.37

## Archetype Summary

- backend_api: total=1, succeeded=1, failed=0
- full_stack_ui_api: total=1, succeeded=1, failed=0
- persistence_data: total=2, succeeded=2, failed=0
- ui_form_validation: total=2, succeeded=2, failed=0
- ui_page_add: total=1, succeeded=1, failed=0
- ui_shell: total=1, succeeded=1, failed=0

## Cases

| id | archetype | quality | commit | succeeded | predicted | actual | matched | exact P/R | high-signal P/R | category P/R |
|---|---|---|---|---:|---:|---:|---:|---|---|---|
| `backend_api_af31104_add_max_range_and_not_null_validation_for_adding_new_pet` | backend_api | good | `af31104` | True | 11 | 1 | 0 | 0.00/0.00 | 0.00/0.00 | 0.25/1.00 |
| `full_stack_ui_api_49ca65b_add_newownerpage_missing_error_handling` | full_stack_ui_api | good | `49ca65b` | True | 4 | 11 | 3 | 0.75/0.27 | 0.75/0.27 | 1.00/0.40 |
| `persistence_data_c758321_add_regex_validation_for_string_input` | persistence_data | good | `c758321` | True | 4 | 1 | 0 | 0.00/0.00 | 0.00/0.00 | 0.00/0.00 |
| `persistence_data_e7f6899_owners_search_has_been_case_insensitive` | persistence_data | good | `e7f6899` | True | 0 | 1 | 0 | 0.00/0.00 | 0.00/0.00 | 0.00/0.00 |
| `ui_form_validation_339ee36_add_error_handling_to_newownerpage` | ui_form_validation | good | `339ee36` | True | 3 | 3 | 2 | 0.67/0.67 | 0.67/0.67 | 1.00/0.50 |
| `ui_form_validation_6e73c96_add_visual_feedback_for_invalid_fields` | ui_form_validation | good | `6e73c96` | True | 0 | 2 | 0 | 0.00/0.00 | 0.00/0.00 | 0.00/0.00 |
| `ui_page_add_0a36a33_add_ownerspage_no_actions_yet` | ui_page_add | good | `0a36a33` | True | 5 | 3 | 3 | 0.60/1.00 | 0.60/1.00 | 1.00/1.00 |
| `ui_shell_f710ba8_add_layout_and_welcome_page` | ui_shell | good | `f710ba8` | True | 4 | 10 | 4 | 1.00/0.40 | 1.00/1.00 | 1.00/0.80 |
