import { Link } from 'react-router-dom'
import { Bot, Users, Play, ChevronRight, ArrowRight } from 'lucide-react'
import { AgentNetwork } from '@/components/Common/AgentNetwork'

const entries = [
  {
    to: '/agents',
    icon: Bot,
    title: '创建 Agent',
    desc: '定义专业 AI agent —— 系统提示词、模型、工具与行为。',
  },
  {
    to: '/teams',
    icon: Users,
    title: '组建团队',
    desc: '把多个 agent 组合成团队，选择协作模式与流程。',
  },
  {
    to: '/execution',
    icon: Play,
    title: '开始讨论',
    desc: '选团队、输入问题，实时运行多 agent 协作并逐字流式输出。',
  },
]

const capabilities = [
  { title: '四种协作模式', desc: '圆桌、流水线、对抗辩论、自由调度。' },
  { title: '实时流式', desc: '逐 token 查看每个 agent 的发言与进展。' },
  { title: '可控运行', desc: '随时暂停 / 停止，token 与成本预算强制生效。' },
  { title: '灵活配置', desc: '自定义提示词、模型、工具与知识库。' },
]

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      {/* Hero band — the agent network is the visual anchor */}
      <section className="animate-fade-up relative overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-[70%]">
          <AgentNetwork className="h-full w-full" />
          <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/75 to-transparent" />
        </div>

        <div className="relative max-w-md px-8 py-14">
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary-400">
            multi-agent
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">Agent Team</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
            创建、编排并实时运行多 agent 协作讨论 —— 圆桌、辩论、流水线与自由调度。
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/execution" className="btn btn-primary">
              开始讨论
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/teams" className="btn btn-secondary">
              组建团队
            </Link>
          </div>
        </div>
      </section>

      {/* Quick access */}
      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        {entries.map((entry, i) => {
          const Icon = entry.icon
          return (
            <Link
              key={entry.to}
              to={entry.to}
              style={{ animationDelay: `${80 + i * 60}ms` }}
              className="group animate-fade-up rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-elevated"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500/12 ring-1 ring-primary-500/25">
                  <Icon className="h-[18px] w-[18px] text-primary-400" />
                </div>
                <ChevronRight className="h-4 w-4 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink-muted" />
              </div>
              <h2 className="mt-4 text-sm font-medium text-ink">{entry.title}</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{entry.desc}</p>
            </Link>
          )
        })}
      </section>

      {/* Capabilities — plain list, no boxes */}
      <section
        className="mt-12 animate-fade-up border-t border-line pt-6"
        style={{ animationDelay: '280ms' }}
      >
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">能力</h3>
        <dl className="mt-4 grid gap-x-10 gap-y-5 sm:grid-cols-2">
          {capabilities.map((cap) => (
            <div key={cap.title}>
              <dt className="text-sm font-medium text-ink">{cap.title}</dt>
              <dd className="mt-1 text-[13px] leading-relaxed text-ink-muted">{cap.desc}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
