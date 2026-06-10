/**
 * API types for the agent-team application.
 */

// Agent types
export interface Agent {
  id: string
  user_id: string
  name: string
  avatar?: string
  description?: string
  tags: string[]
  system_prompt: string
  model_id?: string
  temperature: number
  max_tokens: number
  max_tool_iterations?: number
  tools: string[]
  knowledge_base_id?: string
  memory_enabled: boolean
  domain?: string
  collaboration_style: 'dominant' | 'supportive' | 'critical'
  speaking_priority: number
  interaction_rules: InteractionRules
  version: number
  is_template: boolean
  is_public: boolean
  parent_id?: string
  usage_count: number
  rating: number
  rating_count: number
  created_at: string
  updated_at: string
}

// Agent list item (backend AgentListResponse)
export interface AgentListItem {
  id: string
  name: string
  avatar?: string
  description?: string
  tags: string[]
  domain?: string
  collaboration_style: 'dominant' | 'supportive' | 'critical'
  is_template: boolean
  is_public: boolean
  usage_count: number
  rating: number
  created_at: string
}

export interface InteractionRules {
  can_challenge: boolean
  can_be_challenged: boolean
  defer_to: string[]
}

export interface AgentCreate {
  name: string
  avatar?: string
  description?: string
  tags?: string[]
  system_prompt: string
  model_id?: string
  temperature?: number
  max_tokens?: number
  max_tool_iterations?: number
  tools?: string[]
  knowledge_base_id?: string
  memory_enabled?: boolean
  domain?: string
  collaboration_style?: 'dominant' | 'supportive' | 'critical'
  speaking_priority?: number
  interaction_rules?: InteractionRules
  is_template?: boolean
  is_public?: boolean
}

// Team types
export interface Team {
  id: string
  user_id: string
  name: string
  description?: string
  icon?: string
  collaboration_mode: CollaborationMode
  mode_config: Record<string, unknown>
  coordinator_id?: string
  coordination_rules: CoordinationRules
  output_rules: OutputRules
  is_template: boolean
  is_public: boolean
  usage_count: number
  rating: number
  rating_count: number
  members: TeamMember[]
  created_at: string
  updated_at: string
}

// Team list item (backend TeamListResponse)
export interface TeamListItem {
  id: string
  name: string
  description?: string
  icon?: string
  collaboration_mode: CollaborationMode
  member_count: number
  is_template: boolean
  is_public: boolean
  usage_count: number
  rating: number
  created_at: string
}

export type CollaborationMode = 'roundtable' | 'pipeline' | 'debate' | 'freeform' | 'custom'

export interface CoordinationRules {
  first_speaker: string
  turn_taking: 'round_robin' | 'priority_based' | 'free'
  max_rounds: number
  termination: {
    type: 'consensus' | 'max_rounds' | 'user_decision'
    consensus_threshold?: number
  }
}

export interface OutputRules {
  mode: 'individual' | 'merged' | 'summary'
  summary_agent_id?: string
  format: 'text' | 'markdown' | 'json'
}

export interface TeamMember {
  id: string
  agent_id: string
  role_override?: string
  priority_override?: number
  config_override: Record<string, unknown>
  position: number
  is_active: boolean
  created_at: string
}

export interface TeamCreate {
  name: string
  description?: string
  icon?: string
  collaboration_mode?: CollaborationMode
  mode_config?: Record<string, unknown>
  coordinator_id?: string
  coordination_rules?: Partial<CoordinationRules>
  output_rules?: Partial<OutputRules>
  members?: TeamMemberCreate[]
  is_template?: boolean
  is_public?: boolean
}

export interface TeamMemberCreate {
  agent_id: string
  role_override?: string
  priority_override?: number
  config_override?: Record<string, unknown>
  position?: number
}

// Execution types
export interface Execution {
  id: string
  user_id: string
  team_id?: string
  title?: string
  initial_input: string
  status: ExecutionStatus
  current_stage?: string
  current_round: number
  shared_state: Record<string, unknown>
  agent_states: Record<string, AgentState>
  final_output?: string
  structured_output?: Record<string, unknown>
  tokens_used: number
  tokens_budget: number
  cost: number
  cost_budget: number
  started_at?: string
  completed_at?: string
  error_message?: string
  recent_messages: ExecutionMessage[]
  workspace_path?: string
  created_at: string
  updated_at: string
}

export type ExecutionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed'

export interface AgentState {
  status: string
  wants_to_continue: boolean
  last_opinion?: string
}

export interface ExecutionMessage {
  id: string
  sequence: number
  round: number
  phase: string
  sender_type: 'user' | 'agent' | 'system' | 'coordinator'
  sender_id?: string
  sender_name?: string
  content: string
  content_type: 'text' | 'json' | 'markdown'
  responding_to?: string
  target_agent_id?: string
  wants_to_continue: boolean
  input_tokens: number
  output_tokens: number
  tokens_estimated: boolean
  metadata: Record<string, unknown>
  created_at: string
  /** True while this bubble is still being streamed token-by-token. */
  streaming?: boolean
}

export interface ExecutionCreate {
  team_id: string
  input: string
  title?: string
  budget?: BudgetConfig
  llm?: ExecutionLLMConfig
  workspace_path?: string
}

export interface BudgetConfig {
  max_tokens: number
  max_cost: number
  warning_thresholds: number[]
}

// Which LLM provider a config targets. The backend picks the provider impl
// (OpenAI-compatible vs Anthropic) from this field.
export type LLMProviderKind = 'openai_compatible' | 'anthropic'

// Runtime LLM config passed to backend per execution
export interface LLMRuntimeConfig {
  provider: LLMProviderKind
  model_id: string
  api_key: string
  base_url?: string
  max_context_length?: number
  supports_tools?: boolean
  supports_vision?: boolean
  input_price_per_1k?: number
  output_price_per_1k?: number
}

export interface FileEntry {
  path: string
  is_dir: boolean
  size?: number | null
}

export interface ExecutionLLMConfig {
  default: LLMRuntimeConfig
  models: Record<string, LLMRuntimeConfig>
}

// Model Configuration types
export interface ModelConfig {
  id: string
  user_id?: string
  name: string
  description?: string
  provider: LLMProviderKind
  model_id: string
  api_key?: string
  base_url?: string
  max_context_length: number
  supports_tools: boolean
  supports_vision: boolean
  is_active: boolean
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface ModelConfigCreate {
  name: string
  description?: string
  provider: LLMProviderKind
  model_id: string
  api_key?: string
  base_url?: string
}

export interface ModelConfigUpdate {
  name?: string
  description?: string
  provider?: LLMProviderKind
  model_id?: string
  api_key?: string
  base_url?: string
}

// Common types
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface SuccessResponse {
  success: boolean
  message: string
}

export interface TestModelResponse {
  message: string
  config_id: string
  response_preview?: string
  tokens_used?: number
}
