import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function makeTempDir(prefix = 'filepilot-test-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}

export async function removeTemp(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
}

export async function makeFile(
  root: string,
  relativePath: string,
  content: string | Buffer,
): Promise<string> {
  const fullPath = join(root, relativePath)
  await mkdir(join(root, ...relativePath.split(/[\\/]/).slice(0, -1)), { recursive: true })
  await writeFile(fullPath, content)
  return fullPath
}

export async function makeDir(root: string, relativePath: string): Promise<string> {
  const fullPath = join(root, relativePath)
  await mkdir(fullPath, { recursive: true })
  return fullPath
}

export function randomBytes(size: number): Buffer {
  const buf = Buffer.allocUnsafe(size)
  for (let i = 0; i < size; i += 1) {
    buf[i] = (i * 31 + 17) % 251
  }
  return buf
}
