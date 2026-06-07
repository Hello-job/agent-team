import { useState } from 'react'
import { X, Plus, GripVertical, Trash2 } from 'lucide-react'
import { getErrorMessage } from '@/utils/errors'
import type { Team, TeamCreate, AgentListItem } from '@/types'
import { useCreateTeam, useUpdateTeam, useAgents } from '@/hooks'
import { useToast } from '@/components/Common/Toast'

interface Props {
  team?: Team | null
  onClose: () => void
}

export default function TeamForm({ team, onClose }: Props) {
  const isEdit = !!team
  const createTeam = useCreateTeam()
  const updateTeam = useUpdateTeam()
  const { data: agentsData } = useAgents({ page_size: 100 })
  const { toast } = useToast()
  const [formError, setFormError] = useState<string | null>(null)

  const [form, setForm] = useState<TeamCreate>({
    name: team?.name || '',
    description: team?.description || '',
    collaboration_mode: team?.collaboration_mode || 'roundtable',
    members: team?.members?.map((m) => ({
      agent_id: m.agent_id,
      position: m.position,
    })) || [],
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    try {
      if (isEdit && team) {
        await updateTeam.mutateAsync({ id: team.id, data: form })
        toast('success', '团队已更新')
      } else {
        await createTeam.mutateAsync(form)
        toast('success', '团队已创建')
      }
      onClose()
    } catch (err) {
      setFormError(getErrorMessage(err, '保存失败'))
      toast('error', '保存团队失败')
    }
  }

  const addMember = (agentId: string) => {
    if (!form.members?.find((m) => m.agent_id === agentId)) {
      setForm({
        ...form,
        members: [...(form.members || []), { agent_id: agentId, position: form.members?.length || 0 }],
      })
    }
  }

  const removeMember = (agentId: string) => {
    setForm({
      ...form,
      members: form.members?.filter((m) => m.agent_id !== agentId),
    })
  }

  const getAgentName = (agentId: string) => {
    return agentsData?.items.find((a: AgentListItem) => a.id === agentId)?.name || agentId
  }

  const availableAgents = agentsData?.items.filter(
    (a: AgentListItem) => !form.members?.find((m) => m.agent_id === a.id)
  ) || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-line bg-surface shadow-soft">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-6 py-5">
          <h2 className="text-lg font-semibold tracking-tight text-ink">
            {isEdit ? '编辑团队' : '创建团队'}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink-faint transition-colors hover:bg-elevated hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div>
            <label className="label">团队名称</label>
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
            <label className="label">协作模式</label>
            <select
              className="input w-full cursor-pointer appearance-none"
              value={form.collaboration_mode}
              onChange={(e) => setForm({ ...form, collaboration_mode: e.target.value as TeamCreate['collaboration_mode'] })}
            >
              <option value="roundtable">圆桌讨论</option>
              <option value="pipeline">流水线</option>
              <option value="debate">对抗辩论</option>
              <option value="freeform">自由协作</option>
            </select>
          </div>

          <div>
            <label className="label">团队成员</label>
            <div className="mb-3 space-y-2">
              {form.members?.length === 0 && (
                <div className="rounded-lg border border-dashed border-line py-4 text-center text-xs text-ink-faint">
                  尚未添加成员
                </div>
              )}
              {form.members?.map((member, idx) => (
                <div key={member.agent_id} className="flex items-center gap-3 rounded-lg border border-line bg-elevated p-3 transition-colors hover:border-line-strong">
                  <GripVertical className="h-4 w-4 cursor-grab text-ink-faint" />
                  <span className="font-mono text-[11px] text-primary-400">#{idx + 1}</span>
                  <span className="flex-1 text-sm text-ink">{getAgentName(member.agent_id)}</span>
                  <button
                    type="button"
                    onClick={() => removeMember(member.agent_id)}
                    className="rounded-md p-1 text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            {availableAgents.length > 0 && (
              <div className="flex gap-2">
                <select
                  className="input flex-1 cursor-pointer appearance-none"
                  onChange={(e) => e.target.value && addMember(e.target.value)}
                  value=""
                >
                  <option value="">添加 agent…</option>
                  {availableAgents.map((agent: AgentListItem) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-secondary whitespace-nowrap">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            )}
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
              disabled={createTeam.isPending || updateTeam.isPending}
            >
              {createTeam.isPending || updateTeam.isPending ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
