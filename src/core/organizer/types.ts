import type { FileCategory } from '../classification/categories'

export type ConflictStrategy = 'skip' | 'rename'

export type ConflictReason =
  | 'target-collision'
  | 'self-move'
  | 'overlap'

export type SkipReason =
  | 'project-file'
  | 'zero-byte'
  | 'protected-source'
  | 'invalid-path'

export interface PlannedMove {
  id: string
  source: string
  name: string
  category: FileCategory
  destinationDir: string
  destination: string
  size: number
}

export interface Conflict {
  source: string
  destination: string
  reason: ConflictReason
  message: string
  /** The full candidate move that conflicts (kept for resolution data). */
  candidate: PlannedMove
}

export interface Skip {
  source: string
  reason: SkipReason
  message: string
}

export interface PlanSummary {
  planned: number
  conflicts: number
  skipped: number
  bytesToMove: number
}

export interface OrganizationPlan {
  destinationRoot: string
  moves: PlannedMove[]
  conflicts: Conflict[]
  skipped: Skip[]
  summary: PlanSummary
}
