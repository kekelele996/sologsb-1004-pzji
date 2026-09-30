import { defineStore } from 'pinia'
import type { Exhibit, Hall, Language, LanguageDraft, OfflineRevision, PersistedState, ReconcileItem, ReleasePackage, Screen, ScriptStatus, Segment, VersionSnapshot } from '~/types'

export const LANGUAGES: Language[] = [
  { id: 'zh', code: 'zh-CN', label: '简体中文', shortLabel: '中' },
  { id: 'en', code: 'en-US', label: 'English', shortLabel: 'EN' },
  { id: 'ja', code: 'ja-JP', label: '日本語', shortLabel: '日' }
]

export const SCREEN_KINDS: Array<{ value: Screen['kind']; label: string }> = [
  { value: 'kiosk', label: '馆内触摸屏' },
  { value: 'wall', label: '墙面大屏' },
  { value: 'tablet', label: '平板导览' },
  { value: 'mobile', label: '手机导览' },
  { value: 'projection', label: '投影' }
]

const STORAGE_KEY = 'museum-script-studio-v1'

const segments = (prefix: string, values: Array<[string, string, boolean?]>): Segment[] => values.map(([label, content, locked], index) => ({
  id: `${prefix}-${index + 1}`,
  label,
  content,
  locked: Boolean(locked)
}))

function mergeRevisionIntoDraft(draft: LanguageDraft, rev: OfflineRevision): string[] {
  const changes: string[] = []
  if (rev.segments.length) {
    rev.segments.forEach((rs, i) => {
      const target = draft.segments[i]
      if (target) {
        if (target.locked) {
          changes.push(`段落「${target.label || '未命名'}」已定稿，保留未改`)
        } else {
          target.content = rs.content
          if (rs.label) target.label = rs.label
          changes.push(`段落「${target.label || '未命名'}」已更新`)
        }
      } else {
        draft.segments.push({ id: `segment-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`, label: rs.label, content: rs.content, locked: false })
        changes.push(`新增段落「${rs.label || '未命名'}」`)
      }
    })
  }
  if (rev.narration && draft.narration !== rev.narration) {
    draft.narration = rev.narration
    changes.push('讲解词已更新')
  }
  draft.updatedAt = new Date().toISOString()
  return changes
}

const STATUS_LABELS: Record<ScriptStatus, string> = { draft: '草稿', review: '待审', returned: '退回', approved: '已定稿' }

function computeReconcile(
  exhibits: Exhibit[],
  screens: Screen[],
  packages: ReleasePackage[],
  versions: VersionSnapshot[],
  hallId: string
): ReconcileItem[] {
  const items: ReconcileItem[] = []
  const hallExhibits = exhibits.filter(exhibit => exhibit.hallId === hallId).sort((a, b) => a.order - b.order)
  const hallScreens = screens.filter(screen => screen.hallId === hallId)
  for (const exhibit of hallExhibits) {
    if (!exhibit.screenIds.length) {
      items.push({
        exhibitId: exhibit.id, exhibitCode: exhibit.code, exhibitTitle: exhibit.title,
        type: 'no-screen', severity: 'warning',
        message: '该展项未登记投放屏幕，无法下发到触摸屏'
      })
    }
    for (const draft of exhibit.drafts) {
      const lang = LANGUAGES.find(item => item.id === draft.languageId)
      const langLabel = lang?.label || draft.languageId
      if (draft.status !== 'approved') {
        items.push({
          exhibitId: exhibit.id, exhibitCode: exhibit.code, exhibitTitle: exhibit.title,
          languageId: draft.languageId, languageLabel: langLabel,
          type: 'not-approved', severity: 'info',
          message: `${langLabel}文稿为「${STATUS_LABELS[draft.status]}」，未定稿不下发`
        })
        continue
      }
      if (!draft.onlineSnapshotId) {
        items.push({
          exhibitId: exhibit.id, exhibitCode: exhibit.code, exhibitTitle: exhibit.title,
          languageId: draft.languageId, languageLabel: langLabel,
          type: 'never-synced', severity: 'error',
          message: `${langLabel}文稿已定稿但从未下发到屏幕`
        })
        continue
      }
      const onlineSnapshot = versions.find(item => item.id === draft.onlineSnapshotId)
      const contentChanged = Boolean(onlineSnapshot && (onlineSnapshot.draft.narration !== draft.narration || onlineSnapshot.draft.title !== draft.title))
      for (const screenId of exhibit.screenIds) {
        const screen = hallScreens.find(item => item.id === screenId)
        if (!screen) continue
        if (!screen.lastPackageId) {
          items.push({
            exhibitId: exhibit.id, exhibitCode: exhibit.code, exhibitTitle: exhibit.title,
            screenId: screen.id, screenName: screen.name,
            languageId: draft.languageId, languageLabel: langLabel,
            type: 'never-synced', severity: 'error',
            message: `屏幕「${screen.name}」从未同步发布包`
          })
          continue
        }
        const screenPkg = packages.find(item => item.id === screen.lastPackageId)
        const pkgItem = screenPkg?.items.find(item => item.exhibitId === exhibit.id && item.languageId === draft.languageId)
        if (!pkgItem || pkgItem.snapshotId !== draft.onlineSnapshotId) {
          items.push({
            exhibitId: exhibit.id, exhibitCode: exhibit.code, exhibitTitle: exhibit.title,
            screenId: screen.id, screenName: screen.name,
            languageId: draft.languageId, languageLabel: langLabel,
            type: 'outdated', severity: 'error',
            message: `屏幕「${screen.name}」缓存为旧版，落后于当前上线版本`
          })
          continue
        }
        if (contentChanged) {
          items.push({
            exhibitId: exhibit.id, exhibitCode: exhibit.code, exhibitTitle: exhibit.title,
            screenId: screen.id, screenName: screen.name,
            languageId: draft.languageId, languageLabel: langLabel,
            type: 'content-changed', severity: 'warning',
            message: `屏幕「${screen.name}」缓存为旧版，${draft.languageId === 'zh' ? '中文稿' : langLabel + '稿'}已更新，需重新确认后下发`
          })
        }
      }
    }
  }
  return items
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
      screenIds: ['screen-ancient-1', 'screen-ancient-2', 'screen-ancient-4', 'screen-ancient-5'],
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
      screenIds: ['screen-ancient-3'],
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
      screenIds: ['screen-silk-1'],
      drafts: [{
        id: 'draft-silk-zh', languageId: 'zh', title: '织机与丝路纹样',
        narration: '织机把一根根丝线组织成布匹，也把不同地区的图案与故事连接在一起。',
        accessibility: '体验区提供放大纹样、凸点经纬结构以及可操作的小型织机模型。',
        durationMinutes: 4, sources: '馆内教育活动资料；丝绸之路纺织史专题',
        status: 'draft', updatedAt: '2026-09-20T03:00:00.000Z',
        segments: segments('silk-zh', [['序言', '丝绸不只是一种材料，也是交流的媒介。'], ['互动', '请试着推动梭子，观察经纬线如何交会。']])
      }]
    },
    {
      id: 'exhibit-city', hallId: 'hall-city', code: 'C-01', title: '城市记忆：从码头到街区', order: 1,
      screenIds: [],
      drafts: [{
        id: 'draft-city-zh', languageId: 'zh', title: '城市记忆：从码头到街区',
        narration: '这座城市的码头曾是南北货运转运的枢纽，沿街商铺与会馆记录着近代市民生活的变迁。',
        accessibility: '展区提供码头场景复原、可触摸的老街区模型与 Historical 声音装置。',
        durationMinutes: 3.5, sources: '市档案馆城市史资料；街区口述史项目',
        status: 'draft', updatedAt: '2026-09-29T10:00:00.000Z',
        segments: segments('city-zh', [['码头兴衰', '码头是近代城市货运与生活的起点。'], ['街区生活', '沿街商铺与会馆记录着市民生活的变迁。']])
      }]
    }
  ]

  const screens: Screen[] = [
    { id: 'screen-ancient-1', hallId: 'hall-ancient', name: '序厅触摸屏', location: '序厅东侧', kind: 'kiosk', online: true },
    { id: 'screen-ancient-2', hallId: 'hall-ancient', name: '展厅中部触摸屏', location: '展厅中部展墙', kind: 'kiosk', online: true },
    { id: 'screen-ancient-3', hallId: 'hall-ancient', name: '尾厅墙面大屏', location: '尾厅北墙', kind: 'wall', online: true },
    { id: 'screen-ancient-4', hallId: 'hall-ancient', name: '侧厅触摸屏', location: '侧厅入口', kind: 'kiosk', online: true },
    { id: 'screen-ancient-5', hallId: 'hall-ancient', name: '新增触摸屏', location: '序厅西侧', kind: 'kiosk', online: false },
    { id: 'screen-silk-1', hallId: 'hall-silk', name: '序厅触摸屏', location: '序厅入口', kind: 'kiosk', online: true },
    { id: 'screen-city-1', hallId: 'hall-city', name: '序厅触摸屏', location: '序厅入口', kind: 'kiosk', online: true }
  ]

  const oldNarration0 = '玉琮是良渚文化的礼器，外方内圆。'
  const oldNarration1 = '这件玉琮出土于良渚遗址，外方内圆，刻有神人兽面纹。'
  const snapshot0: VersionSnapshot = {
    id: 'snapshot-demo-0-jade-zh', exhibitId: 'exhibit-jade', languageId: 'zh',
    name: '发布包 #1 · 文明肇始厅', createdAt: '2026-09-18T02:00:00.000Z',
    draft: { ...exhibits[0].drafts[0], narration: oldNarration0, updatedAt: '2026-09-18T02:00:00.000Z' }
  }
  const snapshot1: VersionSnapshot = {
    id: 'snapshot-demo-1-jade-zh', exhibitId: 'exhibit-jade', languageId: 'zh',
    name: '发布包 #2 · 文明肇始厅', createdAt: '2026-09-25T02:00:00.000Z',
    draft: { ...exhibits[0].drafts[0], narration: oldNarration1, updatedAt: '2026-09-25T02:00:00.000Z' }
  }
  const pkg0: ReleasePackage = {
    id: 'package-demo-0', hallId: 'hall-ancient', packageNo: 1, name: '发布包 #1 · 文明肇始厅',
    createdAt: '2026-09-18T02:00:00.000Z', note: '首次下发',
    items: [{
      exhibitId: 'exhibit-jade', languageId: 'zh', snapshotId: snapshot0.id, snapshotName: snapshot0.name,
      exhibitCode: 'A-03', exhibitTitle: '玉琮：沟通天地的礼器', title: '玉琮：沟通天地的礼器',
      narration: oldNarration0, status: 'approved'
    }],
    excluded: [], screenIds: ['screen-ancient-4'], deployedAt: '2026-09-18T02:30:00.000Z'
  }
  const pkg1: ReleasePackage = {
    id: 'package-demo-1', hallId: 'hall-ancient', packageNo: 2, name: '发布包 #2 · 文明肇始厅',
    createdAt: '2026-09-25T02:00:00.000Z', note: '季度更新',
    items: [{
      exhibitId: 'exhibit-jade', languageId: 'zh', snapshotId: snapshot1.id, snapshotName: snapshot1.name,
      exhibitCode: 'A-03', exhibitTitle: '玉琮：沟通天地的礼器', title: '玉琮：沟通天地的礼器',
      narration: oldNarration1, status: 'approved'
    }],
    excluded: [
      { exhibitId: 'exhibit-jade', exhibitCode: 'A-03', languageId: 'en', reason: '待审' },
      { exhibitId: 'exhibit-jade', exhibitCode: 'A-03', languageId: 'ja', reason: '草稿' },
      { exhibitId: 'exhibit-bronze', exhibitCode: 'A-08', languageId: 'zh', reason: '退回' },
      { exhibitId: 'exhibit-bronze', exhibitCode: 'A-08', languageId: 'en', reason: '草稿' }
    ],
    screenIds: ['screen-ancient-1', 'screen-ancient-2', 'screen-ancient-3'], deployedAt: '2026-09-25T02:30:00.000Z'
  }
  exhibits[0].drafts[0].onlineSnapshotId = snapshot1.id
  exhibits[0].drafts[0].publishedAt = pkg1.deployedAt
  screens[0].lastPackageId = pkg1.id; screens[0].lastSyncedAt = pkg1.deployedAt
  screens[1].lastPackageId = pkg1.id; screens[1].lastSyncedAt = pkg1.deployedAt
  screens[2].lastPackageId = pkg1.id; screens[2].lastSyncedAt = pkg1.deployedAt
  screens[3].lastPackageId = pkg0.id; screens[3].lastSyncedAt = pkg0.deployedAt

  const offlineRevisions: OfflineRevision[] = [
    {
      id: 'revision-demo-1', exhibitId: 'exhibit-jade', languageId: 'zh',
      docentName: '王讲解员', notedAt: '2026-09-26T10:00:00.000Z', importedAt: '2026-09-26T18:00:00.000Z',
      note: '序厅现场口播修订，补充良渚年代与礼器含义',
      narration: '这件玉琮出土于长江下游的良渚遗址，距今约五千年。它外方内圆，四角雕刻神人兽面纹，是沟通天地的礼器。',
      segments: [
        { label: '开场定位', content: '这件玉琮来自距今约五千年的良渚文化。' },
        { label: '器物观察', content: '它外方内圆，四角雕刻神人兽面纹。' },
        { label: '文化含义', content: '玉琮是沟通天地的礼器，象征权力与身份。' }
      ],
      status: 'pending'
    },
    {
      id: 'revision-demo-2', exhibitId: 'exhibit-jade', languageId: 'zh',
      docentName: '李讲解员', notedAt: '2026-09-27T14:00:00.000Z', importedAt: '2026-09-27T19:00:00.000Z',
      note: '团队参观后的口播修订，调整表述顺序',
      narration: '良渚玉琮外方内圆，神人兽面纹刻于四角，是新石器时代玉器工艺的代表。',
      segments: [
        { label: '开场定位', content: '良渚玉琮距今约五千年。' },
        { label: '器物观察', content: '外方内圆，刻神人兽面纹。' }
      ],
      status: 'pending'
    },
    {
      id: 'revision-demo-3', exhibitId: 'exhibit-bronze', languageId: 'zh',
      docentName: '王讲解员', notedAt: '2026-09-22T09:00:00.000Z', importedAt: '2026-09-22T17:00:00.000Z',
      note: '青铜爵口播修订',
      narration: '爵是最早的青铜酒器之一，三足稳定器身，长流便于倾倒，柱饰与商周礼仪密切相关。',
      segments: [
        { label: '器物介绍', content: '这是一件商代青铜爵，用于温酒和饮酒。' },
        { label: '结构说明', content: '三足使器身稳定，前端的流便于倾倒。' }
      ],
      status: 'merged', mergedAt: '2026-09-22T17:30:00.000Z',
      mergeNote: '已合并口播修订，讲解词已更新。'
    }
  ]

  return {
    halls,
    exhibits,
    versions: [snapshot0, snapshot1],
    screens,
    packages: [pkg1, pkg0],
    offlineRevisions,
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
    packages: [] as ReleasePackage[],
    offlineRevisions: [] as OfflineRevision[],
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
    selectedHallPackages(state): ReleasePackage[] {
      return state.packages.filter(pkg => pkg.hallId === state.selectedHallId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    latestDeployedPackage(state): ReleasePackage | undefined {
      return state.packages
        .filter(pkg => pkg.hallId === state.selectedHallId && pkg.deployedAt)
        .sort((a, b) => (b.deployedAt || '').localeCompare(a.deployedAt || ''))[0]
    },
    pendingRevisions(state): OfflineRevision[] {
      return state.offlineRevisions.filter(rev => rev.status === 'pending')
    },
    processedRevisions(state): OfflineRevision[] {
      return state.offlineRevisions.filter(rev => rev.status !== 'pending')
    },
    reconcileItems(): ReconcileItem[] {
      return computeReconcile(this.exhibits, this.screens, this.packages, this.versions, this.selectedHallId)
    },
    reconcileSummary(): { total: number; errors: number; warnings: number; infos: number } {
      const items = this.reconcileItems
      return {
        total: items.length,
        errors: items.filter(item => item.severity === 'error').length,
        warnings: items.filter(item => item.severity === 'warning').length,
        infos: items.filter(item => item.severity === 'info').length
      }
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
      if (!Array.isArray(this.screens)) this.screens = []
      if (!Array.isArray(this.packages)) this.packages = []
      if (!Array.isArray(this.offlineRevisions)) this.offlineRevisions = []
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
        screens: this.screens, packages: this.packages, offlineRevisions: this.offlineRevisions
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
        screens: this.screens, packages: this.packages, offlineRevisions: this.offlineRevisions,
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
    screenKindLabel(kind: Screen['kind']) {
      return SCREEN_KINDS.find(item => item.value === kind)?.label || kind
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
    addScreen(data: { name: string; location: string; kind: Screen['kind']; online: boolean }) {
      const screen: Screen = {
        id: `screen-${Date.now()}`,
        hallId: this.selectedHallId,
        name: data.name.trim() || '未命名屏幕',
        location: data.location.trim(),
        kind: data.kind,
        online: data.online
      }
      this.commit(() => this.screens.push(screen))
      this.notice = `已添加屏幕「${screen.name}」。`
    },
    updateScreen(id: string, patch: Partial<Pick<Screen, 'name' | 'location' | 'kind' | 'online'>>) {
      const screen = this.screens.find(item => item.id === id)
      if (!screen) return
      this.commit(() => Object.assign(screen, patch))
    },
    removeScreen(id: string) {
      this.commit(() => {
        this.screens = this.screens.filter(item => item.id !== id)
        for (const exhibit of this.exhibits) {
          exhibit.screenIds = exhibit.screenIds.filter(screenId => screenId !== id)
        }
      })
      this.notice = '已移除屏幕，并解除相关展项的投放登记。'
    },
    toggleExhibitScreen(exhibitId: string, screenId: string) {
      const exhibit = this.exhibits.find(item => item.id === exhibitId)
      if (!exhibit) return
      this.commit(() => {
        if (exhibit.screenIds.includes(screenId)) {
          exhibit.screenIds = exhibit.screenIds.filter(id => id !== screenId)
        } else {
          exhibit.screenIds.push(screenId)
        }
      })
    },
    generatePackage(hallId: string, note = '') {
      const hall = this.halls.find(item => item.id === hallId)
      if (!hall) return
      const hallExhibits = this.exhibits.filter(item => item.hallId === hallId).sort((a, b) => a.order - b.order)
      const now = new Date().toISOString()
      const packageNo = this.packages.filter(item => item.hallId === hallId).length + 1
      const snapshots: VersionSnapshot[] = []
      const items: ReleasePackage['items'] = []
      const excluded: ReleasePackage['excluded'] = []
      for (const exhibit of hallExhibits) {
        for (const draft of exhibit.drafts) {
          if (draft.status === 'approved') {
            const snapshotId = `snapshot-pkg-${Date.now()}-${exhibit.id}-${draft.languageId}`
            snapshots.push({
              id: snapshotId,
              exhibitId: exhibit.id,
              languageId: draft.languageId,
              name: `发布包 #${packageNo} · ${hall.name}`,
              createdAt: now,
              draft: JSON.parse(JSON.stringify(draft))
            })
            items.push({
              exhibitId: exhibit.id,
              languageId: draft.languageId,
              snapshotId,
              snapshotName: `发布包 #${packageNo} · ${hall.name}`,
              exhibitCode: exhibit.code,
              exhibitTitle: exhibit.title,
              title: draft.title,
              narration: draft.narration,
              status: draft.status
            })
          } else {
            excluded.push({
              exhibitId: exhibit.id,
              exhibitCode: exhibit.code,
              languageId: draft.languageId,
              reason: this.statusLabel(draft.status)
            })
          }
        }
      }
      const pkg: ReleasePackage = {
        id: `package-${Date.now()}`,
        hallId,
        packageNo,
        name: `发布包 #${packageNo} · ${hall.name}`,
        createdAt: now,
        note: note.trim(),
        items,
        excluded,
        screenIds: []
      }
      this.commit(() => {
        this.versions.unshift(...snapshots)
        this.packages.unshift(pkg)
      })
      this.notice = `已生成「${pkg.name}」，含 ${items.length} 篇定稿稿件，${excluded.length} 篇未定稿未包含。`
    },
    deployPackage(id: string) {
      const pkg = this.packages.find(item => item.id === id)
      if (!pkg) return
      const hallScreens = this.screens.filter(screen => screen.hallId === pkg.hallId)
      const now = new Date().toISOString()
      this.commit(() => {
        pkg.deployedAt = now
        pkg.screenIds = hallScreens.map(screen => screen.id)
        for (const item of pkg.items) {
          const exhibit = this.exhibits.find(entry => entry.id === item.exhibitId)
          const draft = exhibit?.drafts.find(entry => entry.languageId === item.languageId)
          if (draft) {
            draft.onlineSnapshotId = item.snapshotId
            draft.publishedAt = now
          }
        }
        for (const screen of hallScreens) {
          screen.lastPackageId = pkg.id
          screen.lastSyncedAt = now
        }
      })
      this.notice = `已下发「${pkg.name}」到 ${hallScreens.length} 块屏幕，屏幕缓存已更新。`
    },
    reconfirmAndDeploy(hallId: string) {
      this.generatePackage(hallId, '中文稿更新后重新确认')
      const pkg = this.packages.find(item => item.hallId === hallId && !item.deployedAt)
      if (pkg) this.deployPackage(pkg.id)
    },
    reconcileHall(hallId: string): ReconcileItem[] {
      return computeReconcile(this.exhibits, this.screens, this.packages, this.versions, hallId)
    },
    exhibitNeedsReconfirm(exhibitId: string): boolean {
      const exhibit = this.exhibits.find(item => item.id === exhibitId)
      if (!exhibit) return false
      return exhibit.drafts.some(draft => {
        if (draft.status !== 'approved' || !draft.onlineSnapshotId) return false
        const snapshot = this.versions.find(item => item.id === draft.onlineSnapshotId)
        return Boolean(snapshot && (snapshot.draft.narration !== draft.narration || snapshot.draft.title !== draft.title))
      })
    },
    importOfflineRevision(data: { exhibitId: string; languageId: string; docentName: string; note: string; narration: string; segments: Array<{ label: string; content: string }> }) {
      const now = new Date().toISOString()
      const revision: OfflineRevision = {
        id: `revision-${Date.now()}`,
        exhibitId: data.exhibitId,
        languageId: data.languageId,
        docentName: data.docentName.trim() || '讲解员',
        notedAt: now,
        importedAt: now,
        note: data.note.trim(),
        narration: data.narration,
        segments: data.segments.filter(item => item.content.trim() || item.label.trim()),
        status: 'pending'
      }
      this.commit(() => this.offlineRevisions.unshift(revision))
      this.notice = `已导入「${revision.docentName}」的离线修订，可在下方合并到工作台。`
    },
    mergeOfflineRevision(id: string) {
      const rev = this.offlineRevisions.find(item => item.id === id)
      if (!rev || rev.status !== 'pending') return
      const exhibit = this.exhibits.find(item => item.id === rev.exhibitId)
      if (!exhibit) return
      const lang = LANGUAGES.find(item => item.id === rev.languageId)
      const changes: string[] = []
      this.commit(() => {
        let draft = exhibit.drafts.find(item => item.languageId === rev.languageId)
        if (!draft) {
          const now = new Date().toISOString()
          draft = {
            id: `draft-${exhibit.id}-${rev.languageId}-${now}`,
            languageId: rev.languageId,
            title: '',
            narration: rev.narration,
            accessibility: '',
            durationMinutes: 0,
            sources: '',
            status: 'draft',
            segments: rev.segments.map((item, index) => ({ id: `segment-${now}-${index}`, label: item.label, content: item.content, locked: false })),
            updatedAt: now
          }
          exhibit.drafts.push(draft)
          changes.push(`已新建${lang?.label || ''}文稿`)
        } else {
          changes.push(...mergeRevisionIntoDraft(draft, rev))
        }
        rev.status = 'merged'
        rev.mergedAt = new Date().toISOString()
        rev.mergeNote = changes.length ? changes.join('；') : '无可合并内容'
      })
      this.notice = `已合并离线修订：${changes.join('；') || '无变更'}。已定稿段落保持不动。`
    },
    keepOfflineRevision(id: string) {
      const rev = this.offlineRevisions.find(item => item.id === id)
      if (!rev || rev.status !== 'pending') return
      this.commit(() => { rev.status = 'kept' })
      this.notice = '已保留该离线修订，不合并到工作台。'
    },
    mergeAllPending() {
      const pending = this.offlineRevisions.filter(rev => rev.status === 'pending')
      if (!pending.length) return
      for (const rev of pending) this.mergeOfflineRevision(rev.id)
    },
    completionFor(exhibit: Exhibit, languageId: string): number {
      const draft = exhibit.drafts.find(item => item.languageId === languageId)
      if (!draft) return 0
      const checks = [draft.title, draft.narration, draft.accessibility, draft.sources, draft.segments.length > 0 ? 'segments' : '']
      return Math.round(checks.filter(Boolean).length / checks.length * 100)
    }
  }
})
