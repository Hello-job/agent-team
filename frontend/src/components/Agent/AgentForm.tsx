import { useState } from 'react'
import { X } from 'lucide-react'
import { getErrorMessage } from '@/utils/errors'
import type { Agent, AgentCreate } from '@/types'
import { useCreateAgent, useModelConfigs, useUpdateAgent } from '@/hooks'
import { useToast } from '@/components/Common/Toast'

interface Props {
  agent?: Agent | null
  onClose: () => void
}

export default function AgentForm({ agent, onClose }: Props) {
  const isEdit = !!agent
  const createAgent = useCreateAgent()
  const updateAgent = useUpdateAgent()
  const { data: modelConfigs } = useModelConfigs({ includeSystem: false })
  const { toast } = useToast()
  const [formError, setFormError] = useState<string | null>(null)

  const [form, setForm] = useState<AgentCreate>({
    name: agent?.name || '',
    description: agent?.description || '',
    system_prompt: agent?.system_prompt || '',
    model_id: agent?.model_id,
    temperature: agent?.temperature ?? 0.7,
    max_tokens: agent?.max_tokens ?? 2000,
    max_tool_iterations: agent?.max_tool_iterations ?? 10,
    collaboration_style: agent?.collaboration_style || 'supportive',
    tags: agent?.tags || [],
  })

  const [tagInput, setTagInput] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    try {
      const payload: AgentCreate = {
        ...form,
        model_id: form.model_id ? form.model_id : undefined,
      }
      if (isEdit && agent) {
        await updateAgent.mutateAsync({ id: agent.id, data: payload })
        toast('success', 'Agent 已更新')
      } else {
        await createAgent.mutateAsync(payload)
        toast('success', 'Agent 已创建')
      }
      onClose()
    } catch (err) {
      setFormError(getErrorMessage(err, '保存失败'))
      toast('error', '保存 Agent 失败')
    }
  }

  const addTag = () => {
    if (tagInput.trim() && !form.tags?.includes(tagInput.trim())) {
      setForm({ ...form, tags: [...(form.tags || []), tagInput.trim()] })
      setTagInput('')
    }
  }

  const removeTag = (tag: string) => {
    setForm({ ...form, tags: form.tags?.filter((t) => t !== tag) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-line bg-surface shadow-soft">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-6 py-5">
          <h2 className="text-lg font-semibold tracking-tight text-ink">
            {isEdit ? '编辑 Agent' : '创建 Agent'}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink-faint transition-colors hover:bg-elevated hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div>
            <label className="label">名称</label>
            <input
              type="text"
              className="input w-full"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="label">描述</label>
            <textarea
              className="input w-full h-24 py-2"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div>
            <label className="label">系统提示词</label>
            <textarea
              className="input w-full h-40 py-2 font-mono text-sm"
              value={form.system_prompt}
              onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="label">模型配置</label>
            <select
              className="input w-full cursor-pointer appearance-none"
              value={form.model_id || ''}
              onChange={(e) => setForm({ ...form, model_id: e.target.value || undefined })}
            >
              <option value="">默认 (使用本地默认配置)</option>
              {(modelConfigs || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.model_id})
                </option>
              ))}
            </select>
            <p className="mt-2 text-[12px] text-ink-faint">在 “API 配置” 里创建模型配置后可在这里绑定。</p>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="label">
                Temperature: <span className="font-mono text-ink-muted">{form.temperature}</span>
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                className="mt-1.5 w-full accent-primary-500"
                value={form.temperature}
                onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">Max Tokens</label>
              <input
                type="number"
                className="input w-full"
                value={form.max_tokens}
                onChange={(e) => setForm({ ...form, max_tokens: parseInt(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">最大工具调用轮次</label>
              <input
                type="number"
                min={1}
                max={50}
                className="input w-full"
                value={form.max_tool_iterations ?? 10}
                onChange={(e) =>
                  setForm({
                    ...form,
                    max_tool_iterations: Math.min(50, Math.max(1, parseInt(e.target.value || '10'))),
                  })}
              />
              <p className="mt-2 text-[12px] text-ink-faint">仅在开启工具调用时生效（1-50，默认 10）。</p>
            </div>
          </div>

          <div>
            <label className="label">协作风格</label>
            <select
              className="input w-full cursor-pointer appearance-none"
              value={form.collaboration_style}
              onChange={(e) => setForm({ ...form, collaboration_style: e.target.value as AgentCreate['collaboration_style'] })}
            >
              <option value="supportive">支持型</option>
              <option value="dominant">主导型</option>
              <option value="critical">批判型</option>
            </select>
          </div>

          <div>
            <label className="label">标签</label>
            {(form.tags?.length ?? 0) > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {form.tags?.map((tag) => (
                  <span key={tag} className="flex items-center rounded-full bg-primary-500/12 px-2.5 py-0.5 text-xs font-medium text-primary-400 ring-1 ring-inset ring-primary-500/25">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} className="ml-1.5 text-primary-400/70 transition-colors hover:text-primary-300">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                className="input flex-1"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="添加标签…"
              />
              <button type="button" onClick={addTag} className="btn btn-secondary whitespace-nowrap">
                添加
              </button>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-5">
            {formError && (
              <div className="mb-1 w-full rounded-md border border-red-500/25 bg-red-500/10 p-3 text-xs leading-relaxed text-red-300">
                {formError}
              </div>
            )}
            <button type="button" onClick={onClose} className="btn btn-secondary">
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createAgent.isPending || updateAgent.isPending}
            >
              {createAgent.isPending || updateAgent.isPending ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
