import { useState } from 'react'
import { Plus, Settings, Trash2, Edit3 } from 'lucide-react'
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
      } catch (error: any) {
        toast('error', error?.message || '删除 API 配置失败')
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
      <div className="flex items-center justify-center h-64 font-pixel">
        <div className="text-gray-400 uppercase tracking-widest animate-pulse">加载中...</div>
      </div>
    );
  }

  return (
    <div className="p-8 font-pixel">
      <div className="flex justify-between items-center mb-8 border-b-4 border-black pb-6">
        <div>
          <h1 className="text-3xl font-press text-white mb-2 tracking-tighter uppercase">API Config</h1>
          <p className="text-gray-400 uppercase tracking-tighter text-sm">管理你的 AI 模型 API 连接配置</p>
        </div>
        <button
          onClick={handleCreate}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          添加 API 配置
        </button>
      </div>

      {configs && configs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {configs.map((config) => (
            <div
              key={config.id}
              className="card group hover:bg-[#3d3d3d] transition-all relative"
            >
              <div className="absolute top-3 right-3 flex gap-1">
                <button
                  onClick={() => handleEdit(config)}
                  className="p-2 text-gray-400 hover:text-white border-2 border-transparent hover:border-black active:bg-black transition-all"
                  title="编辑"
                >
                  <Edit3 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handleDelete(config.id)}
                  className="p-2 text-gray-400 hover:text-red-500 border-2 border-transparent hover:border-black active:bg-black transition-all"
                  title="删除"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-press text-white flex items-center gap-3 mb-2 leading-tight">
                  <div className="p-2 bg-blue-600 border-2 border-black shadow-pixel-sm">
                    <Settings className="w-5 h-5 text-white" />
                  </div>
                  {config.name}
                </h3>
                {config.description && (
                  <p className="text-xs text-gray-400 mt-3 bg-black/20 p-2 border-2 border-black line-clamp-2">{config.description}</p>
                )}
              </div>

              <div className="space-y-2 mb-6 bg-black/30 p-4 border-2 border-black text-xs uppercase tracking-tight">
                <div className="flex justify-between border-b border-black/30 pb-1">
                  <span className="text-gray-500">PROVIDER:</span>
                  <span className="text-primary-400">OPENAI COMPATIBLE</span>
                </div>
                <div className="flex justify-between border-b border-black/30 pb-1">
                  <span className="text-gray-500">MODEL ID:</span>
                  <span className="text-primary-400 truncate ml-4" title={config.model_id}>{config.model_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">CONTEXT:</span>
                  <span className="text-primary-400">{config.max_context_length.toLocaleString()} TOKENS</span>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2 mb-4 h-8 items-center">
                {config.supports_tools && (
                  <span className="px-2 py-1 bg-green-600 text-white text-[10px] font-press border-2 border-black shadow-pixel-sm">
                    TOOLS
                  </span>
                )}
                {config.supports_vision && (
                  <span className="px-2 py-1 bg-blue-600 text-white text-[10px] font-press border-2 border-black shadow-pixel-sm">
                    VISION
                  </span>
                )}
                {config.is_default && (
                  <span className="px-2 py-1 bg-yellow-500 text-black text-[10px] font-press border-2 border-black shadow-pixel-sm">
                    DEFAULT
                  </span>
                )}
              </div>

              {!config.is_default && (
                <button
                  type="button"
                  onClick={() => handleSetDefault(config.id)}
                  className="w-full btn btn-secondary text-xs"
                >
                  SET AS DEFAULT
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <Settings className="w-16 h-16 text-gray-600 mx-auto mb-6" />
          <h3 className="text-xl font-press text-white mb-4 uppercase">没有 API 配置</h3>
          <p className="text-gray-400 mb-8 uppercase text-sm tracking-tight leading-relaxed">您还没有创建任何 API 配置，至少需要一个配置才能开始讨论。</p>
          <button
            onClick={handleCreate}
            className="btn btn-primary"
          >
            <Plus className="w-5 h-5 mr-2 inline" />
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
