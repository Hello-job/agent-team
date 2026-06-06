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
    <div className="flex flex-col h-full font-pixel">
      <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-[#1a1a1a]">
        {messages.length === 0 && (status === 'connected' || status === 'connecting') && (
          <div className="text-center text-gray-500 py-12 uppercase tracking-widest">
            <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary-500" />
            [ WAITING FOR DISCUSSION TO START... ]
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {error && (
          <div className="bg-red-900/50 text-red-400 p-4 border-2 border-red-500 shadow-pixel-sm uppercase text-xs">
            ERROR: {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {status === 'connecting' && (
        <div className="p-4 border-t-4 border-black bg-[#2d2d2d] text-center text-gray-400 uppercase text-[10px] font-press tracking-tighter">
          <Loader2 className="w-4 h-4 animate-spin inline mr-3" />
          CONNECTING...
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
    <div className={`flex gap-4 ${isUser ? 'flex-row-reverse' : ''} group`}>
      <div className={`w-12 h-12 border-4 border-black flex items-center justify-center flex-shrink-0 shadow-pixel-sm ${
        isUser ? 'bg-primary-600' : isTool ? 'bg-purple-700' : isSystem ? 'bg-gray-600' : 'bg-green-600'
      }`}>
        {isUser ? <User className="w-6 h-6 text-white" /> : isTool ? <Wrench className="w-6 h-6 text-white" /> : <Bot className="w-6 h-6 text-white" />}
      </div>

        <div className={`max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        {message.sender_name && (
          <div className="text-[10px] font-press text-primary-400 mb-2 uppercase tracking-tighter">
            {isTool ? `${toolName}${toolAgent ? ` · ${toolAgent}` : ''}` : message.sender_name}
            {isTool && (
              <span className="ml-3 text-gray-500">
                {toolStatus}{toolDuration ? ` · ${toolDuration}` : ''}{toolError ? ` · ${toolError}` : ''}
              </span>
            )}
          </div>
        )}
        <div className={`p-4 border-4 border-black shadow-pixel transition-transform group-hover:translate-x-[2px] group-hover:translate-y-[2px] group-hover:shadow-pixel-sm ${
          isUser
            ? 'bg-primary-600 text-white'
            : isTool
            ? 'bg-[#241a33] text-white'
            : isSystem
            ? 'bg-[#333] text-gray-400'
            : 'bg-[#2d2d2d] text-white'
        }`}>
          {isTool ? (
            <details className="text-sm">
              <summary className="cursor-pointer select-none whitespace-pre-wrap leading-relaxed">
                {message.content || `${toolStatus} ${toolName}`}
              </summary>
              <div className="mt-3 space-y-3">
                {message.phase === 'tool_call' && toolMeta?.arguments !== undefined && (
                  <div>
                    <div className="text-[10px] font-press text-gray-400 mb-2 uppercase tracking-tighter">ARGUMENTS</div>
                    <pre className="whitespace-pre-wrap text-xs leading-relaxed bg-black/30 p-3 border-2 border-black overflow-x-auto">
                      {jsonPreview(toolMeta.arguments)}
                    </pre>
                  </div>
                )}
                {message.phase === 'tool_result' && (
                  <div>
                    <div className="text-[10px] font-press text-gray-400 mb-2 uppercase tracking-tighter">OUTPUT</div>
                    {toolName === 'read_file' && toolMeta?.ok === true && (toolMeta?.output as { truncated?: boolean } | undefined)?.truncated === true && (
                      <div className="mb-3 text-[10px] font-press text-yellow-300 bg-yellow-900/30 border-2 border-yellow-500 p-3 shadow-pixel-sm uppercase tracking-tighter leading-relaxed">
                        文件过大，已截断。使用 offset 参数读取更多内容
                      </div>
                    )}
                    <pre className="whitespace-pre-wrap text-xs leading-relaxed bg-black/30 p-3 border-2 border-black overflow-x-auto">
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
        <div className="text-[10px] font-press text-gray-500 mt-3 uppercase tracking-tighter">
          ROUND {message.round} · {message.phase}
          {totalTokens > 0 && !isTool && (
            <span className={`ml-3 text-gray-500 ${message.tokens_estimated ? 'cursor-help' : ''}`} title={message.tokens_estimated ? '估算值' : undefined}>
              TOKENS: {message.tokens_estimated ? `~${totalTokens}` : totalTokens}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
