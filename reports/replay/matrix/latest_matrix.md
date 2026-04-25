# Replay Matrix

- total cases: 12
- succeeded: 12
- failed: 0
- average exact precision: 0.13
- average exact recall: 0.08
- average category precision: 0.20
- average category recall: 0.23
- average high-signal precision: 0.13
- average high-signal recall: 0.13

## Cases

| id | archetype | commit | succeeded | predicted | actual | matched | exact P/R | high-signal P/R | category P/R |
|---|---|---|---:|---:|---:|---:|---|---|---|
| `backend_api_only_202ddf7_move_resources_to_api_endpoint` | backend_api_only | `202ddf7` | True | 5 | 3 | 1 | 0.20/0.33 | 0.20/0.33 | 0.50/1.00 |
| `backend_api_only_bf56f15_move_resource_restcontroller_to_web_api_package` | backend_api_only | `bf56f15` | True | 5 | 5 | 0 | 0.00/0.00 | 0.00/0.00 | 0.50/0.50 |
| `full_stack_49ca65b_add_newownerpage_missing_error_handling` | full_stack | `49ca65b` | True | 6 | 11 | 2 | 0.33/0.18 | 0.33/0.18 | 0.40/0.40 |
| `full_stack_ab702ea_add_visitspage` | full_stack | `ab702ea` | True | 0 | 5 | 0 | 0.00/0.00 | 0.00/0.00 | 0.00/0.00 |
| `mixed_other_cb0504e_92_add_some_comments_to_switch_from_hsqldb_to_mysql` | mixed_other | `cb0504e` | True | 0 | 3 | 0 | 0.00/0.00 | 0.00/0.00 | 0.00/0.00 |
| `mixed_other_d6697d8_add_maven_wrapper_with_mvn_n_io_takari_maven_wrapper` | mixed_other | `d6697d8` | True | 0 | 4 | 0 | 0.00/0.00 | 0.00/0.00 | 0.00/0.00 |
| `persistence_or_data_beb46b2_support_switching_db_init_script_at_deployment` | persistence_or_data | `beb46b2` | True | 0 | 5 | 0 | 0.00/0.00 | 0.00/0.00 | 0.00/0.00 |
| `persistence_or_data_fb64465_add_some_javadoc` | persistence_or_data | `fb64465` | True | 0 | 2 | 0 | 0.00/0.00 | 0.00/0.00 | 0.00/0.00 |
| `ui_only_0a36a33_add_ownerspage_no_actions_yet` | ui_only | `0a36a33` | True | 0 | 3 | 0 | 0.00/0.00 | 0.00/0.00 | 0.00/0.00 |
| `ui_only_6e73c96_add_visual_feedback_for_invalid_fields` | ui_only | `6e73c96` | True | 0 | 2 | 0 | 0.00/0.00 | 0.00/0.00 | 0.00/0.00 |
| `ui_shell_1d8e94e_add_prod_build_make_api_url_configurable_in_webpack` | ui_shell | `1d8e94e` | True | 6 | 5 | 0 | 0.00/0.00 | 0.00/0.00 | 0.00/0.00 |
| `ui_shell_f710ba8_add_layout_and_welcome_page` | ui_shell | `f710ba8` | True | 4 | 10 | 4 | 1.00/0.40 | 1.00/1.00 | 1.00/0.80 |
