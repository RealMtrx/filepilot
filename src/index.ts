export { TaskQueue, mapWithConcurrency } from './core/concurrency'
export { analyzeEntries } from './core/analysis/analyzer'
export type {
  AnalysisOptions,
  CategoryStat,
  DiskAnalysis,
  FileStat,
  FolderStat,
} from './core/analysis/analyzer'
export { findDuplicates } from './core/duplicates/detector'
export type {
  DuplicateDetectionOptions,
  DuplicateFile,
  DuplicateGroup,
  DuplicateProgress,
  DuplicateResult,
} from './core/duplicates/detector'
export { hashBuffer, hashFileStream } from './core/duplicates/hashing'
export { scanDirectories } from './core/scanner/scanner'
export type {
  FileEntry,
  ScanErrorRecord,
  ScanOptions,
  ScanProgress,
  ScanResult,
} from './core/scanner/types'
export { IgnoreMatcher, parseIgnorePattern, type IgnoreRule } from './core/scanner/ignore'
export { nodeFileSystem, type DirEntry, type FileSystemAdapter } from './core/scanner/fs-adapter'
export {
  ConfigStore,
  DEFAULT_CONFIG,
  deepMerge,
  validateConfig,
  type FilePilotConfig,
  type ScanConfig,
  type DuplicatesConfig,
  type HistoryConfig,
  type OrganizeConfig,
  type ReportConfig,
} from './core/config/store'
export { configDir, dataDir, currentAppEnv, type AppEnv } from './core/config/dirs'
export {
  FilePilotError,
  PathValidationError,
  PermissionError,
  ConfigError,
  HistoryError,
  RuleError,
  OrganizeError,
  OrganizeConflictError,
  ScanError,
  ScanAbortedError,
  AbortedError,
  isFilePilotError,
  toErrorMessage,
  formatError,
  type FilePilotErrorOptions,
} from './core/errors'
export {
  isDotfileName,
  isAbsolutePath,
  isDriveRoot,
  isPathInside,
  isProtectedSystemPath,
  normalizePath,
  pathEnvFor,
  systemProtectedPaths,
  validatePathCharacters,
  type PathEnv,
  type Platform,
} from './core/paths'
export { getVersion } from './core/version'
export {
  classifyFileName,
  classifyWithMagic,
  categoryForExtension,
  categoryForMagic,
  extensionOf,
  sniffFileType,
  FILE_CATEGORIES,
  CATEGORY_INFO,
  isFileCategory,
  categoryLabel,
  categoryFolder,
  type Classification,
  type ClassificationMethod,
  type FileCategory,
  type CategoryInfo,
  type MagicType,
} from './core/classification/classifier'
export {
  formatBytes,
  formatDuration,
  formatList,
  formatNumber,
  formatPercent,
} from './utils/format'
