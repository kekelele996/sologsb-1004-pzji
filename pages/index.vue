<script setup lang="ts">
import type { DeviceKind, DiffLine, Exhibit, LanguageDraft, ReconcileItem, Screen, ScriptStatus, Segment } from '~/types'
import { LANGUAGES, SCREEN_KINDS, useScriptStore } from '~/stores/script'

const store = useScriptStore()
const activeTab = ref('editor')
const device = ref<DeviceKind>('desktop')
const versionDialog = ref(false)
const versionName = ref('')
const leftFilter = ref('')
const compareA = ref('')
const compareB = ref('')
const helpDialog = ref(false)
const deleteTarget = ref<string | null>(null)

const screenDialog = ref(false)
const screenForm = ref<{ id: string | null; name: string; location: string; kind: Screen['kind']; online: boolean }>({ id: null, name: '', location: '', kind: 'kiosk', online: true })
const importDialog = ref(false)
const importForm = ref<{ exhibitId: string; languageId: string; docentName: string; note: string; narration: string; segments: Array<{ label: string; content: string }> }>({ exhibitId: '', languageId: 'zh', docentName: '', note: '', narration: '', segments: [{ label: '', content: '' }] })
const registerDialog = ref(false)
const registerExhibitId = ref('')
const packageNote = ref('')

const statusOptions: Array<{ value: ScriptStatus; label: string; color: string }> = [
  { value: 'draft', label: '草稿', color: 'grey' },
  { value: 'review', label: '待审', color: 'warning' },
  { value: 'returned', label: '退回', color: 'error' },
  { value: 'approved', label: '已定稿', color: 'success' }
]
const deviceOptions: Array<{ value: DeviceKind; label: string }> = [
  { value: 'desktop', label: '桌面大屏' },
  { value: 'tablet', label: '平板导览' },
  { value: 'mobile', label: '手机导览' },
  { value: 'kiosk', label: '馆内触摸屏' }
]

const draft = computed(() => store.selectedDraft)
const exhibit = computed(() => store.selectedExhibit)
const currentLanguage = computed(() => LANGUAGES.find(item => item.id === store.selectedLanguageId))
const currentStatus = computed(() => statusOptions.find(item => item.value === draft.value?.status) || statusOptions[0])
const filteredExhibits = computed(() => store.hallExhibits.filter(item => !leftFilter.value || `${item.code} ${item.title}`.toLowerCase().includes(leftFilter.value.toLowerCase())))
const versions = computed(() => store.versions.filter(item => item.exhibitId === store.selectedExhibitId && item.languageId === store.selectedLanguageId))
const selectedVersionA = computed(() => versions.value.find(item => item.id === compareA.value))
const selectedVersionB = computed(() => versions.value.find(item => item.id === compareB.value))
const diffLines = computed<DiffLine[]>(() => {
  const before = selectedVersionA.value?.draft.narration || ''
  const after = selectedVersionB.value?.draft.narration || ''
  return buildDiff(before, after)
})

const hallScreens = computed(() => store.hallScreens)
const packages = computed(() => store.selectedHallPackages)
const reconcileItems = computed(() => store.reconcileItems)
const reconcileSummary = computed(() => store.reconcileSummary)
const pendingRevisions = computed(() => store.pendingRevisions)
const processedRevisions = computed(() => store.processedRevisions)
const registerExhibit = computed(() => store.exhibits.find(item => item.id === registerExhibitId.value))
const reconcileByExhibit = computed(() => {
  const map = new Map<string, { exhibit: Exhibit; items: ReconcileItem[] }>()
  for (const item of reconcileItems.value) {
    if (!map.has(item.exhibitId)) {
      const exhibit = store.exhibits.find(entry => entry.id === item.exhibitId)
      if (exhibit) map.set(item.exhibitId, { exhibit, items: [] })
    }
    map.get(item.exhibitId)?.items.push(item)
  }
  return Array.from(map.values())
})
const isWorkspaceTab = computed(() => !['deploy', 'revisions', 'reconcile'].includes(activeTab.value))

onMounted(() => {
  store.hydrate()
  syncCompareSelection()
  window.addEventListener('keydown', handleKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
watch(versions, syncCompareSelection)

function syncCompareSelection() {
  if (!versions.value.some(item => item.id === compareA.value)) compareA.value = versions.value[1]?.id || versions.value[0]?.id || ''
  if (!versions.value.some(item => item.id === compareB.value)) compareB.value = versions.value[0]?.id || ''
}
function handleKeydown(event: KeyboardEvent) {
  const modifier = event.metaKey || event.ctrlKey
  if (!modifier) return
  if (event.key.toLowerCase() === 'z') {
    event.preventDefault()
    event.shiftKey ? store.redo() : store.undo()
  }
  if (event.key.toLowerCase() === 'y') {
    event.preventDefault()
    store.redo()
  }
  if (event.key.toLowerCase() === 's') {
    event.preventDefault()
    store.createVersion('键盘快捷保存')
  }
}
function saveDraftField(field: 'title' | 'narration' | 'accessibility' | 'durationMinutes' | 'sources', event: Event) {
  const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value
  store.updateDraft({ [field]: field === 'durationMinutes' ? Number(value) : value } as Partial<LanguageDraft>)
}
function saveSegment(id: string, field: 'label' | 'content', event: Event) {
  store.updateSegment(id, { [field]: (event.target as HTMLInputElement | HTMLTextAreaElement).value })
}
function submitVersion() {
  store.createVersion(versionName.value.trim() || undefined)
  versionName.value = ''
  versionDialog.value = false
}
function confirmDelete() {
  if (deleteTarget.value) store.removeSegment(deleteTarget.value)
  deleteTarget.value = null
}
function buildDiff(before: string, after: string): DiffLine[] {
  const a = before.split(/(?<=[。！？.!?])\s*/).filter(Boolean)
  const b = after.split(/(?<=[。！？.!?])\s*/).filter(Boolean)
  const rows = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) rows[i][j] = a[i] === b[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1])
  }
  const result: DiffLine[] = []
  let i = 0, j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { result.push({ type: 'same', text: a[i] }); i++; j++ }
    else if (rows[i + 1][j] >= rows[i][j + 1]) { result.push({ type: 'remove', text: a[i] }); i++ }
    else { result.push({ type: 'add', text: b[j] }); j++ }
  }
  while (i < a.length) result.push({ type: 'remove', text: a[i++] })
  while (j < b.length) result.push({ type: 'add', text: b[j++] })
  return result
}
function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}
function segmentLabel(segment: Segment) { return segment.label || '未命名段落' }

function openAddScreen() {
  screenForm.value = { id: null, name: '', location: '', kind: 'kiosk', online: true }
  screenDialog.value = true
}
function openEditScreen(screen: Screen) {
  screenForm.value = { id: screen.id, name: screen.name, location: screen.location, kind: screen.kind, online: screen.online }
  screenDialog.value = true
}
function submitScreen() {
  if (screenForm.value.id) store.updateScreen(screenForm.value.id, { name: screenForm.value.name, location: screenForm.value.location, kind: screenForm.value.kind, online: screenForm.value.online })
  else store.addScreen({ name: screenForm.value.name, location: screenForm.value.location, kind: screenForm.value.kind, online: screenForm.value.online })
  screenDialog.value = false
}
function openRegister(exhibitId: string) {
  registerExhibitId.value = exhibitId
  registerDialog.value = true
}
function submitGeneratePackage() {
  if (!store.selectedHallId) return
  store.generatePackage(store.selectedHallId, packageNote.value)
  packageNote.value = ''
}
function submitReconfirm() {
  if (!store.selectedHallId) return
  store.reconfirmAndDeploy(store.selectedHallId)
}
function openImportDialog() {
  importForm.value = {
    exhibitId: store.selectedExhibitId || store.hallExhibits[0]?.id || '',
    languageId: store.selectedLanguageId || 'zh',
    docentName: '', note: '', narration: '',
    segments: [{ label: '', content: '' }]
  }
  importDialog.value = true
}
function addImportSegment() {
  importForm.value.segments.push({ label: '', content: '' })
}
function removeImportSegment(index: number) {
  importForm.value.segments.splice(index, 1)
}
function submitImport() {
  if (!importForm.value.exhibitId) return
  store.importOfflineRevision({
    exhibitId: importForm.value.exhibitId,
    languageId: importForm.value.languageId,
    docentName: importForm.value.docentName,
    note: importForm.value.note,
    narration: importForm.value.narration,
    segments: importForm.value.segments
  })
  importDialog.value = false
}
function revisionExhibitTitle(exhibitId: string) {
  return store.exhibits.find(item => item.id === exhibitId)?.title || '未知展项'
}
function revisionLanguageLabel(languageId: string) {
  return LANGUAGES.find(item => item.id === languageId)?.label || languageId
}
function reconcileColor(severity: ReconcileItem['severity']) {
  return ({ error: 'error', warning: 'warning', info: 'info' })[severity]
}
function reconcileIcon(type: ReconcileItem['type']) {
  return ({
    'never-synced': 'mdi-cloud-off-outline',
    'outdated': 'mdi-update',
    'content-changed': 'mdi-file-refresh-outline',
    'no-screen': 'mdi-monitor-off',
    'not-approved': 'mdi-lock-outline'
  })[type]
}
function screenStatus(screen: Screen) {
  if (!screen.online) return { label: '离线', color: 'grey' }
  if (screen.lastSyncedAt) return { label: '已同步', color: 'success' }
  return { label: '未同步', color: 'warning' }
}
</script>

<template>
  <v-app class="workspace-shell">
    <a class="skip-link" href="#main-workspace">跳到主要内容</a>
    <v-app-bar color="surface" flat border>
      <template #prepend><v-app-bar-nav-icon aria-label="打开项目导航" /></template>
      <v-app-bar-title>
        <span class="project-mark">博物声</span>
        <span class="text-caption text-medium-emphasis ms-3 d-none d-md-inline">展陈脚本工作台</span>
      </v-app-bar-title>
      <v-spacer />
      <v-chip class="me-2 d-none d-sm-flex" :color="currentStatus.color" variant="tonal" size="small">
        <span class="status-dot" :style="{ background: 'currentColor' }" />{{ currentStatus.label }}
      </v-chip>
      <v-btn variant="text" prepend-icon="mdi-keyboard-outline" class="d-none d-md-flex" @click="helpDialog = true">快捷键</v-btn>
      <v-btn color="primary" prepend-icon="mdi-content-save-outline" @click="versionDialog = true">保存版本</v-btn>
    </v-app-bar>

    <v-navigation-drawer permanent width="320" color="surface" border>
      <div class="pa-4">
        <div class="section-title mb-2">展厅</div>
        <v-select
          :model-value="store.selectedHallId"
          :items="store.halls"
          item-title="name"
          item-value="id"
          hide-details
          aria-label="选择展厅"
          @update:model-value="store.selectHall"
        />
        <div class="d-flex align-center justify-space-between mt-5 mb-2">
          <div class="section-title">展项</div>
          <v-chip size="x-small" variant="tonal">{{ filteredExhibits.length }} 项</v-chip>
        </div>
        <v-text-field v-model="leftFilter" density="compact" hide-details prepend-inner-icon="mdi-magnify" placeholder="筛选展项" aria-label="筛选展项" />
        <v-list class="mt-2 bg-transparent" nav>
          <v-list-item
            v-for="item in filteredExhibits"
            :key="item.id"
            :active="item.id === store.selectedExhibitId"
            color="primary"
            rounded="lg"
            @click="store.selectExhibit(item.id)"
          >
            <template #prepend><v-chip size="small" variant="outlined">{{ item.code }}</v-chip></template>
            <v-list-item-title class="font-weight-medium">{{ item.title }}</v-list-item-title>
            <v-list-item-subtitle>{{ item.drafts.length }} 种语言</v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </div>
      <v-divider />
      <div class="pa-4">
        <div class="section-title mb-3">多语言完成度</div>
        <div v-for="lang in LANGUAGES" :key="lang.id" class="mb-3">
          <button class="d-flex align-center w-100 border-0 bg-transparent text-left pa-0" :aria-pressed="lang.id === store.selectedLanguageId" @click="store.selectLanguage(lang.id)">
            <v-avatar size="32" :color="lang.id === store.selectedLanguageId ? 'primary' : 'grey-lighten-2'" :class="lang.id === store.selectedLanguageId ? 'text-white' : ''">{{ lang.shortLabel }}</v-avatar>
            <div class="ms-3 flex-grow-1">
              <div class="text-body-2 font-weight-medium">{{ lang.label }}</div>
              <v-progress-linear class="mt-1" :model-value="exhibit ? store.completionFor(exhibit, lang.id) : 0" :color="lang.id === store.selectedLanguageId ? 'primary' : 'secondary'" height="5" rounded />
            </div>
            <span class="text-caption ms-3">{{ exhibit ? store.completionFor(exhibit, lang.id) : 0 }}%</span>
          </button>
        </div>
      </div>
    </v-navigation-drawer>

    <v-main id="main-workspace" style="background:#f4f0e8">
      <div class="pa-3 pa-md-6">
        <div class="d-flex flex-wrap align-start justify-space-between ga-4 mb-5">
          <div>
            <div class="text-caption text-medium-emphasis mb-1">{{ store.selectedHall?.name }} / {{ exhibit?.code }}</div>
            <h1 class="text-h4 font-weight-bold project-mark">{{ exhibit?.title || '请选择展项' }}</h1>
            <div class="text-body-2 text-medium-emphasis mt-2">
              当前语言：{{ currentLanguage?.label }} ·
              {{ draft?.updatedAt ? `最后更新 ${formatTime(draft.updatedAt)}` : '尚未建立文稿' }}
            </div>
          </div>
          <div class="d-flex ga-2">
            <v-btn variant="outlined" prepend-icon="mdi-undo" :disabled="!store.canUndo" @click="store.undo">撤销</v-btn>
            <v-btn variant="outlined" prepend-icon="mdi-redo" :disabled="!store.canRedo" @click="store.redo">重做</v-btn>
            <v-btn variant="outlined" prepend-icon="mdi-history" @click="activeTab = 'versions'">版本</v-btn>
          </div>
        </div>

        <v-alert v-if="store.notice" class="mb-4" color="secondary" variant="tonal" closable @click:close="store.notice = ''">{{ store.notice }}</v-alert>

        <v-tabs v-model="activeTab" color="primary" bg-color="surface" rounded="lg" class="mb-4 px-2">
          <v-tab value="editor">脚本编辑</v-tab>
          <v-tab value="versions">版本比较</v-tab>
          <v-tab value="preview">设备预览</v-tab>
          <v-tab value="sources">资料核对</v-tab>
          <v-tab value="deploy">
            <span class="d-flex align-center ga-1">
              <v-icon start size="small">mdi-monitor-share</v-icon>屏幕下发
            </span>
          </v-tab>
          <v-tab value="revisions">
            <span class="d-flex align-center ga-1">
              <v-icon start size="small">mdi-tablet-cellphone</v-icon>离线修订
              <v-badge v-if="pendingRevisions.length" :content="pendingRevisions.length" color="primary" inline />
            </span>
          </v-tab>
          <v-tab value="reconcile">
            <span class="d-flex align-center ga-1">
              <v-icon start size="small">mdi-clipboard-check-outline</v-icon>屏幕对账
              <v-badge v-if="reconcileSummary.total" :content="reconcileSummary.total" :color="reconcileSummary.errors ? 'error' : 'warning'" inline />
            </span>
          </v-tab>
        </v-tabs>

        <div v-if="draft">
          <v-window v-model="activeTab" :touch="false">
            <v-window-item value="editor">
              <v-row>
                <v-col cols="12" lg="8">
                  <v-card class="script-card pa-4 pa-md-6">
                    <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-5">
                      <div>
                        <div class="section-title">当前文稿</div>
                        <div class="text-h6 font-weight-bold mt-1">{{ currentLanguage?.label }}</div>
                      </div>
                      <div class="d-flex flex-wrap ga-2">
                        <v-select
                          :model-value="draft.status"
                          :items="statusOptions"
                          item-title="label"
                          item-value="value"
                          label="审校状态"
                          hide-details
                          style="min-width:150px"
                          @update:model-value="store.setStatus"
                        />
                        <v-btn color="primary" variant="tonal" prepend-icon="mdi-plus" @click="store.addSegment">新增段落</v-btn>
                      </div>
                    </div>

                    <v-text-field label="展项标题" :model-value="draft.title" hint="面向观众的主标题" persistent-hint @change="saveDraftField('title', $event)" />
                    <v-row class="mt-2">
                      <v-col cols="12" md="5">
                        <v-text-field label="预计朗读时长（分钟）" type="number" min="0" step="0.5" :model-value="draft.durationMinutes" @change="saveDraftField('durationMinutes', $event)" />
                      </v-col>
                      <v-col cols="12" md="7">
                        <v-text-field label="资料来源" :model-value="draft.sources" hint="书籍、档案号或专家核验记录" persistent-hint @change="saveDraftField('sources', $event)" />
                      </v-col>
                    </v-row>

                    <div class="section-title mt-6 mb-2">完整讲解词</div>
                    <v-textarea label="讲解词" rows="7" auto-grow counter :model-value="draft.narration" @change="saveDraftField('narration', $event)" />

                    <div class="section-title mt-6 mb-2">无障碍描述</div>
                    <v-textarea label="无障碍描述" rows="4" auto-grow hint="描述尺寸、材质、色彩与可触摸特征，避免只依赖视觉" persistent-hint :model-value="draft.accessibility" @change="saveDraftField('accessibility', $event)" />
                  </v-card>

                  <v-card class="script-card pa-4 pa-md-6 mt-5">
                    <div class="d-flex align-center justify-space-between mb-4">
                      <div>
                        <div class="section-title">分段校对</div>
                        <div class="text-body-2 text-medium-emphasis mt-1">锁定段落不会被编辑；可在撤销中恢复。</div>
                      </div>
                      <v-chip variant="tonal">{{ draft.segments.filter(item => item.locked).length }}/{{ draft.segments.length }} 已锁定</v-chip>
                    </div>
                    <div class="d-flex flex-column ga-3">
                      <div v-for="(segment, index) in draft.segments" :key="segment.id" class="segment-row" :class="{ locked: segment.locked }">
                        <div class="d-flex align-center ga-2">
                          <v-btn icon size="small" variant="text" :aria-label="segment.locked ? '解锁段落' : '锁定段落'" @click="store.toggleLock(segment.id)">
                            {{ segment.locked ? '🔒' : '🔓' }}
                          </v-btn>
                          <v-text-field :model-value="segment.label" density="compact" hide-details variant="plain" :readonly="segment.locked" :aria-label="`第 ${index + 1} 段标题`" @change="saveSegment(segment.id, 'label', $event)" />
                          <v-chip v-if="segment.locked" color="success" size="small" variant="tonal">已确认</v-chip>
                          <v-btn icon="mdi-delete-outline" size="small" variant="text" color="error" :disabled="segment.locked" :aria-label="`删除第 ${index + 1} 段`" @click="deleteTarget = segment.id" />
                        </div>
                        <v-textarea class="mt-2" :model-value="segment.content" rows="2" auto-grow hide-details :readonly="segment.locked" :aria-label="segmentLabel(segment)" @change="saveSegment(segment.id, 'content', $event)" />
                      </div>
                    </div>
                  </v-card>
                </v-col>

                <v-col cols="12" lg="4">
                  <v-card class="script-card pa-5">
                    <div class="section-title mb-4">同展项语言进度</div>
                    <div v-for="lang in LANGUAGES" :key="lang.id" class="d-flex align-center ga-3 mb-4">
                      <v-progress-circular :model-value="store.completionFor(exhibit!, lang.id)" size="52" width="5" :color="lang.id === store.selectedLanguageId ? 'primary' : 'secondary'">
                        {{ store.completionFor(exhibit!, lang.id) }}
                      </v-progress-circular>
                      <div class="flex-grow-1">
                        <div class="font-weight-medium">{{ lang.label }}</div>
                        <div class="text-caption text-medium-emphasis">
                          {{ exhibit?.drafts.find(item => item.languageId === lang.id) ? store.statusLabel(exhibit!.drafts.find(item => item.languageId === lang.id)!.status) : '尚未创建' }}
                        </div>
                      </div>
                      <v-btn size="small" variant="text" :disabled="lang.id === store.selectedLanguageId" @click="store.selectLanguage(lang.id)">切换</v-btn>
                    </div>
                  </v-card>
                  <v-card class="script-card pa-5 mt-5">
                    <div class="section-title mb-3">审校检查</div>
                    <v-list density="compact" class="bg-transparent">
                      <v-list-item :prepend-icon="draft.narration.length > 80 ? 'mdi-check-circle' : 'mdi-alert-circle'" :title="`讲解词 ${draft.narration.length} 字`" />
                      <v-list-item :prepend-icon="draft.accessibility.length > 30 ? 'mdi-check-circle' : 'mdi-alert-circle'" :title="`无障碍描述 ${draft.accessibility.length} 字`" />
                      <v-list-item :prepend-icon="draft.sources ? 'mdi-check-circle' : 'mdi-alert-circle'" :title="draft.sources ? '资料来源已填写' : '缺少资料来源'" />
                    </v-list>
                    <v-alert class="mt-3" type="info" variant="tonal" density="compact">
                      估算语速约 {{ Math.max(1, Math.round(draft.narration.length / 220 * 10) / 10) }} 分钟，请与目标时长核对。
                    </v-alert>
                  </v-card>
                </v-col>
              </v-row>
            </v-window-item>

            <v-window-item value="versions">
              <v-card class="script-card pa-4 pa-md-6">
                <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-5">
                  <div>
                    <div class="section-title">版本比较</div>
                    <div class="text-h6 font-weight-bold mt-1">选择同一展项、同一语言的两个快照</div>
                  </div>
                  <v-btn color="primary" prepend-icon="mdi-content-save-plus-outline" @click="versionDialog = true">保存当前版本</v-btn>
                </div>
                <v-alert v-if="versions.length < 2" type="info" variant="tonal">至少保存两个版本后即可比较。当前有 {{ versions.length }} 个版本。</v-alert>
                <template v-else>
                  <v-row>
                    <v-col cols="12" md="6"><v-select v-model="compareA" :items="versions" item-title="name" item-value="id" label="基准版本" /></v-col>
                    <v-col cols="12" md="6"><v-select v-model="compareB" :items="versions" item-title="name" item-value="id" label="目标版本" /></v-col>
                  </v-row>
                  <div class="d-flex ga-4 text-caption text-medium-emphasis mb-2">
                    <span><span class="status-dot" style="background:#9b2c25" /> 删除</span>
                    <span><span class="status-dot" style="background:#2f6b45" /> 新增</span>
                  </div>
                  <div class="rounded-lg border pa-3 bg-white">
                    <p v-for="(line, index) in diffLines" :key="index" class="diff-line" :class="`diff-${line.type}`">{{ line.text }}</p>
                    <div v-if="!diffLines.length" class="text-medium-emphasis pa-4">所选版本内容一致。</div>
                  </div>
                  <v-list class="mt-4 bg-transparent">
                    <v-list-item v-for="version in versions" :key="version.id" :title="version.name" :subtitle="formatTime(version.createdAt)">
                      <template #append><v-btn variant="outlined" size="small" @click="store.restoreVersion(version.id)">恢复此版</v-btn></template>
                    </v-list-item>
                  </v-list>
                </template>
              </v-card>
            </v-window-item>

            <v-window-item value="preview">
              <v-card class="script-card pa-4 pa-md-6">
                <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-5">
                  <div>
                    <div class="section-title">设备排版预览</div>
                    <div class="text-h6 font-weight-bold mt-1">以展项实际阅读顺序预览</div>
                  </div>
                  <v-btn-toggle v-model="device" mandatory variant="outlined" divided>
                    <v-btn v-for="item in deviceOptions" :key="item.value" :value="item.value">{{ item.label }}</v-btn>
                  </v-btn-toggle>
                </div>
                <div class="preview-frame" :class="device">
                  <div class="preview-content">
                    <div class="text-overline text-medium-emphasis">{{ exhibit?.code }} · {{ currentLanguage?.label }}</div>
                    <h2 class="text-h4 font-weight-bold mt-2">{{ draft.title }}</h2>
                    <p class="text-body-1 mt-6" style="line-height:1.9;white-space:pre-wrap">{{ draft.narration }}</p>
                    <v-divider class="my-6" />
                    <div class="section-title">无障碍描述</div>
                    <p class="text-body-2 mt-2" style="line-height:1.8;white-space:pre-wrap">{{ draft.accessibility }}</p>
                    <div class="mt-7 text-caption text-medium-emphasis">预计讲解 {{ draft.durationMinutes }} 分钟</div>
                  </div>
                </div>
              </v-card>
            </v-window-item>

            <v-window-item value="sources">
              <v-row>
                <v-col cols="12" md="7">
                  <v-card class="script-card pa-5">
                    <div class="section-title mb-3">来源与核验记录</div>
                    <v-textarea :model-value="draft.sources" rows="8" @change="saveDraftField('sources', $event)" />
                    <v-alert class="mt-4" type="warning" variant="tonal">发布前请由内容负责人逐条核对来源。当前无障碍描述与实物尺寸需由教育部门复核。</v-alert>
                  </v-card>
                </v-col>
                <v-col cols="12" md="5">
                  <v-card class="script-card pa-5">
                    <div class="section-title mb-3">段落锁定概况</div>
                    <v-timeline density="compact" side="end">
                      <v-timeline-item v-for="segment in draft.segments" :key="segment.id" :dot-color="segment.locked ? 'success' : 'grey'" size="small">
                        <div class="font-weight-medium">{{ segment.label }}</div>
                        <div class="text-caption text-medium-emphasis">{{ segment.locked ? '已锁定，审校确认' : '编辑中' }}</div>
                      </v-timeline-item>
                    </v-timeline>
                  </v-card>
                </v-col>
              </v-row>
            </v-window-item>
          </v-window>
        </div>
        <v-empty-state v-else-if="isWorkspaceTab" icon="mdi-script-text-outline" title="尚未选择展项" text="请从左侧选择一个展厅和展项。" />

        <v-window v-model="activeTab" :touch="false">
          <v-window-item value="deploy">
            <v-row>
              <v-col cols="12" lg="5">
                <v-card class="script-card pa-4 pa-md-5">
                  <div class="d-flex align-center justify-space-between mb-3">
                    <div>
                      <div class="section-title">屏幕管理</div>
                      <div class="text-h6 font-weight-bold mt-1">{{ store.selectedHall?.name }}</div>
                    </div>
                    <v-btn color="primary" variant="tonal" prepend-icon="mdi-plus" @click="openAddScreen">添加屏幕</v-btn>
                  </div>
                  <v-alert type="info" variant="tonal" density="compact" class="mb-3">屏幕属于当前展厅，下发发布包时会同步到本厅所有屏幕。</v-alert>
                  <div v-if="!hallScreens.length" class="text-medium-emphasis pa-4 text-center">本厅还没有屏幕，点击右上角添加。</div>
                  <v-list v-else density="compact" class="bg-transparent">
                    <v-list-item v-for="screen in hallScreens" :key="screen.id" rounded="lg" class="mb-1">
                      <template #prepend>
                        <v-avatar size="40" :color="screenStatus(screen).color" variant="tonal"><v-icon :icon="screen.kind === 'wall' ? 'mdi-monitor' : screen.kind === 'kiosk' ? 'mdi-tablet-dashboard' : 'mdi-cellphone'" /></v-avatar>
                      </template>
                      <v-list-item-title class="font-weight-medium">{{ screen.name }}</v-list-item-title>
                      <v-list-item-subtitle>{{ screen.location || '未填写位置' }} · {{ store.screenKindLabel(screen.kind) }}</v-list-item-subtitle>
                      <template #append>
                        <v-chip size="small" :color="screenStatus(screen).color" variant="tonal" class="me-2">{{ screenStatus(screen).label }}</v-chip>
                        <v-btn icon size="small" variant="text" aria-label="编辑屏幕" @click="openEditScreen(screen)"><v-icon>mdi-pencil-outline</v-icon></v-btn>
                        <v-btn icon size="small" variant="text" color="error" aria-label="删除屏幕" @click="store.removeScreen(screen.id)"><v-icon>mdi-delete-outline</v-icon></v-btn>
                      </template>
                    </v-list-item>
                  </v-list>
                  <div v-if="hallScreens.length" class="text-caption text-medium-emphasis mt-2">
                    最近同步：{{ hallScreens.map(s => s.lastSyncedAt).filter(Boolean).sort().pop() ? formatTime(hallScreens.map(s => s.lastSyncedAt).filter(Boolean).sort().pop()!) : '从未同步' }}
                  </div>
                </v-card>
              </v-col>

              <v-col cols="12" lg="7">
                <v-card class="script-card pa-4 pa-md-5">
                  <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-3">
                    <div>
                      <div class="section-title">发布包</div>
                      <div class="text-h6 font-weight-bold mt-1">按展厅生成，含已定稿稿件</div>
                    </div>
                  </div>
                  <v-row class="mb-3">
                    <v-col cols="12" sm="8">
                      <v-text-field v-model="packageNote" label="发布说明（可选）" hide-details density="compact" placeholder="例如：季度更新、特展上线" />
                    </v-col>
                    <v-col cols="12" sm="4">
                      <v-btn color="primary" prepend-icon="mdi-package-variant-closed" class="w-100" @click="submitGeneratePackage">生成发布包</v-btn>
                    </v-col>
                  </v-row>
                  <v-alert type="warning" variant="tonal" density="compact" class="mb-3">只有「已定稿」的稿件会进入发布包；未定稿稿件会列入排除清单。</v-alert>
                  <div v-if="!packages.length" class="text-medium-emphasis pa-4 text-center">尚未生成发布包。</div>
                  <v-list v-else density="compact" class="bg-transparent">
                    <v-list-item v-for="pkg in packages" :key="pkg.id" rounded="lg" class="mb-2 border">
                      <template #prepend>
                        <v-avatar size="44" :color="pkg.deployedAt ? 'success' : 'grey'" variant="tonal"><v-icon icon="mdi-package-variant" /></v-avatar>
                      </template>
                      <v-list-item-title class="font-weight-medium">{{ pkg.name }}</v-list-item-title>
                      <v-list-item-subtitle>
                        {{ formatTime(pkg.createdAt) }} · {{ pkg.items.length }} 篇稿件
                        <span v-if="pkg.deployedAt"> · 已于 {{ formatTime(pkg.deployedAt) }} 下发</span>
                        <span v-else> · 未下发</span>
                      </v-list-item-subtitle>
                      <template #append>
                        <v-btn v-if="!pkg.deployedAt" color="primary" size="small" variant="tonal" prepend-icon="mdi-send" @click="store.deployPackage(pkg.id)">下发到屏幕</v-btn>
                        <v-chip v-else color="success" size="small" variant="tonal">已下发</v-chip>
                      </template>
                      <div v-if="pkg.excluded.length" class="w-100 mt-2">
                        <div class="text-caption text-medium-emphasis mb-1">未包含（{{ pkg.excluded.length }}）：</div>
                        <v-chip v-for="(ex, i) in pkg.excluded" :key="i" size="x-small" class="me-1 mb-1" variant="outlined">{{ ex.exhibitCode }} · {{ revisionLanguageLabel(ex.languageId) }} · {{ ex.reason }}</v-chip>
                      </div>
                    </v-list-item>
                  </v-list>
                </v-card>
              </v-col>
            </v-row>

            <v-card class="script-card pa-4 pa-md-5 mt-5">
              <div class="d-flex align-center justify-space-between mb-3">
                <div>
                  <div class="section-title">展项投放登记</div>
                  <div class="text-h6 font-weight-bold mt-1">每个展项登记要投放的屏幕</div>
                </div>
              </div>
              <v-list density="compact" class="bg-transparent">
                <v-list-item v-for="exhibit in store.hallExhibits" :key="exhibit.id" rounded="lg" class="mb-1">
                  <template #prepend><v-chip size="small" variant="outlined">{{ exhibit.code }}</v-chip></template>
                  <v-list-item-title class="font-weight-medium">{{ exhibit.title }}</v-list-item-title>
                  <v-list-item-subtitle>
                    <span v-if="!exhibit.screenIds.length" class="text-warning">未登记屏幕</span>
                    <span v-else>已登记 {{ exhibit.screenIds.length }} 块屏幕</span>
                    <span v-if="store.exhibitNeedsReconfirm(exhibit.id)" class="text-warning ms-2">· 中文稿已更新，需重新确认</span>
                  </v-list-item-subtitle>
                  <template #append>
                    <v-btn size="small" variant="outlined" prepend-icon="mdi-monitor-share" @click="openRegister(exhibit.id)">登记屏幕</v-btn>
                  </template>
                </v-list-item>
              </v-list>
            </v-card>
          </v-window-item>

          <v-window-item value="revisions">
            <v-card class="script-card pa-4 pa-md-5 mb-5">
              <div class="d-flex flex-wrap align-center justify-space-between ga-3">
                <div>
                  <div class="section-title">离线修订</div>
                  <div class="text-h6 font-weight-bold mt-1">讲解员平板离线口播修订，回馆合并进工作台</div>
                </div>
                <div class="d-flex ga-2">
                  <v-btn variant="outlined" prepend-icon="mdi-tablet-cellphone" @click="openImportDialog">导入离线修订</v-btn>
                  <v-btn color="primary" prepend-icon="mdi-connection" :disabled="!pendingRevisions.length" @click="store.mergeAllPending()">全部合并</v-btn>
                </div>
              </div>
              <v-alert type="info" variant="tonal" density="compact" class="mt-3">合并时已定稿段落保持不动；同一展项的多份修订都会保留为独立记录，不会互相覆盖。</v-alert>
            </v-card>

            <div v-if="!pendingRevisions.length" class="text-medium-emphasis pa-4 text-center mb-5">没有待合并的离线修订。</div>
            <v-row>
              <v-col v-for="rev in pendingRevisions" :key="rev.id" cols="12" lg="6">
                <v-card class="script-card pa-4 pa-md-5 h-100">
                  <div class="d-flex align-center justify-space-between mb-2">
                    <div class="d-flex align-center ga-2">
                      <v-avatar size="36" color="primary" variant="tonal">{{ rev.docentName.slice(0, 1) }}</v-avatar>
                      <div>
                        <div class="font-weight-medium">{{ rev.docentName }}</div>
                        <div class="text-caption text-medium-emphasis">{{ formatTime(rev.notedAt) }} 记录</div>
                      </div>
                    </div>
                    <v-chip size="small" color="warning" variant="tonal">待合并</v-chip>
                  </div>
                  <div class="text-body-2 mb-2">
                    <span class="text-medium-emphasis">展项：</span>{{ revisionExhibitTitle(rev.exhibitId) }} · {{ revisionLanguageLabel(rev.languageId) }}
                  </div>
                  <div v-if="rev.note" class="text-body-2 text-medium-emphasis mb-2">备注：{{ rev.note }}</div>
                  <div v-if="rev.narration" class="rounded-lg bg-grey-lighten-4 pa-3 text-body-2 mb-3" style="white-space:pre-wrap">{{ rev.narration }}</div>
                  <div v-if="rev.segments.length" class="mb-3">
                    <div class="text-caption text-medium-emphasis mb-1">修订段落（{{ rev.segments.length }}）：</div>
                    <v-chip v-for="(seg, i) in rev.segments" :key="i" size="small" class="me-1 mb-1" variant="outlined">{{ seg.label || '未命名' }}</v-chip>
                  </div>
                  <div class="d-flex ga-2">
                    <v-btn color="primary" size="small" prepend-icon="mdi-connection" @click="store.mergeOfflineRevision(rev.id)">合并到工作台</v-btn>
                    <v-btn size="small" variant="text" @click="store.keepOfflineRevision(rev.id)">保留不合并</v-btn>
                  </div>
                </v-card>
              </v-col>
            </v-row>

            <div v-if="processedRevisions.length" class="mt-5">
              <div class="section-title mb-2">已处理记录</div>
              <v-list density="compact" class="bg-transparent">
                <v-list-item v-for="rev in processedRevisions" :key="rev.id" rounded="lg" class="mb-1">
                  <template #prepend>
                    <v-avatar size="36" :color="rev.status === 'merged' ? 'success' : 'grey'" variant="tonal"><v-icon :icon="rev.status === 'merged' ? 'mdi-check' : 'mdi-pin-outline'" /></v-avatar>
                  </template>
                  <v-list-item-title class="font-weight-medium">{{ rev.docentName }} · {{ revisionExhibitTitle(rev.exhibitId) }} · {{ revisionLanguageLabel(rev.languageId) }}</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ formatTime(rev.notedAt) }} 记录 · {{ rev.status === 'merged' ? '已合并' : '已保留' }}
                    <span v-if="rev.mergeNote"> · {{ rev.mergeNote }}</span>
                  </v-list-item-subtitle>
                </v-list-item>
              </v-list>
            </div>
          </v-window-item>

          <v-window-item value="reconcile">
            <v-card class="script-card pa-4 pa-md-5 mb-5">
              <div class="d-flex flex-wrap align-center justify-space-between ga-3">
                <div>
                  <div class="section-title">屏幕对账</div>
                  <div class="text-h6 font-weight-bold mt-1">屏幕缓存与工作台逐条核对</div>
                </div>
                <v-btn color="primary" prepend-icon="mdi-refresh" @click="submitReconfirm">重新确认并下发</v-btn>
              </div>
              <div class="d-flex ga-2 mt-3">
                <v-chip variant="tonal" :color="reconcileSummary.errors ? 'error' : 'success'">{{ reconcileSummary.errors }} 处不一致</v-chip>
                <v-chip variant="tonal" :color="reconcileSummary.warnings ? 'warning' : 'default'">{{ reconcileSummary.warnings }} 项待确认</v-chip>
                <v-chip variant="tonal" :color="reconcileSummary.infos ? 'info' : 'default'">{{ reconcileSummary.infos }} 项提示</v-chip>
              </div>
              <v-alert type="info" variant="tonal" density="compact" class="mt-3">中文稿一旦更新，已上线的展项需重新确认后下发；屏幕缓存落后或从未同步的展项会逐条列出。</v-alert>
            </v-card>

            <div v-if="!reconcileByExhibit.length" class="text-medium-emphasis pa-4 text-center">所有展项的屏幕缓存与工作台一致，无需对账。</div>
            <v-row>
              <v-col v-for="group in reconcileByExhibit" :key="group.exhibit.id" cols="12" lg="6">
                <v-card class="script-card pa-4 pa-md-5 h-100">
                  <div class="d-flex align-center ga-2 mb-3">
                    <v-chip size="small" variant="outlined">{{ group.exhibit.code }}</v-chip>
                    <div class="font-weight-medium">{{ group.exhibit.title }}</div>
                  </div>
                  <v-list density="compact" class="bg-transparent">
                    <v-list-item v-for="(item, i) in group.items" :key="i" rounded="lg" class="mb-1" :color="reconcileColor(item.severity)" variant="tonal">
                      <template #prepend><v-icon :icon="reconcileIcon(item.type)" /></template>
                      <v-list-item-title class="text-body-2">{{ item.message }}</v-list-item-title>
                      <v-list-item-subtitle v-if="item.screenName || item.languageLabel">
                        <span v-if="item.screenName">{{ item.screenName }}</span>
                        <span v-if="item.screenName && item.languageLabel"> · </span>
                        <span v-if="item.languageLabel">{{ item.languageLabel }}</span>
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-list>
                </v-card>
              </v-col>
            </v-row>
          </v-window-item>
        </v-window>
      </div>
    </v-main>

    <v-dialog v-model="versionDialog" max-width="520">
      <v-card class="pa-3">
        <v-card-title>保存版本快照</v-card-title>
        <v-card-text>
          <p class="mb-4 text-medium-emphasis">将当前“{{ draft?.title }}”的完整内容和锁定状态保存为只读版本。</p>
          <v-text-field v-model="versionName" label="版本名称（可选）" autofocus @keyup.enter="submitVersion" />
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn @click="versionDialog = false">取消</v-btn><v-btn color="primary" @click="submitVersion">保存快照</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="Boolean(deleteTarget)" max-width="440" @update:model-value="deleteTarget = null">
      <v-card class="pa-3">
        <v-card-title>删除这个段落？</v-card-title>
        <v-card-text>删除后可使用撤销恢复。</v-card-text>
        <v-card-actions><v-spacer /><v-btn @click="deleteTarget = null">取消</v-btn><v-btn color="error" @click="confirmDelete">删除</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="helpDialog" max-width="520">
      <v-card class="pa-3">
        <v-card-title>键盘操作</v-card-title>
        <v-card-text>
          <v-list>
            <v-list-item prepend-icon="mdi-apple-keyboard-command" title="Ctrl / ⌘ + Z" subtitle="撤销上一步编辑" />
            <v-list-item prepend-icon="mdi-redo" title="Ctrl / ⌘ + Shift + Z" subtitle="重做" />
            <v-list-item prepend-icon="mdi-content-save-outline" title="Ctrl / ⌘ + S" subtitle="保存当前版本快照" />
            <v-list-item prepend-icon="mdi-keyboard-tab" title="Tab / Shift + Tab" subtitle="在字段、状态与段落操作之间移动" />
          </v-list>
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn color="primary" @click="helpDialog = false">知道了</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="Boolean(store.notice)" timeout="2600" location="bottom right" @update:model-value="store.notice = ''">
      {{ store.notice }}
      <template #actions><v-btn variant="text" @click="store.notice = ''">关闭</v-btn></template>
    </v-snackbar>

    <v-dialog v-model="screenDialog" max-width="480">
      <v-card class="pa-3">
        <v-card-title>{{ screenForm.id ? '编辑屏幕' : '添加屏幕' }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="screenForm.name" label="屏幕名称" class="mb-3" placeholder="例如：序厅触摸屏" />
          <v-text-field v-model="screenForm.location" label="安装位置" class="mb-3" placeholder="例如：序厅东侧" />
          <v-select v-model="screenForm.kind" :items="SCREEN_KINDS" item-title="label" item-value="value" label="屏幕类型" class="mb-3" />
          <v-switch v-model="screenForm.online" label="当前在线" color="success" hide-details />
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn @click="screenDialog = false">取消</v-btn><v-btn color="primary" @click="submitScreen">保存</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="importDialog" max-width="620">
      <v-card class="pa-3">
        <v-card-title>导入离线修订</v-card-title>
        <v-card-text>
          <p class="mb-4 text-medium-emphasis">讲解员在平板上离线记录的口播修订，回馆后导入工作台。同一展项的多份修订都会保留。</p>
          <v-row>
            <v-col cols="12" sm="6">
              <v-select v-model="importForm.exhibitId" :items="store.hallExhibits" item-title="title" item-value="id" label="展项" hide-details />
            </v-col>
            <v-col cols="12" sm="6">
              <v-select v-model="importForm.languageId" :items="LANGUAGES" item-title="label" item-value="id" label="语言" hide-details />
            </v-col>
          </v-row>
          <v-text-field v-model="importForm.docentName" label="讲解员姓名" class="mt-3" placeholder="例如：王讲解员" />
          <v-text-field v-model="importForm.note" label="修订备注" class="mt-3" placeholder="例如：序厅现场口播修订" />
          <v-textarea v-model="importForm.narration" label="修订后讲解词" rows="3" auto-grow class="mt-3" placeholder="粘贴讲解员离线记录的完整讲解词" />
          <div class="d-flex align-center justify-space-between mt-4 mb-2">
            <div class="section-title">修订段落</div>
            <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="addImportSegment">添加段落</v-btn>
          </div>
          <div v-for="(seg, index) in importForm.segments" :key="index" class="d-flex ga-2 mb-2">
            <v-text-field v-model="seg.label" density="compact" hide-details placeholder="段落标题" style="max-width:140px" />
            <v-text-field v-model="seg.content" density="compact" hide-details placeholder="段落内容" />
            <v-btn icon size="small" variant="text" color="error" aria-label="移除段落" @click="removeImportSegment(index)"><v-icon>mdi-close</v-icon></v-btn>
          </div>
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn @click="importDialog = false">取消</v-btn><v-btn color="primary" @click="submitImport">导入</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="registerDialog" max-width="480">
      <v-card class="pa-3">
        <v-card-title>登记投放屏幕</v-card-title>
        <v-card-text>
          <p class="mb-3 text-medium-emphasis">为「{{ registerExhibit?.title }}」选择要投放的屏幕。</p>
          <v-checkbox
            v-for="screen in hallScreens"
            :key="screen.id"
            :model-value="registerExhibit?.screenIds.includes(screen.id)"
            :label="`${screen.name}（${screen.location || '未填写位置'}）`"
            hide-details
            @update:model-value="store.toggleExhibitScreen(registerExhibitId, screen.id)"
          />
          <div v-if="!hallScreens.length" class="text-medium-emphasis pa-2">本厅还没有屏幕，请先在「屏幕下发」中添加。</div>
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn color="primary" @click="registerDialog = false">完成</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>
