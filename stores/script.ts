import { defineStore } from 'pinia'
import type { Exhibit, Hall, Language, LanguageDraft, OfflineRevision, PersistedState, PublishTarget, ReconRow, ReleasePackage, Screen, ScreenCache, ScriptStatus, Segment, SyncState, VersionSnapshot } from '~/types'

export const LANGUAGES: Language[] = [
  { id: 'zh', code: 'zh-CN', label: '简体中文', shortLabel: '中' },
  { id: 'en', code: 'en-US', label: 'English', shortLabel: 'EN' },
  { id: 'ja', code: 'ja-JP', label: '日本語', shortLabel: '日' }
]

const STORAGE_KEY = 'museum-script-studio-v1'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

// 内容指纹：标题 + 讲解词 + 无障碍描述 + 各段落，用于比对屏幕缓存与工作台稿件
export function hashOf(draft: Pick<LanguageDraft, 'title' | 'narration' | 'accessibility' | 'segments'>): string {
  const raw = JSON.stringify({
    t: draft.title,
    n: draft.narration,
    a: draft.accessibility,
    s: draft.segments.map(segment => [segment.label, segment.content])
  })
  let hash = 5381
  for (let index = 0; index < raw.length; index++) hash = ((hash << 5) + hash + raw.charCodeAt(index)) >>> 0
  return hash.toString(36)
}

const segments = (prefix: string, values: Array<[string, string, boolean?]>): Segment[] => values.map(([label, content, locked], index) => ({
  id: `${prefix}-${index + 1}`,
  label,
  content,
  locked: Boolean(locked)
}))

// 下发链路示例数据：屏幕、投放登记、屏幕缓存与待合并的离线修订
function seedDistribution(exhibits: Exhibit[]): Pick<PersistedState, 'versions' | 'screens' | 'targets' | 'packages' | 'caches' | 'revisions'> {
  const empty = { versions: [], screens: [], targets: [], packages: [], caches: [], revisions: [] }
  const jadeZh = exhibits.find(item => item.id === 'exhibit-jade')?.drafts.find(draft => draft.languageId === 'zh')
  const bronzeZh = exhibits.find(item => item.id === 'exhibit-bronze')?.drafts.find(draft => draft.languageId === 'zh')
  if (!jadeZh || !bronzeZh) return empty
  const bronzeOnlineDraft = clone(bronzeZh)
  bronzeOnlineDraft.narration = '爵是最早的青铜酒器之一。三足稳定器身，长流便于倾倒。'
  const versions: VersionSnapshot[] = [
    { id: 'version-jade-zh-online', exhibitId: 'exhibit-jade', languageId: 'zh', name: '上线基线 09-23', createdAt: '2026-09-23T09:00:00.000Z', draft: clone(jadeZh) },
    { id: 'version-bronze-zh-online', exhibitId: 'exhibit-bronze', languageId: 'zh', name: '上线基线 09-22', createdAt: '2026-09-22T09:30:00.000Z', draft: bronzeOnlineDraft }
  ]
  const screens: Screen[] = [
    { id: 'screen-a1', hallId: 'hall-ancient', code: 'K-A1', name: '序厅触摸屏', online: true },
    { id: 'screen-a2', hallId: 'hall-ancient', code: 'K-A2', name: '玉琮展柜屏', online: false },
    { id: 'screen-a3', hallId: 'hall-ancient', code: 'K-A3', name: '青铜展区屏', online: true },
    { id: 'screen-b1', hallId: 'hall-silk', code: 'K-B1', name: '丝路序厅屏', online: true }
  ]
  const targets: PublishTarget[] = [
    { exhibitId: 'exhibit-jade', screenIds: ['screen-a1', 'screen-a2'], onlineVersionId: 'version-jade-zh-online', confirmedHash: hashOf(jadeZh), confirmedAt: '2026-09-23T09:05:00.000Z' },
    { exhibitId: 'exhibit-bronze', screenIds: ['screen-a3'], onlineVersionId: 'version-bronze-zh-online', confirmedHash: hashOf(bronzeOnlineDraft), confirmedAt: '2026-09-22T09:35:00.000Z' },
    { exhibitId: 'exhibit-silk', screenIds: ['screen-b1'], onlineVersionId: '', confirmedHash: '', confirmedAt: '' }
  ]
  const caches: ScreenCache[] = [
    { screenId: 'screen-a1', exhibitId: 'exhibit-jade', versionId: 'version-jade-zh-online', hash: hashOf(jadeZh), syncedAt: '2026-09-23T09:10:00.000Z' },
    { screenId: 'screen-a2', exhibitId: 'exhibit-jade', versionId: 'version-jade-zh-old', hash: 'oldcache', syncedAt: '2026-09-10T09:10:00.000Z' },
    { screenId: 'screen-a3', exhibitId: 'exhibit-bronze', versionId: 'version-bronze-zh-online', hash: hashOf(bronzeOnlineDraft), syncedAt: '2026-09-22T09:40:00.000Z' }
  ]
  const revisionOneSegments = clone(jadeZh.segments) as Segment[]
  revisionOneSegments[0].content = '这件玉琮来自距今约五千年的良渚文化，请大家先看它外方内圆的整体造型。'
  revisionOneSegments[3].content = '请沿展柜顺时针观察，触摸复制品前请先使用免洗消毒液，拍照请关闭闪光灯。'
  const revisionTwoSegments = clone(jadeZh.segments) as Segment[]
  revisionTwoSegments[2].content = '玉琮常被看作沟通天地的礼器，也象征权力与身份；现场可以数一数它有几节。'
  const revisions: OfflineRevision[] = [
    {
      id: 'revision-jade-one', exhibitId: 'exhibit-jade', languageId: 'zh',
      author: '王漱玉', device: '平板-导览03', note: '上午带团时观众常问拍照问题，补了一句提示。',
      createdAt: '2026-09-29T07:30:00.000Z', importedAt: '2026-09-29T09:20:00.000Z',
      baseUpdatedAt: jadeZh.updatedAt,
      narration: `${jadeZh.narration}请大家留意四角的神人兽面纹，那是良渚人心中神灵的样子。`,
      segments: revisionOneSegments, status: 'pending', mergedAt: '', mergeLog: []
    },
    {
      id: 'revision-jade-two', exhibitId: 'exhibit-jade', languageId: 'zh',
      author: '李青山', device: '平板-导览07', note: '下午场互动建议，基于两天前的稿子记录。',
      createdAt: '2026-09-29T08:10:00.000Z', importedAt: '2026-09-29T09:25:00.000Z',
      baseUpdatedAt: '2026-09-20T08:00:00.000Z',
      narration: jadeZh.narration,
      segments: revisionTwoSegments, status: 'pending', mergedAt: '', mergeLog: []
    }
  ]
  return { versions, screens, targets, packages: [], caches, revisions }
}

function demoState(): PersistedState {
  const halls: Hall[] = [
    { id: 'hall-ancient', name: '文明肇始厅', description: '史前至先秦文明，共 18 个展项' },
    { id: 'hall-silk', name: '丝路交融厅', description: '丝绸之路上的器物、信仰与生活' },
    { id: 'hall-city', name: '城市记忆厅', description: '近现代城市空间与市民生活' }
  ]
  const exhibits: Exhibit[] = [
    {
      id: 'exhibit-jade', hallId: 'hall-ancient', code: 'A-03', title: '玉琮：沟通天地的礼器', order: 3,
      drafts: [
        {
          id: 'draft-jade-zh', languageId: 'zh', title: '玉琮：沟通天地的礼器',
          narration: '这件玉琮出土于长江下游的良渚遗址。它外方内圆，四角雕刻神人兽面纹，体现了新石器时代晚期精湛的玉器工艺。',
          accessibility: '玉琮为深青色，高约二十厘米。触摸模型可感受方形四角与中央圆孔；圆孔贯穿器身。',
          durationMinutes: 2.5, sources: '《中国玉器全集》第一卷；本馆藏品档案 1987-J-042',
          status: 'approved', updatedAt: '2026-09-23T08:35:00.000Z',
          segments: segments('jade-zh', [
            ['开场定位', '这件玉琮来自距今约五千年的良渚文化。', true],
            ['器物观察', '它外方内圆，四角雕刻神人兽面纹。', true],
            ['文化含义', '玉琮常被看作沟通天地的礼器，也象征权力与身份。'],
            ['参观提示', '请沿展柜顺时针观察，触摸复制品前先使用免洗消毒液。']
          ])
        },
        {
          id: 'draft-jade-en', languageId: 'en', title: 'Jade Cong: A Ritual Object Between Heaven and Earth',
          narration: 'This jade cong was made by the Liangzhu culture. Its square exterior and circular bore embody an early Chinese vision of the cosmos.',
          accessibility: 'The object is dark green. A tactile model shows four corners, carved faces, and a central circular opening.',
          durationMinutes: 2.3, sources: 'Complete Collection of Chinese Jades, Vol. 1; Museum accession 1987-J-042',
          status: 'review', updatedAt: '2026-09-24T02:15:00.000Z',
          segments: segments('jade-en', [
            ['Introduction', 'This jade cong is about five thousand years old.', true],
            ['Visual description', 'Its square body encloses a circular opening, while spirit-and-animal motifs cover the corners.'],
            ['Meaning', 'Jade cong is understood as a ritual link between heaven and earth.']
          ])
        },
        {
          id: 'draft-jade-ja', languageId: 'ja', title: '玉琮：天と地を結ぶ礼器',
          narration: 'こちらは良渚文化の玉琮です。外側は方形、中央は円形で、四隅には神人獣面文が刻まれています。',
          accessibility: '暗い青緑色の玉製です。複製模型では四つの角と中央の円孔を触って確認できます。',
          durationMinutes: 2.6, sources: '『中国玉器全集』第一巻；収蔵資料 1987-J-042',
          status: 'draft', updatedAt: '2026-09-21T06:10:00.000Z',
          segments: segments('jade-ja', [
            ['導入', '約五千年前の良渚文化を代表する玉琮です。'],
            ['観察', '外側は方形、中央は円形で、四隅に精緻な文様があります。'],
            ['意味', '天地を結ぶ礼器として、力と身分を象徴しました。']
          ])
        }
      ]
    },
    {
      id: 'exhibit-bronze', hallId: 'hall-ancient', code: 'A-08', title: '青铜爵与礼制', order: 8,
      drafts: [
        {
          id: 'draft-bronze-zh', languageId: 'zh', title: '青铜爵与礼制',
          narration: '爵是最早的青铜酒器之一。三足稳定器身，长流便于倾倒，柱饰则与商周礼仪密切相关。',
          accessibility: '器物为青铜色，器口一侧有长流，底部三足支撑。复制件配有可触摸的局部纹样。',
          durationMinutes: 3, sources: '《殷周青铜器通论》；展品说明卡 A-08',
          status: 'returned', updatedAt: '2026-09-23T11:20:00.000Z',
          segments: segments('bronze-zh', [
            ['器物介绍', '这是一件商代青铜爵，用于温酒和饮酒。'],
            ['结构说明', '三足使器身稳定，前端的流便于倾倒。'],
            ['礼制背景', '青铜器数量与形制反映了使用者的身份。'],
            ['修改说明', '审校意见：补充“柱饰”的用途，并核对年代。']
          ])
        },
        {
          id: 'draft-bronze-en', languageId: 'en', title: 'Bronze Jue and Ritual Order',
          narration: 'The jue was among the earliest bronze drinking vessels. Its tripod base, pouring spout, and posts were closely tied to Shang and Zhou ritual.',
          accessibility: 'The tactile replica includes the long spout, tripod feet, and raised posts.',
          durationMinutes: 2.8, sources: 'A General Survey of Yin-Zhou Bronzes; Gallery label A-08',
          status: 'draft', updatedAt: '2026-09-22T09:00:00.000Z',
          segments: segments('bronze-en', [['Object', 'This bronze jue dates to the Shang dynasty.'], ['Structure', 'Three legs support the body; the long spout guides the pour.']])
        }
      ]
    },
    {
      id: 'exhibit-silk', hallId: 'hall-silk', code: 'B-02', title: '织机与丝路纹样', order: 2,
      drafts: [{
        id: 'draft-silk-zh', languageId: 'zh', title: '织机与丝路纹样',
        narration: '织机把一根根丝线组织成布匹，也把不同地区的图案与故事连接在一起。',
        accessibility: '体验区提供放大纹样、凸点经纬结构以及可操作的小型织机模型。',
        durationMinutes: 4, sources: '馆内教育活动资料；丝绸之路纺织史专题',
        status: 'draft', updatedAt: '2026-09-20T03:00:00.000Z',
        segments: segments('silk-zh', [['序言', '丝绸不只是一种材料，也是交流的媒介。'], ['互动', '请试着推动梭子，观察经纬线如何交会。']])
      }]
    }
  ]
  return {
    halls,
    exhibits,
    ...seedDistribution(exhibits),
    selectedHallId: halls[0].id,
    selectedExhibitId: exhibits[0].id,
    selectedLanguageId: 'zh',
    lastSavedAt: new Date().toISOString()
  }
}

export const useScriptStore = defineStore('museum-script', {
  state: () => ({
    halls: [] as Hall[],
    exhibits: [] as Exhibit[],
    versions: [] as VersionSnapshot[],
    screens: [] as Screen[],
    targets: [] as PublishTarget[],
    packages: [] as ReleasePackage[],
    caches: [] as ScreenCache[],
    revisions: [] as OfflineRevision[],
    selectedHallId: '',
    selectedExhibitId: '',
    selectedLanguageId: 'zh',
    lastSavedAt: '',
    hydrated: false,
    past: [] as string[],
    future: [] as string[],
    notice: ''
  }),
  getters: {
    selectedHall(state): Hall | undefined {
      return state.halls.find(hall => hall.id === state.selectedHallId)
    },
    hallExhibits(state): Exhibit[] {
      return state.exhibits.filter(exhibit => exhibit.hallId === state.selectedHallId).sort((a, b) => a.order - b.order)
    },
    selectedExhibit(state): Exhibit | undefined {
      return state.exhibits.find(exhibit => exhibit.id === state.selectedExhibitId)
    },
    selectedDraft(): LanguageDraft | undefined {
      return this.selectedExhibit?.drafts.find(draft => draft.languageId === this.selectedLanguageId)
    },
    wordCount(): number {
      return (this.selectedDraft?.narration || '').replace(/\s/g, '').length
    },
    canUndo(state): boolean { return state.past.length > 0 },
    canRedo(state): boolean { return state.future.length > 0 },
    hallScreens(state): Screen[] {
      return state.screens.filter(screen => screen.hallId === state.selectedHallId)
    },
    hallPackages(state): ReleasePackage[] {
      return state.packages.filter(item => item.hallId === state.selectedHallId)
    },
    // 逐行对账：每个已登记展项 × 每块已登记屏幕，比对屏幕缓存、确认指纹与当前中文稿
    reconciliation(state): ReconRow[] {
      const rows: ReconRow[] = []
      for (const target of state.targets) {
        const exhibit = state.exhibits.find(item => item.id === target.exhibitId)
        if (!exhibit) continue
        const zhDraft = exhibit.drafts.find(draft => draft.languageId === 'zh')
        const currentHash = zhDraft ? hashOf(zhDraft) : ''
        for (const screenId of target.screenIds) {
          const screen = state.screens.find(item => item.id === screenId)
          if (!screen) continue
          const cache = state.caches.find(item => item.screenId === screenId && item.exhibitId === target.exhibitId)
          let status: SyncState
          if (!target.confirmedHash || currentHash !== target.confirmedHash) status = 'needs-reconfirm'
          else if (!cache) status = 'never-deployed'
          else if (cache.hash !== target.confirmedHash) status = 'screen-behind'
          else status = 'synced'
          rows.push({
            exhibitId: exhibit.id,
            exhibitCode: exhibit.code,
            exhibitTitle: exhibit.title,
            hallId: exhibit.hallId,
            screenId: screen.id,
            screenCode: screen.code,
            screenName: screen.name,
            screenOnline: screen.online,
            cacheHash: cache?.hash || '',
            cacheSyncedAt: cache?.syncedAt || '',
            confirmedHash: target.confirmedHash,
            currentHash,
            status
          })
        }
      }
      return rows
    },
    mismatchCount(): number {
      return this.reconciliation.filter(row => row.status !== 'synced').length
    },
    pendingRevisionCount(state): number {
      return state.revisions.filter(item => item.status === 'pending').length
    }
  },
  actions: {
    hydrate() {
      if (this.hydrated || typeof localStorage === 'undefined') return
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        try {
          const data = JSON.parse(saved) as PersistedState
          this.$patch({ ...data, hydrated: true })
          if (!this.halls.length || !this.exhibits.length) this.resetDemo()
        } catch {
          this.resetDemo()
        }
      } else {
        this.resetDemo()
      }
      // 旧版本地数据没有下发链路字段，补上演示屏幕与登记
      if (!Array.isArray(this.screens) || !this.screens.length) {
        const seed = seedDistribution(this.exhibits)
        this.$patch({ ...seed, versions: [...seed.versions, ...this.versions] })
        this.persist()
      }
      this.ensureSelection()
      this.hydrated = true
    },
    resetDemo() {
      this.$patch({ ...demoState(), hydrated: true, past: [], future: [] })
      this.persist()
      this.notice = '示例数据已就绪，可直接开始编辑。'
    },
    snapshot(): string {
      return JSON.stringify({
        halls: this.halls, exhibits: this.exhibits, versions: this.versions,
        screens: this.screens, targets: this.targets, packages: this.packages,
        caches: this.caches, revisions: this.revisions
      })
    },
    commit(mutator: () => void) {
      this.past.push(this.snapshot())
      if (this.past.length > 50) this.past.shift()
      this.future = []
      mutator()
      this.lastSavedAt = new Date().toISOString()
      this.persist()
    },
    persist() {
      if (typeof localStorage === 'undefined') return
      const data: PersistedState = {
        halls: this.halls, exhibits: this.exhibits, versions: this.versions,
        screens: this.screens, targets: this.targets, packages: this.packages,
        caches: this.caches, revisions: this.revisions,
        selectedHallId: this.selectedHallId, selectedExhibitId: this.selectedExhibitId,
        selectedLanguageId: this.selectedLanguageId, lastSavedAt: this.lastSavedAt
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    },
    ensureSelection() {
      if (!this.halls.some(hall => hall.id === this.selectedHallId)) this.selectedHallId = this.halls[0]?.id || ''
      const inHall = this.exhibits.filter(exhibit => exhibit.hallId === this.selectedHallId)
      if (!inHall.some(exhibit => exhibit.id === this.selectedExhibitId)) this.selectedExhibitId = inHall[0]?.id || ''
      const exhibit = this.selectedExhibit
      if (!exhibit?.drafts.some(draft => draft.languageId === this.selectedLanguageId)) this.selectedLanguageId = exhibit?.drafts[0]?.languageId || 'zh'
    },
    selectHall(id: string) {
      this.selectedHallId = id
      const exhibit = this.exhibits.find(item => item.hallId === id)
      this.selectedExhibitId = exhibit?.id || ''
      this.ensureSelection()
      this.persist()
    },
    selectExhibit(id: string) {
      this.selectedExhibitId = id
      this.ensureSelection()
      this.persist()
    },
    selectLanguage(id: string) {
      this.selectedLanguageId = id
      this.persist()
    },
    updateDraft(patch: Partial<Pick<LanguageDraft, 'title' | 'narration' | 'accessibility' | 'durationMinutes' | 'sources'>>) {
      const draft = this.selectedDraft
      if (!draft) return
      this.commit(() => Object.assign(draft, patch, { updatedAt: new Date().toISOString() }))
      this.notice = '改动已自动保存到浏览器。'
    },
    updateSegment(id: string, patch: Partial<Pick<Segment, 'label' | 'content'>>) {
      const segment = this.selectedDraft?.segments.find(item => item.id === id)
      if (!segment || segment.locked) return
      this.commit(() => Object.assign(segment, patch))
    },
    toggleLock(id: string) {
      const segment = this.selectedDraft?.segments.find(item => item.id === id)
      if (!segment) return
      this.commit(() => { segment.locked = !segment.locked })
      this.notice = segment.locked ? '段落已锁定，避免误改。' : '段落已解锁。'
    },
    addSegment() {
      const draft = this.selectedDraft
      if (!draft) return
      this.commit(() => draft.segments.push({ id: `segment-${Date.now()}`, label: `新段落 ${draft.segments.length + 1}`, content: '', locked: false }))
    },
    removeSegment(id: string) {
      const draft = this.selectedDraft
      const segment = draft?.segments.find(item => item.id === id)
      if (!draft || !segment || segment.locked) return
      this.commit(() => { draft.segments = draft.segments.filter(item => item.id !== id) })
    },
    setStatus(status: ScriptStatus) {
      const draft = this.selectedDraft
      if (!draft) return
      this.commit(() => { draft.status = status; draft.updatedAt = new Date().toISOString() })
      this.notice = `状态已更新为“${this.statusLabel(status)}”。`
    },
    statusLabel(status: ScriptStatus) {
      return ({ draft: '草稿', review: '待审', returned: '退回', approved: '已定稿' })[status]
    },
    createVersion(name?: string) {
      const draft = this.selectedDraft
      if (!draft) return
      const version: VersionSnapshot = {
        id: `version-${Date.now()}`,
        exhibitId: this.selectedExhibitId,
        languageId: this.selectedLanguageId,
        name: name || `${new Date().toLocaleString('zh-CN', { hour12: false })} 快照`,
        createdAt: new Date().toISOString(),
        draft: JSON.parse(JSON.stringify(draft))
      }
      this.commit(() => this.versions.unshift(version))
      this.notice = '已保存当前版本，可在版本页比较或恢复。'
    },
    restoreVersion(id: string) {
      const version = this.versions.find(item => item.id === id)
      if (!version) return
      this.commit(() => {
        const exhibit = this.exhibits.find(item => item.id === version.exhibitId)
        if (!exhibit) return
        const index = exhibit.drafts.findIndex(item => item.languageId === version.languageId)
        const restored = JSON.parse(JSON.stringify(version.draft)) as LanguageDraft
        if (index >= 0) exhibit.drafts[index] = restored
        else exhibit.drafts.push(restored)
      })
      this.selectedExhibitId = version.exhibitId
      this.selectedLanguageId = version.languageId
      this.notice = '版本已恢复，并作为一次可撤销操作保存。'
    },
    undo() {
      const state = this.past.pop()
      if (!state) return
      this.future.push(this.snapshot())
      this.$patch(JSON.parse(state))
      this.lastSavedAt = new Date().toISOString()
      this.ensureSelection()
      this.persist()
      this.notice = '已撤销上一步。'
    },
    redo() {
      const state = this.future.pop()
      if (!state) return
      this.past.push(this.snapshot())
      this.$patch(JSON.parse(state))
      this.lastSavedAt = new Date().toISOString()
      this.ensureSelection()
      this.persist()
      this.notice = '已重做。'
    },
    completionFor(exhibit: Exhibit, languageId: string): number {
      const draft = exhibit.drafts.find(item => item.languageId === languageId)
      if (!draft) return 0
      const checks = [draft.title, draft.narration, draft.accessibility, draft.sources, draft.segments.length > 0 ? 'segments' : '']
      return Math.round(checks.filter(Boolean).length / checks.length * 100)
    },
    zhDraftOf(exhibitId: string): LanguageDraft | undefined {
      return this.exhibits.find(item => item.id === exhibitId)?.drafts.find(draft => draft.languageId === 'zh')
    },
    hashOfDraft(draft: LanguageDraft): string {
      return hashOf(draft)
    },
    targetFor(exhibitId: string): PublishTarget | undefined {
      return this.targets.find(item => item.exhibitId === exhibitId)
    },
    exhibitSyncState(exhibitId: string): SyncState | 'none' {
      const rows = this.reconciliation.filter(row => row.exhibitId === exhibitId)
      if (!rows.length) return 'none'
      if (rows.some(row => row.status === 'needs-reconfirm')) return 'needs-reconfirm'
      if (rows.some(row => row.status === 'never-deployed')) return 'never-deployed'
      if (rows.some(row => row.status === 'screen-behind')) return 'screen-behind'
      return 'synced'
    },
    setCache(entry: ScreenCache) {
      const existing = this.caches.find(item => item.screenId === entry.screenId && item.exhibitId === entry.exhibitId)
      if (existing) Object.assign(existing, entry)
      else this.caches.push(entry)
    },
    setTargetScreens(exhibitId: string, screenIds: string[]) {
      this.commit(() => {
        const target = this.targetFor(exhibitId)
        if (target) target.screenIds = screenIds
        else this.targets.push({ exhibitId, screenIds, onlineVersionId: '', confirmedHash: '', confirmedAt: '' })
      })
      this.notice = '投放屏幕登记已更新。'
    },
    // 以当前中文稿确认上线：生成快照并记录内容指纹；中文稿再改动时会自动变为待重新确认
    confirmOnline(exhibitId: string) {
      const draft = this.zhDraftOf(exhibitId)
      if (!draft) return
      const now = new Date().toISOString()
      this.commit(() => {
        const version: VersionSnapshot = {
          id: `version-${Date.now()}`,
          exhibitId,
          languageId: 'zh',
          name: `上线确认 ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
          createdAt: now,
          draft: clone(draft)
        }
        this.versions.unshift(version)
        const target = this.targetFor(exhibitId)
        if (target) Object.assign(target, { onlineVersionId: version.id, confirmedHash: hashOf(draft), confirmedAt: now })
        else this.targets.push({ exhibitId, screenIds: [], onlineVersionId: version.id, confirmedHash: hashOf(draft), confirmedAt: now })
      })
      this.notice = '已按当前中文稿确认上线版本，请生成发布包下发到屏幕。'
    },
    // 按展厅生成发布包：只纳入中文稿与确认指纹一致的展项，其余拦下提示
    buildPackage(hallId: string) {
      const hall = this.halls.find(item => item.id === hallId)
      if (!hall) return
      const hallExhibitIds = this.exhibits.filter(item => item.hallId === hallId).map(item => item.id)
      const targets = this.targets.filter(item => hallExhibitIds.includes(item.exhibitId) && item.screenIds.length)
      const ready: ReleasePackage['items'] = []
      const blocked: string[] = []
      for (const target of targets) {
        const exhibit = this.exhibits.find(item => item.id === target.exhibitId)
        const zhDraft = exhibit?.drafts.find(draft => draft.languageId === 'zh')
        if (!exhibit || !zhDraft) continue
        if (target.confirmedHash && hashOf(zhDraft) === target.confirmedHash) {
          ready.push({ exhibitId: exhibit.id, title: exhibit.title, versionId: target.onlineVersionId, hash: target.confirmedHash })
        } else {
          blocked.push(exhibit.title)
        }
      }
      if (!ready.length) {
        this.notice = blocked.length ? `「${blocked.join('」「')}」的中文稿待重新确认，暂无可打包的展项。` : '当前展厅还没有登记投放屏幕的展项。'
        return
      }
      this.commit(() => {
        this.packages.unshift({
          id: `package-${Date.now()}`,
          hallId,
          name: `${hall.name}发布包 ${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}`,
          createdAt: new Date().toISOString(),
          deployedAt: '',
          items: ready
        })
      })
      this.notice = blocked.length ? `发布包已生成（${ready.length} 个展项）；「${blocked.join('」「')}」待重新确认，未纳入。` : `发布包已生成，包含 ${ready.length} 个展项。`
    },
    // 下发到展厅内在线屏幕；离线屏幕保持旧缓存，对账里会继续挂着
    deployPackage(packageId: string) {
      const pkg = this.packages.find(item => item.id === packageId)
      if (!pkg) return
      const hallScreens = this.screens.filter(item => item.hallId === pkg.hallId)
      const online = hallScreens.filter(item => item.online)
      const offline = hallScreens.filter(item => !item.online)
      const now = new Date().toISOString()
      this.commit(() => {
        for (const screen of online) {
          for (const item of pkg.items) {
            const target = this.targetFor(item.exhibitId)
            if (!target?.screenIds.includes(screen.id)) continue
            this.setCache({ screenId: screen.id, exhibitId: item.exhibitId, versionId: item.versionId, hash: item.hash, syncedAt: now })
          }
        }
        pkg.deployedAt = now
      })
      this.notice = offline.length
        ? `已下发到 ${online.map(item => item.code).join('、')}；${offline.map(item => item.code).join('、')} 离线未更新，请在对账中跟进。`
        : `已下发到 ${online.length} 块在线屏幕。`
    },
    // 单屏补发：把已确认的上线版本推给指定屏幕
    deployToScreen(exhibitId: string, screenId: string) {
      const target = this.targetFor(exhibitId)
      const screen = this.screens.find(item => item.id === screenId)
      if (!target?.confirmedHash || !screen) return
      this.commit(() => {
        this.setCache({ screenId, exhibitId, versionId: target.onlineVersionId, hash: target.confirmedHash, syncedAt: new Date().toISOString() })
      })
      this.notice = `已向 ${screen.code} 补发展项内容。`
    },
    toggleScreenOnline(screenId: string) {
      const screen = this.screens.find(item => item.id === screenId)
      if (!screen) return
      this.commit(() => { screen.online = !screen.online })
    },
    // 离线修订只追加、不覆盖：同一展项的多份修订都会保留
    importRevision(input: Pick<OfflineRevision, 'exhibitId' | 'languageId' | 'author' | 'device' | 'note' | 'narration' | 'segments' | 'baseUpdatedAt'>) {
      this.commit(() => {
        this.revisions.unshift({
          id: `revision-${Date.now()}`,
          ...input,
          segments: clone(input.segments),
          createdAt: new Date().toISOString(),
          importedAt: new Date().toISOString(),
          status: 'pending',
          mergedAt: '',
          mergeLog: []
        })
      })
      this.notice = '离线修订已导入，等待合并进工作台。'
    },
    // 合并进工作台：已定稿锁定的段落保持不动，其余按段落名对齐更新
    mergeRevision(revisionId: string) {
      const revision = this.revisions.find(item => item.id === revisionId)
      if (!revision || revision.status === 'merged') return
      const draft = this.exhibits.find(item => item.id === revision.exhibitId)?.drafts.find(item => item.languageId === revision.languageId)
      if (!draft) return
      const log: string[] = []
      this.commit(() => {
        if (revision.baseUpdatedAt && revision.baseUpdatedAt !== draft.updatedAt) log.push('该修订基于较早的工作台稿，已按最新稿合并')
        if (revision.narration.trim() && revision.narration !== draft.narration) {
          draft.narration = revision.narration
          log.push('讲解词已更新')
        }
        for (const revised of revision.segments) {
          const existing = draft.segments.find(segment => segment.label === revised.label)
          if (existing) {
            if (existing.locked) { log.push(`段落「${existing.label}」已定稿锁定，保持不动`); continue }
            if (existing.content !== revised.content) { existing.content = revised.content; log.push(`段落「${existing.label}」已更新`) }
          } else if (revised.content.trim()) {
            draft.segments.push({ id: `segment-${Date.now()}-${draft.segments.length}`, label: revised.label, content: revised.content, locked: false })
            log.push(`新增段落「${revised.label}」`)
          }
        }
        draft.updatedAt = new Date().toISOString()
        revision.status = 'merged'
        revision.mergedAt = new Date().toISOString()
        revision.mergeLog = log
      })
      this.notice = log.length ? `合并完成：${log.join('；')}。` : '修订内容与当前稿一致，无需改动。'
    }
  }
})
