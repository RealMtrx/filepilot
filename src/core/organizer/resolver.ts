import { join } from 'node:path'

import type { Conflict, ConflictStrategy, OrganizationPlan, PlannedMove } from './types'
import { splitConflicts } from './planner'

export interface ResolutionResult {
  /** Plan with conflicts resolved as far as the strategy allows. */
  plan: OrganizationPlan
  /** How many conflicting moves the strategy resolved into moves. */
  resolved: number
  /** Conflicts the strategy could not resolve (stay excluded). */
  remaining: Conflict[]
}

const SPLIT_NAME = /^(.*)\.([^.]+)$/

/** Appends " (2)", " (3)", ... before the extension, if any. */
export function bumpName(name: string, index: number): string {
  const match = name.match(SPLIT_NAME)
  if (!match) return `${name} (${index})`
  return `${match[1]} (${index}).${match[2]}`
}

function uniqueDestination(
  sourceName: string,
  destinationDir: string,
  taken: Set<string>,
  takenSources: Set<string>,
): { destination: string; name: string } | null {
  let index = 2
  for (;;) {
    const name = bumpName(sourceName, index)
    const destination = join(destinationDir, name)
    if (!taken.has(destination) && !takenSources.has(destination)) {
      return { destination, name }
    }
    index += 1
    if (index > 10_000) return null
  }
}

/**
 * Resolves plan conflicts deterministically.
 *
 * - `skip`: no changes; conflicts stay excluded from the plan.
 * - `rename`: target collisions are renamed ("name (2).ext") so both
 *   files can be organized; self-moves and overlaps can never be fixed
 *   by renaming and remain excluded.
 */
export function resolveConflicts(
  plan: OrganizationPlan,
  strategy: ConflictStrategy = 'skip',
): ResolutionResult {
  if (strategy === 'skip') {
    return { plan, resolved: 0, remaining: plan.conflicts }
  }

  const byDestination = new Map<string, PlannedMove[]>()
  for (const conflict of plan.conflicts) {
    if (conflict.reason !== 'target-collision') continue
    const list = byDestination.get(conflict.destination)
    if (list) list.push(conflict.candidate)
    else byDestination.set(conflict.destination, [conflict.candidate])
  }

  const resolvedMoves = new Map<string, PlannedMove>()
  const taken = new Set(plan.moves.map((move) => move.destination))
  const takenSources = new Set(plan.moves.map((move) => move.source))
  let resolved = 0

  for (const group of byDestination.values()) {
    const members = group.sort((a, b) => a.source.localeCompare(b.source))
    let first = true
    for (const member of members) {
      const target = first
        ? { destination: member.destination, name: member.name }
        : uniqueDestination(member.name, member.destinationDir, taken, takenSources)
      if (!target) continue
      const move: PlannedMove = { ...member, name: target.name, destination: target.destination }
      resolvedMoves.set(member.source, move)
      taken.add(target.destination)
      takenSources.add(target.destination)
      resolved += 1
      first = false
    }
  }

  const combined = [...plan.moves, ...resolvedMoves.values()].sort((a, b) =>
    a.source.localeCompare(b.source),
  )
  const { moves, conflicts } = splitConflicts(combined)
  const remaining = plan.conflicts.filter((conflict) => !resolvedMoves.has(conflict.source))

  return {
    plan: {
      ...plan,
      moves,
      conflicts: [...conflicts, ...remaining],
      summary: {
        ...plan.summary,
        planned: moves.length,
        conflicts: conflicts.length + remaining.length,
        skipped: plan.summary.skipped,
        bytesToMove: moves.reduce((sum, move) => sum + move.size, 0),
      },
    },
    resolved,
    remaining,
  }
}
