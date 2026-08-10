import type { FileSystemAdapter } from './fs-adapter'

export interface FileEntry {
  /** Absolute, normalized path. */
  path: string
  /** Base name of the entry. */
  name: string
  /** Size in bytes. */
  size: number
  /** Last modification time, epoch milliseconds. */
  modifiedAt: number
  /** Creation time when available, epoch milliseconds. */
  birthtimeMs: number
  /** True when the entry is a symlink (either followed or not). */
  isSymlink: boolean
  /** Depth relative to the scan root (root children are depth 1). */
  depth: number
  /** Absolute path of the parent directory. */
  parent: string
}

export interface ScanErrorRecord {
  path: string
  code: string
  message: string
  fatal: boolean
}

export interface ScanProgress {
  phase: 'scanning' | 'done'
  filesScanned: number
  dirsScanned: number
  bytesScanned: number
  currentPath: string | null
  errorCount: number
}

export interface ScanOptions {
  /** Scan targets; each must be an existing directory. */
  paths: readonly string[]
  /** Max concurrent filesystem operations. Default 16. */
  concurrency?: number
  /** Whether symlinked directories/files are followed. Default false. */
  followSymlinks?: boolean
  /** Gitignore-style patterns. */
  ignorePatterns?: readonly string[]
  /** Maximum directory depth to recurse into. Default unlimited. */
  maxDepth?: number
  /** Cooperative cancellation. */
  signal?: AbortSignal
  /** Accumulate `FileEntry` objects in the result. Default true. */
  collectEntries?: boolean
  /** Throttle window for `onProgress` calls. Default 100ms. */
  progressIntervalMs?: number
  /** Receives throttled progress snapshots. */
  onProgress?: (progress: ScanProgress) => void
  /** Receives every completed file entry. */
  onEntry?: (entry: FileEntry) => void
  /** Injectable filesystem for testing. */
  fs?: FileSystemAdapter
}

export interface ScanResult {
  roots: string[]
  files: FileEntry[]
  fileCount: number
  directoryCount: number
  totalBytes: number
  skippedSymlinks: number
  skippedOther: number
  ignoredCount: number
  errors: ScanErrorRecord[]
  /** Roots that live inside protected system directories (scan allowed, flagged). */
  protectedRoots: string[]
  elapsedMs: number
  startedAt: number
}
