import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { analyzeEntries, type DiskAnalysis } from '../../src/index'
import type { FileEntry } from '../../src/index'

const entry = (
  path: string,
  name: string,
  size: number,
  depth: number,
  parent: string,
): FileEntry => ({ path, name, size, modifiedAt: 0, birthtimeMs: 0, isSymlink: false, depth, parent })

describe('analyzeEntries', () => {
  it('reports totals and counts for an empty scan', () => {
    const result = analyzeEntries([], ['C:\\root'])
    expect(result.totalBytes).toBe(0)
    expect(result.totalFiles).toBe(0)
    expect(result.totalDirectories).toBe(0)
    expect(result.topFiles).toEqual([])
    expect(result.topFolders).toEqual([])
    expect(result.byCategory).toEqual([])
  })

  it('aggregates totals and lists the largest files first', () => {
    const root = 'C:\\root'
    const files = [
      entry(join(root, 'small.txt'), 'small.txt', 10, 1, root),
      entry(join(root, 'big.bin'), 'big.bin', 500, 1, root),
      entry(join(root, 'mid.bin'), 'mid.bin', 100, 1, root),
    ]
    const result = analyzeEntries(files, [root])
    expect(result.totalBytes).toBe(610)
    expect(result.totalFiles).toBe(3)
    expect(result.topFiles.map((f) => f.name)).toEqual(['big.bin', 'mid.bin', 'small.txt'])
  })

  it('respects the topFiles limit', () => {
    const root = 'C:\\root'
    const files = [1, 2, 3, 4, 5].map((i) => entry(join(root, `f${i}.bin`), `f${i}.bin`, i * 10, 1, root))
    const result = analyzeEntries(files, [root], { topFiles: 2 })
    expect(result.topFiles.map((f) => f.name)).toEqual(['f5.bin', 'f4.bin'])
  })

  it('breaks sizes down by category using extensions', () => {
    const root = 'C:\\root'
    const files = [
      entry(join(root, 'a.jpg'), 'a.jpg', 100, 1, root),
      entry(join(root, 'b.png'), 'b.png', 200, 1, root),
      entry(join(root, 'c.mp4'), 'c.mp4', 300, 1, root),
      entry(join(root, 'd.txt'), 'd.txt', 400, 1, root),
      entry(join(root, 'e.zip'), 'e.zip', 500, 1, root),
      entry(join(root, 'f.xyz'), 'f.xyz', 600, 1, root),
    ]
    const result = analyzeEntries(files, [root])
    const byCategory = new Map(result.byCategory.map((c) => [c.category, c]))
    expect(byCategory.get('images')?.bytes).toBe(300)
    expect(byCategory.get('videos')?.bytes).toBe(300)
    expect(byCategory.get('documents')?.bytes).toBe(400)
    expect(byCategory.get('archives')?.bytes).toBe(500)
    expect(byCategory.get('other')?.bytes).toBe(600)
    expect(result.byCategory[0]!.category).toBe('other')
  })

  it('computes category percentages', () => {
    const root = 'C:\\root'
    const files = [
      entry(join(root, 'a.jpg'), 'a.jpg', 250, 1, root),
      entry(join(root, 'b.txt'), 'b.txt', 750, 1, root),
    ]
    const result = analyzeEntries(files, [root])
    const images = result.byCategory.find((c) => c.category === 'images')!
    const docs = result.byCategory.find((c) => c.category === 'documents')!
    expect(images.percent).toBeCloseTo(25)
    expect(docs.percent).toBeCloseTo(75)
  })

  it('aggregates nested folder subtrees without double counting', () => {
    const root = 'C:\\root'
    const sub = join(root, 'sub')
    const deep = join(sub, 'deep')
    const files = [
      entry(join(root, 'top.txt'), 'top.txt', 100, 1, root),
      entry(join(sub, 'one.txt'), 'one.txt', 200, 2, sub),
      entry(join(sub, 'two.txt'), 'two.txt', 300, 2, sub),
      entry(join(deep, 'three.bin'), 'three.bin', 400, 3, deep),
    ]
    const result = analyzeEntries(files, [root])
    expect(result.totalBytes).toBe(1000)
    const topFolders = new Map(result.topFolders.map((f) => [f.name, f]))
    const subStat = topFolders.get('sub')!
    expect(subStat.size).toBe(900)
    expect(subStat.fileCount).toBe(3)
    expect(subStat.percent).toBeCloseTo(90)
    expect(result.totalDirectories).toBe(3)
  })

  it('reports only folders directly under a scan root as top folders', () => {
    const root = 'C:\\root'
    const sub = join(root, 'sub')
    const deep = join(root, 'deep')
    const files = [
      entry(join(root, 'a.txt'), 'a.txt', 10, 1, root),
      entry(join(sub, 'b.txt'), 'b.txt', 20, 2, sub),
      entry(join(deep, 'c.bin'), 'c.bin', 30, 3, deep),
    ]
    const result = analyzeEntries(files, [root, sub])
    const names = result.topFolders.map((f) => f.name).sort()
    expect(names).toEqual(['deep', 'sub'])
    expect(result.topFolders.find((f) => f.name === 'sub')!.size).toBe(20)
    expect(result.topFolders.find((f) => f.name === 'deep')!.size).toBe(30)
  })

  it('limits top folders and sorts them by size', () => {
    const root = 'C:\\root'
    const files = ['a', 'b', 'c', 'd'].flatMap((letter) => {
      const dir = join(root, `folder-${letter}`)
      return [1, 2, 3].map((i) => entry(join(dir, `f${i}.bin`), `f${i}.bin`, i * 10, 2, dir))
    })
    const result = analyzeEntries(files, [root], { topFolders: 2 })
    expect(result.topFolders).toHaveLength(2)
    for (const folder of result.topFolders) {
      expect(folder.size).toBe(60)
      expect(folder.fileCount).toBe(3)
    }
  })

  it('is deterministic for tied sizes', () => {
    const root = 'C:\\root'
    const files = [
      entry(join(root, 'b.bin'), 'b.bin', 50, 1, root),
      entry(join(root, 'a.bin'), 'a.bin', 50, 1, root),
    ]
    const result = analyzeEntries(files, [root])
    expect(result.topFiles.map((f) => f.name)).toEqual(['a.bin', 'b.bin'])
  })

  it('classifies unknown extension-less files as other', () => {
    const root = 'C:\\root'
    const files = [entry(join(root, 'MYSTERYDATA'), 'MYSTERYDATA', 42, 1, root)]
    const result = analyzeEntries(files, [root])
    expect(result.byCategory).toHaveLength(1)
    expect(result.byCategory[0]!.category).toBe('other')
    expect(result.byCategory[0]!.bytes).toBe(42)
  })

  it('exposes a typed result shape', () => {
    const root = 'C:\\root'
    const result: DiskAnalysis = analyzeEntries([], [root])
    expect(typeof result.totalBytes).toBe('number')
    expect(Array.isArray(result.topFiles)).toBe(true)
    expect(typeof result.elapsedMs).toBe('number')
  })
})
