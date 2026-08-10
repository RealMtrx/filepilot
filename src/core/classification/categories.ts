export const FILE_CATEGORIES = [
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
] as const

export type FileCategory = (typeof FILE_CATEGORIES)[number]

export interface CategoryInfo {
  id: FileCategory
  label: string
  description: string
  /** Default folder name used by the organizer. */
  defaultFolder: string
}

export const CATEGORY_INFO: Record<FileCategory, CategoryInfo> = {
  images: {
    id: 'images',
    label: 'Images',
    description: 'Photos, graphics and image assets',
    defaultFolder: 'Images',
  },
  videos: {
    id: 'videos',
    label: 'Videos',
    description: 'Video files and clips',
    defaultFolder: 'Videos',
  },
  audio: {
    id: 'audio',
    label: 'Audio',
    description: 'Music, podcasts and recordings',
    defaultFolder: 'Audio',
  },
  documents: {
    id: 'documents',
    label: 'Documents',
    description: 'Text, office and reading documents',
    defaultFolder: 'Documents',
  },
  archives: {
    id: 'archives',
    label: 'Archives',
    description: 'Compressed and packaged files',
    defaultFolder: 'Archives',
  },
  installers: {
    id: 'installers',
    label: 'Installers',
    description: 'Application installers and packages',
    defaultFolder: 'Installers',
  },
  code: {
    id: 'code',
    label: 'Code',
    description: 'Source code and configuration files',
    defaultFolder: 'Code',
  },
  projects: {
    id: 'projects',
    label: 'Projects',
    description: 'Project and workspace definition files',
    defaultFolder: 'Projects',
  },
  fonts: {
    id: 'fonts',
    label: 'Fonts',
    description: 'Font files',
    defaultFolder: 'Fonts',
  },
  databases: {
    id: 'databases',
    label: 'Databases',
    description: 'Database and data-store files',
    defaultFolder: 'Databases',
  },
  backups: {
    id: 'backups',
    label: 'Backups',
    description: 'Backup and versioned copies',
    defaultFolder: 'Backups',
  },
  temporary: {
    id: 'temporary',
    label: 'Temporary',
    description: 'Temp, cache and partial files',
    defaultFolder: 'Temporary',
  },
  other: {
    id: 'other',
    label: 'Other',
    description: 'Files that do not fit any category',
    defaultFolder: 'Other',
  },
}

export function getCategoryInfo(category: FileCategory): CategoryInfo {
  return CATEGORY_INFO[category]
}

export function isFileCategory(value: unknown): value is FileCategory {
  return typeof value === 'string' && (FILE_CATEGORIES as readonly string[]).includes(value)
}

export function categoryLabel(category: FileCategory): string {
  return CATEGORY_INFO[category].label
}

export function categoryFolder(category: FileCategory): string {
  return CATEGORY_INFO[category].defaultFolder
}
