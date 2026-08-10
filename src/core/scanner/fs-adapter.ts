import { promises as nodeFs } from 'node:fs'
import type { Stats } from 'node:fs'

export interface DirEntry {
  readonly name: string
  isDirectory(): boolean
  isFile(): boolean
  isSymbolicLink(): boolean
}

/**
 * Minimal filesystem surface used by the scanner. Everything else in the
 * engine goes through Node's `fs/promises` directly; this seam exists so
 * the walker can be tested with in-memory fixtures and simulated
 * permission failures on any platform.
 */
export interface FileSystemAdapter {
  readdir(path: string): Promise<DirEntry[]>
  stat(path: string): Promise<Stats>
  realpath(path: string): Promise<string>
}

export const nodeFileSystem: FileSystemAdapter = {
  async readdir(path: string): Promise<DirEntry[]> {
    return nodeFs.readdir(path, { withFileTypes: true })
  },
  async stat(path: string): Promise<Stats> {
    return nodeFs.stat(path)
  },
  async realpath(path: string): Promise<string> {
    return nodeFs.realpath(path)
  },
}
