export type ScriptStatus = 'draft' | 'review' | 'returned' | 'approved'
export type DeviceKind = 'desktop' | 'tablet' | 'mobile' | 'kiosk'
export type ScreenKind = 'kiosk' | 'wall' | 'tablet' | 'mobile' | 'projection'
export type OfflineRevisionStatus = 'pending' | 'merged' | 'kept'
export type ReconcileType = 'never-synced' | 'outdated' | 'content-changed' | 'no-screen' | 'not-approved'
export type ReconcileSeverity = 'error' | 'warning' | 'info'

export interface Hall {
  id: string
  name: string
  description: string
}

export interface Segment {
  id: string
  label: string
  content: string
  locked: boolean
}

export interface LanguageDraft {
  id: string
  languageId: string
  title: string
  narration: string
  accessibility: string
  durationMinutes: number
  sources: string
  status: ScriptStatus
  segments: Segment[]
  updatedAt: string
  onlineSnapshotId?: string
  publishedAt?: string
}

export interface Exhibit {
  id: string
  hallId: string
  code: string
  title: string
  order: number
  drafts: LanguageDraft[]
  screenIds: string[]
}

export interface Screen {
  id: string
  hallId: string
  name: string
  location: string
  kind: ScreenKind
  online: boolean
  lastPackageId?: string
  lastSyncedAt?: string
}

export interface PackageItem {
  exhibitId: string
  languageId: string
  snapshotId: string
  snapshotName: string
  exhibitCode: string
  exhibitTitle: string
  title: string
  narration: string
  status: ScriptStatus
}

export interface ReleasePackage {
  id: string
  hallId: string
  packageNo: number
  name: string
  createdAt: string
  note: string
  items: PackageItem[]
  excluded: Array<{ exhibitId: string; exhibitCode: string; languageId: string; reason: string }>
  screenIds: string[]
  deployedAt?: string
}

export interface OfflineRevision {
  id: string
  exhibitId: string
  languageId: string
  docentName: string
  notedAt: string
  importedAt: string
  note: string
  narration: string
  segments: Array<{ label: string; content: string }>
  status: OfflineRevisionStatus
  mergedAt?: string
  mergeNote?: string
}

export interface ReconcileItem {
  exhibitId: string
  exhibitCode: string
  exhibitTitle: string
  screenId?: string
  screenName?: string
  languageId?: string
  languageLabel?: string
  type: ReconcileType
  severity: ReconcileSeverity
  message: string
}

export interface Language {
  id: string
  code: string
  label: string
  shortLabel: string
}

export interface VersionSnapshot {
  id: string
  exhibitId: string
  languageId: string
  name: string
  createdAt: string
  draft: LanguageDraft
}

export interface PersistedState {
  halls: Hall[]
  exhibits: Exhibit[]
  versions: VersionSnapshot[]
  screens: Screen[]
  packages: ReleasePackage[]
  offlineRevisions: OfflineRevision[]
  selectedHallId: string
  selectedExhibitId: string
  selectedLanguageId: string
  lastSavedAt: string
}

export interface DiffLine {
  type: 'same' | 'add' | 'remove'
  text: string
}
