import { useState } from 'react'
import { Plus, Search, Users, MoreVertical, Trash2, Edit, Play } from 'lucide-react'
import { getErrorMessage } from '@/utils/errors'
import { useNavigate } from 'react-router-dom'
import { useTeams, useDeleteTeam, useDebounce } from '@/hooks'
import { TeamForm } from '@/components/Team'
import type { Team, TeamListItem } from '@/types'
import { teamApi } from '@/services/api'
import { useToast } from '@/components/Common/Toast'
import { tauriConfirm } from '@/services/tauri'

const modeLabels: Record<string, string> = {
  roundtable: '圆桌讨论',
  pipeline: '流水线',
  debate: '对抗辩论',
  freeform: '自由协作',
  custom: '自定义',
}

export default function TeamsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editTeam, setEditTeam] = useState<Team | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useTeams({ search: debouncedSearch || undefined })
  const deleteTeam = useDeleteTeam()
  const { toast } = useToast()

  const handleEdit = async (team: TeamListItem) => {
    const fullTeam = await teamApi.get(team.id)
    setEditTeam(fullTeam)
    setShowForm(true)
    setMenuOpen(null)
  }

  const handleDelete = async (id: string) => {
    const confirmed = await tauriConfirm('确定删除此团队?', '删除团队')
    if (confirmed) {
      try {
        await deleteTeam.mutateAsync(id)
        toast('success', '团队已删除')
      } catch (err) {
        toast('error', getErrorMessage(err, '删除失败'))
      }
    }
    setMenuOpen(null)
  }

  const handleStart = (teamId: string) => {
    navigate(`/execution?team=${teamId}`)
    setMenuOpen(null)
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="flex items-center justify-between mb-8 border-b border-line pb-6">
        <div>
          <span className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">Teams</span>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">团队</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">管理你的 agent 团队配置。</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditTeam(null); setShowForm(true) }}>
          <Plus className="h-4 w-4" />
          创建团队
        </button>
      </div>

      <div className="mb-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-faint" />
          <input
            type="text"
            placeholder="搜索团队…"
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
          <h3 className="text-base font-medium text-ink">没有找到匹配的团队</h3>
          <p className="mt-1.5 text-[13px] text-ink-muted">尝试其他关键词，或清空搜索。</p>
        </div>
      ) : data?.items.length === 0 ? (
        <div className="card py-12 text-center">
          <Users className="mx-auto mb-5 h-12 w-12 text-ink-faint" />
          <h3 className="text-lg font-semibold tracking-tight text-ink">还没有团队</h3>
          <p className="mt-2 mb-7 text-[13px] text-ink-muted">创建你的第一个 agent 团队开始协作。</p>
          <button className="btn btn-primary mx-auto" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            创建团队
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.items.map((team: TeamListItem) => (
            <TeamCard
              key={team.id}
              team={team}
              menuOpen={menuOpen === team.id}
              onMenuToggle={() => setMenuOpen(menuOpen === team.id ? null : team.id)}
              onEdit={() => handleEdit(team)}
              onDelete={() => handleDelete(team.id)}
              onStart={() => handleStart(team.id)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <TeamForm team={editTeam} onClose={() => { setShowForm(false); setEditTeam(null) }} />
      )}
    </div>
  )
}

function TeamCard({
  team,
  menuOpen,
  onMenuToggle,
  onEdit,
  onDelete,
  onStart,
}: {
  team: TeamListItem
  menuOpen: boolean
  onMenuToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onStart: () => void
}) {
  const renderIcon = () => {
    const icon = team.icon?.trim()
    if (!icon) return <Users className="h-6 w-6 text-primary-400" />
    const isImageSrc =
      /^https?:\/\//.test(icon) ||
      icon.startsWith('data:') ||
      icon.startsWith('blob:') ||
      icon.startsWith('/') ||
      icon.startsWith('./') ||
      icon.startsWith('../') ||
      icon.includes('/') ||
      icon.includes('\\') ||
      icon.includes('.')
    if (isImageSrc) {
      return <img src={icon} alt={team.name} className="h-full w-full object-cover" />
    }
    return <span className="text-2xl leading-none">{icon}</span>
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
            <button onClick={onDelete} className="flex w-full items-center px-3 py-2 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300">
              <Trash2 className="mr-2.5 h-4 w-4" /> 删除
            </button>
          </div>
        )}
      </div>

      <div className="flex items-start mb-5 pr-8">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-primary-500/12 ring-1 ring-primary-500/25">
          {renderIcon()}
        </div>
        <div className="ml-3.5 flex-1">
          <h3 className="text-sm font-medium leading-tight text-ink">{team.name}</h3>
          <p className="mt-1 font-mono text-[11px] text-ink-faint">{team.member_count ?? 0} 个成员</p>
        </div>
      </div>

      {team.description && (
        <p className="mb-5 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">{team.description}</p>
      )}

      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary-500/10 px-2 py-0.5 text-[11px] font-medium text-primary-400 ring-1 ring-inset ring-primary-500/25">
            {modeLabels[team.collaboration_mode] || team.collaboration_mode}
          </span>
          {team.is_template && (
            <span className="rounded-full bg-elevated px-2 py-0.5 text-[11px] font-medium text-ink-muted ring-1 ring-inset ring-line">
              内置
            </span>
          )}
        </div>
        <span className="font-mono text-[11px] text-ink-faint">used {team.usage_count}</span>
      </div>

      <button
        onClick={onStart}
        className="btn btn-secondary w-full"
      >
        <Play className="h-4 w-4" />
        开始讨论
      </button>
    </div>
  )
}
