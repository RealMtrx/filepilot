import { AbortedError } from '../errors'
import { TaskQueue } from '../concurrency'
import type { FileEntry } from '../scanner/types'
import { DEFAULT_FAST_HASH_BYTES, fastHashOfFile, fullHashOfFile } from './hashing'

export interface DuplicateFile {
  path: string
  name: string
  size: number
  modifiedAt: number
}

export interface DuplicateGroup {
  size: number
  hash: string
  copies: number
  wastedBytes: number
  files: DuplicateFile[]
}

export interface DuplicateResult {
  groups: DuplicateGroup[]
  duplicateCount: number
  wastedBytes: number
  hashedFiles: number
  errors: Array<{ path: string; message: string }>
  elapsedMs: number
}

export type DuplicateProgress =
  | { phase: 'hashing'; groupsChecked: number; filesHashed: number; groupsFound: number }
  | { phase: 'done'; groupsChecked: number; filesHashed: number; groupsFound: number }

export interface DuplicateDetectionOptions {
  concurrency?: number
  fastHashBytes?: number
  includeEmptyFiles?: boolean
  signal?: AbortSignal
  progressIntervalMs?: number
  onProgress?: (progress: DuplicateProgress) => void
}

const toErrorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/**
 * Detects groups of identical files using a size -> fast hash -> full
 * hash pipeline:
 *
 *   1. Files are grouped by size alone (cheap, no I/O beyond metadata).
 *   2. Groups of size >= 2 are pre-filtered by hashing only the leading
 *      bytes of each file (cheap reads).
 *   3. Survivors are confirmed with a full streaming hash (constant
 *      memory for files of any size).
 *
 * The detection never deletes or modifies anything; it only reads.
 * Files that fail to hash (permissions, races) are recorded as errors
 * and excluded, never crashing the run.
 */
export async function findDuplicates(
  files: readonly FileEntry[],
  options: DuplicateDetectionOptions = {},
): Promise<DuplicateResult> {
  const startedAt = Date.now()
  const concurrency = options.concurrency ?? 8
  const fastHashBytes = options.fastHashBytes ?? DEFAULT_FAST_HASH_BYTES
  const progressIntervalMs = options.progressIntervalMs ?? 100
  const errors: Array<{ path: string; message: string }> = []
  const groups: DuplicateGroup[] = []
  let groupsChecked = 0
  let hashedFiles = 0
  let lastProgressAt = 0

  const emitProgress = (phase: 'hashing' | 'done'): void => {
    if (!options.onProgress) return
    if (phase === 'done' || Date.now() - lastProgressAt >= progressIntervalMs) {
      lastProgressAt = Date.now()
      options.onProgress({ phase, groupsChecked, filesHashed: hashedFiles, groupsFound: groups.length })
    }
  }

  const throwIfAborted = (): void => {
    if (options.signal?.aborted) throw new AbortedError('Duplicate detection aborted by user')
  }

  const queue = new TaskQueue(concurrency)
  const hashOne = async (path: string, full: boolean): Promise<string | null> => {
    return queue.push(async () => {
      try {
        const hash = full ? await fullHashOfFile(path) : await fastHashOfFile(path, fastHashBytes)
        hashedFiles += 1
        return hash
      } catch (err) {
        errors.push({ path, message: toErrorMessage(err) })
        return null
      }
    })
  }

  const seen = new Set<string>()
  const uniqueFiles: FileEntry[] = []
  for (const file of files) {
    if (!seen.has(file.path)) {
      seen.add(file.path)
      uniqueFiles.push(file)
    }
  }

  const bySize = new Map<number, FileEntry[]>()
  for (const file of uniqueFiles) {
    if (file.size === 0 && !options.includeEmptyFiles) continue
    const list = bySize.get(file.size)
    if (list) list.push(file)
    else bySize.set(file.size, [file])
  }

  for (const sizeGroup of bySize.values()) {
    if (sizeGroup.length < 2) continue
    throwIfAborted()
    groupsChecked += 1

    const fastResults = await Promise.all(
      sizeGroup.map(async (file) => ({ file, hash: await hashOne(file.path, false) })),
    )

    const byFastHash = new Map<string, FileEntry[]>()
    for (const { file, hash } of fastResults) {
      if (hash === null) continue
      const key = `${file.size}:${hash}`
      const list = byFastHash.get(key)
      if (list) list.push(file)
      else byFastHash.set(key, [file])
    }

    for (const fastGroup of byFastHash.values()) {
      if (fastGroup.length < 2) continue
      throwIfAborted()

      const fullResults = await Promise.all(
        fastGroup.map(async (file) => ({ file, hash: await hashOne(file.path, true) })),
      )

      const byFullHash = new Map<string, FileEntry[]>()
      for (const { file, hash } of fullResults) {
        if (hash === null) continue
        const list = byFullHash.get(hash)
        if (list) list.push(file)
        else byFullHash.set(hash, [file])
      }

      for (const [hash, duplicateFiles] of byFullHash) {
        if (duplicateFiles.length < 2) continue
        const files = duplicateFiles
          .map(
            (file): DuplicateFile => ({
              path: file.path,
              name: file.name,
              size: file.size,
              modifiedAt: file.modifiedAt,
            }),
          )
          .sort((a, b) => a.path.localeCompare(b.path))
        const size = files[0]!.size
        groups.push({
          size,
          hash,
          copies: files.length,
          wastedBytes: (files.length - 1) * size,
          files,
        })
      }
      emitProgress('hashing')
    }
  }

  throwIfAborted()
  emitProgress('done')

  groups.sort((a, b) => b.wastedBytes - a.wastedBytes || b.size - a.size)

  return {
    groups,
    duplicateCount: groups.reduce((sum, group) => sum + group.copies - 1, 0),
    wastedBytes: groups.reduce((sum, group) => sum + group.wastedBytes, 0),
    hashedFiles,
    errors,
    elapsedMs: Date.now() - startedAt,
  }
}
