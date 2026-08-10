import { dirname } from 'node:path'
import { classifyFileName, categoryLabel } from '../classification/classifier'
import type { FileCategory } from '../classification/categories'
import type { FileEntry } from '../scanner/types'

export interface AnalysisOptions {
  /** How many largest files to report. Default 20. */
  topFiles?: number
  /** How many largest top-level folders to report. Default 10. */
  topFolders?: number
}

export interface FileStat {
  path: string
  name: string
  size: number
}

export interface FolderStat {
  path: string
  name: string
  size: number
  fileCount: number
  /** Share of the analyzed total size, 0-100. */
  percent: number
}

export interface CategoryStat {
  category: FileCategory
  label: string
  bytes: number
  fileCount: number
  /** Share of the analyzed total size, 0-100. */
  percent: number
}

export interface DiskAnalysis {
  totalBytes: number
  totalFiles: number
  totalDirectories: number
  topFiles: FileStat[]
  topFolders: FolderStat[]
  byCategory: CategoryStat[]
  analyzedAt: number
  elapsedMs: number
}

const percentOf = (bytes: number, total: number): number =>
  total === 0 ? 0 : (bytes / total) * 100

const pathDepth = (path: string): number => path.split(/[\\/]/).filter(Boolean).length

const baseName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path

/**
 * Analyzes a scanned entry list without touching the filesystem:
 * total sizes, largest files, largest top-level folder subtrees and a
 * per-category breakdown (using the classification engine).
 *
 * Folder sizes are aggregated in memory from the entry parent links
 * (iterative, deepest-first), so no extra I/O is needed.
 */
export function analyzeEntries(
  files: readonly FileEntry[],
  directories: readonly string[],
  options: AnalysisOptions = {},
): DiskAnalysis {
  const startedAt = Date.now()
  const topFilesLimit = options.topFiles ?? 20
  const topFoldersLimit = options.topFolders ?? 10

  const totalFiles = files.length
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)

  const topFiles: FileStat[] = files
    .map((file) => ({ path: file.path, name: file.name, size: file.size }))
    .sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))
    .slice(0, topFilesLimit)

  const byCategory = new Map<FileCategory, { bytes: number; fileCount: number }>()
  for (const file of files) {
    const { category } = classifyFileName(file.name)
    const stat = byCategory.get(category)
    if (stat) {
      stat.bytes += file.size
      stat.fileCount += 1
    } else {
      byCategory.set(category, { bytes: file.size, fileCount: 1 })
    }
  }
  const byCategoryList: CategoryStat[] = [...byCategory.entries()]
    .map(([category, { bytes, fileCount }]) => ({
      category,
      label: categoryLabel(category) ?? category,
      bytes,
      fileCount,
      percent: percentOf(bytes, totalBytes),
    }))
    .sort((a, b) => b.bytes - a.bytes || a.label.localeCompare(b.label))

  // Build the directory tree from the entries' parent links.
  const filesByParent = new Map<string, FileEntry[]>()
  const dirSet = new Set<string>()
  for (const file of files) {
    dirSet.add(file.parent)
    const list = filesByParent.get(file.parent)
    if (list) list.push(file)
    else filesByParent.set(file.parent, [file])
  }

  const dirChildren = new Map<string, string[]>()
  for (const dir of dirSet) {
    const parent = dirname(dir)
    if (parent === dir) continue
    const list = dirChildren.get(parent)
    if (list) list.push(dir)
    else dirChildren.set(parent, [dir])
  }

  // Iterative subtree aggregation: process deeper directories first so
  // every child total is already known when its parent is computed.
  const subtreeBytes = new Map<string, number>()
  const subtreeFileCount = new Map<string, number>()
  const sortedDirs = [...dirSet].sort((a, b) => pathDepth(b) - pathDepth(a))
  for (const dir of sortedDirs) {
    if (subtreeBytes.has(dir)) continue
    let bytes = 0
    let count = 0
    for (const file of filesByParent.get(dir) ?? []) {
      bytes += file.size
      count += 1
    }
    for (const sub of dirChildren.get(dir) ?? []) {
      bytes += subtreeBytes.get(sub) ?? 0
      count += subtreeFileCount.get(sub) ?? 0
    }
    subtreeBytes.set(dir, bytes)
    subtreeFileCount.set(dir, count)
  }

  const rootSet = new Set(directories)
  const topFolders: FolderStat[] = [...subtreeBytes.entries()]
    .filter(([path]) => rootSet.has(dirname(path)))
    .map(([path, size]) => ({
      path,
      name: baseName(path),
      size,
      fileCount: subtreeFileCount.get(path) ?? 0,
      percent: percentOf(size, totalBytes),
    }))
    .sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))
    .slice(0, topFoldersLimit)

  return {
    totalBytes,
    totalFiles,
    totalDirectories: dirSet.size,
    topFiles,
    topFolders,
    byCategory: byCategoryList,
    analyzedAt: Date.now(),
    elapsedMs: Date.now() - startedAt,
  }
}
