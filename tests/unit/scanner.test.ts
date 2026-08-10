import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { PathValidationError, ScanAbortedError } from '../../src/core/errors'
import { scanDirectories } from '../../src/core/scanner/scanner'
import { FakeFileSystem } from '../helpers/fake-fs'
import { makeDir, makeFile, makeTempDir, removeTemp, supportsSymlinks } from '../helpers/fs'

let tempDir: string | null = null

afterEach(async () => {
  if (tempDir) {
    await removeTemp(tempDir)
    tempDir = null
  }
})

async function makeRoot(): Promise<string> {
  tempDir = await makeTempDir('filepilot-scan-')
  return tempDir
}

describe('scanDirectories (real filesystem)', () => {
  it('scans a recursive tree with sizes, paths and depths', async () => {
    const root = await makeRoot()
    await makeFile(root, 'a.txt', 'hello world')
    await makeFile(root, 'sub/b.txt', '0123456789')
    await makeFile(root, 'sub/deep/c.txt', 'x'.repeat(500))
    await makeDir(root, 'empty')

    const result = await scanDirectories({ paths: [root] })

    expect(result.fileCount).toBe(3)
    expect(result.directoryCount).toBeGreaterThanOrEqual(4)
    expect(result.totalBytes).toBe(11 + 10 + 500)

    const a = result.files.find((f) => f.name === 'a.txt')
    expect(a?.path).toBe(join(root, 'a.txt'))
    expect(a?.size).toBe(11)
    expect(a?.depth).toBe(1)
    expect(a?.parent).toBe(root)

    const c = result.files.find((f) => f.name === 'c.txt')
    expect(c?.size).toBe(500)
    expect(c?.depth).toBe(3)
    expect(result.files.map((f) => f.path).sort()).toEqual(
      [join(root, 'a.txt'), join(root, 'sub', 'b.txt'), join(root, 'sub', 'deep', 'c.txt')].sort(),
    )
  })

  it('scans multiple roots', async () => {
    const rootA = await makeRoot()
    const rootB = await makeRoot()
    await makeFile(rootA, 'one.txt', '1')
    await makeFile(rootB, 'two.txt', '22')

    const result = await scanDirectories({ paths: [rootA, rootB] })
    expect(result.fileCount).toBe(2)
    expect(result.roots).toContain(rootA)
    expect(result.roots).toContain(rootB)
  })

  it('respects ignore patterns and counts them', async () => {
    const root = await makeRoot()
    await makeFile(root, 'keep.txt', 'k')
    await makeFile(root, 'temp.tmp', 't')
    await makeFile(root, 'node_modules/ignored.js', 'i')
    await makeFile(root, 'src/cache/data.bin', 'd')
    await makeFile(root, 'build/out.js', 'o')

    const result = await scanDirectories({
      paths: [root],
      ignorePatterns: ['*.tmp', 'node_modules', '**/cache', 'build/'],
    })

    const names = result.files.map((f) => f.name).sort()
    expect(names).toEqual(['keep.txt'])
    expect(result.ignoredCount).toBe(4)
  })

  it('honors negation patterns', async () => {
    const root = await makeRoot()
    await makeFile(root, 'keep.txt', 'k')
    await makeFile(root, 'drop.txt', 'd')

    const result = await scanDirectories({
      paths: [root],
      ignorePatterns: ['*.txt', '!keep.txt'],
    })
    expect(result.files.map((f) => f.name)).toEqual(['keep.txt'])
  })

  it('limits depth with maxDepth', async () => {
    const root = await makeRoot()
    await makeFile(root, 'top.txt', 't')
    await makeFile(root, 'sub/mid.txt', 'm')
    await makeFile(root, 'sub/deep/bottom.txt', 'b')

    const result = await scanDirectories({ paths: [root], maxDepth: 1 })
    expect(result.files.map((f) => f.name)).toEqual(['top.txt'])
  })

  it('includes hidden files by default', async () => {
    const root = await makeRoot()
    await makeFile(root, '.hidden', 'h')
    await makeFile(root, 'visible', 'v')

    const result = await scanDirectories({ paths: [root] })
    expect(result.files.map((f) => f.name).sort()).toEqual(['.hidden', 'visible'])
  })

  it('scans large flat directories', async () => {
    const root = await makeRoot()
    await makeDir(root, 'big')
    const chunk = 250
    for (let start = 0; start < 1000; start += chunk) {
      await Promise.all(
        Array.from({ length: chunk }, (_, i) =>
          makeFile(root, `big/file-${start + i}.bin`, 'x'.repeat(10)),
        ),
      )
    }

    const result = await scanDirectories({ paths: [join(root, 'big')] })
    expect(result.fileCount).toBe(1000)
    expect(result.totalBytes).toBe(10_000)
  })

  it('supports collectEntries: false', async () => {
    const root = await makeRoot()
    await makeFile(root, 'a.txt', 'aaa')
    await makeFile(root, 'b.txt', 'bb')

    const result = await scanDirectories({ paths: [root], collectEntries: false })
    expect(result.files).toEqual([])
    expect(result.fileCount).toBe(2)
    expect(result.totalBytes).toBe(5)
  })

  it('streams entries through onEntry', async () => {
    const root = await makeRoot()
    await makeFile(root, 'a.txt', 'a')
    await makeFile(root, 'b.txt', 'b')

    const seen: string[] = []
    const result = await scanDirectories({ paths: [root], onEntry: (entry) => seen.push(entry.name) })
    expect(seen.sort()).toEqual(['a.txt', 'b.txt'])
    expect(result.fileCount).toBe(2)
  })

  it('reports throttled progress and a final snapshot', async () => {
    const root = await makeRoot()
    await makeFile(root, 'a.txt', 'a')
    await makeFile(root, 'b.txt', 'b')

    const snapshots: string[] = []
    await scanDirectories({
      paths: [root],
      progressIntervalMs: 0,
      onProgress: (p) => snapshots.push(p.phase),
    })
    expect(snapshots.length).toBeGreaterThanOrEqual(2)
    expect(snapshots[snapshots.length - 1]).toBe('done')
  })

  it('rejects nonexistent, non-directory and empty targets', async () => {
    const root = await makeRoot()
    const file = await makeFile(root, 'plain.txt', 'x')

    await expect(scanDirectories({ paths: [join(root, 'missing')] })).rejects.toBeInstanceOf(
      PathValidationError,
    )
    await expect(scanDirectories({ paths: [file] })).rejects.toBeInstanceOf(PathValidationError)
    await expect(scanDirectories({ paths: [] })).rejects.toBeInstanceOf(PathValidationError)
  })

  it('flags protected system roots without failing', async () => {
    const root = await makeRoot()
    await makeFile(root, 'x.txt', 'x')
    if (process.platform === 'win32') {
      const result = await scanDirectories({ paths: [root] })
      expect(result.protectedRoots).toEqual([])
    }
  })

  it('finds duplicates of directories count correctly', async () => {
    const root = await makeRoot()
    await makeDir(root, 'd1')
    await makeDir(root, 'd2')
    const result = await scanDirectories({ paths: [root] })
    expect(result.directoryCount).toBeGreaterThanOrEqual(3)
  })
})

describe('scanDirectories (fake filesystem)', () => {
  function makeFake(): { root: string; fs: FakeFileSystem } {
    const root = 'C:\\fake\\tree'
    const fs = new FakeFileSystem(root, {
      '/': { type: 'dir' },
      '/a.txt': { type: 'file', size: 100 },
      '/dir': { type: 'dir' },
      '/dir/b.txt': { type: 'file', size: 50 },
      '/denied': { type: 'dir' },
      '/denied/c.txt': { type: 'file', size: 5 },
      '/sym': { type: 'symlink', target: '/dir' },
      '/symfile.txt': { type: 'symlink', target: '/a.txt' },
    })
    return { root, fs }
  }

  it('scans and records sizes', async () => {
    const { root, fs } = makeFake()
    const result = await scanDirectories({ paths: [root], fs })
    expect(result.fileCount).toBe(3)
    expect(result.totalBytes).toBe(155)
    expect(result.skippedSymlinks).toBe(2)
  })

  it('follows symlinks when requested', async () => {
    const { root, fs } = makeFake()
    const result = await scanDirectories({ paths: [root], fs, followSymlinks: true })
    const names = result.files.map((f) => f.name).sort()
    expect(names).toEqual(['a.txt', 'b.txt', 'c.txt', 'symfile.txt'])
    expect(result.skippedSymlinks).toBe(1)
    const viaLink = result.files.filter((f) => f.isSymlink)
    expect(viaLink.map((f) => f.name)).toEqual(['symfile.txt'])
    expect(viaLink[0]?.size).toBe(100)
  })

  it('does not loop on symlink cycles', async () => {
    const root = 'C:\\loop'
    const fs = new FakeFileSystem(root, {
      '/': { type: 'dir' },
      '/a': { type: 'dir' },
      '/a/loop': { type: 'symlink', target: '/a' },
      '/a/x.txt': { type: 'file', size: 10 },
    })
    const result = await scanDirectories({ paths: [root], fs, followSymlinks: true })
    expect(result.fileCount).toBe(1)
  })

  it('records permission errors and continues', async () => {
    const { root, fs } = makeFake()
    fs.denyDir('C:\\fake\\tree\\denied')
    fs.denyFile('C:\\fake\\tree\\a.txt')

    const result = await scanDirectories({ paths: [root], fs })
    expect(result.fileCount).toBe(1)
    expect(result.files[0]?.name).toBe('b.txt')
    const codes = result.errors.map((e) => e.code)
    expect(codes).toContain('EACCES')
    expect(result.errors.every((e) => e.fatal === false)).toBe(true)
  })

  it('supports cancellation via AbortSignal', async () => {
    const { root, fs } = makeFake()
    const controller = new AbortController()
    fs.denyDir('C:\\fake\\tree\\denied')

    let progressSeen = false
    const promise = scanDirectories({
      paths: [root],
      fs,
      signal: controller.signal,
      onProgress: () => {
        if (!progressSeen) {
          progressSeen = true
          controller.abort()
        }
      },
    })
    await expect(promise).rejects.toBeInstanceOf(ScanAbortedError)
  })

  it('returns errors instead of crashing on vanished directories', async () => {
    const { root, fs } = makeFake()
    fs.denyDir('C:\\fake\\tree\\dir')
    const result = await scanDirectories({ paths: [root], fs })
    expect(result.fileCount).toBe(2)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

describe('scanDirectories with real symlinks', () => {
  it('skips symlinks by default and counts them', async () => {
    if (!(await supportsSymlinks())) return
    const root = await makeRoot()
    await makeFile(root, 'real.txt', 'r')
    const target = await makeFile(root, 'target.txt', 't')
    const { symlink } = await import('node:fs/promises')
    await symlink(target, join(root, 'link.txt'))

    const result = await scanDirectories({ paths: [root] })
    expect(result.skippedSymlinks).toBe(1)
    expect(result.files.map((f) => f.name).sort()).toEqual(['real.txt', 'target.txt'])
  })

  it('follows file symlinks when enabled', async () => {
    if (!(await supportsSymlinks())) return
    const root = await makeRoot()
    const target = await makeFile(root, 'target.txt', 't')
    const { symlink } = await import('node:fs/promises')
    await symlink(target, join(root, 'link.txt'))

    const result = await scanDirectories({ paths: [root], followSymlinks: true })
    const links = result.files.filter((f) => f.isSymlink)
    expect(links.map((f) => f.name)).toEqual(['link.txt'])
    expect(links[0]?.size).toBe(1)
  })

  it('breaks symlink loops', async () => {
    if (!(await supportsSymlinks())) return
    const root = await makeRoot()
    const { symlink } = await import('node:fs/promises')
    await symlink(root, join(root, 'loop'))

    const result = await scanDirectories({ paths: [root], followSymlinks: true })
    expect(result.fileCount).toBe(0)
    expect(result.directoryCount).toBeLessThan(50)
  })
})
