import type { OrganizationPlan } from './types'

/**
 * Renders a plan as a human-readable report (used by the CLI's
 * dry-run output):
 *
 *   Images/
 *     photo.png
 *     screenshot.jpg
 *
 *   Planned: 2 moves
 *   Conflicts: 0
 *   Skipped: 1
 */
export function renderPlan(plan: OrganizationPlan): string {
  const lines: string[] = ['Organization Plan', '']
  const byDir = new Map<string, string[]>()
  for (const move of plan.moves) {
    const list = byDir.get(move.destinationDir)
    if (list) list.push(move.name)
    else byDir.set(move.destinationDir, [move.name])
  }
  const dirs = [...byDir.keys()].sort((a, b) => a.localeCompare(b))
  for (const dir of dirs) {
    lines.push(`${dir}/`)
    const names = byDir.get(dir)!
    for (const name of names) lines.push(`  ${name}`)
    lines.push('')
  }
  lines.push(`Planned: ${plan.summary.planned} moves`)
  lines.push(`Conflicts: ${plan.summary.conflicts}`)
  lines.push(`Skipped: ${plan.summary.skipped}`)
  return lines.join('\n')
}
