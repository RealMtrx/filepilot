import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

export const DEFAULT_HASH_ALGORITHM = 'sha256'
export const DEFAULT_FAST_HASH_BYTES = 16 * 1024

export function hashBuffer(data: Buffer | Uint8Array, algorithm = DEFAULT_HASH_ALGORITHM): string {
  return createHash(algorithm).update(data).digest('hex')
}

/**
 * Streams a file through a hash function without ever loading it into
 * memory, so files of any size can be hashed with constant memory use.
 *
 * When `bytes` is provided, only the leading part of the file is
 * hashed (used for the cheap pre-filter stage of duplicate detection).
 */
export function hashFileStream(
  filePath: string,
  options: { algorithm?: string; bytes?: number } = {},
): Promise<string> {
  const { algorithm = DEFAULT_HASH_ALGORITHM, bytes } = options
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm)
    const stream = createReadStream(filePath, bytes !== undefined ? { start: 0, end: bytes - 1 } : {})
    stream.on('error', (err) => reject(err))
    stream.on('data', (chunk: string | Buffer) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export function fastHashOfFile(filePath: string, bytes = DEFAULT_FAST_HASH_BYTES): Promise<string> {
  return hashFileStream(filePath, { bytes })
}

export function fullHashOfFile(filePath: string, algorithm = DEFAULT_HASH_ALGORITHM): Promise<string> {
  return hashFileStream(filePath, { algorithm })
}
