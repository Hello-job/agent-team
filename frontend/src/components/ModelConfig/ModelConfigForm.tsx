import { useState } from 'react'
import { X } from 'lucide-react'
import type { ModelConfig, ModelConfigCreate, ModelConfigUpdate } from '@/types'
import { useCreateModelConfig, useUpdateModelConfig, useTestModelConfig } from '@/hooks'
import { useToast } from '@/components/Common/Toast'

interface Props {
  config?: ModelConfig | null;
  onClose: () => void;
}

export default function ModelConfigForm({ config, onClose }: Props) {
  const isEdit = !!config
  const createModelConfig = useCreateModelConfig()
  const updateModelConfig = useUpdateModelConfig()
  const testModelConfig = useTestModelConfig()
  const { toast } = useToast()
  const [formError, setFormError] = useState<string | null>(null)

  const [form, setForm] = useState<ModelConfigCreate>({
    name: config?.name || '',
    description: config?.description || '',
    provider: 'openai_compatible',
    model_id: config?.model_id || '',
    api_key: '',
    base_url: config?.base_url || '',
  });

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    try {
      if (isEdit && config) {
        const update: ModelConfigUpdate = {
          name: form.name,
          description: form.description,
          provider: form.provider,
          model_id: form.model_id,
          base_url: form.base_url,
        }
        if (form.api_key?.trim()) {
          update.api_key = form.api_key
        }
        await updateModelConfig.mutateAsync({ id: config.id, data: update })
        toast('success', 'API 配置已更新')
      } else {
        await createModelConfig.mutateAsync(form)
        toast('success', 'API 配置已创建')
      }
      onClose()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || '保存失败'
      setFormError(typeof msg === 'string' ? msg : JSON.stringify(msg))
      toast('error', '保存 API 配置失败')
    }
  }

  const handleTest = async () => {
    if (!config) return;
    
    setIsTesting(true);
    setTestResult(null);
    setTestError(null);
    
    try {
      const result = await testModelConfig.mutateAsync({ id: config.id });
      setTestResult(result.response_preview || result.message);
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      const detailText = typeof detail === 'string' ? detail : detail ? JSON.stringify(detail, null, 2) : null;
      setTestError(detailText || error.message || '测试失败');
    } finally {
      setIsTesting(false);
    }
  };

  const handleChange = (field: keyof ModelConfigCreate, value: string) => {
    setForm({ ...form, [field]: value });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 font-pixel">
      <div className="bg-[#2d2d2d] border-4 border-black w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-pixel">
        <div className="flex items-center justify-between p-6 border-b-4 border-black sticky top-0 bg-[#2d2d2d] z-10">
          <h2 className="text-xl font-press text-white uppercase tracking-tighter">
            {isEdit ? 'EDIT CONFIG' : 'CREATE CONFIG'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white border-2 border-transparent hover:border-black p-1">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-black/20 p-4 border-2 border-black">
            <label className="label uppercase tracking-tighter">配置名称</label>
            <input
              type="text"
              className="input w-full"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
            />
            <p className="text-[10px] text-gray-400 mt-2 uppercase">为您的模型配置起一个名称</p>
          </div>

          <div className="bg-black/20 p-4 border-2 border-black">
            <label className="label uppercase tracking-tighter">描述</label>
            <textarea
              className="input w-full h-20"
              value={form.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
            />
          </div>

          <div className="bg-black/20 p-4 border-2 border-black">
            <label className="label uppercase tracking-tighter">提供商</label>
            <div className="input w-full bg-gray-100 border-4 border-black text-black px-4 py-2 uppercase font-pixel cursor-not-allowed">
              OpenAI Compatible API
            </div>
          </div>

          <div className="bg-black/20 p-4 border-2 border-black">
            <label className="label uppercase tracking-tighter">模型 ID</label>
            <input
              type="text"
              className="input w-full"
              value={form.model_id}
              onChange={(e) => handleChange('model_id', e.target.value)}
              required
              placeholder="例如: gpt-4o, llama3.1"
            />
          </div>

          <div className="bg-black/20 p-4 border-2 border-black">
            <label className="label uppercase tracking-tighter">API 密钥</label>
            <input
              type="password"
              className="input w-full"
              value={form.api_key}
              onChange={(e) => handleChange('api_key', e.target.value)}
              placeholder={isEdit ? '留空保持当前密钥' : '输入您的 API 密钥'}
            />
            <p className="text-[10px] text-gray-400 mt-2 uppercase">OpenAI 兼容 API 的密钥</p>
          </div>

          <div className="bg-black/20 p-4 border-2 border-black">
            <label className="label uppercase tracking-tighter">API 基础 URL</label>
            <input
              type="text"
              className="input w-full"
              value={form.base_url || ''}
              onChange={(e) => handleChange('base_url', e.target.value)}
              placeholder="例如: https://api.openai.com/v1"
            />
            <p className="text-[10px] text-gray-400 mt-2 uppercase leading-relaxed">
              如果文档写的是 `/v1/chat/completions`，这里通常应填到 `/v1`。
            </p>
          </div>

          {isEdit && (
            <div className="bg-black/20 p-4 border-2 border-black space-y-4">
              <div className="flex items-center justify-between">
                <label className="label uppercase tracking-tighter">连接测试</label>
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={isTesting || testModelConfig.isPending}
                  className="btn btn-secondary text-xs"
                >
                  {isTesting || testModelConfig.isPending ? 'TESTING...' : 'RUN TEST'}
                </button>
              </div>
              
              {testResult && (
                <div className="text-xs font-press text-green-400 bg-green-900/30 border-2 border-green-600 p-4 shadow-pixel-sm uppercase tracking-tighter leading-relaxed">
                  SUCCESS: {testResult}
                </div>
              )}
              {testError && (
                <div className="text-xs font-press text-red-400 bg-red-900/30 border-2 border-red-600 p-4 shadow-pixel-sm uppercase tracking-tighter leading-relaxed">
                  ERROR: {testError}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-4 pt-6 border-t-4 border-black">
            {formError && (
              <div className="w-full mb-4 text-xs font-press text-red-300 bg-red-900/50 border-2 border-red-500 p-3 shadow-pixel-sm uppercase tracking-tighter leading-relaxed">
                {formError}
              </div>
            )}
            <button type="button" onClick={onClose} className="btn btn-secondary">
              CANCEL
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createModelConfig.isPending || updateModelConfig.isPending}
            >
              {createModelConfig.isPending || updateModelConfig.isPending ? 'SAVING...' : 'SAVE CONFIG'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
