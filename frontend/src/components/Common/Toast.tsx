import { useEffect, useState, useCallback, createContext, useContext } from 'react'
import { X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    setToasts((prev) => [...prev, { id, type, message }])
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const colorMap = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-ink',
  error: 'border-red-500/30 bg-red-500/10 text-ink',
  warning: 'border-amber-500/30 bg-amber-500/10 text-ink',
  info: 'border-line bg-surface text-ink',
}

const iconColorMap = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-ink-muted',
}

function ToastItem({ toast, onDismiss }: { toast: Toast, onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onDismiss(toast.id), 200)
    }, 3500)
    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])

  const Icon = iconMap[toast.type]

  return (
    <div
      className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border shadow-soft text-sm max-w-sm transition-all duration-200 ${colorMap[toast.type]} ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${iconColorMap[toast.type]}`} />
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={() => { setVisible(false); setTimeout(() => onDismiss(toast.id), 200) }}
        className="flex-shrink-0 text-ink-faint transition-colors hover:text-ink-muted"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
