import type { FileCategory } from './categories'
import {
  CODE_FILE_NAMES,
  DOCUMENT_FILE_NAMES,
  HIDDEN_CONFIG_FILES,
  JUNK_FILE_NAMES,
  categoryForExtension,
  extensionOf,
} from './extensions'
import { categoryForMagic, sniffFileType } from './magic'

export type ClassificationMethod = 'extension' | 'magic' | 'filename' | 'fallback'

export interface Classification {
  category: FileCategory
  method: ClassificationMethod
}

function classifyKnownFileName(name: string): Classification | null {
  const lower = name.toLowerCase()
  if (JUNK_FILE_NAMES.has(lower)) return { category: 'temporary', method: 'filename' }
  if (HIDDEN_CONFIG_FILES.has(lower)) return { category: 'code', method: 'filename' }
  if (CODE_FILE_NAMES.has(lower)) return { category: 'code', method: 'filename' }
  for (const docName of DOCUMENT_FILE_NAMES) {
    if (lower === docName || lower.startsWith(`${docName}.`)) {
      return { category: 'documents', method: 'filename' }
    }
  }
  return null
}

/**
 * Classifies a file purely by its name (extension and well-known names).
 * No filesystem access.
 */
export function classifyFileName(name: string): Classification {
  const known = classifyKnownFileName(name)
  if (known) return known

  const extension = extensionOf(name)
  if (extension !== null) {
    const category = categoryForExtension(extension)
    if (category !== null) return { category, method: 'extension' }
  }

  return { category: 'other', method: 'fallback' }
}

/**
 * Classifies a file by name, falling back to magic-byte detection when
 * the name alone is not conclusive. `head` should hold the first bytes
 * of the file (16 bytes are enough for the built-in signatures).
 */
export function classifyWithMagic(name: string, head: Uint8Array | null): Classification {
  const byName = classifyFileName(name)
  if (byName.method !== 'fallback' || head === null || head.length === 0) {
    return byName
  }
  const magic = sniffFileType(head)
  const category = magic === null ? null : categoryForMagic(magic)
  if (category !== null) return { category, method: 'magic' }
  return byName
}

export { extensionOf, categoryForExtension } from './extensions'
export { sniffFileType, categoryForMagic, type MagicType } from './magic'
export { FILE_CATEGORIES, CATEGORY_INFO, isFileCategory, categoryLabel, categoryFolder, type FileCategory, type CategoryInfo } from './categories'
