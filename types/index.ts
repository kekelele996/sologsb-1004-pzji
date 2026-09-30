export type ScriptStatus = 'draft' | 'review' | 'returned' | 'approved'
export type DeviceKind = 'desktop' | 'tablet' | 'mobile' | 'kiosk'

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
}

export interface Exhibit {
  id: string
  hallId: string
  code: string
  title: string
  order: number
  drafts: LanguageDraft[]
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

export type SyncState = 'synced' | 'screen-behind' | 'needs-reconfirm' | 'never-deployed'

export interface Screen {
  id: string
  hallId: string
  code: string
  name: string
  online: boolean
}

export interface PublishTarget {
  exhibitId: string
  screenIds: string[]
  onlineVersionId: string
  confirmedHash: string
  confirmedAt: string
}

export interface ReleasePackageItem {
  exhibitId: string
  title: string
  versionId: string
  hash: string
}

export interface ReleasePackage {
  id: string
  hallId: string
  name: string
  createdAt: string
  deployedAt: string
  items: ReleasePackageItem[]
}

export interface ScreenCache {
  screenId: string
  exhibitId: string
  versionId: string
  hash: string
  syncedAt: string
}

export interface OfflineRevision {
  id: string
  exhibitId: string
  languageId: string
  author: string
  device: string
  note: string
  createdAt: string
  importedAt: string
  baseUpdatedAt: string
  narration: string
  segments: Segment[]
  status: 'pending' | 'merged'
  mergedAt: string
  mergeLog: string[]
}

export interface ReconRow {
  exhibitId: string
  exhibitCode: string
  exhibitTitle: string
  hallId: string
  screenId: string
  screenCode: string
  screenName: string
  screenOnline: boolean
  cacheHash: string
  cacheSyncedAt: string
  confirmedHash: string
  currentHash: string
  status: SyncState
}

export interface PersistedState {
  halls: Hall[]
  exhibits: Exhibit[]
  versions: VersionSnapshot[]
  screens: Screen[]
  targets: PublishTarget[]
  packages: ReleasePackage[]
  caches: ScreenCache[]
  revisions: OfflineRevision[]
  selectedHallId: string
  selectedExhibitId: string
  selectedLanguageId: string
  lastSavedAt: string
}

export interface DiffLine {
  type: 'same' | 'add' | 'remove'
  text: string
}
