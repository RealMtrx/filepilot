import type { FileCategory } from './categories'

export type MagicType =
  | 'png'
  | 'jpeg'
  | 'gif'
  | 'webp'
  | 'bmp'
  | 'tiff'
  | 'avif'
  | 'pdf'
  | 'zip'
  | 'gzip'
  | 'bzip2'
  | 'xz'
  | 'zstd'
  | 'rar'
  | '7z'
  | 'mp3'
  | 'ogg'
  | 'flac'
  | 'wav'
  | 'aiff'
  | 'mp4'
  | 'mkv'
  | 'avi'
  | 'mov'
  | 'sqlite'
  | 'elf'
  | 'macho'
  | 'pe'
  | 'java-class'
  | 'ttf'
  | 'otf'
  | 'woff'
  | 'wasm'
  | 'xml'
  | 'json'
  | 'html'
  | 'svg'
  | 'rtf'
  | 'deb'
  | 'rpm'

export const MAGIC_CATEGORY_MAP: Record<MagicType, FileCategory> = {
  png: 'images',
  jpeg: 'images',
  gif: 'images',
  webp: 'images',
  bmp: 'images',
  tiff: 'images',
  avif: 'images',
  svg: 'images',
  pdf: 'documents',
  zip: 'archives',
  gzip: 'archives',
  bzip2: 'archives',
  xz: 'archives',
  zstd: 'archives',
  rar: 'archives',
  '7z': 'archives',
  mp3: 'audio',
  ogg: 'audio',
  flac: 'audio',
  wav: 'audio',
  aiff: 'audio',
  mp4: 'videos',
  mkv: 'videos',
  avi: 'videos',
  mov: 'videos',
  sqlite: 'databases',
  elf: 'code',
  macho: 'code',
  pe: 'code',
  'java-class': 'code',
  ttf: 'fonts',
  otf: 'fonts',
  woff: 'fonts',
  wasm: 'code',
  xml: 'code',
  json: 'code',
  html: 'code',
  rtf: 'documents',
  deb: 'installers',
  rpm: 'installers',
}

function startsWith(head: Uint8Array, offset: number, bytes: number[]): boolean {
  if (offset + bytes.length > head.length) return false
  for (let i = 0; i < bytes.length; i += 1) {
    if (head[offset + i] !== bytes[i]) return false
  }
  return true
}

function ascii(head: Uint8Array, offset: number, text: string): boolean {
  return startsWith(
    head,
    offset,
    Array.from(text, (ch) => ch.charCodeAt(0)),
  )
}

function skipWhitespace(head: Uint8Array, offset: number): number {
  let i = offset
  while (i < head.length) {
    const byte = head[i]
    if (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d) {
      i += 1
    } else {
      break
    }
  }
  return i
}

/**
 * Detects common file formats from their leading magic bytes.
 * Returns null when the header does not match anything known.
 */
export function sniffFileType(head: Uint8Array): MagicType | null {
  if (head.length < 4) return null

  if (startsWith(head, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (startsWith(head, 0, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (ascii(head, 0, 'GIF8')) return 'gif'
  if (ascii(head, 0, '%PDF-')) return 'pdf'

  if (ascii(head, 0, 'RIFF')) {
    if (ascii(head, 8, 'WAVE')) return 'wav'
    if (ascii(head, 8, 'AVI ')) return 'avi'
    if (ascii(head, 8, 'WEBP')) return 'webp'
  }
  if (ascii(head, 8, 'AVIF')) return 'avif'
  if (ascii(head, 0, 'BM') && head[2] !== undefined && head[2] > 0) return 'bmp'
  if (startsWith(head, 0, [0x49, 0x49, 0x2a, 0x00]) || startsWith(head, 0, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff'

  if (startsWith(head, 0, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, 0, [0x50, 0x4b, 0x05, 0x06])) return 'zip'
  if (startsWith(head, 0, [0x1f, 0x8b])) return 'gzip'
  if (startsWith(head, 0, [0x42, 0x5a, 0x68])) return 'bzip2'
  if (startsWith(head, 0, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])) return 'xz'
  if (startsWith(head, 0, [0x28, 0xb5, 0x2f, 0xfd])) return 'zstd'
  if (startsWith(head, 0, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) return 'rar'
  if (startsWith(head, 0, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return '7z'

  if (startsWith(head, 0, [0x49, 0x44, 0x33]) || startsWith(head, 0, [0xff, 0xfb]) || startsWith(head, 0, [0xff, 0xf3]) || startsWith(head, 0, [0xff, 0xf2])) return 'mp3'
  if (ascii(head, 0, 'OggS')) return 'ogg'
  if (ascii(head, 0, 'fLaC')) return 'flac'
  if (ascii(head, 0, 'FORM') && ascii(head, 8, 'AIFF')) return 'aiff'

  if (ascii(head, 4, 'ftyp')) {
    if (ascii(head, 8, 'qt  ')) return 'mov'
    return 'mp4'
  }
  if (startsWith(head, 0, [0x1a, 0x45, 0xdf, 0xa3])) return 'mkv'

  if (ascii(head, 0, 'SQLite format 3')) return 'sqlite'

  if (startsWith(head, 0, [0x7f, 0x45, 0x4c, 0x46])) return 'elf'
  if (startsWith(head, 0, [0xfe, 0xed, 0xfa, 0xce]) || startsWith(head, 0, [0xfe, 0xed, 0xfa, 0xcf]) || startsWith(head, 0, [0xce, 0xfa, 0xed, 0xfe]) || startsWith(head, 0, [0xcf, 0xfa, 0xed, 0xfe]) || startsWith(head, 0, [0xbe, 0xba, 0xfe, 0xca])) return 'macho'
  if (startsWith(head, 0, [0x4d, 0x5a]) && ascii(head, 0x40, 'PE')) return 'pe'
  if (startsWith(head, 0, [0xca, 0xfe, 0xba, 0xbe])) return 'java-class'
  if (startsWith(head, 0, [0x00, 0x61, 0x73, 0x6d])) return 'wasm'

  if (startsWith(head, 0, [0x00, 0x01, 0x00, 0x00])) return 'ttf'
  if (ascii(head, 0, 'OTTO')) return 'otf'
  if (ascii(head, 0, 'wOFF')) return 'woff'

  if (startsWith(head, 0, [0x21, 0x3c, 0x61, 0x72, 0x63, 0x68])) return 'deb'
  if (startsWith(head, 0, [0xed, 0xab, 0xee, 0xdb])) return 'rpm'

  const textStart = skipWhitespace(head, 0)
  if (ascii(head, textStart, '<?xml') || ascii(head, textStart, '<!DOCTYPE')) return 'xml'
  if (ascii(head, textStart, '<svg')) return 'svg'
  if (ascii(head, textStart, '<html') || ascii(head, textStart, '<!doctype')) return 'html'
  if (ascii(head, textStart, '{\\rtf')) return 'rtf'
  const open = head[textStart]
  if (open === 0x7b || open === 0x5b) return 'json'

  return null
}

export function categoryForMagic(type: MagicType): FileCategory | null {
  return MAGIC_CATEGORY_MAP[type] ?? null
}
