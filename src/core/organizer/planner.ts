import { join } from 'node:path'

import { classifyFileName } from '../classification/classifier'
import type { FileCategory } from '../classification/categories'
import type { FileEntry } from '../scanner/types'
import { detectProjectRoots, isInsideProjectRoots } from './projects'
import {
  isProtectedPath,
  validateDestinationRoot,
  validateFolderName,
  validateSourcePath,
} from './validator'
import type { Conflict, OrganizationPlan, PlannedMove } from './types'

export interface PlanOptions {
  destinationRoot: string
  /** Custom folder name per category. Defaults to the category folders. */
  folderFor?: (category: FileCategory) => string
  /** Keep files that live inside detected software projects together. Default true. */
  skipProjects?: boolean
  /** Skip zero-byte files. Default true. */
  skipZeroByteFiles?: boolean
  /** Allow organizing files that live inside protected system paths. Default false. */
  allowProtectedSources?: boolean
}

export interface PlanningFailure {
  source: string
  reason: 'invalid-path' | 'protected-source' | 'zero-byte' | 'project-file'
  message: string
}

const DEFAULT_FOLDER: Record<FileCategory, string> = {
  images: 'Images',
  videos: 'Videos',
  audio: 'Audio',
  documents: 'Documents',
  archives: 'Archives',
  installers: 'Installers',
  code: 'Code',
  projects: 'Projects',
  fonts: 'Fonts',
  databases: 'Databases',
  backups: 'Backups',
  temporary: 'Temporary',
  other: 'Other',
}

/**
 * Builds a full organization plan without touching the filesystem.
 *
 * Each file is classified and assigned a destination folder under the
 * destination root. Files that are invalid, protected, empty or part of
 * a detected software project are skipped. Moves that would collide
 * (same destination, move onto itself, or move into another move's
 * source) are reported as conflicts and never enter the plan.
 *
 * The returned plan contains no I/O whatsoever: executing it is a
 * separate, explicit step.
 */
export function planOrganization(
  entries: readonly FileEntry[],
  options: PlanOptions,
): OrganizationPlan {
  const { value: destinationRoot } = validateDestinationRoot(options.destinationRoot)
  const skipProjects = options.skipProjects ?? true
  const skipZeroByteFiles = options.skipZeroByteFiles ?? true
  const allowProtectedSources = options.allowProtectedSources ?? false
  const folderFor = options.folderFor
  const defaultFolderFor = (category: FileCategory): string => DEFAULT_FOLDER[category]

  const projectRoots = skipProjects
    ? new Set(detectProjectRoots(entries))
    : new Set<string>()

  const failures: PlanningFailure[] = []
  const candidates: PlannedMove[] = []
  let idCounter = 0

  for (const entry of entries) {
    const sourceProblem = validateSourcePath(entry.path)
    if (sourceProblem) {
      failures.push({ source: entry.path, reason: 'invalid-path', message: sourceProblem })
      continue
    }
    if (isProtectedPath(entry.path) && !allowProtectedSources) {
      failures.push({
        source: entry.path,
        reason: 'protected-source',
        message: 'source lives inside a protected system path',
      })
      continue
    }
    if (skipZeroByteFiles && entry.size === 0) {
      failures.push({
        source: entry.path,
        reason: 'zero-byte',
        message: 'file is empty (zero bytes)',
      })
      continue
    }
    if (skipProjects && isInsideProjectRoots(entry.path, projectRoots)) {
      failures.push({
        source: entry.path,
        reason: 'project-file',
        message: 'file lives inside a detected software project',
      })
      continue
    }

    const { category } = classifyFileName(entry.name)
    const folder = folderFor ? folderFor(category) : defaultFolderFor(category)
    const folderProblem = validateFolderName(folder)
    if (folderProblem) {
      failures.push({
        source: entry.path,
        reason: 'invalid-path',
        message: folderProblem,
      })
      continue
    }

    const destinationDir = join(destinationRoot, folder)
    const destination = join(destinationDir, entry.name)
    candidates.push({
      id: `m${(idCounter += 1)}`,
      source: entry.path,
      name: entry.name,
      category,
      destinationDir,
      destination,
      size: entry.size,
    })
  }

  const { moves, conflicts } = splitConflicts(candidates)
  const skipped = failures.map((failure) => ({
    source: failure.source,
    reason: failure.reason,
    message: failure.message,
  }))

  return {
    destinationRoot,
    moves,
    conflicts,
    skipped,
    summary: {
      planned: moves.length,
      conflicts: conflicts.length,
      skipped: skipped.length,
      bytesToMove: moves.reduce((sum, move) => sum + move.size, 0),
    },
  }
}

/**
 * Determines which candidate moves are safe to run and which are
 * conflicting. Never mutates the candidates; fully deterministic.
 */
export function splitConflicts(
  candidates: readonly PlannedMove[],
): { moves: PlannedMove[]; conflicts: Conflict[] } {
  const moves: PlannedMove[] = []
  const conflicts: Conflict[] = []

  const selfMoves = candidates.filter((candidate) => candidate.destination === candidate.source)
  const rest = candidates.filter((candidate) => candidate.destination !== candidate.source)
  const selfPaths = new Set(selfMoves.map((candidate) => candidate.source))

  for (const candidate of selfMoves) {
    conflicts.push({
      source: candidate.source,
      destination: candidate.destination,
      reason: 'self-move',
      message: 'file is already at its planned destination',
      candidate,
    })
  }

  const byDestination = new Map<string, PlannedMove[]>()
  for (const candidate of rest) {
    const list = byDestination.get(candidate.destination)
    if (list) list.push(candidate)
    else byDestination.set(candidate.destination, [candidate])
  }

  const collisionSources = new Set<string>()
  const collisionMoves: PlannedMove[] = []
  for (const group of byDestination.values()) {
    if (group.length > 1) {
      for (const candidate of group) {
        collisionSources.add(candidate.source)
        collisionMoves.push(candidate)
      }
    }
  }
  for (const candidate of collisionMoves) {
    conflicts.push({
      source: candidate.source,
      destination: candidate.destination,
      reason: 'target-collision',
      message: 'another file is planned for the same destination',
      candidate,
    })
  }

  const remaining = rest.filter((candidate) => !collisionSources.has(candidate.source))
  // Any planned destination that equals another move's source would chain
  // two moves into the same path; self-move sources count too.
  const allSources = new Set([...remaining.map((candidate) => candidate.source), ...selfPaths])
  for (const candidate of remaining) {
    if (allSources.has(candidate.destination)) {
      conflicts.push({
        source: candidate.source,
        destination: candidate.destination,
        reason: 'overlap',
        message: "destination is another planned move's source",
        candidate,
      })
      continue
    }
    moves.push(candidate)
  }

  moves.sort((a, b) => a.source.localeCompare(b.source))
  return { moves, conflicts }
}
