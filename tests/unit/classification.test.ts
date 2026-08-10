import { describe, expect, it } from 'vitest'

import { FILE_CATEGORIES } from '../../src/core/classification/categories'
import {
  classifyFileName,
  classifyWithMagic,
  extensionOf,
} from '../../src/core/classification/classifier'
import { sniffFileType } from '../../src/core/classification/magic'

function head(bytes: number[]): Uint8Array {
  return new Uint8Array(bytes)
}

function asciiHead(text: string): Uint8Array {
  return new Uint8Array(Array.from(text, (ch) => ch.charCodeAt(0)))
}

describe('category taxonomy', () => {
  it('defines the expected 13 categories', () => {
    expect(FILE_CATEGORIES).toEqual([
      'images',
      'videos',
      'audio',
      'documents',
      'archives',
      'installers',
      'code',
      'projects',
      'fonts',
      'databases',
      'backups',
      'temporary',
      'other',
    ])
  })
})

describe('extensionOf', () => {
  it('extracts the lowercase extension', () => {
    expect(extensionOf('photo.JPG')).toBe('jpg')
    expect(extensionOf('archive.tar.gz')).toBe('gz')
    expect(extensionOf('file.Name.txt')).toBe('txt')
  })

  it('returns null without an extension', () => {
    expect(extensionOf('README')).toBeNull()
    expect(extensionOf('noext.')).toBeNull()
    expect(extensionOf('.env')).toBeNull()
    expect(extensionOf('')).toBeNull()
  })
})

describe('classifyFileName', () => {
  it('classifies images', () => {
    expect(classifyFileName('pic.jpg')).toMatchObject({ category: 'images', method: 'extension' })
    expect(classifyFileName('pic.JPEG')).toMatchObject({ category: 'images' })
    expect(classifyFileName('icon.svg')).toMatchObject({ category: 'images' })
    expect(classifyFileName('raw.dng')).toMatchObject({ category: 'images' })
  })

  it('classifies videos', () => {
    expect(classifyFileName('clip.mp4')).toMatchObject({ category: 'videos' })
    expect(classifyFileName('movie.mkv')).toMatchObject({ category: 'videos' })
    expect(classifyFileName('show.mov')).toMatchObject({ category: 'videos' })
  })

  it('classifies audio', () => {
    expect(classifyFileName('song.mp3')).toMatchObject({ category: 'audio' })
    expect(classifyFileName('track.flac')).toMatchObject({ category: 'audio' })
    expect(classifyFileName('podcast.m4a')).toMatchObject({ category: 'audio' })
  })

  it('classifies documents', () => {
    expect(classifyFileName('invoice.pdf')).toMatchObject({ category: 'documents' })
    expect(classifyFileName('report.docx')).toMatchObject({ category: 'documents' })
    expect(classifyFileName('sheet.xlsx')).toMatchObject({ category: 'documents' })
    expect(classifyFileName('notes.md')).toMatchObject({ category: 'documents' })
    expect(classifyFileName('book.epub')).toMatchObject({ category: 'documents' })
  })

  it('classifies archives', () => {
    expect(classifyFileName('bundle.zip')).toMatchObject({ category: 'archives' })
    expect(classifyFileName('backup.tar.gz')).toMatchObject({ category: 'archives' })
    expect(classifyFileName('disk.iso')).toMatchObject({ category: 'archives' })
    expect(classifyFileName('app.7z')).toMatchObject({ category: 'archives' })
  })

  it('classifies installers', () => {
    expect(classifyFileName('setup.exe')).toMatchObject({ category: 'installers' })
    expect(classifyFileName('app.msi')).toMatchObject({ category: 'installers' })
    expect(classifyFileName('pkg.deb')).toMatchObject({ category: 'installers' })
    expect(classifyFileName('app.apk')).toMatchObject({ category: 'installers' })
    expect(classifyFileName('App.dmg')).toMatchObject({ category: 'installers' })
  })

  it('classifies code', () => {
    expect(classifyFileName('main.ts')).toMatchObject({ category: 'code' })
    expect(classifyFileName('app.py')).toMatchObject({ category: 'code' })
    expect(classifyFileName('style.css')).toMatchObject({ category: 'code' })
    expect(classifyFileName('config.yaml')).toMatchObject({ category: 'code' })
    expect(classifyFileName('script.sh')).toMatchObject({ category: 'code' })
  })

  it('classifies projects', () => {
    expect(classifyFileName('App.sln')).toMatchObject({ category: 'projects' })
    expect(classifyFileName('Game.xcodeproj')).toMatchObject({ category: 'projects' })
    expect(classifyFileName('Project.uproject')).toMatchObject({ category: 'projects' })
  })

  it('classifies fonts', () => {
    expect(classifyFileName('Inter.ttf')).toMatchObject({ category: 'fonts' })
    expect(classifyFileName('JetBrainsMono.otf')).toMatchObject({ category: 'fonts' })
    expect(classifyFileName('font.woff2')).toMatchObject({ category: 'fonts' })
  })

  it('classifies databases', () => {
    expect(classifyFileName('data.db')).toMatchObject({ category: 'databases' })
    expect(classifyFileName('users.sqlite3')).toMatchObject({ category: 'databases' })
    expect(classifyFileName('catalog.mdb')).toMatchObject({ category: 'databases' })
  })

  it('classifies backups', () => {
    expect(classifyFileName('report.bak')).toMatchObject({ category: 'backups' })
    expect(classifyFileName('site.backup')).toMatchObject({ category: 'backups' })
    expect(classifyFileName('old version.old')).toMatchObject({ category: 'backups' })
  })

  it('classifies temporary files', () => {
    expect(classifyFileName('partial.tmp')).toMatchObject({ category: 'temporary' })
    expect(classifyFileName('download.part')).toMatchObject({ category: 'temporary' })
    expect(classifyFileName('file.crdownload')).toMatchObject({ category: 'temporary' })
    expect(classifyFileName('output.log')).toMatchObject({ category: 'temporary' })
  })

  it('classifies junk files by name', () => {
    expect(classifyFileName('desktop.ini')).toMatchObject({ category: 'temporary', method: 'filename' })
    expect(classifyFileName('Thumbs.db')).toMatchObject({ category: 'temporary', method: 'filename' })
    expect(classifyFileName('.DS_Store')).toMatchObject({ category: 'temporary', method: 'filename' })
  })

  it('classifies hidden config files as code', () => {
    expect(classifyFileName('.gitignore')).toMatchObject({ category: 'code', method: 'filename' })
    expect(classifyFileName('.env')).toMatchObject({ category: 'code', method: 'filename' })
    expect(classifyFileName('.prettierrc.json')).toMatchObject({ category: 'code', method: 'filename' })
  })

  it('classifies extension-less well-known names', () => {
    expect(classifyFileName('Dockerfile')).toMatchObject({ category: 'code', method: 'filename' })
    expect(classifyFileName('Makefile')).toMatchObject({ category: 'code', method: 'filename' })
    expect(classifyFileName('README')).toMatchObject({ category: 'documents', method: 'filename' })
    expect(classifyFileName('README.md')).toMatchObject({ category: 'documents', method: 'filename' })
    expect(classifyFileName('LICENSE')).toMatchObject({ category: 'documents', method: 'filename' })
  })

  it('falls back to other', () => {
    expect(classifyFileName('mystery.xyzabc')).toMatchObject({ category: 'other', method: 'fallback' })
    expect(classifyFileName('noext')).toMatchObject({ category: 'other', method: 'fallback' })
  })
})

describe('sniffFileType', () => {
  it('detects images', () => {
    expect(sniffFileType(head([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png')
    expect(sniffFileType(head([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg')
    expect(sniffFileType(asciiHead('GIF89a'))).toBe('gif')
    expect(sniffFileType(asciiHead('RIFF\x00\x00\x00\x00WEBP'))).toBe('webp')
    expect(sniffFileType(asciiHead('BM\x36\x00'))).toBe('bmp')
  })

  it('detects documents', () => {
    expect(sniffFileType(asciiHead('%PDF-1.7'))).toBe('pdf')
    expect(sniffFileType(asciiHead('{\\rtf1\\ansi'))).toBe('rtf')
  })

  it('detects archives', () => {
    expect(sniffFileType(head([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBe('zip')
    expect(sniffFileType(head([0x1f, 0x8b, 0x08, 0x00]))).toBe('gzip')
    expect(sniffFileType(head([0x42, 0x5a, 0x68, 0x39]))).toBe('bzip2')
    expect(sniffFileType(head([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]))).toBe('xz')
    expect(sniffFileType(head([0x28, 0xb5, 0x2f, 0xfd]))).toBe('zstd')
    expect(sniffFileType(head([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]))).toBe('rar')
    expect(sniffFileType(head([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))).toBe('7z')
  })

  it('detects audio and video', () => {
    expect(sniffFileType(asciiHead('ID3\x04\x00'))).toBe('mp3')
    expect(sniffFileType(asciiHead('OggS\x00\x02'))).toBe('ogg')
    expect(sniffFileType(asciiHead('fLaC\x00'))).toBe('flac')
    expect(sniffFileType(asciiHead('RIFF\x00\x00\x00\x00WAVE'))).toBe('wav')
    expect(sniffFileType(asciiHead('\x00\x00\x00\x20ftypisom'))).toBe('mp4')
    expect(sniffFileType(asciiHead('\x00\x00\x00\x20ftypqt  '))).toBe('mov')
    expect(sniffFileType(asciiHead('RIFF\x00\x00\x00\x00AVI '))).toBe('avi')
    expect(sniffFileType(head([0x1a, 0x45, 0xdf, 0xa3]))).toBe('mkv')
  })

  it('detects binaries', () => {
    expect(sniffFileType(asciiHead('SQLite format 3\x00'))).toBe('sqlite')
    expect(sniffFileType(head([0x7f, 0x45, 0x4c, 0x46, 0x02]))).toBe('elf')
    expect(sniffFileType(head([0xfe, 0xed, 0xfa, 0xce]))).toBe('macho')
    expect(sniffFileType(head([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00, 0xb8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x50, 0x45, 0x00, 0x00]))).toBe('pe')
    expect(sniffFileType(head([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x33]))).toBe('java-class')
    expect(sniffFileType(head([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00]))).toBe('wasm')
  })

  it('detects fonts and packages', () => {
    expect(sniffFileType(head([0x00, 0x01, 0x00, 0x00]))).toBe('ttf')
    expect(sniffFileType(asciiHead('OTTO'))).toBe('otf')
    expect(sniffFileType(asciiHead('wOFF'))).toBe('woff')
    expect(sniffFileType(asciiHead('!<arch>\ndebian-binary'))).toBe('deb')
    expect(sniffFileType(head([0xed, 0xab, 0xee, 0xdb]))).toBe('rpm')
  })

  it('detects text formats after whitespace', () => {
    expect(sniffFileType(asciiHead('  <?xml version="1.0"?>'))).toBe('xml')
    expect(sniffFileType(asciiHead('\n{"key": 1}'))).toBe('json')
    expect(sniffFileType(asciiHead('<!DOCTYPE html>'))).toBe('xml')
    expect(sniffFileType(asciiHead('\t<html>'))).toBe('html')
    expect(sniffFileType(asciiHead('<svg xmlns="x">'))).toBe('svg')
  })

  it('returns null for unknown content', () => {
    expect(sniffFileType(asciiHead('random data here'))).toBeNull()
    expect(sniffFileType(head([0x00, 0x00]))).toBeNull()
    expect(sniffFileType(new Uint8Array(0))).toBeNull()
  })
})

describe('classifyWithMagic', () => {
  it('prefers extension over magic', () => {
    const result = classifyWithMagic('photo.png', head([0xff, 0xd8, 0xff]))
    expect(result).toEqual({ category: 'images', method: 'extension' })
  })

  it('uses magic for unknown extensions', () => {
    const result = classifyWithMagic('data.xyz', head([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    expect(result).toEqual({ category: 'images', method: 'magic' })
  })

  it('uses magic for extension-less files', () => {
    const result = classifyWithMagic('archive', head([0x50, 0x4b, 0x03, 0x04, 0x00]))
    expect(result).toEqual({ category: 'archives', method: 'magic' })
  })

  it('falls back to other when nothing matches', () => {
    const result = classifyWithMagic('mystery', head([0x01, 0x02, 0x03, 0x04]))
    expect(result).toEqual({ category: 'other', method: 'fallback' })
  })

  it('returns name classification without head bytes', () => {
    expect(classifyWithMagic('doc.pdf', null)).toEqual({ category: 'documents', method: 'extension' })
    expect(classifyWithMagic('mystery', null)).toEqual({ category: 'other', method: 'fallback' })
  })
})
