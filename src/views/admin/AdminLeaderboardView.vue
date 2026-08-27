<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Plus, Pencil, Trash2, Trophy } from 'lucide-vue-next';
import { db, createMockLeaderboardEntry, updateMockLeaderboardEntry, deleteMockLeaderboardEntry } from '../../db';
import AdminShell from '../../components/AdminShell.vue';
import type { LeaderboardMockRecord } from '../../db';

const entries = ref<LeaderboardMockRecord[]>([]);
const isLoading = ref(true);

onMounted(async () => {
  await refresh();
});

async function refresh() {
  isLoading.value = true;
  const all = await db.leaderboard_mock.toArray();
  entries.value = all.sort((a, b) => b.points - a.points);
  isLoading.value = false;
}

const isModalOpen = ref(false);
const editingId = ref<string | null>(null);
const formName = ref('');
const formPoints = ref<number>(500);
const isSaving = ref(false);
const formError = ref<string | null>(null);

function openCreateModal() {
  editingId.value = null;
  formName.value = '';
  formPoints.value = 500;
  formError.value = null;
  isModalOpen.value = true;
}

function openEditModal(entry: LeaderboardMockRecord) {
  editingId.value = entry.id;
  formName.value = entry.displayName;
  formPoints.value = entry.points;
  formError.value = null;
  isModalOpen.value = true;
}

async function saveEntry() {
  formError.value = null;
  if (formName.value.trim().length < 2) {
    formError.value = 'Please enter a name.';
    return;
  }

  isSaving.value = true;
  try {
    if (editingId.value) {
      await updateMockLeaderboardEntry(editingId.value, { displayName: formName.value.trim(), points: formPoints.value });
    } else {
      await createMockLeaderboardEntry(formName.value.trim(), formPoints.value);
    }
    await refresh();
    isModalOpen.value = false;
  } finally {
    isSaving.value = false;
  }
}

const confirmDeleteId = ref<string | null>(null);

async function confirmDelete() {
  if (!confirmDeleteId.value) return;
  await deleteMockLeaderboardEntry(confirmDeleteId.value);
  confirmDeleteId.value = null;
  await refresh();
}
</script>

<template>
  <AdminShell>
    <div class="max-w-3xl mx-auto px-5 py-6">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 class="font-display text-xl font-bold text-ink-900 flex items-center gap-2">
            <Trophy class="w-5 h-5 text-gold" /> Leaderboard Entries
          </h1>
          <p class="text-sm text-ink-500 mt-1">Manage the seeded competitor rows shown alongside real accounts.</p>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold px-4 py-2 transition-colors"
          @click="openCreateModal"
        >
          <Plus class="w-4 h-4" /> Add Entry
        </button>
      </div>

      <div v-if="isLoading" class="text-sm text-ink-300 text-center py-16">Loading entries…</div>

      <div v-else class="mt-5 bg-white rounded-2xl border border-ink-100 shadow-card divide-y divide-ink-50">
        <div v-if="entries.length === 0" class="text-center text-sm text-ink-300 py-10">No mock entries yet.</div>

        <div v-for="entry in entries" :key="entry.id" class="flex items-center justify-between px-4 py-3.5 gap-3">
          <span class="text-sm font-medium text-ink-900 truncate">{{ entry.displayName }}</span>
          <div class="flex items-center gap-3 shrink-0">
            <span class="text-sm font-mono font-bold text-ink-900">{{ entry.points }}</span>
            <button type="button" class="p-2 rounded-lg text-ink-500 hover:bg-ink-50 hover:text-brand-600" @click="openEditModal(entry)">
              <Pencil class="w-4 h-4" />
            </button>
            <button type="button" class="p-2 rounded-lg text-ink-500 hover:bg-coral-soft hover:text-coral" @click="confirmDeleteId = entry.id">
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Entry form modal -->
    <div v-if="isModalOpen" class="fixed inset-0 z-30 bg-ink-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl shadow-panel max-w-xs w-full p-6 animate-popIn">
        <h4 class="font-display text-lg font-bold text-ink-900 mb-4">
          {{ editingId ? 'Edit Entry' : 'Add Entry' }}
        </h4>

        <label class="block text-xs font-semibold text-ink-500 mb-1.5">Display Name</label>
        <input
          v-model="formName"
          type="text"
          placeholder="e.g. Amaka Obi"
          class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 mb-3.5"
        />

        <label class="block text-xs font-semibold text-ink-500 mb-1.5">Points</label>
        <input
          v-model.number="formPoints"
          type="number"
          min="0"
          class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 text-sm font-mono text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 mb-4"
        />

        <p v-if="formError" class="text-sm text-coral-dim bg-coral-soft border border-coral/30 rounded-xl px-3.5 py-2.5 mb-4">
          {{ formError }}
        </p>

        <div class="flex gap-2.5">
          <button type="button" class="flex-1 rounded-xl border border-ink-200 text-ink-600 text-sm font-medium py-2.5" @click="isModalOpen = false">
            Cancel
          </button>
          <button
            type="button"
            class="flex-1 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold py-2.5 disabled:opacity-50 transition-colors"
            :disabled="isSaving"
            @click="saveEntry"
          >
            {{ isSaving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete confirmation -->
    <div v-if="confirmDeleteId" class="fixed inset-0 z-30 bg-ink-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl shadow-panel max-w-xs w-full p-6 animate-popIn">
        <h4 class="font-display text-lg font-bold text-ink-900 mb-1.5">Delete this entry?</h4>
        <p class="text-sm text-ink-500 mb-5">This cannot be undone.</p>
        <div class="flex gap-2.5">
          <button type="button" class="flex-1 rounded-xl border border-ink-200 text-ink-600 text-sm font-medium py-2.5" @click="confirmDeleteId = null">
            Cancel
          </button>
          <button type="button" class="flex-1 rounded-xl bg-coral text-white text-sm font-semibold py-2.5" @click="confirmDelete">
            Delete
          </button>
        </div>
      </div>
    </div>
  </AdminShell>
</template>
