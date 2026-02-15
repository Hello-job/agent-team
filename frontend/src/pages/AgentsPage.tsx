import { useState } from 'react'
import { Plus, Search, Bot, MoreVertical, Copy, Trash2, Edit } from 'lucide-react'
import { useAgents, useDeleteAgent, useDuplicateAgent, useDebounce } from '@/hooks'
import { AgentForm } from '@/components/Agent'
import type { Agent, AgentListItem } from '@/types'
import { agentApi } from '@/services/api'
import { useToast } from '@/components/Common/Toast'
import { tauriConfirm } from '@/services/tauri'

export default function AgentsPage() {
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editAgent, setEditAgent] = useState<Agent | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useAgents({ search: debouncedSearch || undefined })
  const deleteAgent = useDeleteAgent()
  const duplicateAgent = useDuplicateAgent()
  const { toast } = useToast()

  const handleEdit = async (agent: AgentListItem) => {
    const fullAgent = await agentApi.get(agent.id)
    setEditAgent(fullAgent)
    setShowForm(true)
    setMenuOpen(null)
  }

  const handleDelete = async (id: string) => {
    const confirmed = await tauriConfirm('确定删除此 Agent?', '删除 Agent')
    if (confirmed) {
      try {
        await deleteAgent.mutateAsync(id)
        toast('success', 'Agent 已删除')
      } catch (err: any) {
        toast('error', err?.message || '删除失败')
      }
    }
    setMenuOpen(null)
  }

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateAgent.mutateAsync({ id })
      toast('success', 'Agent 已复制')
    } catch (err: any) {
      toast('error', err?.message || '复制失败')
    }
    setMenuOpen(null)
  }

  return (
    <div className="p-8 font-pixel">
      <div className="flex items-center justify-between mb-8 border-b-4 border-black pb-6">
        <div>
          <h1 className="text-3xl font-press text-white mb-2">AGENTS</h1>
          <p className="text-gray-400 uppercase tracking-tighter text-sm">管理你的 AI AGENT 配置</p>
        </div>
        <button className="btn btn-primary flex items-center" onClick={() => { setEditAgent(null); setShowForm(true) }}>
          <Plus className="w-5 h-5 mr-2" />
          创建 AGENT
        </button>
      </div>

      <div className="mb-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="搜索 AGENT..."
            className="input pl-12"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400 uppercase">加载中...</div>
      ) : data?.items.length === 0 && debouncedSearch ? (
        <div className="card text-center py-12">
          <Search className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-press text-white mb-2">没有找到匹配的 AGENT</h3>
          <p className="text-gray-400 text-sm uppercase tracking-tight">尝试其他关键词，或清空搜索</p>
        </div>
      ) : data?.items.length === 0 ? (
        <div className="card text-center py-12">
          <Bot className="w-16 h-16 text-gray-600 mx-auto mb-6" />
          <h3 className="text-xl font-press text-white mb-4">还没有 AGENT</h3>
          <p className="text-gray-400 mb-8 uppercase text-sm tracking-tight">创建你的第一个 AI AGENT 开始使用</p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus className="w-5 h-5 mr-2 inline" />
            创建 AGENT
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {data?.items.map((agent: AgentListItem) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              menuOpen={menuOpen === agent.id}
              onMenuToggle={() => setMenuOpen(menuOpen === agent.id ? null : agent.id)}
              onEdit={() => handleEdit(agent)}
              onDelete={() => handleDelete(agent.id)}
              onDuplicate={() => handleDuplicate(agent.id)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <AgentForm agent={editAgent} onClose={() => { setShowForm(false); setEditAgent(null) }} />
      )}
    </div>
  )
}

function AgentCard({
  agent,
  menuOpen,
  onMenuToggle,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  agent: AgentListItem
  menuOpen: boolean
  onMenuToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  const renderAvatar = () => {
    const avatar = agent.avatar?.trim()
    if (!avatar) return agent.name.charAt(0).toUpperCase()
    const isImageSrc =
      /^https?:\/\//.test(avatar) ||
      avatar.startsWith('data:') ||
      avatar.startsWith('blob:') ||
      avatar.startsWith('/') ||
      avatar.startsWith('./') ||
      avatar.startsWith('../') ||
      avatar.includes('/') ||
      avatar.includes('\\') ||
      avatar.includes('.')
    if (isImageSrc) {
      return <img src={avatar} alt={agent.name} className="w-full h-full object-cover rendering-pixelated" />
    }
    return <span className="text-3xl leading-none">{avatar}</span>
  }

  return (
    <div className="card group hover:bg-[#3d3d3d] transition-all relative">
      <div className="absolute top-3 right-3">
        <button onClick={onMenuToggle} className="text-gray-400 hover:text-white p-1 border-2 border-transparent hover:border-black active:bg-black transition-all">
          <MoreVertical className="w-5 h-5" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 bg-[#1a1a1a] border-4 border-black shadow-pixel py-0 min-w-[140px] z-10">
            <button onClick={onEdit} className="w-full px-4 py-3 text-left text-sm text-gray-300 hover:bg-primary-600 hover:text-white flex items-center border-b-2 border-black last:border-b-0 uppercase tracking-tighter">
              <Edit className="w-4 h-4 mr-3" /> 编辑
            </button>
            <button onClick={onDuplicate} className="w-full px-4 py-3 text-left text-sm text-gray-300 hover:bg-primary-600 hover:text-white flex items-center border-b-2 border-black last:border-b-0 uppercase tracking-tighter">
              <Copy className="w-4 h-4 mr-3" /> 复制
            </button>
            <button onClick={onDelete} className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-red-600 hover:text-white flex items-center border-b-2 border-black last:border-b-0 uppercase tracking-tighter">
              <Trash2 className="w-4 h-4 mr-3" /> 删除
            </button>
          </div>
        )}
      </div>

      <div className="flex items-start mb-6 pr-8">
        <div className="w-16 h-16 border-4 border-black bg-primary-600 flex items-center justify-center text-white font-press text-2xl shadow-pixel-sm">
          {renderAvatar()}
        </div>
        <div className="ml-4 flex-1">
          <h3 className="text-lg font-press text-white leading-tight mb-1">{agent.name}</h3>
          <p className="text-xs text-primary-400 uppercase tracking-widest">{agent.domain || '通用'}</p>
        </div>
      </div>

      {agent.description && (
        <div className="bg-black/20 p-3 border-2 border-black mb-6">
          <p className="text-gray-400 text-sm line-clamp-2 leading-relaxed">{agent.description}</p>
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] font-press">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 border-2 border-black shadow-pixel-sm ${
            agent.collaboration_style === 'dominant'
              ? 'bg-red-600 text-white'
              : agent.collaboration_style === 'critical'
              ? 'bg-yellow-500 text-black'
              : 'bg-green-500 text-white'
          }`}>
            {agent.collaboration_style === 'dominant' ? '主导型' :
             agent.collaboration_style === 'critical' ? '批判型' : '支持型'}
          </span>
          {agent.is_template && (
            <span className="px-2 py-1 border-2 border-black shadow-pixel-sm bg-gray-700 text-white">
              内置
            </span>
          )}
        </div>
        <span className="text-gray-500 uppercase">USED: {agent.usage_count}</span>
      </div>
    </div>
  )
}
