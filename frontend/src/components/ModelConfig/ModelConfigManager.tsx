import { useState } from 'react'
import { Plus, Settings, Trash2, Edit3 } from 'lucide-react'
import { getErrorMessage } from '@/utils/errors'
import type { ModelConfig } from '@/types'
import { useModelConfigs, useDeleteModelConfig } from '@/hooks'
import ModelConfigForm from './ModelConfigForm'
import { setDefaultModelConfig } from '@/services/modelConfigStore'
import { useToast } from '@/components/Common/Toast'
import { tauriConfirm } from '@/services/tauri'

export default function ModelConfigManager() {
  const { data: configs, isLoading, refetch } = useModelConfigs({ includeSystem: false });
  const deleteMutation = useDeleteModelConfig();
  const [showForm, setShowForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ModelConfig | null>(null);
  const { toast } = useToast()

  const handleDelete = async (id: string) => {
    const confirmed = await tauriConfirm('确定要删除此API配置吗？此操作不可撤销。', '删除配置')
    if (confirmed) {
      try {
        await deleteMutation.mutateAsync(id);
        toast('success', 'API 配置已删除')
        refetch();
      } catch (error) {
        toast('error', getErrorMessage(error, '删除 API 配置失败'))
      }
    }
  };

  const handleEdit = (config: ModelConfig) => {
    setEditingConfig(config);
    setShowForm(true);
  };

  const handleSetDefault = async (id: string) => {
    setDefaultModelConfig(id);
    await refetch();
  };

  const handleCreate = () => {
    setEditingConfig(null);
    setShowForm(true);
  };

  const handleClose = () => {
    setShowForm(false);
    setEditingConfig(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-ink-muted animate-pulse">加载中…</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="flex justify-between items-center mb-8 border-b border-line pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink mb-1.5">API 配置</h1>
          <p className="text-[13px] text-ink-muted">管理你的 AI 模型 API 连接配置</p>
        </div>
        <button
          onClick={handleCreate}
          className="btn btn-primary"
        >
          <Plus className="w-4 h-4" />
          添加 API 配置
        </button>
      </div>

      {configs && configs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {configs.map((config) => (
            <div
              key={config.id}
              className="card group relative transition-colors hover:border-line-strong hover:bg-elevated"
            >
              <div className="absolute top-3 right-3 flex gap-1">
                <button
                  onClick={() => handleEdit(config)}
                  className="p-1.5 rounded-md text-ink-faint transition-colors hover:text-ink hover:bg-elevated"
                  title="编辑"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(config.id)}
                  className="p-1.5 rounded-md text-ink-faint transition-colors hover:text-red-400 hover:bg-red-500/10"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="mb-5">
                <h3 className="text-sm font-medium text-ink flex items-center gap-3 leading-tight">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500/12 ring-1 ring-primary-500/25">
                    <Settings className="w-[18px] h-[18px] text-primary-400" />
                  </div>
                  <span className="truncate pr-12">{config.name}</span>
                </h3>
                {config.description && (
                  <p className="text-[13px] leading-relaxed text-ink-muted mt-2.5 line-clamp-2">{config.description}</p>
                )}
              </div>

              <div className="space-y-2 mb-5 rounded-lg bg-base/50 border border-line p-3.5 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-ink-faint">Provider</span>
                  <span className="font-mono text-ink-muted">openai compatible</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ink-faint">Model ID</span>
                  <span className="font-mono text-primary-400 truncate" title={config.model_id}>{config.model_id}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ink-faint">Context</span>
                  <span className="font-mono text-ink-muted">{config.max_context_length.toLocaleString()} tokens</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-4 min-h-[24px] items-center">
                {config.supports_tools && (
                  <span className="px-2 py-0.5 rounded-md bg-primary-500/12 text-primary-400 text-[11px] font-medium ring-1 ring-primary-500/25">
                    Tools
                  </span>
                )}
                {config.supports_vision && (
                  <span className="px-2 py-0.5 rounded-md bg-primary-500/12 text-primary-400 text-[11px] font-medium ring-1 ring-primary-500/25">
                    Vision
                  </span>
                )}
                {config.is_default && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[11px] font-medium ring-1 ring-emerald-500/25">
                    默认
                  </span>
                )}
              </div>

              {!config.is_default && (
                <button
                  type="button"
                  onClick={() => handleSetDefault(config.id)}
                  className="w-full btn btn-secondary text-xs"
                >
                  设为默认
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-14">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-500/12 ring-1 ring-primary-500/25">
            <Settings className="w-6 h-6 text-primary-400" />
          </div>
          <h3 className="text-sm font-medium text-ink mb-2">还没有 API 配置</h3>
          <p className="text-[13px] leading-relaxed text-ink-muted mb-7 max-w-sm mx-auto">你还没有创建任何 API 配置，至少需要一个配置才能开始讨论。</p>
          <button
            onClick={handleCreate}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" />
            创建第一个 API 配置
          </button>
        </div>
      )}

      {showForm && (
        <ModelConfigForm
          config={editingConfig}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
