<script setup lang="ts">
import type { OfflineRevision, Segment, SyncState } from '~/types'
import { LANGUAGES, useScriptStore } from '~/stores/script'

const store = useScriptStore()
const subTab = ref('recon')
const showAllRows = ref(false)
const hallFilter = ref<'current' | 'all'>('current')
const revisionDialog = ref(false)
const revForm = ref({ exhibitId: '', languageId: 'zh', author: '', device: '', note: '', narration: '', segments: [] as Segment[] })

const syncMeta: Record<SyncState, { label: string; color: string }> = {
  synced: { label: '一致', color: 'success' },
  'screen-behind': { label: '屏幕待更新', color: 'warning' },
  'needs-reconfirm': { label: '待重新确认', color: 'error' },
  'never-deployed': { label: '未下发', color: 'grey' }
}

const hallRows = computed(() => store.reconciliation.filter(row => hallFilter.value === 'all' || row.hallId === store.selectedHallId))
const visibleRows = computed(() => showAllRows.value ? hallRows.value : hallRows.value.filter(row => row.status !== 'synced'))
const mismatchTotal = computed(() => hallRows.value.filter(row => row.status !== 'synced').length)
const countOf = (status: SyncState) => hallRows.value.filter(row => row.status === status).length
const hallName = (hallId: string) => store.halls.find(hall => hall.id === hallId)?.name || hallId
const exhibitOf = (exhibitId: string) => store.exhibits.find(item => item.id === exhibitId)
const languageLabel = (languageId: string) => LANGUAGES.find(item => item.id === languageId)?.label || languageId
const versionName = (versionId: string) => store.versions.find(item => item.id === versionId)?.name || ''
const shortHash = (hash: string) => hash ? hash.slice(0, 6) : '—'
const formatTime = (value: string) => value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—'

function confirmState(exhibitId: string): { label: string; color: string } {
  const target = store.targetFor(exhibitId)
  const zhDraft = store.zhDraftOf(exhibitId)
  if (!target?.confirmedHash) return { label: '未确认上线', color: 'grey' }
  if (!zhDraft) return { label: '缺少中文稿', color: 'error' }
  return zhDraft && store.hashOfDraft(zhDraft) === target.confirmedHash
    ? { label: '已确认', color: 'success' }
    : { label: '中文稿已改，待重新确认', color: 'error' }
}

function openRevisionDialog() {
  revForm.value = { exhibitId: store.selectedExhibitId || store.exhibits[0]?.id || '', languageId: 'zh', author: '', device: '', note: '', narration: '', segments: [] }
  loadRevisionBase()
  revisionDialog.value = true
}

function loadRevisionBase() {
  const draft = exhibitOf(revForm.value.exhibitId)?.drafts.find(item => item.languageId === revForm.value.languageId)
  revForm.value.narration = draft?.narration || ''
  revForm.value.segments = JSON.parse(JSON.stringify(draft?.segments || [])) as Segment[]
}

function submitRevision() {
  const draft = exhibitOf(revForm.value.exhibitId)?.drafts.find(item => item.languageId === revForm.value.languageId)
  if (!draft) {
    store.notice = '该展项还没有对应语言的稿件，无法记录修订。'
    return
  }
  store.importRevision({
    exhibitId: revForm.value.exhibitId,
    languageId: revForm.value.languageId,
    author: revForm.value.author.trim() || '未署名讲解员',
    device: revForm.value.device.trim() || '平板',
    note: revForm.value.note.trim(),
    narration: revForm.value.narration,
    segments: revForm.value.segments,
    baseUpdatedAt: draft.updatedAt
  })
  revisionDialog.value = false
}

function revisionTitle(revision: OfflineRevision) {
  const exhibit = exhibitOf(revision.exhibitId)
  return exhibit ? `${exhibit.code} ${exhibit.title}` : revision.exhibitId
}
</script>

<template>
  <div>
    <v-tabs v-model="subTab" color="primary" bg-color="surface" rounded="lg" class="mb-4 px-2">
      <v-tab value="recon">
        对账
        <v-chip v-if="mismatchTotal" size="x-small" color="error" class="ms-2">{{ mismatchTotal }}</v-chip>
      </v-tab>
      <v-tab value="targets">投放登记</v-tab>
      <v-tab value="packages">发布包</v-tab>
      <v-tab value="revisions">
        离线修订
        <v-chip v-if="store.pendingRevisionCount" size="x-small" color="warning" class="ms-2">{{ store.pendingRevisionCount }}</v-chip>
      </v-tab>
    </v-tabs>

    <v-window v-model="subTab" :touch="false">
      <v-window-item value="recon">
        <v-card class="script-card pa-4 pa-md-6">
          <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
            <div>
              <div class="section-title">屏幕对账</div>
              <div class="text-h6 font-weight-bold mt-1">屏幕缓存与工作台逐条比对</div>
              <div class="text-body-2 text-medium-emphasis mt-1">屏幕缓存指纹与确认指纹不一致、或中文稿改动后未重新确认的展项，都会列在这里。</div>
            </div>
            <div class="d-flex flex-wrap align-center ga-3">
              <v-select
                v-model="hallFilter"
                :items="[{ value: 'current', title: '当前展厅' }, { value: 'all', title: '全部展厅' }]"
                hide-details
                density="compact"
                style="min-width:130px"
                aria-label="对账范围"
              />
              <v-switch v-model="showAllRows" color="primary" hide-details density="compact" label="显示一致项" />
            </div>
          </div>

          <div class="d-flex flex-wrap ga-2 mb-4" role="status">
            <v-chip color="success" variant="tonal" size="small">一致 {{ countOf('synced') }}</v-chip>
            <v-chip color="warning" variant="tonal" size="small">屏幕待更新 {{ countOf('screen-behind') }}</v-chip>
            <v-chip color="error" variant="tonal" size="small">待重新确认 {{ countOf('needs-reconfirm') }}</v-chip>
            <v-chip color="grey" variant="tonal" size="small">未下发 {{ countOf('never-deployed') }}</v-chip>
          </div>

          <v-alert v-if="!visibleRows.length" type="success" variant="tonal">所有已登记屏幕都与工作台一致。</v-alert>
          <v-table v-else density="comfortable" class="recon-table">
            <thead>
              <tr>
                <th>展项</th>
                <th v-if="hallFilter === 'all'">展厅</th>
                <th>屏幕</th>
                <th>屏幕缓存</th>
                <th>工作台确认</th>
                <th>状态</th>
                <th class="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in visibleRows" :key="`${row.exhibitId}-${row.screenId}`">
                <td>
                  <div class="font-weight-medium">{{ row.exhibitCode }} {{ row.exhibitTitle }}</div>
                </td>
                <td v-if="hallFilter === 'all'">{{ hallName(row.hallId) }}</td>
                <td>
                  {{ row.screenCode }} {{ row.screenName }}
                  <v-chip v-if="!row.screenOnline" size="x-small" color="grey" variant="tonal" class="ms-1">离线</v-chip>
                </td>
                <td>
                  <code>{{ shortHash(row.cacheHash) }}</code>
                  <div class="text-caption text-medium-emphasis">{{ formatTime(row.cacheSyncedAt) }}</div>
                </td>
                <td>
                  <code>{{ shortHash(row.confirmedHash) }}</code>
                  <div v-if="row.status === 'needs-reconfirm' && row.currentHash" class="text-caption text-error">当前稿 <code>{{ shortHash(row.currentHash) }}</code></div>
                </td>
                <td><v-chip :color="syncMeta[row.status].color" size="small" variant="tonal">{{ syncMeta[row.status].label }}</v-chip></td>
                <td class="text-right">
                  <v-btn
                    v-if="row.status === 'screen-behind' || row.status === 'never-deployed'"
                    size="small"
                    variant="outlined"
                    :disabled="!row.screenOnline"
                    @click="store.deployToScreen(row.exhibitId, row.screenId)"
                  >补发该屏</v-btn>
                  <v-btn
                    v-else-if="row.status === 'needs-reconfirm'"
                    size="small"
                    color="primary"
                    variant="tonal"
                    @click="store.confirmOnline(row.exhibitId)"
                  >重新确认</v-btn>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-window-item>

      <v-window-item value="targets">
        <v-card class="script-card pa-4 pa-md-6">
          <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
            <div>
              <div class="section-title">投放登记</div>
              <div class="text-h6 font-weight-bold mt-1">{{ store.selectedHall?.name }} · 展项与屏幕对应关系</div>
              <div class="text-body-2 text-medium-emphasis mt-1">登记每个展项要投放的屏幕；中文稿一经改动，已确认的展项需重新确认后才能打包下发。</div>
            </div>
          </div>

          <v-alert v-if="!store.hallScreens.length" type="info" variant="tonal" class="mb-4">当前展厅还没有登记屏幕。</v-alert>
          <v-list v-else class="bg-transparent">
            <v-list-item v-for="screen in store.hallScreens" :key="screen.id" class="px-0">
              <template #prepend><v-icon :color="screen.online ? 'success' : 'grey'">mdi-monitor</v-icon></template>
              <v-list-item-title>{{ screen.code }} · {{ screen.name }}</v-list-item-title>
              <v-list-item-subtitle>{{ screen.online ? '在线，可接收下发' : '离线，下发时会跳过' }}</v-list-item-subtitle>
              <template #append>
                <v-switch
                  :model-value="screen.online"
                  color="primary"
                  hide-details
                  density="compact"
                  :label="screen.online ? '在线' : '离线'"
                  :aria-label="`切换 ${screen.name} 在线状态`"
                  @update:model-value="store.toggleScreenOnline(screen.id)"
                />
              </template>
            </v-list-item>
          </v-list>

          <v-divider class="my-5" />

          <div v-for="exhibit in store.hallExhibits" :key="exhibit.id" class="target-row">
            <div class="d-flex flex-wrap align-center ga-3">
              <div class="flex-grow-1" style="min-width:220px">
                <div class="font-weight-bold">{{ exhibit.code }} · {{ exhibit.title }}</div>
                <div class="text-caption text-medium-emphasis mt-1">
                  上线版本：{{ versionName(store.targetFor(exhibit.id)?.onlineVersionId || '') || '尚未确认' }}
                  <template v-if="store.targetFor(exhibit.id)?.confirmedAt"> · 确认于 {{ formatTime(store.targetFor(exhibit.id)!.confirmedAt) }}</template>
                </div>
              </div>
              <v-chip :color="confirmState(exhibit.id).color" size="small" variant="tonal">{{ confirmState(exhibit.id).label }}</v-chip>
              <v-btn
                size="small"
                color="primary"
                variant="tonal"
                :disabled="!store.zhDraftOf(exhibit.id)"
                @click="store.confirmOnline(exhibit.id)"
              >以当前中文稿确认上线</v-btn>
            </div>
            <v-select
              :model-value="store.targetFor(exhibit.id)?.screenIds || []"
              :items="store.hallScreens"
              item-title="name"
              item-value="id"
              multiple
              chips
              closable-chips
              density="compact"
              hide-details
              label="投放屏幕"
              class="mt-3"
              :aria-label="`选择 ${exhibit.title} 的投放屏幕`"
              @update:model-value="store.setTargetScreens(exhibit.id, $event)"
            />
          </div>
          <v-alert v-if="!store.hallExhibits.length" type="info" variant="tonal">当前展厅还没有展项。</v-alert>
        </v-card>
      </v-window-item>

      <v-window-item value="packages">
        <v-card class="script-card pa-4 pa-md-6">
          <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
            <div>
              <div class="section-title">发布包</div>
              <div class="text-h6 font-weight-bold mt-1">按展厅生成并下发</div>
              <div class="text-body-2 text-medium-emphasis mt-1">只打包中文稿与确认指纹一致的展项；下发只推送到在线屏幕，离线屏幕留待对账跟进。</div>
            </div>
            <v-btn color="primary" prepend-icon="mdi-package-variant-plus" @click="store.buildPackage(store.selectedHallId)">生成当前展厅发布包</v-btn>
          </div>

          <v-alert v-if="!store.hallPackages.length" type="info" variant="tonal">当前展厅还没有发布包。</v-alert>
          <div v-for="pkg in store.hallPackages" :key="pkg.id" class="package-row">
            <div class="d-flex flex-wrap align-center ga-3">
              <div class="flex-grow-1">
                <div class="font-weight-bold">{{ pkg.name }}</div>
                <div class="text-caption text-medium-emphasis mt-1">
                  {{ pkg.items.length }} 个展项 · 生成于 {{ formatTime(pkg.createdAt) }}
                  <template v-if="pkg.deployedAt"> · 已下发 {{ formatTime(pkg.deployedAt) }}</template>
                </div>
              </div>
              <v-btn size="small" color="primary" variant="tonal" prepend-icon="mdi-send-outline" @click="store.deployPackage(pkg.id)">下发到在线屏幕</v-btn>
            </div>
            <v-table density="compact" class="mt-3">
              <thead><tr><th>展项</th><th>上线版本</th><th>内容指纹</th></tr></thead>
              <tbody>
                <tr v-for="item in pkg.items" :key="item.exhibitId">
                  <td>{{ item.title }}</td>
                  <td>{{ versionName(item.versionId) || '—' }}</td>
                  <td><code>{{ shortHash(item.hash) }}</code></td>
                </tr>
              </tbody>
            </v-table>
          </div>
        </v-card>
      </v-window-item>

      <v-window-item value="revisions">
        <v-card class="script-card pa-4 pa-md-6">
          <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
            <div>
              <div class="section-title">离线修订</div>
              <div class="text-h6 font-weight-bold mt-1">讲解员平板修订合并</div>
              <div class="text-body-2 text-medium-emphasis mt-1">同一展项的多份修订都会保留；合并时已定稿锁定的段落保持不动。</div>
            </div>
            <v-btn color="primary" prepend-icon="mdi-tablet" @click="openRevisionDialog">记录离线修订</v-btn>
          </div>

          <v-alert v-if="!store.revisions.length" type="info" variant="tonal">还没有离线修订。讲解员在平板上记录后，回到馆里从这里导入合并。</v-alert>
          <div v-for="revision in store.revisions" :key="revision.id" class="revision-row">
            <div class="d-flex flex-wrap align-center ga-3">
              <div class="flex-grow-1" style="min-width:240px">
                <div class="font-weight-bold">{{ revisionTitle(revision) }} · {{ languageLabel(revision.languageId) }}</div>
                <div class="text-caption text-medium-emphasis mt-1">
                  {{ revision.author }} · {{ revision.device }} · 记录于 {{ formatTime(revision.createdAt) }} · 导入 {{ formatTime(revision.importedAt) }}
                </div>
                <div v-if="revision.note" class="text-body-2 mt-1">{{ revision.note }}</div>
              </div>
              <v-chip :color="revision.status === 'pending' ? 'warning' : 'success'" size="small" variant="tonal">
                {{ revision.status === 'pending' ? '待合并' : '已合并' }}
              </v-chip>
              <v-btn
                v-if="revision.status === 'pending'"
                size="small"
                color="primary"
                variant="tonal"
                @click="store.mergeRevision(revision.id)"
              >合并进工作台</v-btn>
            </div>
            <v-alert v-if="revision.mergeLog.length" class="mt-3" type="info" variant="tonal" density="compact">
              <div v-for="(line, index) in revision.mergeLog" :key="index">{{ line }}</div>
            </v-alert>
          </div>
        </v-card>
      </v-window-item>
    </v-window>

    <v-dialog v-model="revisionDialog" max-width="720" scrollable>
      <v-card class="pa-3">
        <v-card-title>记录离线修订（模拟平板导入）</v-card-title>
        <v-card-text>
          <p class="mb-4 text-medium-emphasis">以当前工作台稿件为底稿，模拟讲解员在平板上离线修改；保存后进入“待合并”列表，原有修订不会被覆盖。</p>
          <v-row>
            <v-col cols="12" md="6">
              <v-select
                v-model="revForm.exhibitId"
                :items="store.exhibits"
                :item-title="item => `${item.code} ${item.title}`"
                item-value="id"
                label="展项"
                @update:model-value="loadRevisionBase"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-select
                v-model="revForm.languageId"
                :items="LANGUAGES"
                item-title="label"
                item-value="id"
                label="语言"
                @update:model-value="loadRevisionBase"
              />
            </v-col>
            <v-col cols="12" md="6"><v-text-field v-model="revForm.author" label="记录人" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="revForm.device" label="设备" placeholder="平板-导览03" /></v-col>
          </v-row>
          <v-text-field v-model="revForm.note" label="备注（可选）" />
          <v-textarea v-model="revForm.narration" label="讲解词（离线修订版）" rows="5" auto-grow class="mt-2" />
          <div class="section-title mt-4 mb-2">段落修订</div>
          <div v-for="segment in revForm.segments" :key="segment.id" class="segment-row mb-3" :class="{ locked: segment.locked }">
            <div class="d-flex align-center ga-2 mb-1">
              <span class="font-weight-medium">{{ segment.label }}</span>
              <v-chip v-if="segment.locked" color="success" size="x-small" variant="tonal">工作台已定稿，合并时不会覆盖</v-chip>
            </div>
            <v-textarea v-model="segment.content" rows="2" auto-grow hide-details density="compact" :aria-label="`修订段落 ${segment.label}`" />
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="revisionDialog = false">取消</v-btn>
          <v-btn color="primary" @click="submitRevision">保存为待合并</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.recon-table code { background: rgba(45, 38, 32, .06); padding: 1px 6px; border-radius: 6px; }
.target-row, .package-row, .revision-row { border: 1px solid rgba(45, 38, 32, .1); border-radius: 14px; padding: 14px 16px; margin-bottom: 12px; background: #fff; }
</style>
