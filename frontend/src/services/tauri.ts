export function isTauriApp() {
  return (
    typeof window !== 'undefined' &&
    (Boolean((window as any).__TAURI__) || Boolean((window as any).__TAURI_INTERNALS__))
  )
}

export async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  
  // Tauri v2 expects camelCase for argument names if the Rust side uses snake_case.
  // We convert keys here to maintain compatibility with existing snake_case code.
  const camelArgs: Record<string, unknown> = {}
  if (args) {
    for (const key in args) {
      const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase())
      camelArgs[camelKey] = args[key]
    }
  }

  return invoke<T>(command, camelArgs)
}

export async function tauriListen<TPayload>(
  eventName: string,
  handler: (payload: TPayload) => void,
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event')
  const unlisten = await listen<TPayload>(eventName, (event) => handler(event.payload))
  return unlisten
}

export async function tauriSelectDirectory(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({ directory: true, multiple: false })
  if (!selected) return null
  if (Array.isArray(selected)) return selected[0] ? String(selected[0]) : null
  return String(selected)
}

export async function tauriConfirm(message: string, title?: string): Promise<boolean> {
  if (isTauriApp()) {
    const { ask } = await import('@tauri-apps/plugin-dialog')
    return ask(message, { title: title || '确认', kind: 'warning' })
  }
  return window.confirm(message)
}
