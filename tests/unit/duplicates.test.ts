import { describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { AbortedError, findDuplicates, type DuplicateProgress } from '../../src/index'
import type { FileEntry } from '../../src/index'
import { makeTempDir, randomBytes } from '../helpers/fs'

async function makeFiles(
  tempDir: string,
  spec: Array<[string, string | Buffer]>,
): Promise<FileEntry[]> {
  const entries: FileEntry[] = []
  for (const [relative, content] of spec) {
    const path = join(tempDir, relative)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content)
    entries.push({
      path,
      name: relative,
      size: Buffer.byteLength(content),
      modifiedAt: 0,
      birthtimeMs: 0,
      isSymlink: false,
      depth: 1,
      parent: dirname(path),
    })
  }
  return entries
}

const entry = (path: string, size: number, modifiedAt = 0): FileEntry => ({
  path,
  name: path.split(/[\\/]/).pop() ?? path,
  size,
  modifiedAt,
  birthtimeMs: 0,
  isSymlink: false,
  depth: 1,
  parent: path.slice(0, path.lastIndexOf(path.split(/[\\/]/).pop() ?? '')) || path,
})

describe('findDuplicates', () => {
  it('finds no duplicates for unique files', async () => {
    const tempDir = await makeTempDir()
    const files = await makeFiles(tempDir, [
      ['a.txt', 'content a'],
      ['b.txt', 'content b'],
    ])
    const result = await findDuplicates(files)
    expect(result.groups).toEqual([])
    expect(result.duplicateCount).toBe(0)
    expect(result.wastedBytes).toBe(0)
  })

  it('detects an exact duplicate pair', async () => {
    const tempDir = await makeTempDir()
    const content = randomBytes(4096)
    const files = await makeFiles(tempDir, [
      ['one.bin', content],
      ['two.bin', content],
    ])
    const result = await findDuplicates(files)
    expect(result.groups).toHaveLength(1)
    const group = result.groups[0]!
    expect(group.copies).toBe(2)
    expect(group.size).toBe(content.length)
    expect(group.wastedBytes).toBe(content.length)
    expect(group.files.map((f: { name: string }) => f.name)).toEqual(['one.bin', 'two.bin'])
    expect(result.duplicateCount).toBe(1)
    expect(result.wastedBytes).toBe(content.length)
  })

  it('does not group same-size files with different content', async () => {
    const tempDir = await makeTempDir()
    const files = await makeFiles(tempDir, [
      ['a.bin', Buffer.concat([Buffer.from('different'), randomBytes(2040)])],
      ['b.bin', randomBytes(2048)],
    ])
    const result = await findDuplicates(files)
    expect(result.groups).toHaveLength(0)
  })

  it('groups three identical copies with correct waste', async () => {
    const tempDir = await makeTempDir()
    const content = randomBytes(1024)
    const files = await makeFiles(tempDir, [
      ['x1.bin', content],
      ['x2.bin', content],
      ['x3.bin', content],
    ])
    const result = await findDuplicates(files)
    expect(result.groups).toHaveLength(1)
    const group = result.groups[0]!
    expect(group.copies).toBe(3)
    expect(group.wastedBytes).toBe(2 * content.length)
    expect(result.duplicateCount).toBe(2)
  })

  it('sorts group members by path and groups by waste', async () => {
    const tempDir = await makeTempDir()
    const contentA = randomBytes(512)
    const contentB = randomBytes(8192)
    const files = await makeFiles(tempDir, [
      ['b/a.bin', contentA],
      ['z/a.bin', contentA],
      ['a/b.bin', contentB],
      ['c/b.bin', contentB],
    ])
    const result = await findDuplicates(files)
    expect(result.groups).toHaveLength(2)
    const bigGroup = result.groups[0]!
    const smallGroup = result.groups[1]!
    expect(bigGroup.size).toBe(contentB.length)
    expect(smallGroup.size).toBe(contentA.length)
    expect(smallGroup.files.map((f: { path: string }) => f.path)).toEqual([
      join(tempDir, 'b', 'a.bin'),
      join(tempDir, 'z', 'a.bin'),
    ])
  })

  it('resolves fast-hash collisions with the full hash', async () => {
    const tempDir = await makeTempDir()
    const prefix = 'x'.repeat(2048)
    const files = await makeFiles(tempDir, [
      ['a.bin', prefix + 'AAAA'],
      ['b.bin', prefix + 'BBBB'],
    ])
    const result = await findDuplicates(files, { fastHashBytes: 2048 })
    expect(result.groups).toHaveLength(0)
  })

  it('detects a duplicate when fast hash matches and content is identical', async () => {
    const tempDir = await makeTempDir()
    const content = 'x'.repeat(4096)
    const files = await makeFiles(tempDir, [
      ['a.bin', content],
      ['b.bin', content],
    ])
    const result = await findDuplicates(files, { fastHashBytes: 128 })
    expect(result.groups).toHaveLength(1)
  })

  it('handles large files without loading them into memory', async () => {
    const tempDir = await makeTempDir()
    const chunk = randomBytes(1024 * 1024)
    const big = Buffer.concat([chunk, chunk, chunk, chunk, chunk]) // 5 MB
    const files = await makeFiles(tempDir, [
      ['big1.bin', big],
      ['big2.bin', big],
    ])
    const result = await findDuplicates(files)
    expect(result.groups).toHaveLength(1)
    const group = result.groups[0]!
    expect(group.size).toBe(big.length)
    expect(group.wastedBytes).toBe(big.length)
  })

  it('excludes zero-byte files by default and can include them', async () => {
    const tempDir = await makeTempDir()
    const files = await makeFiles(tempDir, [
      ['empty1.txt', ''],
      ['empty2.txt', ''],
      ['real.bin', randomBytes(64)],
    ])
    const defaultResult = await findDuplicates(files)
    expect(defaultResult.groups).toHaveLength(0)

    const includedResult = await findDuplicates(files, { includeEmptyFiles: true })
    expect(includedResult.groups).toHaveLength(1)
    const emptyGroup = includedResult.groups[0]!
    expect(emptyGroup.copies).toBe(2)
    expect(emptyGroup.wastedBytes).toBe(0)
  })

  it('deduplicates repeated paths from overlapping roots', async () => {
    const tempDir = await makeTempDir()
    const content = randomBytes(256)
    const files = await makeFiles(tempDir, [['dup.bin', content]])
    const doubled = [files[0]!, files[0]!, files[0]!]
    const result = await findDuplicates(doubled)
    expect(result.groups).toHaveLength(0)
  })

  it('records hashing errors without crashing', async () => {
    const tempDir = await makeTempDir()
    const content = randomBytes(1024)
    const good = await makeFiles(tempDir, [
      ['a.bin', content],
      ['b.bin', content],
    ])
    const missing = entry(join(tempDir, 'missing.bin'), content.length)
    const result = await findDuplicates([...good, missing])
    expect(result.groups).toHaveLength(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.path).toBe(missing.path)
  })

  it('aborts immediately when the signal is already aborted', async () => {
    const tempDir = await makeTempDir()
    const content = randomBytes(256)
    const files = await makeFiles(tempDir, [
      ['a.bin', content],
      ['b.bin', content],
    ])
    const controller = new AbortController()
    controller.abort()
    await expect(findDuplicates(files, { signal: controller.signal })).rejects.toBeInstanceOf(
      AbortedError,
    )
  })

  it('aborts mid-detection when the signal fires during hashing', async () => {
    const tempDir = await makeTempDir()
    const content = randomBytes(4096)
    const files = await makeFiles(tempDir, [
      ['a.bin', content],
      ['b.bin', content],
    ])
    const controller = new AbortController()
    const promise = findDuplicates(files, {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    })
    await expect(promise).rejects.toBeInstanceOf(AbortedError)
  })

  it('reports hashing progress', async () => {
    const tempDir = await makeTempDir()
    const content = randomBytes(1024)
    const files = await makeFiles(tempDir, [
      ['a.bin', content],
      ['b.bin', content],
    ])
    const phases: string[] = []
    const result = await findDuplicates(files, {
      progressIntervalMs: 0,
      onProgress: (progress: DuplicateProgress) => phases.push(progress.phase),
    })
    expect(result.groups).toHaveLength(1)
    expect(phases.at(-1)).toBe('done')
    expect(phases).toContain('hashing')
  })
})
