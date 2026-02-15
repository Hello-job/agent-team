import { useState } from 'react'
import { X } from 'lucide-react'
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
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || '保存失败'
      setFormError(typeof msg === 'string' ? msg : JSON.stringify(msg))
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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 font-pixel">
      <div className="bg-[#2d2d2d] border-4 border-black w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-pixel">
        <div className="flex items-center justify-between p-6 border-b-4 border-black sticky top-0 bg-[#2d2d2d] z-10">
          <h2 className="text-xl font-press text-white uppercase tracking-tighter">
            {isEdit ? 'EDIT AGENT' : 'CREATE AGENT'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white border-2 border-transparent hover:border-black p-1">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-black/20 p-4 border-2 border-black">
            <label className="label uppercase tracking-tighter">名称</label>
            <input
              type="text"
              className="input w-full"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="bg-black/20 p-4 border-2 border-black">
            <label className="label uppercase tracking-tighter">描述</label>
            <textarea
              className="input w-full h-24"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="bg-black/20 p-4 border-2 border-black">
            <label className="label uppercase tracking-tighter">系统提示词</label>
            <textarea
              className="input w-full h-40 font-mono text-sm"
              value={form.system_prompt}
              onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
              required
            />
          </div>

          <div className="bg-black/20 p-4 border-2 border-black">
            <label className="label uppercase tracking-tighter">模型配置</label>
            <select
              className="input w-full appearance-none cursor-pointer"
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
            <p className="text-[10px] text-gray-400 mt-2 uppercase tracking-tight">在 “API配置” 里创建模型配置后可在这里绑定</p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-black/20 p-4 border-2 border-black">
              <label className="label uppercase tracking-tighter mb-2">
                Temperature: {form.temperature}
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                className="w-full accent-primary-500"
                value={form.temperature}
                onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) })}
              />
            </div>
            <div className="bg-black/20 p-4 border-2 border-black">
              <label className="label uppercase tracking-tighter">Max Tokens</label>
              <input
                type="number"
                className="input w-full"
                value={form.max_tokens}
                onChange={(e) => setForm({ ...form, max_tokens: parseInt(e.target.value) })}
              />
            </div>
            <div className="bg-black/20 p-4 border-2 border-black">
              <label className="label uppercase tracking-tighter">最大工具调用轮次</label>
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
              <p className="text-[10px] text-gray-400 mt-2 uppercase tracking-tight">仅在开启工具调用时生效（1-50，默认 10）</p>
            </div>
          </div>

          <div className="bg-black/20 p-4 border-2 border-black">
            <label className="label uppercase tracking-tighter">协作风格</label>
            <select
              className="input w-full appearance-none cursor-pointer"
              value={form.collaboration_style}
              onChange={(e) => setForm({ ...form, collaboration_style: e.target.value as AgentCreate['collaboration_style'] })}
            >
              <option value="supportive">支持型</option>
              <option value="dominant">主导型</option>
              <option value="critical">批判型</option>
            </select>
          </div>

          <div className="bg-black/20 p-4 border-2 border-black">
            <label className="label uppercase tracking-tighter">标签</label>
            <div className="flex gap-2 mb-4 flex-wrap">
              {form.tags?.map((tag) => (
                <span key={tag} className="px-3 py-1 bg-primary-600 text-white border-2 border-black shadow-pixel-sm text-xs flex items-center uppercase">
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="ml-2 hover:text-black transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                className="input flex-1"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="添加标签..."
              />
              <button type="button" onClick={addTag} className="btn btn-secondary whitespace-nowrap">
                添加
              </button>
            </div>
          </div>

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
              disabled={createAgent.isPending || updateAgent.isPending}
            >
              {createAgent.isPending || updateAgent.isPending ? 'SAVING...' : 'SAVE'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
