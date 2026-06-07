import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUp, FileText, Folder, FolderOpen, RefreshCw, Save, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import type { FileEntry } from '@/types'
import { executionApi } from '@/services/api'
import { tauriSelectDirectory } from '@/services/tauri'
import { getErrorMessage } from '@/utils/errors'

function basename(path: string) {
  const parts = path.split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : path
}

function parentDir(path: string) {
  const parts = path.split('/').filter(Boolean)
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/')
}

export default function ExecutionWorkspacePanel({
  executionId,
  initialWorkspacePath,
}: {
  executionId: string
  initialWorkspacePath?: string | null
}) {
  const queryClient = useQueryClient()
  const [workspacePath, setWorkspacePath] = useState<string | null>(initialWorkspacePath || null)
  const [currentDir, setCurrentDir] = useState<string>('')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [editorContent, setEditorContent] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isListing, setIsListing] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSettingWorkspace, setIsSettingWorkspace] = useState(false)
  const [saveBanner, setSaveBanner] = useState<string | null>(null)

  useEffect(() => {
    setWorkspacePath(initialWorkspacePath || null)
    setCurrentDir('')
    setEntries([])
    setSelectedPath(null)
    setFileContent('')
    setEditorContent('')
    setError(null)
    setSaveBanner(null)
  }, [executionId])

  const canList = Boolean(workspacePath)

  const refreshList = useCallback(async () => {
    if (!workspacePath) {
      setEntries([])
      return
    }

    setIsListing(true)
    setError(null)
    try {
      const items = await executionApi.listFiles(executionId, currentDir || undefined)
      setEntries(items)
    } catch (e) {
      setEntries([])
      setError(getErrorMessage(e))
    } finally {
      setIsListing(false)
    }
  }, [currentDir, executionId, workspacePath])

  useEffect(() => {
    void refreshList()
  }, [refreshList])

  const pickWorkspace = useCallback(async () => {
    setError(null)
    setSaveBanner(null)
    const dir = await tauriSelectDirectory()
    if (!dir) return

    setIsSettingWorkspace(true)
    try {
      await executionApi.setWorkspace(executionId, dir)
      setWorkspacePath(dir)
      setCurrentDir('')
      setSelectedPath(null)
      setFileContent('')
      setEditorContent('')
      queryClient.invalidateQueries({ queryKey: ['execution', executionId] })
      await refreshList()
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setIsSettingWorkspace(false)
    }
  }, [executionId, queryClient, refreshList])

  const clearWorkspace = useCallback(async () => {
    setError(null)
    setSaveBanner(null)
    setIsSettingWorkspace(true)
    try {
      await executionApi.setWorkspace(executionId, null)
      setWorkspacePath(null)
      setCurrentDir('')
      setEntries([])
      setSelectedPath(null)
      setFileContent('')
      setEditorContent('')
      queryClient.invalidateQueries({ queryKey: ['execution', executionId] })
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setIsSettingWorkspace(false)
    }
  }, [executionId, queryClient])

  const openEntry = useCallback(async (entry: FileEntry) => {
    setError(null)
    setSaveBanner(null)

    if (entry.is_dir) {
      setCurrentDir(entry.path)
      setSelectedPath(null)
      setFileContent('')
      setEditorContent('')
      return
    }

    setSelectedPath(entry.path)
    setIsReading(true)
    try {
      const text = await executionApi.readFile(executionId, entry.path)
      setFileContent(text)
      setEditorContent(text)
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setIsReading(false)
    }
  }, [executionId])

  const goUp = useCallback(() => {
    setCurrentDir((prev) => parentDir(prev))
    setSelectedPath(null)
    setFileContent('')
    setEditorContent('')
    setSaveBanner(null)
  }, [])

  const isDirty = useMemo(() => {
    if (!selectedPath) return false
    return editorContent !== fileContent
  }, [editorContent, fileContent, selectedPath])

  const saveFile = useCallback(async () => {
    if (!selectedPath) return
    setError(null)
    setIsSaving(true)
    try {
      await executionApi.writeFile(executionId, selectedPath, editorContent)
      setFileContent(editorContent)
      setSaveBanner('已保存')
      void refreshList()
      window.setTimeout(() => setSaveBanner(null), 1200)
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setIsSaving(false)
    }
  }, [editorContent, executionId, refreshList, selectedPath])

  return (
    <div className="w-96 border-r border-line bg-surface flex flex-col">
      <div className="p-4 border-b border-line bg-base">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold tracking-tight text-ink">工作区</div>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-outline p-2"
              onClick={() => void pickWorkspace()}
              disabled={isSettingWorkspace}
              title="选择工作目录"
            >
              <FolderOpen className="w-4 h-4" />
            </button>
            {workspacePath && (
              <button
                className="btn btn-outline p-2 text-red-400 hover:bg-red-500/10 hover:text-red-400"
                onClick={() => void clearWorkspace()}
                disabled={isSettingWorkspace}
                title="清除工作目录"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div className="text-[11px] font-mono text-primary-400 break-all leading-tight bg-elevated rounded-md border border-line p-2">
          {workspacePath || '未设置 · 选择一个目录'}
        </div>
      </div>

      <div className="p-3 border-b border-line flex items-center justify-between gap-2 bg-base">
        <div className="text-[11px] font-mono text-ink-faint truncate">
          {currentDir ? `/${currentDir}` : '/'}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            className="btn btn-outline p-1"
            onClick={goUp}
            disabled={!currentDir || !canList}
            title="上一级"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            className="btn btn-outline p-1"
            onClick={() => void refreshList()}
            disabled={!canList || isListing}
            title="刷新"
          >
            <RefreshCw className={`w-4 h-4 ${isListing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {!workspacePath ? (
        <div className="p-6 text-xs text-ink-muted leading-relaxed text-center">
          选择一个工作目录后，可以在这里浏览和编辑文件。
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {entries.length === 0 && !isListing ? (
            <div className="p-6 text-xs text-ink-faint text-center">目录为空</div>
          ) : (
            <ul className="divide-y divide-line">
              {entries.map((entry) => (
                <li key={entry.path}>
                  <button
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-elevated group transition-colors"
                    onClick={() => void openEntry(entry)}
                    title={entry.path}
                  >
                    {entry.is_dir ? (
                      <Folder className="w-[18px] h-[18px] text-primary-400 flex-shrink-0" />
                    ) : (
                      <FileText className="w-[18px] h-[18px] text-ink-faint flex-shrink-0" />
                    )}
                    <span className="text-xs text-ink-muted group-hover:text-ink truncate flex-1">
                      {basename(entry.path)}{entry.is_dir ? '/' : ''}
                    </span>
                    {!entry.is_dir && typeof entry.size === 'number' && (
                      <span className="text-[11px] text-ink-faint flex-shrink-0 font-mono">
                        {entry.size} B
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {selectedPath && workspacePath && (
        <div className="border-t border-line flex flex-col h-72 bg-base">
          <div className="p-3 border-b border-line bg-surface flex items-center justify-between gap-2">
            <div className="text-[11px] font-mono text-primary-400 truncate" title={selectedPath}>
              {basename(selectedPath)}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {saveBanner && (
                <span className="text-[11px] font-mono text-emerald-400">{saveBanner}</span>
              )}
              <button
                className="btn btn-primary p-2"
                onClick={() => void saveFile()}
                disabled={!isDirty || isSaving || isReading}
                title="保存"
              >
                <Save className="w-4 h-4" />
              </button>
            </div>
          </div>
          <textarea
            className="flex-1 w-full px-4 py-3 bg-base text-ink-muted text-xs font-mono resize-none focus:outline-none"
            value={editorContent}
            onChange={(e) => setEditorContent(e.target.value)}
            disabled={isReading}
            spellCheck={false}
          />
        </div>
      )}

      {error && (
        <div className="p-4 border-t border-line bg-red-500/10 text-red-400 text-[11px] leading-relaxed">
          出错了：{error}
        </div>
      )}
    </div>
  )
}

