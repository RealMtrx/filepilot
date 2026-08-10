import { basename, dirname, join, relative } from 'node:path'

import { TaskQueue } from '../concurrency'
import { PathValidationError, ScanAbortedError } from '../errors'
import { isProtectedSystemPath, normalizePath, validatePathCharacters } from '../paths'
import { IgnoreMatcher } from './ignore'
import { nodeFileSystem, type DirEntry, type FileSystemAdapter } from './fs-adapter'
import type { FileEntry, ScanErrorRecord, ScanOptions, ScanProgress, ScanResult } from './types'

const UNLIMITED_DEPTH = Number.POSITIVE_INFINITY

interface WalkContext {
  root: string
  matcher: IgnoreMatcher
  maxDepth: number
  signal?: AbortSignal
  fs: FileSystemAdapter
  followSymlinks: boolean
  collect: boolean
  onEntry?: (entry: FileEntry) => void
  queue: TaskQueue
  files: FileEntry[]
  fileCount: number
  directoryCount: number
  bytesScanned: number
  skippedSymlinks: number
  skippedOther: number
  ignoredCount: number
  errors: ScanErrorRecord[]
  visitedRealPaths: Set<string>
  startedAt: number
  lastProgressEmit: number
  progressIntervalMs: number
  currentPath: string | null
  onProgress?: (progress: ScanProgress) => void
  aborted: boolean
}

function errnoOf(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as NodeJS.ErrnoException).code
    return typeof code === 'string' ? code : null
  }
  return null
}

function recordError(ctx: WalkContext, path: string, err: unknown): void {
  const code = errnoOf(err) ?? 'UNKNOWN'
  const message = err instanceof Error ? err.message : String(err)
  ctx.errors.push({ path, code, message, fatal: false })
}

function assertNotAborted(ctx: WalkContext): void {
  if (ctx.aborted) throw new ScanAbortedError()
  if (ctx.signal?.aborted) {
    ctx.aborted = true
    throw new ScanAbortedError()
  }
}

function reportProgress(ctx: WalkContext, force: boolean): void {
  if (!ctx.onProgress) return
  const now = Date.now()
  if (!force && now - ctx.lastProgressEmit < ctx.progressIntervalMs) return
  ctx.lastProgressEmit = now
  ctx.onProgress({
    phase: 'scanning',
    filesScanned: ctx.fileCount,
    dirsScanned: ctx.directoryCount,
    bytesScanned: ctx.bytesScanned,
    currentPath: ctx.currentPath,
    errorCount: ctx.errors.length,
  })
}

function addEntry(ctx: WalkContext, path: string, size: number, modifiedAt: number, birthtimeMs: number, isSymlink: boolean, depth: number): void {
  const entry: FileEntry = {
    path,
    name: basename(path),
    size,
    modifiedAt,
    birthtimeMs,
    isSymlink,
    depth,
    parent: dirname(path),
  }
  ctx.fileCount += 1
  ctx.bytesScanned += size
  if (ctx.collect) ctx.files.push(entry)
  ctx.onEntry?.(entry)
}

function createWalkTask(ctx: WalkContext, dirPath: string, root: string, depth: number): Promise<void> {
  return ctx.queue.push(async () => {
    assertNotAborted(ctx)
    ctx.directoryCount += 1
    ctx.currentPath = dirPath
    reportProgress(ctx, false)

    if (ctx.followSymlinks) {
      try {
        const real = await ctx.fs.realpath(dirPath)
        if (ctx.visitedRealPaths.has(real)) return
        ctx.visitedRealPaths.add(real)
      } catch {
        // realpath unavailable; symlink-target checks still guard against loops
      }
    }

    let dirEntries: DirEntry[]
    try {
      dirEntries = await ctx.fs.readdir(dirPath)
    } catch (err) {
      if (errnoOf(err) === 'ENOENT' || errnoOf(err) === 'ENOTDIR') {
        // Directory vanished or was replaced mid-walk; record and continue.
        recordError(ctx, dirPath, err)
      } else if (ctx.signal?.aborted || errnoOf(err) === 'ABORT_ERR') {
        throw new ScanAbortedError()
      } else {
        recordError(ctx, dirPath, err)
      }
      return
    }

    for (const dirent of dirEntries) {
      assertNotAborted(ctx)
      const childDepth = depth + 1
      if (childDepth > ctx.maxDepth) continue
      const entryPath = join(dirPath, dirent.name)
      const relPath = relative(root, entryPath).replace(/\\/g, '/')

      if (dirent.isDirectory()) {
        if (ctx.matcher.isIgnored(relPath, true)) {
          ctx.ignoredCount += 1
          continue
        }
        await createWalkTask(ctx, entryPath, root, childDepth)
        continue
      }

      if (dirent.isSymbolicLink()) {
        if (!ctx.followSymlinks) {
          ctx.skippedSymlinks += 1
          continue
        }
        if (ctx.matcher.isIgnored(relPath, false)) {
          ctx.ignoredCount += 1
          continue
        }
        await handleSymlink(ctx, entryPath, root, childDepth)
        continue
      }

      if (ctx.matcher.isIgnored(relPath, false)) {
        ctx.ignoredCount += 1
        continue
      }

      if (!dirent.isFile()) {
        ctx.skippedOther += 1
        continue
      }

      try {
        const stats = await ctx.fs.stat(entryPath)
        addEntry(ctx, entryPath, stats.size, stats.mtimeMs, stats.birthtimeMs, false, childDepth)
      } catch (err) {
        recordError(ctx, entryPath, err)
      }
    }
  })
}

async function handleSymlink(ctx: WalkContext, linkPath: string, root: string, depth: number): Promise<void> {
  let stats
  try {
    stats = await ctx.fs.stat(linkPath)
  } catch (err) {
    recordError(ctx, linkPath, err)
    return
  }

  if (stats.isDirectory()) {
    let real: string
    try {
      real = await ctx.fs.realpath(linkPath)
    } catch (err) {
      recordError(ctx, linkPath, err)
      return
    }
    if (ctx.visitedRealPaths.has(real)) {
      ctx.skippedSymlinks += 1
      return
    }
    ctx.visitedRealPaths.add(real)
    await createWalkTask(ctx, linkPath, root, depth)
    return
  }

  if (stats.isFile()) {
    addEntry(ctx, linkPath, stats.size, stats.mtimeMs, stats.birthtimeMs, true, depth)
    return
  }

  ctx.skippedOther += 1
}

async function resolveRoot(pathInput: string, fs: FileSystemAdapter): Promise<string> {
  const normalized = normalizePath(pathInput)
  validatePathCharacters(normalized)
  let stats
  try {
    stats = await fs.stat(normalized)
  } catch (err) {
    const code = errnoOf(err)
    if (code === 'ENOENT') {
      throw new PathValidationError(`Scan target does not exist`, { path: normalized, cause: err })
    }
    throw new PathValidationError(`Cannot access scan target`, { path: normalized, cause: err })
  }
  if (!stats.isDirectory()) {
    throw new PathValidationError(`Scan target is not a directory`, { path: normalized })
  }
  return normalized
}

/**
 * Recursively scans one or more directories with controlled concurrency.
 *
 * Safety guarantees:
 * - never modifies anything on disk
 * - permission errors are recorded and skipped, never fatal
 * - symlinks are not followed by default; when followed, loops are
 *   detected via real-path tracking
 * - supports cooperative cancellation via AbortSignal
 */
export async function scanDirectories(options: ScanOptions): Promise<ScanResult> {
  const fs = options.fs ?? nodeFileSystem
  const startedAt = Date.now()

  if (options.paths.length === 0) {
    throw new PathValidationError('At least one scan target is required')
  }

  const roots: string[] = []
  const protectedRoots: string[] = []
  for (const raw of options.paths) {
    const root = await resolveRoot(raw, fs)
    roots.push(root)
    if (isProtectedSystemPath(root)) protectedRoots.push(root)
  }

  const queue = new TaskQueue(options.concurrency ?? 16)
  const ctx: WalkContext = {
    root: roots[0]!,
    matcher: new IgnoreMatcher(options.ignorePatterns ?? []),
    maxDepth: options.maxDepth ?? UNLIMITED_DEPTH,
    signal: options.signal,
    fs,
    followSymlinks: options.followSymlinks ?? false,
    collect: options.collectEntries ?? true,
    onEntry: options.onEntry,
    queue,
    files: [],
    fileCount: 0,
    directoryCount: 0,
    bytesScanned: 0,
    skippedSymlinks: 0,
    skippedOther: 0,
    ignoredCount: 0,
    errors: [],
    visitedRealPaths: new Set<string>(),
    startedAt,
    lastProgressEmit: 0,
    progressIntervalMs: options.progressIntervalMs ?? 100,
    currentPath: null,
    onProgress: options.onProgress,
    aborted: false,
  }

  const abortListener = (): void => {
    ctx.aborted = true
  }
  options.signal?.addEventListener('abort', abortListener, { once: true })

  const tasks: Array<Promise<void>> = roots.map((root) =>
    createWalkTask(ctx, root, root, 0).catch((err: unknown) => {
      if (err instanceof ScanAbortedError) throw err
      recordError(ctx, root, err)
    }),
  )

  let firstError: unknown = null
  try {
    await Promise.all(tasks)
    await queue.idle()
  } catch (err) {
    firstError = err
  }

  options.signal?.removeEventListener('abort', abortListener)

  if (firstError !== null) {
    throw firstError
  }
  if (ctx.aborted || options.signal?.aborted) {
    throw new ScanAbortedError()
  }

  reportProgress(ctx, true)
  ctx.onProgress?.({
    phase: 'done',
    filesScanned: ctx.fileCount,
    dirsScanned: ctx.directoryCount,
    bytesScanned: ctx.bytesScanned,
    currentPath: null,
    errorCount: ctx.errors.length,
  })

  return {
    roots,
    files: ctx.files,
    fileCount: ctx.fileCount,
    directoryCount: ctx.directoryCount,
    totalBytes: ctx.bytesScanned,
    skippedSymlinks: ctx.skippedSymlinks,
    skippedOther: ctx.skippedOther,
    ignoredCount: ctx.ignoredCount,
    errors: ctx.errors,
    protectedRoots,
    elapsedMs: Date.now() - startedAt,
    startedAt,
  }
}
