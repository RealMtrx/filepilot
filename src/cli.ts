#!/usr/bin/env node
import { Command } from 'commander'

import { formatError } from './core/errors'
import { getVersion } from './core/version'

export async function buildProgram(): Promise<Command> {
  const program = new Command()

  program
    .name('filepilot')
    .description(
      'Local-first file analysis and organization for your device.\n' +
        'Everything runs on your machine. No accounts, no cloud, no data leaves your computer.',
    )
    .version(getVersion(), '-v, --version', 'output the current version')
    .helpOption('-h, --help', 'display help for command')
    .showHelpAfterError()
    .configureHelp({ sortSubcommands: true })

  program.action(async () => {
    const { runInteractiveMode } = await import('./tui')
    await runInteractiveMode()
  })

  const { buildOrganizeCommand } = await import('./commands/organize')
  buildOrganizeCommand(program)

  return program
}

async function main(): Promise<void> {
  try {
    await (await buildProgram()).parseAsync(process.argv)
  } catch (err) {
    process.stderr.write(`filepilot: ${formatError(err)}\n`)
    process.exitCode = 1
  }
}

void main()
