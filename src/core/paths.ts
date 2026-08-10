import * as nodePath from 'node:path'

import { PathValidationError } from './errors'

export type Platform = NodeJS.Platform

export interface PathEnv {
  readonly name: Platform
  readonly sep: string
  readonly caseInsensitive: boolean
  readonly path: typeof nodePath.posix | typeof nodePath.win32
}

export function pathEnvFor(platform: Platform = process.platform): PathEnv {
  if (platform === 'win32') {
    return { name: platform, sep: '\\', caseInsensitive: true, path: nodePath.win32 }
  }
  return { name: platform, sep: '/', caseInsensitive: false, path: nodePath.posix }
}

export function normalizePath(input: string, platform: Platform = process.platform): string {
  const env = pathEnvFor(platform)
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    throw new PathValidationError('Path must not be empty')
  }
  return env.path.resolve(trimmed)
}

export function isAbsolutePath(input: string, platform: Platform = process.platform): boolean {
  return pathEnvFor(platform).path.isAbsolute(input)
}

export function isDriveRoot(input: string, platform: Platform = process.platform): boolean {
  const env = pathEnvFor(platform)
  if (env.name === 'win32') {
    const normalized = env.path.normalize(input)
    if (/^[a-zA-Z]:[\\/]*\.?$/.test(normalized)) return true
    return normalized === '\\' || normalized === '/'
  }
  return env.path.normalize(input) === '/'
}

/**
 * Returns true when `child` equals `parent` or lives strictly inside it.
 * Comparison is case-insensitive on platforms where the filesystem
 * typically is (Windows).
 */
export function isPathInside(
  parent: string,
  child: string,
  platform: Platform = process.platform,
): boolean {
  const env = pathEnvFor(platform)
  const p = env.path.normalize(parent)
  const c = env.path.normalize(child)
  const compare = (value: string): string => (env.caseInsensitive ? value.toLowerCase() : value)
  const pc = compare(p)
  const cc = compare(c)
  if (cc === pc) return true
  const rel = env.path.relative(pc, cc)
  return rel !== '' && !rel.startsWith('..') && !env.path.isAbsolute(rel)
}

const WINDOWS_INVALID_CHARS = /[<>"|?*\u0000-\u001F]/
const NULL_OR_CONTROL = /[\u0000-\u001F]/

export function validatePathCharacters(
  input: string,
  platform: Platform = process.platform,
): string {
  if (NULL_OR_CONTROL.test(input)) {
    throw new PathValidationError('Path must not contain control or null characters')
  }
  if (pathEnvFor(platform).name === 'win32') {
    const bad = input.match(WINDOWS_INVALID_CHARS)
    if (bad) {
      throw new PathValidationError(
        `Path contains characters not allowed on Windows: "${bad[0]}" (allowed are letters, digits, spaces and .-_()[]{}~@#$^&+;=,)'`,
      )
    }
  }
  return input
}

export function isDotfileName(name: string): boolean {
  return name.startsWith('.') && name !== '.' && name !== '..'
}

export interface SystemPathEnv {
  SystemRoot?: string
  ProgramFiles?: string
  'ProgramFiles(x86)'?: string
  ProgramData?: string
}

export function systemProtectedPaths(
  platform: Platform = process.platform,
  env: SystemPathEnv = process.env,
): string[] {
  const p = pathEnvFor(platform).path
  if (platform === 'win32') {
    const systemRoot = p.normalize(env.SystemRoot ?? 'C:\\Windows')
    const programFiles = p.normalize(env.ProgramFiles ?? 'C:\\Program Files')
    const programFilesX86 = p.normalize(env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)')
    const programData = p.normalize(env.ProgramData ?? 'C:\\ProgramData')
    const systemDrive = p.parse(systemRoot).root
    return [
      systemRoot,
      programFiles,
      programFilesX86,
      programData,
      p.join(systemDrive, 'System Volume Information'),
      p.join(systemDrive, '$Recycle.Bin'),
      p.join(systemDrive, 'Recovery'),
    ]
  }
  if (platform === 'darwin') {
    return [
      '/System',
      '/Applications',
      '/Library',
      '/private',
      '/usr',
      '/bin',
      '/sbin',
      '/etc',
      '/var',
      '/dev',
      '/cores',
    ].map(p.normalize)
  }
  return [
    '/etc',
    '/usr',
    '/bin',
    '/sbin',
    '/lib',
    '/lib64',
    '/boot',
    '/proc',
    '/sys',
    '/dev',
    '/run',
    '/var',
    '/snap',
  ].map(p.normalize)
}

/**
 * Returns true when the given path is inside (or equals) a system
 * directory that must never be used as an organization target.
 * Scanning such directories is still allowed (with a warning).
 */
export function isProtectedSystemPath(
  input: string,
  platform: Platform = process.platform,
  env: SystemPathEnv = process.env,
): boolean {
  const target = normalizePath(input, platform)
  return systemProtectedPaths(platform, env).some((protectedPath) =>
    isPathInside(protectedPath, target, platform),
  )
}
