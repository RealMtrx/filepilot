import { promises as nodeFs } from 'node:fs'
import type { Stats } from 'node:fs'

import { AbortedError } from '../errors'
import { isDestinationInside } from './validator'
import { createOperation, defaultJournalPath, TransactionManager } from './transaction'
import type { OrganizationPlan, PlannedMove } from './types'

/**
 * Minimal filesystem surface for the executor. Node's fs is the
 * default; tests inject wrappers to simulate permission failures,
 * interrupted renames and cross-device moves.
 */
export interface OrganizerFs {
  mkdir(path: string, options: { recursive: true }): Promise<void>
  lstat(path: string): Promise<Stats>
  rename(from: string, to: string): Promise<void>
  unlink(path: string): Promise<void>
  copyFile(from: string, to: string): Promise<void>
  realpath(path: string): Promise<string>
  stat(path: string): Promise<Stats>
}

export const nodeOrganizerFs: OrganizerFs = {
  async mkdir(path, options) {
    await nodeFs.mkdir(path, options)
  },
  async lstat(path) {
    return nodeFs.lstat(path)
  },
  async rename(from, to) {
    await nodeFs.rename(from, to)
  },
  async unlink(path) {
    await nodeFs.unlink(path)
  },
  async copyFile(from, to) {
    await nodeFs.copyFile(from, to)
  },
  async realpath(path) {
    return nodeFs.realpath(path)
  },
  async stat(path) {
    return nodeFs.stat(path)
  },
}

export type MoveStatus = 'pending' | 'moved' | 'failed'

export interface MoveExecution {
  move: PlannedMove
  status: MoveStatus
  error?: string
  /** True when the move used a copy-then-delete fallback (cross-device). */
  copiedFallback?: boolean
}

export interface ExecutionResult {
  dryRun: boolean
  planned: number
  applied: number
  failed: number
  moves: MoveExecution[]
  errors: Array<{ source: string; destination: string; message: string }>
  transactionId: string | null
  elapsedMs: number
}

export interface ExecuteOptions {
  /** Run without touching the filesystem. Default true. */
  dryRun?: boolean
  /** Journal file for recording applied moves. Defaults to the platform data dir. */
  journalFile?: string
  /** Injectable filesystem for testing. */
  fs?: OrganizerFs
  /** Cooperative cancellation. */
  signal?: AbortSignal
}

const errorCode = (err: unknown): string | undefined =>
  err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : undefined

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/**
 * Executes an organization plan with safety as the top priority:
 *
 * - dry-run is the default and performs zero filesystem operations
 * - destinations are created, never reused: an existing destination is
 *   an error, never an overwrite
 * - every move re-checks source existence and destination before acting
 * - a move that would escape the destination root through a symlink is
 *   refused
 * - symlinks are moved as links, their targets are never followed
 * - one failing file never aborts the rest of the plan
 * - every applied move is journaled before the next one starts, so an
 *   interrupted run leaves a recoverable trail
 */
export async function executePlan(
  plan: OrganizationPlan,
  options: ExecuteOptions = {},
): Promise<ExecutionResult> {
  const startedAt = Date.now()
  const dryRun = options.dryRun ?? true
  const fs = options.fs ?? nodeOrganizerFs
  const journalFile = options.journalFile ?? defaultJournalPath()
  const manager = new TransactionManager(journalFile)

  if (options.signal?.aborted) {
    throw new AbortedError('Organization aborted by user')
  }

  if (dryRun) {
    return {
      dryRun: true,
      planned: plan.moves.length,
      applied: 0,
      failed: 0,
      moves: plan.moves.map((move) => ({ move, status: 'pending' as const })),
      errors: [],
      transactionId: null,
      elapsedMs: Date.now() - startedAt,
    }
  }

  const transaction = await manager.create(plan.destinationRoot)
  const result: MoveExecution[] = []
  const errors: ExecutionResult['errors'] = []
  let applied = 0
  let failed = 0

  try {
    await fs.mkdir(plan.destinationRoot, { recursive: true })
    const realRoot = await fs.realpath(plan.destinationRoot)

    for (const move of plan.moves) {
      if (options.signal?.aborted) {
        throw new AbortedError('Organization aborted by user')
      }
      const outcome = await executeOneMove(move, realRoot, fs)
      result.push(outcome.execution)
      if (outcome.error) errors.push(outcome.error)
      if (outcome.execution.status === 'moved') {
        applied += 1
        await manager.appendOperation(
          transaction,
          createOperation(move.source, move.destination, move.size),
        )
      } else {
        failed += 1
      }
    }
    await manager.complete(transaction)
  } catch (err) {
    // An aborted run intentionally leaves the journal in-progress so
    // Undo & History (Phase 7) can recover the partial state.
    throw err
  }

  return {
    dryRun: false,
    planned: plan.moves.length,
    applied,
    failed,
    moves: result,
    errors,
    transactionId: transaction.id,
    elapsedMs: Date.now() - startedAt,
  }
}

interface MoveOutcome {
  execution: MoveExecution
  error: ExecutionResult['errors'][number] | null
}

async function executeOneMove(
  move: PlannedMove,
  realRoot: string,
  fs: OrganizerFs,
): Promise<MoveOutcome> {
  const fail = (message: string): MoveOutcome => ({
    execution: { move, status: 'failed', error: message },
    error: { source: move.source, destination: move.destination, message },
  })

  let sourceStats: Stats
  try {
    sourceStats = await fs.lstat(move.source)
  } catch {
    return fail('source not found or unreadable')
  }
  if (sourceStats.isDirectory()) {
    return fail('source is a directory; only files are moved')
  }

  try {
    await fs.mkdir(move.destinationDir, { recursive: true })
  } catch (err) {
    return fail(`cannot create destination folder: ${errorMessage(err)}`)
  }

  let realDestinationDir: string
  try {
    realDestinationDir = await fs.realpath(move.destinationDir)
  } catch {
    return fail('destination folder cannot be resolved')
  }
  if (!isDestinationInside(realDestinationDir, realRoot)) {
    return fail('destination would escape the destination root (symlink)')
  }

  let destinationStats: Stats | null = null
  try {
    destinationStats = await fs.lstat(move.destination)
  } catch {
    // Not present: good.
  }
  if (destinationStats) {
    return fail('destination already exists; refusing to overwrite')
  }

  try {
    await fs.rename(move.source, move.destination)
    return { execution: { move, status: 'moved' }, error: null }
  } catch (err) {
    const code = errorCode(err)
    if (code === 'EXDEV') {
      return moveViaCopy(move, fs)
    }
    if (code === 'EACCES' || code === 'EPERM') {
      return fail(`permission denied`)
    }
    return fail(errorMessage(err))
  }
}

async function moveViaCopy(move: PlannedMove, fs: OrganizerFs): Promise<MoveOutcome> {
  try {
    await fs.copyFile(move.source, move.destination)
    const [destStats, sourceStats] = await Promise.all([
      fs.stat(move.destination),
      fs.stat(move.source),
    ])
    if (destStats.size !== sourceStats.size) {
      await fs.unlink(move.destination).catch(() => undefined)
      return {
        execution: { move, status: 'failed', error: 'cross-device copy size mismatch; source untouched' },
        error: {
          source: move.source,
          destination: move.destination,
          message: 'cross-device copy size mismatch; source untouched',
        },
      }
    }
    await fs.unlink(move.source)
    return { execution: { move, status: 'moved', copiedFallback: true }, error: null }
  } catch (err) {
    await fs.unlink(move.destination).catch(() => undefined)
    return {
      execution: { move, status: 'failed', error: `cross-device copy failed: ${errorMessage(err)}` },
      error: {
        source: move.source,
        destination: move.destination,
        message: `cross-device copy failed: ${errorMessage(err)}`,
      },
    }
  }
}
