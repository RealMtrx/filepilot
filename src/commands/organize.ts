import type { Command } from 'commander'

import { formatBytes } from '../utils/format'
import { formatError } from '../core/errors'
import { scanDirectories } from '../core/scanner/scanner'
import {
  executePlan,
  planOrganization,
  renderPlan,
  resolveConflicts,
  type ConflictStrategy,
  type OrganizationPlan,
} from '../index'

interface OrganizeOptions {
  dest?: string
  strategy?: ConflictStrategy
  skipProjects: boolean
  includeEmpty: boolean
  apply: boolean
  yes: boolean
}

const isConflictStrategy = (value: unknown): value is ConflictStrategy =>
  value === 'skip' || value === 'rename'

/**
 * `filepilot organize <paths...>` — scans, plans and (unless explicitly
 * asked) only shows what would happen.
 *
 * Safety rules:
 * - dry-run is the default; nothing is created, moved or deleted
 * - applying requires BOTH --apply and --yes (explicit confirmation)
 * - the engine never overwrites an existing file
 */
export function buildOrganizeCommand(program: Command): Command {
  return program
    .command('organize')
    .description(
      'Plan and organize files by category into folders. Dry-run by default: applying ' +
        'requires --apply together with an explicit --yes confirmation.',
    )
    .argument('<paths...>', 'directories to scan')
    .option('-d, --dest <dir>', 'destination root (default: the first scanned path)')
    .option(
      '--strategy <strategy>',
      'how to handle name collisions: skip (default) or rename',
      'skip',
    )
    .option('--no-skip-projects', 'also organize files inside detected software projects')
    .option('--include-empty', 'include zero-byte files in the plan')
    .option('--apply', 'apply the plan for real (dangerous)')
    .option('--yes', 'confirm that you want to apply the plan')
    .action(async (paths: string[], options: OrganizeOptions) => {
      const strategy: ConflictStrategy = isConflictStrategy(options.strategy)
        ? options.strategy
        : 'skip'
      const destinationRoot = options.dest ?? paths[0]!
      const skipProjects = options.skipProjects
      const apply = options.apply ?? false
      const confirmed = options.yes ?? false

      if (apply && !confirmed) {
        console.error(
          'Refusing to apply: organizing moves real files. Re-run with BOTH --apply and --yes ' +
            'if you are sure (e.g. filepilot organize <paths> --apply --yes).',
        )
        process.exitCode = 1
        return
      }

      try {
        const scan = await scanDirectories({
          paths,
          followSymlinks: false,
          signal: new AbortController().signal,
        })
        const plan: OrganizationPlan = planOrganization(scan.files, {
          destinationRoot,
          skipProjects,
          skipZeroByteFiles: !options.includeEmpty,
        })
        const resolved = resolveConflicts(plan, strategy).plan

        process.stdout.write(`${renderPlan(resolved)}\n\n`)
        for (const move of resolved.moves) {
          process.stdout.write(`${move.source} → ${move.destination}\n`)
        }
        process.stdout.write(`\nTotal size to move: ${formatBytes(resolved.summary.bytesToMove)}\n`)

        if (!apply) {
          process.stdout.write('\nDry run: no files were created, moved or deleted.\n')
          process.stdout.write('Re-run with --apply --yes to execute this plan.\n')
          return
        }

        const result = await executePlan(resolved, { dryRun: false })
        process.stdout.write(
          `\nApplied ${result.applied}, failed ${result.failed} (transaction ${result.transactionId}).\n`,
        )
        for (const error of result.errors) {
          process.stdout.write(`  ERROR: ${error.source} → ${error.destination}: ${error.message}\n`)
        }
      } catch (err) {
        console.error(`filepilot: ${formatError(err)}`)
        process.exitCode = 1
      }
    })
}
