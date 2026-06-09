import { Outlet, Link, useLocation } from 'react-router-dom'
import { Users, Bot, Play, Home, Settings, Network } from 'lucide-react'
import clsx from 'clsx'

const navItems = [
  { path: '/', label: '首页', icon: Home },
  { path: '/agents', label: 'Agents', icon: Bot },
  { path: '/teams', label: '团队', icon: Users },
  { path: '/execution', label: '讨论', icon: Play },
  { path: '/settings', label: '设置', icon: Settings },
]

export default function Layout() {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-base text-ink">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-[232px] bg-sidebar border-r border-line flex flex-col">
        {/* Brand */}
        <div className="flex items-center gap-3 h-16 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500/15 ring-1 ring-primary-500/25">
            <Network className="h-[18px] w-[18px] text-primary-400" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-ink">Agent Team</div>
            <div className="text-[11px] text-ink-faint">多 agent 编排</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 pt-2">
          <div className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            工作区
          </div>
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)

            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  'group flex items-center gap-3 h-9 px-2.5 mb-0.5 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-elevated text-ink'
                    : 'text-ink-muted hover:text-ink hover:bg-elevated/60'
                )}
              >
                <Icon
                  className={clsx(
                    'h-[18px] w-[18px] transition-colors',
                    isActive ? 'text-primary-400' : 'text-ink-faint group-hover:text-ink-muted'
                  )}
                />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-line">
          <div className="flex items-center gap-2 text-[11px] text-ink-faint">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
            <span className="font-mono">v1.0.0</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-[232px] min-h-screen">
        <Outlet />
      </main>
    </div>
  )
}
