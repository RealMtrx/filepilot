import { describe, expect, it } from 'vitest'
import { join } from 'node:path'

import {
  bumpName,
  normalizePath,
  OrganizeError,
  planOrganization,
  resolveConflicts,
  type FileEntry,
} from '../../src/index'

const win = (path: string): string => path.replace(/\//g, '\\')

const entry = (
  path: string,
  name: string,
  size = 100,
  parent = path.slice(0, path.length - name.length - 1),
): FileEntry => ({
  path,
  name,
  size,
  modifiedAt: 0,
  birthtimeMs: 0,
  isSymlink: false,
  depth: 1,
  parent,
})

const DEST = '/dl/out'

/** Mirrors the planner's normalize-then-join so expectations are platform-correct. */
const dest = (...parts: string[]): string => join(normalizePath(DEST), ...parts)

describe('planOrganization', () => {
  it('plans moves into category folders by extension', () => {
    const plan = planOrganization(
      [
        entry(join('/dl', 'photo.png'), 'photo.png'),
        entry(join('/dl', 'invoice.pdf'), 'invoice.pdf'),
        entry(join('/dl', 'backup.zip'), 'backup.zip'),
      ],
      { destinationRoot: DEST },
    )
    expect(plan.summary.planned).toBe(3)
    expect(plan.summary.conflicts).toBe(0)
    expect(plan.summary.skipped).toBe(0)
    expect(plan.moves.map((m) => m.destination)).toEqual([
      dest('Archives', 'backup.zip'),
      dest('Documents', 'invoice.pdf'),
      dest('Images', 'photo.png'),
    ])
  })

  it('handles multiple files and nested directories', () => {
    const files = [
      entry(join('/dl/a', 'one.jpg'), 'one.jpg', 10),
      entry(join('/dl/a/b', 'two.jpg'), 'two.jpg', 20),
      entry(join('/dl/c', 'three.mp3'), 'three.mp3', 30),
    ]
    const plan = planOrganization(files, { destinationRoot: DEST })
    expect(plan.summary.planned).toBe(3)
    expect(plan.summary.bytesToMove).toBe(60)
    const dirs = plan.moves.map((m) => m.destinationDir)
    expect(dirs.every((d) => d === dest('Images') || d === dest('Audio'))).toBe(true)
  })

  it('reports same-name collisions as target-collision conflicts', () => {
    const plan = planOrganization(
      [
        entry(join('/dl/a', 'photo.png'), 'photo.png'),
        entry(join('/dl/b', 'photo.png'), 'photo.png'),
      ],
      { destinationRoot: DEST },
    )
    expect(plan.summary.planned).toBe(0)
    expect(plan.summary.conflicts).toBe(2)
    expect(plan.conflicts.every((c) => c.reason === 'target-collision')).toBe(true)
    expect(plan.conflicts.map((c) => c.source).sort()).toEqual([
      join('/dl/a', 'photo.png'),
      join('/dl/b', 'photo.png'),
    ])
  })

  it('reports self-moves (already organized) as conflicts', () => {
    const already = dest('Images', 'photo.png')
    const plan = planOrganization([entry(already, 'photo.png')], { destinationRoot: DEST })
    expect(plan.summary.planned).toBe(0)
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.conflicts[0]!.reason).toBe('self-move')
  })

  it('reports overlap when a destination is another move source', () => {
    const secondSource = dest('Images', 'a.png')
    const plan = planOrganization(
      [
        entry(join('/dl/sub', 'a.png'), 'a.png'),
        entry(secondSource, 'a.png'),
      ],
      { destinationRoot: DEST },
    )
    expect(plan.summary.planned).toBe(0)
    const reasons = plan.conflicts.map((c) => c.reason).sort()
    expect(reasons).toEqual(['overlap', 'self-move'])
  })

  it('skips files inside detected software projects', () => {
    const projectRoot = join('/projects', 'myapp')
    const plan = planOrganization(
      [
        entry(join(projectRoot, 'package.json'), 'package.json', 500),
        entry(join(projectRoot, 'src', 'index.ts'), 'index.ts', 900),
        entry(join('/dl', 'report.pdf'), 'report.pdf', 300),
      ],
      { destinationRoot: DEST },
    )
    expect(plan.summary.planned).toBe(1)
    expect(plan.summary.skipped).toBe(2)
    expect(plan.skipped.every((s) => s.reason === 'project-file')).toBe(true)
    expect(plan.moves[0]!.source).toBe(join('/dl', 'report.pdf'))
  })

  it('can include project files when skipProjects is false', () => {
    const plan = planOrganization(
      [entry(join('/projects/myapp/src', 'index.ts'), 'index.ts')],
      { destinationRoot: DEST, skipProjects: false },
    )
    expect(plan.summary.planned).toBe(1)
  })

  it('skips zero-byte files by default and includes them on request', () => {
    const empty = entry(join('/dl', 'empty.txt'), 'empty.txt', 0)
    const normal = entry(join('/dl', 'notes.txt'), 'notes.txt', 50)
    expect(planOrganization([empty, normal], { destinationRoot: DEST }).summary.skipped).toBe(1)
    const included = planOrganization([empty, normal], {
      destinationRoot: DEST,
      skipZeroByteFiles: false,
    })
    expect(included.summary.planned).toBe(2)
  })

  it('skips paths with invalid characters', () => {
    const plan = planOrganization(
      [entry('/dl/bad\u0000file.png', 'bad\u0000file.png')],
      { destinationRoot: DEST },
    )
    expect(plan.summary.planned).toBe(0)
    expect(plan.skipped[0]!.reason).toBe('invalid-path')
  })

  it('throws for a relative destination root', () => {
    expect(() => planOrganization([], { destinationRoot: 'relative/out' })).toThrow(OrganizeError)
  })

  it('throws for a protected destination root on Windows', (context) => {
    if (process.platform !== 'win32') context.skip()
    expect(() => planOrganization([], { destinationRoot: 'C:\\Windows' })).toThrow(OrganizeError)
  })

  it('applies a custom folderFor function', () => {
    const plan = planOrganization([entry(join('/dl', 'a.png'), 'a.png')], {
      destinationRoot: DEST,
      folderFor: () => 'CustomFolder',
    })
    expect(plan.moves[0]!.destinationDir).toBe(dest('CustomFolder'))
  })

  it('rejects folder names with separators', () => {
    const plan = planOrganization([entry(join('/dl', 'a.png'), 'a.png')], {
      destinationRoot: DEST,
      folderFor: () => 'a/b',
    })
    expect(plan.summary.planned).toBe(0)
    expect(plan.skipped[0]!.reason).toBe('invalid-path')
  })

  it('computes summary counts and bytes', () => {
    const plan = planOrganization(
      [
        entry(join('/dl/a', 'a.png'), 'a.png', 10),
        entry(join('/dl/b', 'b.mp4'), 'b.mp4', 20),
        entry(join('/dl/c', 'c.txt'), 'c.txt', 30),
        entry(join('/dl/d', 'c.txt'), 'c.txt', 40),
      ],
      { destinationRoot: DEST },
    )
    expect(plan.summary.planned).toBe(2)
    expect(plan.summary.conflicts).toBe(2)
    expect(plan.summary.skipped).toBe(0)
    expect(plan.summary.bytesToMove).toBe(30)
  })

  it('works with Windows-style paths', () => {
    const plan = planOrganization(
      [
        entry(win('C:\\Users\\me\\Downloads\\shot.png'), 'shot.png'),
        entry(win('C:\\Users\\me\\Downloads\\notes.docx'), 'notes.docx'),
      ],
      { destinationRoot: 'D:\\organized' },
    )
    expect(plan.summary.planned).toBe(2)
    expect(plan.moves.map((m) => m.destination)).toEqual([
      join(normalizePath('D:\\organized'), 'Documents', 'notes.docx'),
      join(normalizePath('D:\\organized'), 'Images', 'shot.png'),
    ])
  })

  it('works with POSIX-style paths', () => {
    const plan = planOrganization(
      [entry('/home/me/dl/video.mkv', 'video.mkv')],
      { destinationRoot: '/mnt/disk/out' },
    )
    expect(plan.moves[0]!.destination).toBe(join(normalizePath('/mnt/disk/out'), 'Videos', 'video.mkv'))
  })

  it('orders moves deterministically by source path', () => {
    const plan = planOrganization(
      [
        entry(join('/dl', 'z.png'), 'z.png'),
        entry(join('/dl', 'a.png'), 'a.png'),
        entry(join('/dl', 'm.png'), 'm.png'),
      ],
      { destinationRoot: DEST },
    )
    expect(plan.moves.map((m) => m.source)).toEqual([
      join('/dl', 'a.png'),
      join('/dl', 'm.png'),
      join('/dl', 'z.png'),
    ])
  })

  it('skips protected sources on Windows unless allowed', (context) => {
    if (process.platform !== 'win32') context.skip()
    const protectedFile = entry(win('C:\\Windows\\system32\\foo.dll'), 'foo.dll')
    const blocked = planOrganization([protectedFile], { destinationRoot: 'D:\\out' })
    expect(blocked.summary.planned).toBe(0)
    expect(blocked.skipped[0]!.reason).toBe('protected-source')
    const allowed = planOrganization([protectedFile], {
      destinationRoot: 'D:\\out',
      allowProtectedSources: true,
    })
    expect(allowed.summary.planned).toBe(1)
  })
})

describe('resolveConflicts (rename strategy)', () => {
  const collisionPlan = (): ReturnType<typeof planOrganization> =>
    planOrganization(
      [
        entry(join('/dl/a', 'photo.png'), 'photo.png', 10),
        entry(join('/dl/b', 'photo.png'), 'photo.png', 20),
      ],
      { destinationRoot: DEST },
    )

  it('keeps conflicts excluded under the skip strategy', () => {
    const plan = collisionPlan()
    const result = resolveConflicts(plan, 'skip')
    expect(result.resolved).toBe(0)
    expect(result.plan.summary.planned).toBe(0)
    expect(result.remaining).toHaveLength(2)
  })

  it('renames colliding files deterministically', () => {
    const plan = collisionPlan()
    const result = resolveConflicts(plan, 'rename')
    expect(result.resolved).toBe(2)
    expect(result.plan.summary.planned).toBe(2)
    expect(result.remaining).toHaveLength(0)
    const destinations = result.plan.moves.map((m) => m.destination).sort()
    expect(destinations).toEqual([
      dest('Images', 'photo (2).png'),
      dest('Images', 'photo.png'),
    ])
  })

  it('renames multiple colliding files with increasing indexes', () => {
    const plan = planOrganization(
      [
        entry(join('/dl/a', 'x.png'), 'x.png'),
        entry(join('/dl/b', 'x.png'), 'x.png'),
        entry(join('/dl/c', 'x.png'), 'x.png'),
      ],
      { destinationRoot: DEST },
    )
    const result = resolveConflicts(plan, 'rename')
    expect(result.plan.summary.planned).toBe(3)
    expect(result.plan.moves.map((m) => m.destination).sort()).toEqual([
      dest('Images', 'x (2).png'),
      dest('Images', 'x (3).png'),
      dest('Images', 'x.png'),
    ])
  })

  it('never renames onto another planned destination', () => {
    const plan = planOrganization(
      [
        entry(join('/dl/a', 'x.png'), 'x.png'),
        entry(join('/dl/b', 'x.png'), 'x.png'),
        entry(join('/dl/c', 'x (2).png'), 'x (2).png'),
      ],
      { destinationRoot: DEST },
    )
    const result = resolveConflicts(plan, 'rename')
    const destinations = result.plan.moves.map((m) => m.destination)
    expect(new Set(destinations).size).toBe(destinations.length)
    expect(destinations).toContain(dest('Images', 'x (3).png'))
  })

  it('cannot resolve self-moves or overlaps by renaming', () => {
    const plan = planOrganization(
      [
        entry(dest('Images', 'a.png'), 'a.png'),
        entry(join('/dl/sub', 'a.png'), 'a.png'),
      ],
      { destinationRoot: DEST },
    )
    const result = resolveConflicts(plan, 'rename')
    expect(result.resolved).toBe(0)
    expect(result.remaining.map((c) => c.reason).sort()).toEqual(['overlap', 'self-move'])
  })
})

describe('bumpName', () => {
  it('inserts the index before the extension', () => {
    expect(bumpName('photo.png', 2)).toBe('photo (2).png')
    expect(bumpName('archive.tar.gz', 3)).toBe('archive.tar (3).gz')
    expect(bumpName('README', 4)).toBe('README (4)')
  })
})


