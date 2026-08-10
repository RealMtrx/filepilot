import type { Stats } from 'node:fs'

import type { DirEntry, FileSystemAdapter } from '../../src/core/scanner/fs-adapter'

export interface FakeNode {
  type: 'dir' | 'file' | 'symlink'
  size?: number
  mtime?: number
  target?: string
}

export type FakeTree = Record<string, FakeNode>

interface Entry {
  name: string
  node: FakeNode
}

/**
 * In-memory filesystem used to test the scanner deterministically,
 * including simulated permission failures on any platform.
 */
export class FakeFileSystem implements FileSystemAdapter {
  private readonly root: string
  private readonly tree: Map<string, FakeNode>
  readonly deniedDirs: Set<string>
  readonly deniedFiles: Set<string>
  readonly callLog: string[] = []

  constructor(rootPath: string, tree: FakeTree) {
    this.root = this.normalize(rootPath)
    this.tree = new Map()
    this.deniedDirs = new Set()
    this.deniedFiles = new Set()
    for (const [key, node] of Object.entries(tree)) {
      const path = key === '/' ? this.root : `${this.root}${key}`
      this.tree.set(this.normalize(path), { ...node })
    }
  }

  private normalize(path: string): string {
    return path.replace(/\\/g, '/')
  }

  private resolve(path: string): string {
    return this.normalize(path)
  }

  deny(path: string): this {
    path = this.resolve(path)
    this.deniedDirs.add(path)
    this.deniedFiles.add(path)
    return this
  }

  denyDir(path: string): this {
    this.deniedDirs.add(this.resolve(path))
    return this
  }

  denyFile(path: string): this {
    this.deniedFiles.add(this.resolve(path))
    return this
  }

  private entriesOf(path: string): Entry[] {
    const prefix = `${path}/`
    const entries: Entry[] = []
    for (const [key, node] of this.tree) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length)
        if (rest.length === 0 || rest.includes('/')) continue
        entries.push({ name: rest, node })
      }
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name))
  }

  private find(path: string): FakeNode | undefined {
    path = this.resolve(path)
    if (path === this.root) return { type: 'dir' }
    const node = this.tree.get(path)
    if (!node) return undefined
    if (node.type === 'symlink') return this.resolveSymlink(path)
    return node
  }

  private resolvePath(path: string, depth = 0): string | undefined {
    path = this.resolve(path)
    if (depth > 32) return undefined
    if (path === this.root) return this.root
    const node = this.tree.get(path)
    if (node) {
      if (node.type === 'symlink' && node.target) {
        const target = node.target === '/' ? this.root : `${this.root}${node.target}`
        return this.resolvePath(this.normalize(target), depth + 1)
      }
      return path
    }
    const sepIndex = path.lastIndexOf('/')
    if (sepIndex <= 0) return undefined
    const parent = path.slice(0, sepIndex)
    const child = path.slice(sepIndex + 1)
    const resolvedParent = this.resolvePath(parent, depth + 1)
    if (resolvedParent === undefined) return undefined
    return `${resolvedParent}/${child}`
  }

  private resolveSymlink(path: string): FakeNode | undefined {
    const resolved = this.resolvePath(path)
    if (resolved === undefined || resolved === this.resolve(path)) return undefined
    return this.find(resolved)
  }

  async readdir(path: string): Promise<DirEntry[]> {
    path = this.resolve(path)
    this.callLog.push(`readdir:${path}`)
    if (this.deniedDirs.has(path)) {
      throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    }
    const resolved = this.resolvePath(path)
    if (resolved === undefined || this.find(resolved)?.type !== 'dir') {
      throw Object.assign(new Error('ENOENT: no such directory'), { code: 'ENOENT' })
    }
    return this.entriesOf(resolved).map(({ name, node: child }) => ({
      name,
      isDirectory: () => child.type === 'dir',
      isFile: () => child.type === 'file',
      isSymbolicLink: () => child.type === 'symlink',
    }))
  }

  async stat(path: string): Promise<Stats> {
    path = this.resolve(path)
    this.callLog.push(`stat:${path}`)
    if (this.deniedFiles.has(path)) {
      throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    }
    const resolved = this.resolvePath(path)
    const node = resolved === undefined ? undefined : this.find(resolved)
    if (!node) {
      throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' })
    }
    const isDir = node.type === 'dir'
    const isLink = node.type === 'symlink'
    const mtime = node.mtime ?? 1_700_000_000_000
    return {
      size: isDir ? 0 : (node.size ?? 0),
      isDirectory: () => isDir,
      isFile: () => node.type === 'file',
      isSymbolicLink: () => isLink,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isFIFO: () => false,
      isSocket: () => false,
      mtimeMs: mtime,
      birthtimeMs: mtime,
      atimeMs: mtime,
      ctimeMs: mtime,
      dev: 0,
      ino: 0,
      mode: 0,
      nlink: 1,
      uid: 0,
      gid: 0,
      rdev: 0,
      blksize: 4096,
      blocks: 0,
    } as Stats
  }

  async realpath(path: string): Promise<string> {
    const resolved = this.resolvePath(path)
    if (resolved === undefined) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    }
    return resolved
  }
}
