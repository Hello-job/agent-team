import { useState } from 'react'
import { X, Plus, GripVertical, Trash2 } from 'lucide-react'
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
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || '保存失败'
      setFormError(typeof msg === 'string' ? msg : JSON.stringify(msg))
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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 font-pixel">
      <div className="bg-[#2d2d2d] border-4 border-black w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-pixel">
        <div className="flex items-center justify-between p-6 border-b-4 border-black sticky top-0 bg-[#2d2d2d] z-10">
          <h2 className="text-xl font-press text-white uppercase tracking-tighter">
            {isEdit ? 'EDIT TEAM' : 'CREATE TEAM'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white border-2 border-transparent hover:border-black p-1">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-black/20 p-4 border-2 border-black">
            <label className="label uppercase tracking-tighter">团队名称</label>
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
              className="input w-full h-20"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="bg-black/20 p-4 border-2 border-black">
            <label className="label uppercase tracking-tighter">协作模式</label>
            <select
              className="input w-full appearance-none cursor-pointer"
              value={form.collaboration_mode}
              onChange={(e) => setForm({ ...form, collaboration_mode: e.target.value as TeamCreate['collaboration_mode'] })}
            >
              <option value="roundtable">圆桌讨论 (ROUNDTABLE)</option>
              <option value="pipeline">流水线 (PIPELINE)</option>
              <option value="debate">辩论 (DEBATE)</option>
              <option value="freeform">自由讨论 (FREEFORM)</option>
            </select>
          </div>

          <div className="bg-black/20 p-4 border-2 border-black">
            <label className="label uppercase tracking-tighter mb-4">团队成员</label>
            <div className="space-y-3 mb-6">
              {form.members?.length === 0 && (
                <div className="text-center py-4 text-gray-500 uppercase text-xs border-2 border-dashed border-black/30">
                  [ NO MEMBERS ADDED ]
                </div>
              )}
              {form.members?.map((member, idx) => (
                <div key={member.agent_id} className="flex items-center gap-4 bg-black/40 p-3 border-2 border-black shadow-pixel-sm transition-transform hover:translate-x-1">
                  <GripVertical className="w-5 h-5 text-gray-500 cursor-grab" />
                  <span className="font-press text-[10px] text-primary-400">#{idx + 1}</span>
                  <span className="flex-1 text-white uppercase tracking-tight">{getAgentName(member.agent_id)}</span>
                  <button
                    type="button"
                    onClick={() => removeMember(member.agent_id)}
                    className="text-red-400 hover:text-red-300 p-1 border-2 border-transparent hover:border-black active:bg-black transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {availableAgents.length > 0 && (
              <div className="flex gap-4">
                <select
                  className="input flex-1 appearance-none cursor-pointer"
                  onChange={(e) => e.target.value && addMember(e.target.value)}
                  value=""
                >
                  <option value="">ADD AGENT...</option>
                  {availableAgents.map((agent: AgentListItem) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-secondary whitespace-nowrap">
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            )}
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
              disabled={createTeam.isPending || updateTeam.isPending}
            >
              {createTeam.isPending || updateTeam.isPending ? 'SAVING...' : 'SAVE TEAM'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
