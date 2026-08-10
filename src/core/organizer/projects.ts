import { dirname } from 'node:path'

import type { FileEntry } from '../scanner/types'

/**
 * Strong project marker files. When a scanned directory contains one of
 * these, the whole directory is treated as a software project and its
 * files are kept together (the organizer never splits projects).
 *
 * Deliberately conservative: only files that are unambiguous project
 * markers qualify, to avoid false positives in regular downloads.
 */
const PROJECT_MARKER_FILES = new Set([
  'package.json',
  'tsconfig.json',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'pyproject.toml',
  'setup.py',
  'composer.json',
  'Gemfile',
  'mix.exs',
  'project.clj',
  'stack.yaml',
  'pubspec.yaml',
  '.project',
  'CMakeLists.txt',
])

/** A directory is a project root when it directly contains a marker file. */
export function detectProjectRoots(entries: readonly FileEntry[]): string[] {
  const roots = new Set<string>()
  for (const entry of entries) {
    if (PROJECT_MARKER_FILES.has(entry.name)) {
      roots.add(entry.parent)
    }
  }
  return [...roots]
}

export const isProjectMarkerFile = (name: string): boolean => PROJECT_MARKER_FILES.has(name)

/**
 * Whether a file path lives inside one of the given project roots.
 * Walks the ancestor chain (bounded) without touching the filesystem.
 */
export function isInsideProjectRoots(
  path: string,
  projectRoots: Set<string>,
  maxDepth = 32,
): boolean {
  let cursor = dirname(path)
  let depth = 0
  while (depth < maxDepth) {
    if (projectRoots.has(cursor)) return true
    const parent = dirname(cursor)
    if (parent === cursor) break
    cursor = parent
    depth += 1
  }
  return false
}
