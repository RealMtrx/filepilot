import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

import { dataDir } from '../config/dirs'

export interface TransactionOperation {
  id: string
  type: 'move'
  source: string
  destination: string
  size: number
  status: 'applied' | 'failed'
  movedAt: string
}

export interface TransactionRecord {
  id: string
  kind: 'organize'
  createdAt: string
  destinationRoot: string
  status: 'in-progress' | 'completed'
  operations: TransactionOperation[]
}

/**
 * Default journal location under the platform data directory. Kept
 * outside any organized folder so undoing a plan never moves its own
 * history.
 */
export function defaultJournalPath(timestamp = new Date()): string {
  const stamp = timestamp.toISOString().replace(/[:.]/g, '-')
  return join(dataDir(), 'transactions', `organize-${stamp}.json`)
}

export function createOperation(
  source: string,
  destination: string,
  size: number,
  status: TransactionOperation['status'] = 'applied',
): TransactionOperation {
  return {
    id: randomUUID(),
    type: 'move',
    source,
    destination,
    size,
    status,
    movedAt: new Date().toISOString(),
  }
}

/**
 * Append-only journal for organize runs. Every applied move is recorded
 * atomically before the executor moves on, so an interrupted run leaves
 * a recoverable trail for Undo & History (Phase 7).
 *
 * A dry run never touches this journal (and therefore never touches
 * the filesystem at all).
 */
export class TransactionManager {
  constructor(private readonly journalPath: string) {}

  get path(): string {
    return this.journalPath
  }

  async create(destinationRoot: string): Promise<TransactionRecord> {
    const record: TransactionRecord = {
      id: randomUUID(),
      kind: 'organize',
      createdAt: new Date().toISOString(),
      destinationRoot,
      status: 'in-progress',
      operations: [],
    }
    await this.writeAtomic(record)
    return record
  }

  async appendOperation(record: TransactionRecord, operation: TransactionOperation): Promise<void> {
    record.operations.push(operation)
    await this.writeAtomic(record)
  }

  async complete(record: TransactionRecord): Promise<void> {
    record.status = 'completed'
    await this.writeAtomic(record)
  }

  async load(): Promise<TransactionRecord | null> {
    try {
      const raw = await readFile(this.journalPath, 'utf8')
      return JSON.parse(raw) as TransactionRecord
    } catch {
      return null
    }
  }

  private async writeAtomic(record: TransactionRecord): Promise<void> {
    await mkdir(dirname(this.journalPath), { recursive: true })
    const tmpPath = `${this.journalPath}.tmp`
    await writeFile(tmpPath, JSON.stringify(record, null, 2), 'utf8')
    await rename(tmpPath, this.journalPath)
  }
}
