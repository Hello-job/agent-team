import { useState } from 'react'
import { X } from 'lucide-react'
import { getErrorMessage } from '@/utils/errors'
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
    } catch (err) {
      setFormError(getErrorMessage(err, '保存失败'))
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
    } catch (error) {
      setTestError(getErrorMessage(error, '测试失败'));
    } finally {
      setIsTesting(false);
    }
  };

  const handleChange = (field: keyof ModelConfigCreate, value: string) => {
    setForm({ ...form, [field]: value });
  };

  return (
    <div className="fixed inset-0 bg-base/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-line rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-soft">
        <div className="flex items-center justify-between px-6 py-5 border-b border-line sticky top-0 bg-surface z-10">
          <h2 className="text-lg font-semibold tracking-tight text-ink">
            {isEdit ? '编辑配置' : '新建配置'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-ink-faint transition-colors hover:text-ink hover:bg-elevated">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="label">配置名称</label>
            <input
              type="text"
              className="input"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
            />
            <p className="text-xs text-ink-faint mt-1.5">为你的模型配置起一个名称</p>
          </div>

          <div>
            <label className="label">描述</label>
            <textarea
              className="input h-20 py-2"
              value={form.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
            />
          </div>

          <div>
            <label className="label">提供商</label>
            <div className="input flex items-center text-ink-muted bg-elevated cursor-not-allowed">
              OpenAI 兼容 API
            </div>
          </div>

          <div>
            <label className="label">模型 ID</label>
            <input
              type="text"
              className="input font-mono"
              value={form.model_id}
              onChange={(e) => handleChange('model_id', e.target.value)}
              required
              placeholder="例如：gpt-4o、llama3.1"
            />
          </div>

          <div>
            <label className="label">API 密钥</label>
            <input
              type="password"
              className="input font-mono"
              value={form.api_key}
              onChange={(e) => handleChange('api_key', e.target.value)}
              placeholder={isEdit ? '留空保持当前密钥' : '输入你的 API 密钥'}
            />
            <p className="text-xs text-ink-faint mt-1.5">OpenAI 兼容 API 的密钥</p>
          </div>

          <div>
            <label className="label">API 基础 URL</label>
            <input
              type="text"
              className="input font-mono"
              value={form.base_url || ''}
              onChange={(e) => handleChange('base_url', e.target.value)}
              placeholder="例如：https://api.openai.com/v1"
            />
            <p className="text-xs text-ink-faint mt-1.5 leading-relaxed">
              如果文档写的是 <span className="font-mono">/v1/chat/completions</span>，这里通常应填到 <span className="font-mono">/v1</span>。
            </p>
          </div>

          {isEdit && (
            <div className="rounded-lg bg-base/50 border border-line p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="label mb-0">连接测试</label>
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={isTesting || testModelConfig.isPending}
                  className="btn btn-secondary text-xs"
                >
                  {isTesting || testModelConfig.isPending ? '测试中…' : '运行测试'}
                </button>
              </div>

              {testResult && (
                <div className="text-xs text-ink leading-relaxed rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <span className="text-emerald-400 font-medium">成功</span>：{testResult}
                </div>
              )}
              {testError && (
                <div className="text-xs text-ink leading-relaxed rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                  <span className="text-red-400 font-medium">失败</span>：{testError}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-end items-center gap-3 pt-5 border-t border-line">
            {formError && (
              <div className="w-full text-xs text-ink leading-relaxed rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                {formError}
              </div>
            )}
            <button type="button" onClick={onClose} className="btn btn-outline">
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createModelConfig.isPending || updateModelConfig.isPending}
            >
              {createModelConfig.isPending || updateModelConfig.isPending ? '保存中…' : '保存配置'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
