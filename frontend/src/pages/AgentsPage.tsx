import { useState } from 'react'
import { Plus, Search, Bot, MoreVertical, Copy, Trash2, Edit } from 'lucide-react'
import { getErrorMessage } from '@/utils/errors'
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
      } catch (err) {
        toast('error', getErrorMessage(err, '删除失败'))
      }
    }
    setMenuOpen(null)
  }

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateAgent.mutateAsync({ id })
      toast('success', 'Agent 已复制')
    } catch (err) {
      toast('error', getErrorMessage(err, '复制失败'))
    }
    setMenuOpen(null)
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="flex items-center justify-between mb-8 border-b border-line pb-6">
        <div>
          <span className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">工作区</span>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">Agents</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">管理你的 AI agent 配置。</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditAgent(null); setShowForm(true) }}>
          <Plus className="h-4 w-4" />
          创建 Agent
        </button>
      </div>

      <div className="mb-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-faint" />
          <input
            type="text"
            placeholder="搜索 agent…"
            className="input pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-ink-muted">加载中…</div>
      ) : data?.items.length === 0 && debouncedSearch ? (
        <div className="card py-12 text-center">
          <Search className="mx-auto mb-4 h-10 w-10 text-ink-faint" />
          <h3 className="text-base font-medium text-ink">没有找到匹配的 agent</h3>
          <p className="mt-1.5 text-[13px] text-ink-muted">尝试其他关键词，或清空搜索。</p>
        </div>
      ) : data?.items.length === 0 ? (
        <div className="card py-12 text-center">
          <Bot className="mx-auto mb-5 h-12 w-12 text-ink-faint" />
          <h3 className="text-lg font-semibold tracking-tight text-ink">还没有 agent</h3>
          <p className="mt-2 mb-7 text-[13px] text-ink-muted">创建你的第一个 AI agent 开始使用。</p>
          <button className="btn btn-primary mx-auto" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            创建 Agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
      return <img src={avatar} alt={agent.name} className="w-full h-full object-cover" />
    }
    return <span className="text-2xl leading-none">{avatar}</span>
  }

  return (
    <div className="card group relative transition-colors hover:border-line-strong hover:bg-elevated">
      <div className="absolute top-3 right-3">
        <button onClick={onMenuToggle} className="rounded-md p-1 text-ink-faint transition-colors hover:bg-elevated hover:text-ink">
          <MoreVertical className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 min-w-[140px] overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-soft z-10">
            <button onClick={onEdit} className="flex w-full items-center px-3 py-2 text-left text-sm text-ink-muted transition-colors hover:bg-elevated hover:text-ink">
              <Edit className="mr-2.5 h-4 w-4" /> 编辑
            </button>
            <button onClick={onDuplicate} className="flex w-full items-center px-3 py-2 text-left text-sm text-ink-muted transition-colors hover:bg-elevated hover:text-ink">
              <Copy className="mr-2.5 h-4 w-4" /> 复制
            </button>
            <button onClick={onDelete} className="flex w-full items-center px-3 py-2 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300">
              <Trash2 className="mr-2.5 h-4 w-4" /> 删除
            </button>
          </div>
        )}
      </div>

      <div className="flex items-start mb-5 pr-8">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-primary-500/12 text-lg font-semibold text-primary-400 ring-1 ring-primary-500/25">
          {renderAvatar()}
        </div>
        <div className="ml-3.5 flex-1">
          <h3 className="text-sm font-medium leading-tight text-ink">{agent.name}</h3>
          <p className="mt-1 font-mono text-[11px] text-ink-faint">{agent.domain || '通用'}</p>
        </div>
      </div>

      {agent.description && (
        <p className="mb-5 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">{agent.description}</p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
            agent.collaboration_style === 'dominant'
              ? 'bg-red-500/10 text-red-300 ring-red-500/25'
              : agent.collaboration_style === 'critical'
              ? 'bg-amber-500/10 text-amber-300 ring-amber-500/25'
              : 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25'
          }`}>
            {agent.collaboration_style === 'dominant' ? '主导型' :
             agent.collaboration_style === 'critical' ? '批判型' : '支持型'}
          </span>
          {agent.is_template && (
            <span className="rounded-full bg-elevated px-2 py-0.5 text-[11px] font-medium text-ink-muted ring-1 ring-inset ring-line">
              内置
            </span>
          )}
        </div>
        <span className="font-mono text-[11px] text-ink-faint">used {agent.usage_count}</span>
      </div>
    </div>
  )
}
