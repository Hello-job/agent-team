import { useState } from 'react'
import { Plus, Search, Users, MoreVertical, Trash2, Edit, Play } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTeams, useDeleteTeam } from '@/hooks'
import { TeamForm } from '@/components/Team'
import type { Team, TeamListItem } from '@/types'
import { teamApi } from '@/services/api'

const modeLabels: Record<string, string> = {
  roundtable: '圆桌讨论',
  pipeline: '流水线',
  debate: '对抗辩论',
  freeform: '自由协作',
  custom: '自定义',
}

const modeColors: Record<string, string> = {
  roundtable: 'bg-blue-600 text-white',
  pipeline: 'bg-purple-600 text-white',
  debate: 'bg-red-600 text-white',
  freeform: 'bg-green-600 text-white',
  custom: 'bg-gray-700 text-white',
}

export default function TeamsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editTeam, setEditTeam] = useState<Team | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  const { data, isLoading } = useTeams({ search: search || undefined })
  const deleteTeam = useDeleteTeam()

  const handleEdit = async (team: TeamListItem) => {
    const fullTeam = await teamApi.get(team.id)
    setEditTeam(fullTeam)
    setShowForm(true)
    setMenuOpen(null)
  }

  const handleDelete = async (id: string) => {
    if (confirm('确定删除此团队?')) {
      await deleteTeam.mutateAsync(id)
    }
    setMenuOpen(null)
  }

  const handleStart = (teamId: string) => {
    navigate(`/execution?team=${teamId}`)
    setMenuOpen(null)
  }

  return (
    <div className="p-8 font-pixel">
      <div className="flex items-center justify-between mb-8 border-b-4 border-black pb-6">
        <div>
          <h1 className="text-3xl font-press text-white mb-2">TEAMS</h1>
          <p className="text-gray-400 uppercase tracking-tighter text-sm">管理你的 Agent 团队配置</p>
        </div>
        <button className="btn btn-primary flex items-center" onClick={() => { setEditTeam(null); setShowForm(true) }}>
          <Plus className="w-5 h-5 mr-2" />
          创建团队
        </button>
      </div>

      <div className="mb-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="搜索团队..."
            className="input pl-12"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400 uppercase">加载中...</div>
      ) : data?.items.length === 0 ? (
        <div className="card text-center py-12">
          <Users className="w-16 h-16 text-gray-600 mx-auto mb-6" />
          <h3 className="text-xl font-press text-white mb-4">还没有团队</h3>
          <p className="text-gray-400 mb-8 uppercase text-sm tracking-tight">创建你的第一个 Agent 团队开始协作</p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus className="w-5 h-5 mr-2 inline" />
            创建团队
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
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
    if (!icon) return <Users className="w-8 h-8 text-white" />
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
      return <img src={icon} alt={team.name} className="w-10 h-10 rendering-pixelated" />
    }
    return <span className="text-3xl leading-none">{icon}</span>
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
            <button onClick={onDelete} className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-red-600 hover:text-white flex items-center border-b-2 border-black last:border-b-0 uppercase tracking-tighter">
              <Trash2 className="w-4 h-4 mr-3" /> 删除
            </button>
          </div>
        )}
      </div>

      <div className="flex items-start mb-6 pr-8">
        <div className="w-16 h-16 border-4 border-black bg-gradient-to-br from-primary-600 to-purple-600 flex items-center justify-center shadow-pixel-sm">
          {renderIcon()}
        </div>
        <div className="ml-4 flex-1">
          <h3 className="text-lg font-press text-white leading-tight mb-1">{team.name}</h3>
          <p className="text-xs text-primary-400 uppercase tracking-widest">{team.member_count ?? 0} 个成员</p>
        </div>
      </div>

      {team.description && (
        <div className="bg-black/20 p-3 border-2 border-black mb-6">
          <p className="text-gray-400 text-sm line-clamp-2 leading-relaxed">{team.description}</p>
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] font-press mb-6">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 border-2 border-black shadow-pixel-sm ${modeColors[team.collaboration_mode] || modeColors.custom}`}>
            {modeLabels[team.collaboration_mode] || team.collaboration_mode}
          </span>
          {team.is_template && (
            <span className="px-2 py-1 border-2 border-black shadow-pixel-sm bg-gray-700 text-white">
              内置
            </span>
          )}
        </div>
        <span className="text-gray-500 uppercase">USED: {team.usage_count}</span>
      </div>

      <button
        onClick={onStart}
        className="w-full btn btn-primary flex items-center justify-center py-3 font-press text-xs tracking-tighter"
      >
        <Play className="w-4 h-4 mr-2 fill-current" />
        开始讨论
      </button>
    </div>
  )
}
