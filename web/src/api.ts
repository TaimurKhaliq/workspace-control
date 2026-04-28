export type Workspace = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type RepoTarget = {
  id: string;
  workspace_id: string;
  target_id: string;
  repo_name: string;
  source_type: 'local_path' | 'git_url';
  locator: string;
  ref: string | null;
  status: string;
  last_discovered_at: string | null;
  last_learned_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RepoTargetValidation = {
  selected_path: string;
  suggested_root_path: string | null;
  detected_frameworks: string[];
  detected_repo_type: string;
  warnings: string[];
};

export type SemanticStatus = {
  configured: boolean;
  provider: string | null;
  model: string | null;
  api_style: string;
  cached_artifact_available: boolean;
  available: boolean;
};

export type PlanBundleChangeItem = {
  repo_name: string;
  path: string;
  action: 'modify' | 'create' | 'inspect' | 'inspect-only' | string;
  priority: number;
  confidence: 'high' | 'medium' | 'low' | string;
  source: 'planner' | 'recipe' | 'semantic_enrichment' | 'both' | string;
  node_type: string;
  reason: string;
  evidence: string[];
  matched_recipe_id: string | null;
  exists_in_current_source: boolean;
  ui_section: 'frontend' | 'backend' | 'api' | 'persistence' | 'config' | 'unknown' | string;
};

export type PlanBundle = {
  schema_version: string;
  feature_request: string;
  generated_at: string;
  target: {
    target_id: string | null;
    repo_count: number;
    selected_path: string | null;
    suggested_root_path: string | null;
    detected_repo_type: string | null;
    detected_frameworks: string[];
    warnings: string[];
    repos: Array<{
      repo_name: string;
      metadata_mode: string;
      evidence_mode: string;
      detected_frameworks: string[];
      framework_packs: string[];
    }>;
  };
  summary: {
    title: string;
    short_description?: string;
    detected_intents: string[];
    confidence: 'high' | 'medium' | 'low';
    planning_mode: string;
    planner_native_available: boolean;
    recipe_assisted: boolean;
    new_domain_candidates: string[];
    backend_required: boolean;
    backend_available: boolean;
    missing_backend_required: boolean;
  };
  ownership: {
    primary_owner: string | null;
    implementation_owner: string | null;
    domain_owner: string | null;
    direct_dependents: string[];
    possible_downstreams: string[];
  };
  recommended_change_set: PlanBundleChangeItem[];
  matched_recipes: Array<{
    recipe_id: string;
    recipe_type: string;
    structural_confidence: number;
    planner_effectiveness: number;
    why_matched: string[];
    learned_patterns?: {
      created_node_types: string[];
      modified_node_types: string[];
      cochange_patterns: string[];
    };
  }>;
  concept_grounding: Array<{
    concept: string;
    status: string;
    matched_terms: string[];
    sources: string[];
  }>;
  source_graph_evidence: Array<{
    repo_name: string;
    path: string;
    node_type: string;
    domain_tokens: string[];
    confidence: 'high' | 'medium' | 'low';
    reason: string;
  }>;
  semantic_enrichment?: {
    available?: boolean;
    model_info?: Record<string, unknown>;
    feature_spec?: {
      technical_intents?: string[];
      technical_intent_labels?: string[];
      missing_details?: string[];
      clarifying_questions?: string[];
      [key: string]: unknown;
    };
    technical_intents?: string[];
    technical_intent_labels?: string[];
    caveats?: string[];
    [key: string]: unknown;
  };
  semantic_cache_status?: 'hit' | 'miss' | 'skipped_prompt_mismatch' | 'regenerated' | 'unavailable' | string;
  semantic_cache_message?: string | null;
  semantic_missing_details?: string[];
  semantic_clarifying_questions?: string[];
  semantic_caveats?: string[];
  validation: {
    commands: string[];
    notes: string[];
  };
  risks_and_caveats: Array<{
    severity: string;
    message: string;
    source: string;
  }>;
  handoff_prompts: Array<{
    repo_name: string;
    title: string;
    prompt: string;
    recommended_files: string[];
    validation_commands: string[];
  }>;
  debug?: unknown;
};

export type PlanBundleResponse = {
  run_id: string;
  plan_bundle: PlanBundle;
};

export type PlanRun = {
  id: string;
  workspace_id: string;
  feature_request: string;
  target_ids: string[];
  status: string;
  plan_bundle_json: PlanBundle | null;
  created_at: string;
};

export type ResetLocalDataResponse = {
  status: string;
  deleted_paths: string[];
  reset_tables: string[];
  message: string;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(detail.detail ?? response.statusText);
  }
  return response.json() as Promise<T>;
}

export function listWorkspaces() {
  return request<Workspace[]>('/api/workspaces');
}

export function createWorkspace(name: string) {
  return request<Workspace>('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
}

export function listRepos(workspaceId: string) {
  return request<RepoTarget[]>(`/api/workspaces/${workspaceId}/repos`);
}

export function addRepo(workspaceId: string, payload: { target_id: string; source_type: 'local_path' | 'git_url'; locator: string; ref?: string }) {
  return request<RepoTarget>(`/api/workspaces/${workspaceId}/repos`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function validateRepoTarget(payload: { source_type: 'local_path' | 'git_url'; locator: string }) {
  return request<RepoTargetValidation>('/api/repos/validate-target', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function discoverRepo(targetId: string) {
  return request(`/api/repos/${targetId}/discover`, { method: 'POST' });
}

export function learningStatus(targetId: string) {
  return request<{ target_id: string; status: string; recipe_count: number; message?: string }>(`/api/repos/${targetId}/learning-status`);
}

export function refreshLearning(targetId: string) {
  return request(`/api/repos/${targetId}/refresh-learning`, { method: 'POST' });
}

export function getSemanticStatus(targetId?: string) {
  const suffix = targetId ? `?target_id=${encodeURIComponent(targetId)}` : '';
  return request<SemanticStatus>(`/api/semantic/status${suffix}`);
}

export function generatePlanBundle(
  workspaceId: string,
  featureRequest: string,
  targetIds: string[],
  useSemantic = false,
  options?: { signal?: AbortSignal }
) {
  return request<PlanBundleResponse>(`/api/workspaces/${workspaceId}/plan-bundles`, {
    method: 'POST',
    signal: options?.signal,
    body: JSON.stringify({ feature_request: featureRequest, target_ids: targetIds, use_semantic: useSemantic })
  });
}

export function listPlanRuns(workspaceId: string) {
  return request<PlanRun[]>(`/api/workspaces/${workspaceId}/plan-runs`);
}

export function getPlanRun(runId: string) {
  return request<PlanRun>(`/api/plan-bundles/${runId}`);
}

export function resetLocalData(confirm: string) {
  return request<ResetLocalDataResponse>('/api/admin/reset-local-data', {
    method: 'POST',
    body: JSON.stringify({ confirm })
  });
}
