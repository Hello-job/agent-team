import { useEffect, useRef } from 'react'
import { Loader2, User, Bot, Wrench } from 'lucide-react'
import type { ExecutionMessage } from '@/types'

interface Props {
  messages: ExecutionMessage[]
  status: 'idle' | 'connecting' | 'connected' | 'completed' | 'error'
  error?: string | null
}

export default function ExecutionChat({ messages, status, error }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-base">
        {messages.length === 0 && (status === 'connected' || status === 'connecting') && (
          <div className="text-center text-ink-faint py-12 text-sm">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary-400" />
            等待讨论开始…
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 p-4 text-sm">
            出错了：{error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {status === 'connecting' && (
        <div className="p-3 border-t border-line bg-surface text-center text-ink-muted text-[11px] font-mono uppercase tracking-wider">
          <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-2 align-middle" />
          连接中…
        </div>
      )}
    </div>
  )
}

function MessageBubble({ message }: { message: ExecutionMessage }) {
  const isUser = message.sender_type === 'user'
  const isSystem = message.sender_type === 'system'
  const isTool = message.phase === 'tool_call' || message.phase === 'tool_result' || Boolean(message.sender_name?.startsWith('tool:'))
  const totalTokens = (message.input_tokens || 0) + (message.output_tokens || 0)

  const toolMeta = isTool ? message.metadata : null
  const toolName =
    (toolMeta && typeof toolMeta === 'object' && toolMeta.tool_name ? String(toolMeta.tool_name) : null) ||
    (message.sender_name?.startsWith('tool:') ? message.sender_name.slice('tool:'.length) : null) ||
    'tool'
  const toolStatus = message.phase === 'tool_result' ? (toolMeta?.ok === true ? 'OK' : toolMeta?.ok === false ? 'ERROR' : 'RESULT') : 'CALL'
  const toolAgent = toolMeta?.agent_name ? String(toolMeta.agent_name) : null
  const toolDuration = typeof toolMeta?.duration_ms === 'number' ? `${toolMeta.duration_ms}ms` : null
  const toolError = toolMeta?.error ? String(toolMeta.error) : null

  const jsonPreview = (value: unknown) => {
    try {
      const text = JSON.stringify(value, null, 2) || ''
      if (text.length <= 6000) return text
      return `${text.slice(0, 6000)}\n…(truncated)…`
    } catch {
      return String(value)
    }
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} group`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
        isUser
          ? 'bg-primary-500/12 ring-1 ring-primary-500/25'
          : isTool
          ? 'bg-elevated ring-1 ring-line'
          : isSystem
          ? 'bg-elevated ring-1 ring-line'
          : 'bg-primary-500/12 ring-1 ring-primary-500/25'
      }`}>
        {isUser ? (
          <User className="w-[18px] h-[18px] text-primary-400" />
        ) : isTool ? (
          <Wrench className="w-[18px] h-[18px] text-ink-muted" />
        ) : (
          <Bot className={`w-[18px] h-[18px] ${isSystem ? 'text-ink-muted' : 'text-primary-400'}`} />
        )}
      </div>

        <div className={`max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        {message.sender_name && (
          <div className="text-[11px] font-mono text-ink-muted mb-1.5">
            <span className="text-primary-400">{isTool ? `${toolName}${toolAgent ? ` · ${toolAgent}` : ''}` : message.sender_name}</span>
            {isTool && (
              <span className="ml-2 text-ink-faint">
                {toolStatus}{toolDuration ? ` · ${toolDuration}` : ''}{toolError ? ` · ${toolError}` : ''}
              </span>
            )}
          </div>
        )}
        <div className={`p-3.5 rounded-2xl text-sm transition-colors ${
          isUser
            ? 'bg-primary-500/12 border border-primary-500/25 text-ink'
            : isTool
            ? 'bg-base/60 border border-line text-ink-muted'
            : isSystem
            ? 'bg-elevated border border-line text-ink-muted'
            : 'bg-surface border border-line text-ink'
        }`}>
          {isTool ? (
            <details className="text-sm">
              <summary className="cursor-pointer select-none whitespace-pre-wrap leading-relaxed text-ink">
                {message.content || `${toolStatus} ${toolName}`}
              </summary>
              <div className="mt-3 space-y-3">
                {message.phase === 'tool_call' && toolMeta?.arguments !== undefined && (
                  <div>
                    <div className="text-[11px] font-mono text-ink-faint mb-1.5 uppercase tracking-wider">arguments</div>
                    <pre className="whitespace-pre-wrap text-xs leading-relaxed font-mono text-ink-muted bg-base rounded-lg border border-line p-3 overflow-x-auto">
                      {jsonPreview(toolMeta.arguments)}
                    </pre>
                  </div>
                )}
                {message.phase === 'tool_result' && (
                  <div>
                    <div className="text-[11px] font-mono text-ink-faint mb-1.5 uppercase tracking-wider">output</div>
                    {toolName === 'read_file' && toolMeta?.ok === true && (toolMeta?.output as { truncated?: boolean } | undefined)?.truncated === true && (
                      <div className="mb-3 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 leading-relaxed">
                        文件过大，已截断。使用 offset 参数读取更多内容
                      </div>
                    )}
                    <pre className="whitespace-pre-wrap text-xs leading-relaxed font-mono text-ink-muted bg-base rounded-lg border border-line p-3 overflow-x-auto">
                      {jsonPreview(toolMeta?.ok === false ? { error: toolMeta?.error } : toolMeta?.output)}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          ) : (
            <p className="whitespace-pre-wrap leading-relaxed">
              {message.content}
              {message.streaming && (
                <span className="inline-block w-2 h-4 ml-0.5 bg-primary-400 animate-pulse align-middle" />
              )}
            </p>
          )}
        </div>
        <div className="text-[11px] font-mono text-ink-faint mt-1.5">
          round {message.round} · {message.phase}
          {totalTokens > 0 && !isTool && (
            <span className={`ml-2 ${message.tokens_estimated ? 'cursor-help' : ''}`} title={message.tokens_estimated ? '估算值' : undefined}>
              tokens: {message.tokens_estimated ? `~${totalTokens}` : totalTokens}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
