import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Send, Pause, Play, Square, MessageSquare } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useExecution, useCreateExecution, useControlExecution, useDeleteExecution, useExecutionSocket } from '@/hooks'
import { ExecutionChat } from '@/components/Execution'
import { buildExecutionLLMConfig } from '@/services/modelConfigStore'
import { isTauriApp, tauriConfirm } from '@/services/tauri'
import ExecutionWorkspacePanel from '@/components/Execution/ExecutionWorkspacePanel'
import { useToast } from '@/components/Common/Toast'
import { getErrorMessage } from '@/utils/errors'
import type { ExecutionMessage } from '@/types'

export default function ExecutionPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const teamId = searchParams.get('team') || searchParams.get('team_id')
  const { toast } = useToast()

  const [chatInput, setChatInput] = useState('')
  const [initialInput, setInitialInput] = useState('')
  const [clientMessages, setClientMessages] = useState<ExecutionMessage[]>([])
  const [isSendingFollowup, setIsSendingFollowup] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [executionId, setExecutionId] = useState<string | null>(id || null)
  const [isCreating, setIsCreating] = useState(false)

  const effectiveId = id || executionId
  const { data: execution, isLoading } = useExecution(effectiveId || '')
  const createExecution = useCreateExecution()
  const controlExecution = useControlExecution()
  const deleteExecution = useDeleteExecution()
  const llm = buildExecutionLLMConfig()
  const { messages, status: streamStatus, error: streamError, sendFollowup, reconnect } =
    useExecutionSocket(effectiveId)

  const baseMessages = useMemo(() => {
    const merged = new Map<string, ExecutionMessage>()
    const recent = execution?.recent_messages || []
    for (const m of recent) merged.set(m.id, m)
    for (const m of messages || []) merged.set(m.id, m)
    return Array.from(merged.values()).sort((a, b) => {
      const sa = Number(a.sequence || 0)
      const sb = Number(b.sequence || 0)
      if (sa !== sb) return sa - sb
      return String(a.created_at || '').localeCompare(String(b.created_at || ''))
    })
  }, [execution?.recent_messages, messages])

  const displayMessages = useMemo(() => {
    const merged = new Map<string, ExecutionMessage>()
    for (const m of baseMessages) merged.set(m.id, m)
    for (const m of clientMessages) merged.set(m.id, m)
    return Array.from(merged.values()).sort((a, b) => {
      const sa = Number(a.sequence || 0)
      const sb = Number(b.sequence || 0)
      if (sa !== sb) return sa - sb
      return String(a.created_at || '').localeCompare(String(b.created_at || ''))
    })
  }, [baseMessages, clientMessages])

  useEffect(() => {
    setExecutionId(id || null)
  }, [id])

  useEffect(() => {
    if (effectiveId) {
      localStorage.setItem('agent-team:lastExecutionId', effectiveId)
      return
    }
    if (!id && !teamId) {
      const last = localStorage.getItem('agent-team:lastExecutionId')
      if (last) navigate(`/execution/${last}`)
    }
  }, [effectiveId, id, teamId, navigate])

  const handleStartDiscussion = async () => {
    if (!teamId || !initialInput.trim()) return
    if (!llm) {
      setStartError('需要先在 "API 配置" 里创建默认配置并填写 API Key。')
      return
    }

    setIsCreating(true)
    setStartError(null)
    try {
      const result = await createExecution.mutateAsync({
        team_id: teamId,
        input: initialInput.trim(),
        title: undefined,
        llm,
      })
      setExecutionId(result.id)
      navigate(`/execution/${result.id}?team=${teamId}`, { replace: true })
    } catch (e) {
      setStartError(getErrorMessage(e, '创建执行失败'))
      toast('error', '启动讨论失败')
    } finally {
      setIsCreating(false)
    }
  }

  const handleControl = async (action: string) => {
    if (!effectiveId) return
    try {
      await controlExecution.mutateAsync({ id: effectiveId, action })
    } catch (e) {
      toast('error', getErrorMessage(e, `操作 ${action} 失败`))
    }
  }

  const handleNewDiscussion = async () => {
    const resolvedTeamId = teamId || execution?.team_id
    if (!resolvedTeamId) {
      navigate('/teams')
      return
    }
    // Reset to initial input state for the same team
    setExecutionId(null)
    setClientMessages([])
    setInitialInput('')
    setStartError(null)
    navigate(`/execution?team=${resolvedTeamId}`)
  }

  const handleDeleteDiscussion = async () => {
    if (!effectiveId) return
    const confirmed = await tauriConfirm('确定删除当前讨论？删除后无法恢复。', '删除讨论')
    if (!confirmed) return

    try {
      await deleteExecution.mutateAsync(effectiveId)
      const last = localStorage.getItem('agent-team:lastExecutionId')
      if (last === effectiveId) localStorage.removeItem('agent-team:lastExecutionId')
      setClientMessages([])
      setExecutionId(null)
      toast('success', '讨论已删除')
      navigate('/teams')
    } catch (e) {
      setStartError(getErrorMessage(e, '删除失败'))
      toast('error', '删除讨论失败')
    }
  }

  const handleFollowup = async () => {
    if (!effectiveId || !chatInput.trim()) return
    if (!execution) return

    const text = chatInput.trim()
    setChatInput('')

    if (execution.status === 'running') {
      await handleControl('pause')
    }

    setIsSendingFollowup(true)
    const ok = sendFollowup(text)
    if (!ok) {
      setClientMessages((prev) => [
        ...prev,
        {
          id: `${effectiveId}-sys-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          sequence: 0,
          round: 0,
          phase: 'error',
          sender_type: 'system',
          sender_name: 'system',
          content: '追问失败: WebSocket 未连接',
          content_type: 'text',
          wants_to_continue: true,
          input_tokens: 0,
          output_tokens: 0,
          tokens_estimated: false,
          metadata: {},
          created_at: new Date().toISOString(),
        },
      ])
      toast('error', '追问失败: WebSocket 未连接')
    }
    setIsSendingFollowup(false)
  }

  // Show initial input form when coming from a team but no execution yet
  if (!effectiveId) {
    return (
      <div className="flex items-center justify-center h-screen px-8">
        <div className="card w-full max-w-lg">
          <h2 className="text-lg font-semibold tracking-tight text-ink mb-4">讨论</h2>

          {teamId && !llm ? (
            <div className="mb-2">
              <p className="text-sm text-amber-300 mb-4">
                需要先配置 API Key 才能开始讨论。
              </p>
              <button className="btn btn-primary w-full" onClick={() => navigate('/models')}>
                去配置 API
              </button>
            </div>
          ) : startError ? (
            <div className="mb-2">
              <p className="text-sm text-red-400 mb-4">
                启动讨论失败：{startError}
              </p>
              <button className="btn btn-secondary w-full mb-3" onClick={() => setStartError(null)}>
                重试
              </button>
              <button className="btn btn-primary w-full" onClick={() => navigate('/teams')}>
                返回团队列表
              </button>
            </div>
          ) : teamId ? (
            <div>
              <p className="text-sm text-ink-muted mb-6">
                输入讨论主题，让 Agent 团队开始协作。
              </p>
              <div className="mb-6">
                <label className="label">讨论主题</label>
                <textarea
                  className="input w-full h-32 py-2 resize-none"
                  placeholder="例如：设计一个用户认证系统的技术方案…"
                  value={initialInput}
                  onChange={(e) => setInitialInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && initialInput.trim()) {
                      e.preventDefault()
                      void handleStartDiscussion()
                    }
                  }}
                  autoFocus
                />
                <p className="text-[11px] text-ink-faint mt-2">
                  按 Cmd+Enter 快速开始
                </p>
              </div>
              <button
                className="btn btn-primary w-full"
                disabled={!initialInput.trim() || isCreating}
                onClick={() => void handleStartDiscussion()}
              >
                {isCreating ? (
                  <span className="animate-pulse">正在启动讨论…</span>
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4" />
                    开始讨论
                  </>
                )}
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-ink-muted mb-6">从团队页面选择一个团队开始讨论。</p>
              <button className="btn btn-primary w-full" onClick={() => navigate('/teams')}>
                去选择团队
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-ink-muted text-sm animate-pulse">加载中…</div>
      </div>
    )
  }

  if (!execution) {
    return (
      <div className="flex items-center justify-center h-screen px-8">
        <div className="card w-full max-w-lg">
          <h2 className="text-lg font-semibold tracking-tight text-ink mb-4">讨论不存在</h2>
          <p className="text-sm text-ink-muted mb-6">可能已被删除，或本地记录的 ID 已失效。</p>
          <button
            className="btn btn-secondary w-full mb-3"
            onClick={() => {
              localStorage.removeItem('agent-team:lastExecutionId')
              navigate('/teams')
            }}
          >
            去选择团队
          </button>
          <button className="btn btn-primary w-full" onClick={() => navigate('/execution')}>
            返回讨论入口
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-surface">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">讨论</h1>
          <div className="text-[11px] font-mono text-ink-muted mt-1.5 flex gap-4">
            <span>状态 <span className="text-primary-400">{execution.status}</span></span>
            <span>轮次 <span className="text-primary-400">{execution.current_round}</span></span>
            {streamStatus === 'connecting' && <span className="text-amber-400 animate-pulse">连接中…</span>}
            {streamStatus === 'error' && <span className="text-red-400">连接出错</span>}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {streamStatus === 'error' && (
            <button className="btn btn-outline" onClick={() => reconnect()}>
              重连
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => void handleNewDiscussion()} disabled={!llm}>
            新建
          </button>

          {execution.status === 'running' ? (
            <button className="btn btn-secondary" onClick={() => handleControl('pause')}>
              <Pause className="w-4 h-4" />
              暂停
            </button>
          ) : execution.status === 'paused' ? (
            <button className="btn btn-primary" onClick={() => handleControl('resume')}>
              <Play className="w-4 h-4" />
              继续
            </button>
          ) : null}

          {['running', 'paused'].includes(execution.status) && (
            <button
              className="btn btn-outline text-red-400 hover:bg-red-500/10 hover:text-red-400"
              onClick={() => handleControl('stop')}
            >
              <Square className="w-4 h-4" />
              停止
            </button>
          )}

          <button
            className="btn btn-outline text-red-400 hover:bg-red-500/10 hover:text-red-400"
            onClick={() => void handleDeleteDiscussion()}
            disabled={deleteExecution.isPending}
            title="删除当前讨论"
          >
            删除
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex bg-base">
        {isTauriApp() && (
          <ExecutionWorkspacePanel
            executionId={effectiveId}
            initialWorkspacePath={execution.workspace_path}
          />
        )}
        <div className="flex-1 overflow-hidden border-l border-line">
          <ExecutionChat messages={displayMessages} status={streamStatus} error={streamError} />
        </div>
      </div>

      <div className="px-6 py-3 border-t border-line bg-surface">
        <div className="flex items-center justify-between text-[11px] font-mono text-ink-muted mb-2">
          <span className="uppercase tracking-wider">token 用量</span>
          <span>
            {execution.tokens_used.toLocaleString()} / {execution.tokens_budget.toLocaleString()}
          </span>
        </div>
        <div className="w-full bg-elevated rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-primary-500 h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, (execution.tokens_used / execution.tokens_budget) * 100)}%` }}
          />
        </div>
      </div>

      {execution.status !== 'failed' && (
        <div className="px-6 py-4 border-t border-line bg-surface">
          {!llm && (
            <div className="mb-4 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 leading-relaxed">
              需要先在 “API 配置” 里创建默认配置并填写 API Key。
              <button
                type="button"
                className="ml-2 underline text-amber-200 hover:text-amber-100"
                onClick={() => navigate('/models')}
              >
                去配置
              </button>
            </div>
          )}
          {startError && (
            <div className="mb-4 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3 leading-relaxed">
              出错了：{startError}
            </div>
          )}
          <div className="flex items-center gap-3">
            <input
              type="text"
              className="input flex-1"
              placeholder="输入追问，按 Enter 发送…"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && chatInput.trim()) {
                  e.preventDefault()
                  void handleFollowup()
                }
              }}
              disabled={!effectiveId || isSendingFollowup}
            />
            <button
              className="btn btn-primary px-3"
              disabled={!chatInput.trim() || !effectiveId || isSendingFollowup}
              onClick={() => void handleFollowup()}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-ink-faint mt-2.5">
            后端只允许在暂停 / 完成状态处理追问；运行中会先请求暂停。
          </p>
        </div>
      )}
    </div>
  )
}
