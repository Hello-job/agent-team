import { useState } from 'react'
import { Sliders, Settings, Sun, Moon, Laptop } from 'lucide-react'
import ModelConfigManager from '@/components/ModelConfig/ModelConfigManager'
import { useAppStore } from '@/stores/appStore'

export default function SettingsPage() {
  const { theme, setTheme } = useAppStore()
  const [activeTab, setActiveTab] = useState<'general' | 'api'>('general')

  return (
    <div className="mx-auto max-w-5xl px-8 py-8 animate-fade-up">
      {/* Settings Tab Navigation */}
      <div className="flex border-b border-line mb-8 gap-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab('general')}
          className={`pb-3 border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'general'
              ? 'border-primary-500 text-primary-400 font-semibold'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <Sliders className="w-4 h-4" />
          通用设置
        </button>
        <button
          onClick={() => setActiveTab('api')}
          className={`pb-3 border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'api'
              ? 'border-primary-500 text-primary-400 font-semibold'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <Settings className="w-4 h-4" />
          API 配置
        </button>
      </div>

      {/* Tab Content */}
      <div className="transition-all duration-200">
        {activeTab === 'general' ? (
          <div>
            {/* Header */}
            <div className="mb-8 border-b border-line pb-6">
              <h1 className="text-2xl font-semibold tracking-tight text-ink mb-1.5 flex items-center gap-2.5">
                <Sliders className="w-6 h-6 text-primary-400" />
                通用设置
              </h1>
              <p className="text-[13px] text-ink-muted">配置界面主题及基本选项</p>
            </div>

            {/* Appearance Section */}
            <div className="card">
              <h2 className="text-base font-semibold text-ink mb-2">外观设置</h2>
              <p className="text-[13px] text-ink-muted mb-6">选择适合您的应用配色主题</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Light Theme Option */}
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`group relative flex flex-col items-stretch overflow-hidden rounded-xl border text-left transition-all ${
                    theme === 'light'
                      ? 'border-primary-500 ring-2 ring-primary-500/20 bg-elevated/40'
                      : 'border-line hover:border-line-strong hover:bg-elevated/20'
                  }`}
                >
                  {/* Mockup Preview */}
                  <div className="h-28 bg-[#f8f9fa] p-3 border-b border-line flex flex-col justify-between select-none">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-slate-300" />
                      <div className="w-10 h-1.5 rounded bg-slate-200" />
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 h-12 rounded bg-white border border-slate-200 p-1.5 flex flex-col gap-1">
                        <div className="w-1/2 h-1 rounded bg-slate-200" />
                        <div className="w-3/4 h-1 rounded bg-slate-100" />
                        <div className="w-1/3 h-1 rounded bg-[#18181b]/30" />
                      </div>
                      <div className="w-6 h-12 rounded bg-[#f1f3f5] border border-slate-200" />
                    </div>
                  </div>
                  {/* Details */}
                  <div className="p-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-ink group-hover:text-primary-500 transition-colors">浅色模式</div>
                      <div className="text-[11px] text-ink-muted mt-0.5">清新明朗，适合光线充足的环境</div>
                    </div>
                    <div className={`p-2 rounded-lg border transition-colors ${
                      theme === 'light'
                        ? 'bg-primary-500/10 border-primary-500/20 text-primary-500'
                        : 'border-line text-ink-faint group-hover:text-ink-muted'
                    }`}>
                      <Sun className="w-[18px] h-[18px]" />
                    </div>
                  </div>
                </button>

                {/* Dark Theme Option */}
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`group relative flex flex-col items-stretch overflow-hidden rounded-xl border text-left transition-all ${
                    theme === 'dark'
                      ? 'border-primary-500 ring-2 ring-primary-500/20 bg-elevated/40'
                      : 'border-line hover:border-line-strong hover:bg-elevated/20'
                  }`}
                >
                  {/* Mockup Preview */}
                  <div className="h-28 bg-[#161618] p-3 border-b border-line flex flex-col justify-between select-none">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-zinc-800" />
                      <div className="w-10 h-1.5 rounded bg-zinc-800" />
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 h-12 rounded bg-[#121214] border border-zinc-900 p-1.5 flex flex-col gap-1">
                        <div className="w-1/2 h-1 rounded bg-zinc-800" />
                        <div className="w-3/4 h-1 rounded bg-zinc-900" />
                        <div className="w-1/3 h-1 rounded bg-white/30" />
                      </div>
                      <div className="w-6 h-12 rounded bg-[#121214] border border-zinc-900" />
                    </div>
                  </div>
                  {/* Details */}
                  <div className="p-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-ink group-hover:text-primary-450 transition-colors">深色模式</div>
                      <div className="text-[11px] text-ink-muted mt-0.5">沉浸护眼，展现科技极客美学</div>
                    </div>
                    <div className={`p-2 rounded-lg border transition-colors ${
                      theme === 'dark'
                        ? 'bg-primary-500/10 border-primary-500/20 text-primary-400'
                        : 'border-line text-ink-faint group-hover:text-ink-muted'
                    }`}>
                      <Moon className="w-[18px] h-[18px]" />
                    </div>
                  </div>
                </button>

                {/* System Theme Option */}
                <button
                  type="button"
                  onClick={() => setTheme('system')}
                  className={`group relative flex flex-col items-stretch overflow-hidden rounded-xl border text-left transition-all ${
                    theme === 'system'
                      ? 'border-primary-500 ring-2 ring-primary-500/20 bg-elevated/40'
                      : 'border-line hover:border-line-strong hover:bg-elevated/20'
                  }`}
                >
                  {/* Mockup Preview */}
                  <div className="h-28 bg-transparent flex border-b border-line select-none relative overflow-hidden">
                    <div className="w-1/2 bg-[#f8f9fa] p-3 flex flex-col justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-slate-300" />
                        <div className="w-8 h-1.5 rounded bg-slate-200" />
                      </div>
                      <div className="h-12 rounded bg-white border border-slate-200 p-1 flex flex-col gap-1 overflow-hidden">
                        <div className="w-full h-1 rounded bg-slate-200" />
                        <div className="w-3/4 h-1 rounded bg-slate-100" />
                      </div>
                    </div>
                    <div className="w-1/2 bg-[#161618] p-3 flex flex-col justify-between">
                      <div className="flex items-center gap-1.5 justify-end">
                        <div className="w-8 h-1.5 rounded bg-zinc-800" />
                        <div className="w-2 h-2 rounded-full bg-zinc-800" />
                      </div>
                      <div className="h-12 rounded bg-[#121214] border border-zinc-900 p-1 flex flex-col gap-1 overflow-hidden">
                        <div className="w-full h-1 rounded bg-zinc-800" />
                        <div className="w-3/4 h-1 rounded bg-zinc-900" />
                      </div>
                    </div>
                  </div>
                  {/* Details */}
                  <div className="p-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-ink group-hover:text-primary-400 transition-colors">跟随系统</div>
                      <div className="text-[11px] text-ink-muted mt-0.5">根据操作系统偏好自动切换</div>
                    </div>
                    <div className={`p-2 rounded-lg border transition-colors ${
                      theme === 'system'
                        ? 'bg-primary-500/10 border-primary-500/20 text-primary-400'
                        : 'border-line text-ink-faint group-hover:text-ink-muted'
                    }`}>
                      <Laptop className="w-[18px] h-[18px]" />
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className="-mx-8 -my-8">
              <ModelConfigManager />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
