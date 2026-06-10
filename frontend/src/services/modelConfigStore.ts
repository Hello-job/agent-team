import type { ExecutionLLMConfig, LLMRuntimeConfig, ModelConfig, ModelConfigCreate, ModelConfigUpdate } from '@/types'

const STORAGE_KEY = 'agent-team:model-configs:v1'

function nowIso() {
  return new Date().toISOString()
}

function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `mc_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

function normalize(raw: unknown): ModelConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!r.id || !r.name || !r.model_id) return null

  return {
    id: String(r.id),
    user_id: r.user_id ? String(r.user_id) : undefined,
    name: String(r.name),
    description: r.description ? String(r.description) : undefined,
    provider: r.provider === 'anthropic' ? 'anthropic' : 'openai_compatible',
    model_id: String(r.model_id),
    api_key: r.api_key ? String(r.api_key) : undefined,
    base_url: r.base_url ? String(r.base_url) : undefined,
    max_context_length: Number.isFinite(r.max_context_length) ? Number(r.max_context_length) : 8192,
    supports_tools: r.supports_tools !== undefined ? Boolean(r.supports_tools) : true,
    supports_vision: r.supports_vision !== undefined ? Boolean(r.supports_vision) : false,
    is_active: r.is_active !== undefined ? Boolean(r.is_active) : true,
    is_default: r.is_default !== undefined ? Boolean(r.is_default) : false,
    created_at: r.created_at ? String(r.created_at) : nowIso(),
    updated_at: r.updated_at ? String(r.updated_at) : nowIso(),
  }
}

function readAll(): ModelConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalize).filter(Boolean) as ModelConfig[]
  } catch {
    return []
  }
}

function writeAll(configs: ModelConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs))
}

function ensureSingleDefault(configs: ModelConfig[]) {
  const defaults = configs.filter((c) => c.is_default)
  if (defaults.length <= 1) return configs
  const [, ...rest] = defaults
  return configs.map((c) => (rest.some((r) => r.id === c.id) ? { ...c, is_default: false } : c))
}

export function listModelConfigs(): ModelConfig[] {
  return readAll()
}

export function getModelConfig(id: string): ModelConfig | null {
  return readAll().find((c) => c.id === id) || null
}

export function createModelConfig(data: ModelConfigCreate): ModelConfig {
  const configs = readAll()
  const created: ModelConfig = {
    id: newId(),
    user_id: 'local',
    name: data.name,
    description: data.description,
    provider: data.provider,
    model_id: data.model_id,
    api_key: data.api_key?.trim() ? data.api_key.trim() : undefined,
    base_url: data.base_url?.trim() ? data.base_url.trim() : undefined,
    max_context_length: 8192,
    supports_tools: true,
    supports_vision: false,
    is_active: true,
    is_default: configs.length === 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  }

  const next = ensureSingleDefault([created, ...configs])
  writeAll(next)
  return created
}

export function updateModelConfig(id: string, update: ModelConfigUpdate): ModelConfig {
  const configs = readAll()
  const idx = configs.findIndex((c) => c.id === id)
  if (idx === -1) throw new Error('Model config not found')

  const existing = configs[idx]
  const nextConfig: ModelConfig = {
    ...existing,
    name: update.name ?? existing.name,
    description: update.description ?? existing.description,
    provider: update.provider ?? existing.provider,
    model_id: update.model_id ?? existing.model_id,
    base_url: update.base_url ?? existing.base_url,
    api_key: update.api_key?.trim() ? update.api_key.trim() : existing.api_key,
    updated_at: nowIso(),
  }

  const next = ensureSingleDefault(configs.map((c, i) => (i === idx ? nextConfig : c)))
  writeAll(next)
  return nextConfig
}

export function deleteModelConfig(id: string) {
  const configs = readAll()
  const removed = configs.find((c) => c.id === id)
  const remaining = configs.filter((c) => c.id !== id)

  if (removed?.is_default && remaining.length > 0) {
    remaining[0] = { ...remaining[0], is_default: true, updated_at: nowIso() }
  }

  writeAll(ensureSingleDefault(remaining))
}

export function setDefaultModelConfig(id: string) {
  const configs = readAll()
  const next = configs.map((c) => ({ ...c, is_default: c.id === id, updated_at: nowIso() }))
  writeAll(ensureSingleDefault(next))
}

export function getDefaultModelConfig(): ModelConfig | null {
  const configs = readAll()
  return configs.find((c) => c.is_default) || configs[0] || null
}

export function buildExecutionLLMConfig(): ExecutionLLMConfig | null {
  const configs = readAll().filter((c) => c.is_active)
  const defaultConfig = getDefaultModelConfig()
  if (!defaultConfig?.api_key?.trim()) return null

  const toRuntime = (c: ModelConfig): LLMRuntimeConfig => ({
    provider: c.provider,
    model_id: c.model_id,
    api_key: c.api_key || '',
    base_url: c.base_url,
    max_context_length: c.max_context_length,
    supports_tools: c.supports_tools,
    supports_vision: c.supports_vision,
  })

  const models: Record<string, LLMRuntimeConfig> = {}
  for (const c of configs) {
    if (!c.api_key?.trim()) continue
    models[c.id] = toRuntime(c)
  }

  return {
    default: toRuntime(defaultConfig),
    models,
  }
}
