import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { dirname, join } from 'node:path'

import {
  AbortedError,
  executePlan,
  nodeOrganizerFs,
  planOrganization,
  TransactionManager,
  type FileEntry,
  type OrganizerFs,
} from '../../src/index'
import { makeTempDir, supportsSymlinks } from '../helpers/fs'

const entryOf = (path: string, size: number): FileEntry => ({
  path,
  name: path.split(/[\\/]/).pop() ?? path,
  size,
  modifiedAt: 0,
  birthtimeMs: 0,
  isSymlink: false,
  depth: 1,
  parent: dirname(path),
})

interface TreeSnapshot {
  rel: string
  content: string
}

async function snapshotTree(root: string): Promise<TreeSnapshot[]> {
  const entries: TreeSnapshot[] = []
  const walk = async (dir: string, prefix: string): Promise<void> => {
    const items = await readdir(dir, { withFileTypes: true })
    for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, item.name)
      const rel = prefix ? `${prefix}/${item.name}` : item.name
      if (item.isDirectory()) {
        await walk(full, rel)
      } else if (item.isFile() || item.isSymbolicLink()) {
        entries.push({ rel, content: await readFile(full, 'utf8').catch(() => '<unreadable>') })
      }
    }
  }
  await walk(root, '')
  return entries
}

const filesEqual = (a: TreeSnapshot[], b: TreeSnapshot[]): boolean =>
  a.length === b.length &&
  a.every((entry, i) => entry.rel === b[i]!.rel && entry.content === b[i]!.content)

/** fs shim that injects failures per operation, delegating to real fs. */
class FailingFs implements OrganizerFs {
  constructor(
    private readonly failures: Array<{
      op: 'rename' | 'copyFile' | 'unlink' | 'mkdir' | 'lstat'
      path: string
      code: string
    }>,
  ) {}

  private fail(op: 'rename' | 'copyFile' | 'unlink' | 'mkdir' | 'lstat', path: string): void {
    const entry = this.failures.find((f) => f.op === op && f.path === path)
    if (entry) {
      const error = new Error(`simulated ${op} failure`) as Error & { code: string }
      error.code = entry.code
      throw error
    }
  }

  async mkdir(path: string, options: { recursive: true }): Promise<void> {
    this.fail('mkdir', path)
    await nodeOrganizerFs.mkdir(path, options)
  }
  async lstat(path: string): Promise<Stats> {
    this.fail('lstat', path)
    return nodeOrganizerFs.lstat(path)
  }
  async rename(from: string, to: string): Promise<void> {
    this.fail('rename', from)
    await nodeOrganizerFs.rename(from, to)
  }
  async unlink(path: string): Promise<void> {
    this.fail('unlink', path)
    await nodeOrganizerFs.unlink(path)
  }
  async copyFile(from: string, to: string): Promise<void> {
    this.fail('copyFile', from)
    await nodeOrganizerFs.copyFile(from, to)
  }
  async realpath(path: string): Promise<string> {
    return nodeOrganizerFs.realpath(path)
  }
  async stat(path: string): Promise<Stats> {
    return nodeOrganizerFs.stat(path)
  }
}

let temps: string[] = []

const makeTemp = async (): Promise<string> => {
  const dir = await makeTempDir()
  temps.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(temps.map((dir) => rm(dir, { recursive: true, force: true })))
  temps = []
})

const SPEC: Array<[name: string, folder: string, content: string]> = [
  ['photo.png', 'images', 'images:photo.png'],
  ['invoice.pdf', 'documents', 'documents:invoice.pdf'],
  ['backup.zip', 'archives', 'archives:backup.zip'],
  ['song.mp3', 'audio', 'audio:song.mp3'],
  ['video.mp4', 'videos', 'videos:video.mp4'],
  ['script.ts', 'code', 'code:script.ts'],
]

async function makeScenario(): Promise<{
  srcDir: string
  destDir: string
  files: string[]
  plan: ReturnType<typeof planOrganization>
}> {
  const srcDir = await makeTemp()
  const destDir = await makeTemp()
  const files: string[] = []
  for (const [name, , content] of SPEC) {
    const path = join(srcDir, name)
    await writeFile(path, content)
    files.push(path)
  }
  const entries = files.map(async (path) => entryOf(path, (await stat(path)).size))
  const plan = planOrganization(await Promise.all(entries), { destinationRoot: destDir })
  expect(plan.summary.planned).toBe(files.length)
  return { srcDir, destDir, files, plan }
}

describe('executePlan — dry run', () => {
  it('performs zero filesystem modifications by default', async () => {
    const { srcDir, destDir, files, plan } = await makeScenario()
    const before = await snapshotTree(srcDir)
    const result = await executePlan(plan)
    const after = await snapshotTree(srcDir)

    expect(result.dryRun).toBe(true)
    expect(result.applied).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.planned).toBe(files.length)
    expect(result.moves.every((m) => m.status === 'pending')).toBe(true)
    expect(filesEqual(before, after)).toBe(true)
    await expect(stat(join(destDir, 'Images'))).rejects.toThrow()
  })

  it('never creates the destination root during a dry run', async () => {
    const { plan } = await makeScenario()
    await executePlan(plan)
    const brandNew = join(plan.destinationRoot, 'never-created')
    await expect(stat(brandNew)).rejects.toThrow()
  })

  it('never writes a journal during a dry run', async () => {
    const { plan } = await makeScenario()
    const journalFile = join(await makeTemp(), 'tx.json')
    await executePlan(plan, { journalFile })
    await expect(readFile(journalFile, 'utf8')).rejects.toThrow()
  })

  it('is a no-op on an empty plan', async () => {
    const destDir = await makeTemp()
    const plan = planOrganization([], { destinationRoot: destDir })
    const result = await executePlan(plan)
    expect(result.planned).toBe(0)
    expect(result.applied).toBe(0)
  })
})

describe('executePlan — real execution', () => {
  it('moves files into category folders and journals them', async () => {
    const { srcDir, destDir, files, plan } = await makeScenario()
    const journalFile = join(await makeTemp(), 'tx.json')
    const result = await executePlan(plan, { dryRun: false, journalFile })

    expect(result.dryRun).toBe(false)
    expect(result.applied).toBe(files.length)
    expect(result.failed).toBe(0)
    expect(result.transactionId).toBeTruthy()
    for (const file of files) {
      await expect(stat(file)).rejects.toThrow()
    }
    expect((await stat(join(destDir, 'Images', 'photo.png'))).isFile()).toBe(true)
    expect(await readFile(join(destDir, 'Images', 'photo.png'), 'utf8')).toBe('images:photo.png')
    expect((await stat(join(destDir, 'Documents', 'invoice.pdf'))).isFile()).toBe(true)

    const record = await new TransactionManager(journalFile).load()
    expect(record).not.toBeNull()
    expect(record!.status).toBe('completed')
    expect(record!.operations).toHaveLength(files.length)
    const photoOp = record!.operations.find((op) => op.source === files[0])!
    expect(photoOp).toMatchObject({
      type: 'move',
      source: files[0],
      destination: join(destDir, 'Images', 'photo.png'),
      status: 'applied',
    })
  })

  it('flattens nested source directories into category folders', async () => {
    const srcDir = await makeTemp()
    const destDir = await makeTemp()
    const nested = join(srcDir, 'a', 'b', 'c')
    await mkdir(nested, { recursive: true })
    const deep = join(nested, 'deep.png')
    await writeFile(deep, 'deep-image')
    const plan = planOrganization([entryOf(deep, (await stat(deep)).size)], {
      destinationRoot: destDir,
    })
    const result = await executePlan(plan, {
      dryRun: false,
      journalFile: join(await makeTemp(), 'tx.json'),
    })
    expect(result.applied).toBe(1)
    expect(await readFile(join(destDir, 'Images', 'deep.png'), 'utf8')).toBe('deep-image')
    await expect(stat(deep)).rejects.toThrow()
  })

  it('fails a move when the destination already exists, leaving the source intact', async () => {
    const { files, plan } = await makeScenario()
    const blocked = files[0]!
    const destPath = plan.moves.find((m) => m.source === blocked)!.destination
    await mkdir(dirname(destPath), { recursive: true })
    await writeFile(destPath, 'existing-content')

    const result = await executePlan(plan, {
      dryRun: false,
      journalFile: join(await makeTemp(), 'tx.json'),
    })
    expect(result.failed).toBe(1)
    expect(result.applied).toBe(files.length - 1)
    expect(result.errors[0]!.message).toContain('refusing to overwrite')
    expect(await readFile(blocked, 'utf8')).toBe('images:photo.png')
    expect(await readFile(destPath, 'utf8')).toBe('existing-content')
  })

  it('continues after a missing source', async () => {
    const { srcDir, destDir, files, plan } = await makeScenario()
    await rm(files[0]!)
    const result = await executePlan(plan, {
      dryRun: false,
      journalFile: join(await makeTemp(), 'tx.json'),
    })
    expect(result.failed).toBe(1)
    expect(result.applied).toBe(files.length - 1)
    expect(result.errors[0]!.message).toContain('source not found')
    expect((await stat(join(destDir, 'Documents', 'invoice.pdf'))).isFile()).toBe(true)
  })

  it('refuses to move a source that became a directory', async () => {
    const { files, plan } = await makeScenario()
    await rm(files[0]!)
    await mkdir(files[0]!)
    const result = await executePlan(plan, {
      dryRun: false,
      journalFile: join(await makeTemp(), 'tx.json'),
    })
    expect(result.failed).toBe(1)
    expect(result.errors[0]!.message).toContain('directory')
  })

  it('survives permission failures without crashing the plan', async () => {
    const { srcDir, destDir, files, plan } = await makeScenario()
    const fs = new FailingFs([{ op: 'rename', path: files[2]!, code: 'EACCES' }])
    const result = await executePlan(plan, {
      dryRun: false,
      fs,
      journalFile: join(await makeTemp(), 'tx.json'),
    })
    expect(result.failed).toBe(1)
    expect(result.errors[0]!.message).toContain('permission denied')
    expect(result.applied).toBe(files.length - 1)
    expect((await stat(files[2]!)).isFile()).toBe(true)
    expect((await stat(join(destDir, 'Images', 'photo.png'))).isFile()).toBe(true)
  })

  it('recovers from an interrupted rename and keeps going', async () => {
    const { srcDir, destDir, files, plan } = await makeScenario()
    const fs = new FailingFs([{ op: 'rename', path: files[1]!, code: 'EIO' }])
    const result = await executePlan(plan, {
      dryRun: false,
      fs,
      journalFile: join(await makeTemp(), 'tx.json'),
    })
    expect(result.applied).toBe(files.length - 1)
    expect(result.failed).toBe(1)
    expect((await stat(join(destDir, 'Images', 'photo.png'))).isFile()).toBe(true)
    expect((await stat(join(destDir, 'Archives', 'backup.zip'))).isFile()).toBe(true)
    expect((await stat(files[1]!)).isFile()).toBe(true)
  })

  it('uses copy-then-delete when a rename crosses devices (EXDEV)', async () => {
    const { destDir, files, plan } = await makeScenario()
    const fs = new FailingFs([{ op: 'rename', path: files[0]!, code: 'EXDEV' }])
    const result = await executePlan(plan, {
      dryRun: false,
      fs,
      journalFile: join(await makeTemp(), 'tx.json'),
    })
    expect(result.applied).toBe(files.length)
    const execution = result.moves.find((m) => m.move.source === files[0])!
    expect(execution.copiedFallback).toBe(true)
    expect(await readFile(join(destDir, 'Images', 'photo.png'), 'utf8')).toBe('images:photo.png')
    await expect(stat(files[0]!)).rejects.toThrow()
  })

  it('keeps the source when a cross-device copy fails and cleans up the partial copy', async () => {
    const { destDir, files, plan } = await makeScenario()
    const fs = new FailingFs([
      { op: 'rename', path: files[0]!, code: 'EXDEV' },
      { op: 'copyFile', path: files[0]!, code: 'EIO' },
    ])
    const result = await executePlan(plan, {
      dryRun: false,
      fs,
      journalFile: join(await makeTemp(), 'tx.json'),
    })
    expect(result.failed).toBe(1)
    expect(result.applied).toBe(files.length - 1)
    expect((await stat(files[0]!)).isFile()).toBe(true)
    await expect(stat(join(destDir, 'Images', 'photo.png'))).rejects.toThrow()
  })

  it('moves a symlink as a link, never following it', async (context) => {
    if (!(await supportsSymlinks())) context.skip()
    const srcDir = await makeTemp()
    const destDir = await makeTemp()
    const target = join(srcDir, 'real-target.txt')
    const link = join(srcDir, 'link.txt')
    await writeFile(target, 'target-content')
    await symlink('real-target.txt', link)

    const plan = planOrganization([entryOf(link, 0)], {
      destinationRoot: destDir,
      skipZeroByteFiles: false,
    })
    const result = await executePlan(plan, {
      dryRun: false,
      journalFile: join(await makeTemp(), 'tx.json'),
    })
    expect(result.applied).toBe(1)
    expect((await stat(target)).isFile()).toBe(true)
    expect((await stat(join(destDir, 'Documents', 'link.txt'))).isSymbolicLink()).toBe(true)
    await expect(stat(link)).rejects.toThrow()
  })

  it('refuses a destination that escapes the root through a symlink', async (context) => {
    if (!(await supportsSymlinks())) context.skip()
    const srcDir = await makeTemp()
    const destDir = await makeTemp()
    const outside = await makeTemp()
    await writeFile(join(srcDir, 'photo.png'), 'x')
    await symlink(outside, join(destDir, 'Images'))

    const plan = planOrganization([entryOf(join(srcDir, 'photo.png'), 1)], {
      destinationRoot: destDir,
    })
    expect(plan.summary.planned).toBe(1)
    const result = await executePlan(plan, {
      dryRun: false,
      journalFile: join(await makeTemp(), 'tx.json'),
    })
    expect(result.failed).toBe(1)
    expect(result.errors[0]!.message).toContain('symlink')
    expect((await stat(join(srcDir, 'photo.png'))).isFile()).toBe(true)
  })

  it('aborts mid-run on request, leaving an in-progress journal', async () => {
    const { files, plan } = await makeScenario()
    const journalFile = join(await makeTemp(), 'tx.json')
    const controller = new AbortController()
    let renameCount = 0
    const fs: OrganizerFs = {
      ...nodeOrganizerFs,
      async rename(from, to) {
        renameCount += 1
        if (renameCount === 1) controller.abort()
        await nodeOrganizerFs.rename(from, to)
      },
    }
    await expect(
      executePlan(plan, { dryRun: false, fs, journalFile, signal: controller.signal }),
    ).rejects.toBeInstanceOf(AbortedError)

    const record = await new TransactionManager(journalFile).load()
    expect(record).not.toBeNull()
    expect(record!.status).toBe('in-progress')
    expect(record!.operations).toHaveLength(1)
    expect(record!.operations[0]!.destination).toBe(plan.moves[0]!.destination)
    expect((await stat(plan.moves[0]!.destination)).isFile()).toBe(true)
  })

  it('aborts immediately on an already-aborted signal', async () => {
    const { plan } = await makeScenario()
    const controller = new AbortController()
    controller.abort()
    await expect(
      executePlan(plan, { dryRun: false, signal: controller.signal }),
    ).rejects.toBeInstanceOf(AbortedError)
  })

  it('respects abort in dry run mode', async () => {
    const { plan } = await makeScenario()
    const controller = new AbortController()
    controller.abort()
    await expect(executePlan(plan, { signal: controller.signal })).rejects.toBeInstanceOf(
      AbortedError,
    )
  })
})
