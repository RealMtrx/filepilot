import {
  isAbsolutePath,
  isPathInside,
  isProtectedSystemPath,
  normalizePath,
  validatePathCharacters,
} from '../paths'
import { OrganizeError } from '../errors'

/**
 * Destination root for an organization plan, already normalized and
 * validated for safety.
 */
export interface ValidatedDestinationRoot {
  value: string
}

/** Returns a problem description when a source path is unusable, else null. */
export function validateSourcePath(path: string): string | null {
  if (!isAbsolutePath(path)) return 'source path is not absolute'
  try {
    validatePathCharacters(path)
  } catch {
    return 'source path contains invalid characters'
  }
  return null
}

export function isProtectedPath(path: string): boolean {
  return isProtectedSystemPath(path)
}

/**
 * Normalizes and validates a destination root. Throws OrganizeError on
 * any invalid or unsafe destination, so a plan can never be built
 * against an unusable root.
 */
export function validateDestinationRoot(
  destinationRoot: string,
): ValidatedDestinationRoot {
  if (!isAbsolutePath(destinationRoot)) {
    throw new OrganizeError(`Destination root must be an absolute path: "${destinationRoot}"`)
  }
  let normalized: string
  try {
    validatePathCharacters(destinationRoot)
    normalized = normalizePath(destinationRoot)
  } catch (err) {
    throw new OrganizeError(
      `Destination root contains invalid characters: "${destinationRoot}"`,
      { cause: err },
    )
  }
  if (isProtectedSystemPath(normalized)) {
    throw new OrganizeError(
      `Destination root is a protected system path and cannot be used: "${normalized}"`,
    )
  }
  return { value: normalized }
}

/**
 * Folder names in a plan must be plain names: no path separators, no
 * '.'/'..' escapes, no invalid characters. Returns null when valid.
 */
export function validateFolderName(folder: string): string | null {
  if (folder === '' || folder === '.' || folder === '..') {
    return 'folder name must not be empty, "." or ".."'
  }
  if (folder.includes('/') || folder.includes('\\')) {
    return `folder name must not contain path separators: "${folder}"`
  }
  try {
    validatePathCharacters(folder)
  } catch {
    return `folder name contains invalid characters: "${folder}"`
  }
  return null
}

export function isDestinationInside(destination: string, root: string): boolean {
  return isPathInside(root, destination)
}
