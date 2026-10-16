<!-- src/views/admin/AdminLeaderboardView.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, } from 'vue';
import {
  Plus, Pencil, Trash2, Trophy, Search, Download,
  Users, TrendingUp, Target, Medal, Share2, Check,
  Building2, Calendar, ChevronDown,
} from 'lucide-vue-next';
import { getDocs, collection } from 'firebase/firestore';
import { firestore } from '../../firebase';
import {
  createMockLeaderboardEntry,
  updateMockLeaderboardEntry,
  deleteMockLeaderboardEntry,
} from '../../services/content';
import { toCsv, downloadTextFile } from '../../utils/csv';
import AdminShell from '../../components/AdminShell.vue';
import type { LeaderboardMockRecord } from '../../db/schema';
import type { User, Department, ExamSession } from '../../types/healthApp';

/* ── Types ──────────────────────────────────────────────────────────────── */

interface LeaderboardRow {
  id: string;
  name: string;
  email: string;
  departmentName: string;
  departmentId: string;
  totalExams: number;
  completedExams: number;
  averageScore: number;
  bestScore: number;
  totalQuestionsAnswered: number;
  totalCorrect: number;
  accuracyPercent: number;
  points: number;
  isMock: boolean;
}

type TimeRange = 'all' | 'week' | 'month';

/* ── State ──────────────────────────────────────────────────────────────── */

const allRows = ref<LeaderboardRow[]>([]);
const departments = ref<Department[]>([]);
const mockEntries = ref<LeaderboardMockRecord[]>([]);
const isLoading = ref(true);

const searchQuery = ref('');
const selectedDepartmentId = ref('all');
const selectedTimeRange = ref<TimeRange>('all');
const activeTab = ref<'stats' | 'mock'>('stats');
const copied = ref(false);

/* ── Load all data ──────────────────────────────────────────────────────── */

onMounted(async () => {
  await refresh();
});

async function refresh() {
  isLoading.value = true;

  try {
    const [usersSnap, deptsSnap, sessionsSnap, mockSnap] = await Promise.all([
      getDocs(collection(firestore, 'users')),
      getDocs(collection(firestore, 'departments')),
      getDocs(collection(firestore, 'exam_sessions')),
      getDocs(collection(firestore, 'leaderboard_mock')),
    ]);

    departments.value = deptsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Department)
      .sort((a, b) => a.name.localeCompare(b.name));

    const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as User);
    const sessions = sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as ExamSession);
    mockEntries.value = mockSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as LeaderboardMockRecord)
      .sort((a, b) => b.points - a.points);

    // Build department lookup
    const deptById = new Map<string, Department>(
      departments.value.map((d) => [d.id, d]),
    );

    // Build user stats from exam sessions
    const rows: LeaderboardRow[] = users.map((user) => {
      const userSessions = sessions.filter((s) => s.userId === user.id);
      const completed = userSessions.filter(
        (s) => s.status === 'submitted' || s.status === 'auto-submitted',
      );

      const scores = completed
        .map((s) => s.scorePercent ?? 0)
        .filter((s) => s > 0);

      const totalCorrect = completed.reduce(
        (sum, s) => sum + (s.correctCount ?? 0), 0,
      );
      const totalAnswered = completed.reduce(
        (sum, s) => sum + (s.totalQuestions ?? 0), 0,
      );

      return {
        id: user.id,
        name: user.fullName ?? 'Unknown',
        email: user.email ?? '',
        departmentName: deptById.get(user.departmentId ?? '')?.name ?? '—',
        departmentId: user.departmentId ?? '',
        totalExams: userSessions.length,
        completedExams: completed.length,
        averageScore: scores.length > 0
          ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
          : 0,
        bestScore: scores.length > 0 ? Math.max(...scores) : 0,
        totalQuestionsAnswered: totalAnswered,
        totalCorrect,
        accuracyPercent: totalAnswered > 0
          ? Math.round((totalCorrect / totalAnswered) * 100)
          : 0,
        points: totalCorrect * 10 + completed.length * 5,
        isMock: false,
      };
    });

    // Add mock entries
    for (const mock of mockEntries.value) {
      rows.push({
        id: mock.id,
        name: mock.displayName,
        email: '—',
        departmentName: 'Mock',
        departmentId: 'mock',
        totalExams: 0,
        completedExams: 0,
        averageScore: 0,
        bestScore: 0,
        totalQuestionsAnswered: 0,
        totalCorrect: 0,
        accuracyPercent: 0,
        points: mock.points,
        isMock: true,
      });
    }

    allRows.value = rows;
  } catch (err: any) {
    console.error('[AdminLeaderboard] Failed to load:', err);
  } finally {
    isLoading.value = false;
  }
}

/* ── Filters ────────────────────────────────────────────────────────────── */

const filteredRows = computed(() => {
  let rows = allRows.value;

  // Department filter
  if (selectedDepartmentId.value !== 'all') {
    rows = rows.filter((r) => r.departmentId === selectedDepartmentId.value);
  }

  // Search filter
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q),
    );
  }

  // Sort by points descending
  rows = [...rows].sort((a, b) => b.points - a.points);

  // Add rank
  return rows.map((r, idx) => ({ ...r, rank: idx + 1 }));
});

/* ── Stats summary ──────────────────────────────────────────────────────── */

const stats = computed(() => {
  const rows = filteredRows.value.filter((r) => !r.isMock);
  const realUsers = rows.length;
  const totalExams = rows.reduce((s, r) => s + r.completedExams, 0);
  const avgScore = rows.length > 0
    ? Math.round(rows.reduce((s, r) => s + r.averageScore, 0) / rows.length)
    : 0;
  const topPerformer = rows[0] ?? null;

  return {
    totalParticipants: realUsers,
    totalExamsCompleted: totalExams,
    averageScore: avgScore,
    topPerformerName: topPerformer?.name ?? '—',
    topPerformerScore: topPerformer?.points ?? 0,
  };
});

/* ── Time range label ───────────────────────────────────────────────────── */

const timeRangeLabel = computed(() => {
  switch (selectedTimeRange.value) {
    case 'week': return 'This Week';
    case 'month': return 'This Month';
    default: return 'All Time';
  }
});

/* ── Share ──────────────────────────────────────────────────────────────── */

async function shareLeaderboard() {
  const top5 = filteredRows.value.slice(0, 5);
  const text = [
    `🏆 HealthPrep CBT — Leaderboard (${timeRangeLabel.value})`,
    selectedDepartmentId.value !== 'all'
      ? `📚 ${departments.value.find((d) => d.id === selectedDepartmentId.value)?.name ?? ''}`
      : '',
    '',
    ...top5.map((r, i) => `${['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i]} ${r.name} — ${r.points} pts`),
    '',
    `📊 ${stats.value.totalParticipants} participants · ${stats.value.totalExamsCompleted} exams completed`,
    'Prep smarter. Prep offline. #HealthPrepCBT',
  ].filter(Boolean).join('\n');

  try {
    if (navigator.share) {
      await navigator.share({
        title: 'HealthPrep CBT Leaderboard',
        text,
      });
      copied.value = true;
    } else {
      await navigator.clipboard.writeText(text);
      copied.value = true;
    }
    setTimeout(() => (copied.value = false), 3000);
  } catch {
    // share cancelled
  }
}

/* ── Export CSV ─────────────────────────────────────────────────────────── */

function exportCsv() {
  const rows = filteredRows.value.map((r) => ({
    rank: r.rank,
    name: r.name,
    email: r.email,
    department: r.departmentName,
    totalExams: r.totalExams,
    completedExams: r.completedExams,
    averageScore: r.averageScore,
    bestScore: r.bestScore,
    accuracyPercent: r.accuracyPercent,
    points: r.points,
    isMock: r.isMock ? 'Yes' : 'No',
  }));
  downloadTextFile(`leaderboard-${selectedTimeRange.value}.csv`, toCsv(rows));
}
/* ── Mock entry CRUD ────────────────────────────────────────────────────── */

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
      await updateMockLeaderboardEntry(editingId.value, {
        displayName: formName.value.trim(),
        points: formPoints.value,
      });
    } else {
      await createMockLeaderboardEntry(formName.value.trim(), formPoints.value);
    }
    await refresh();
    isModalOpen.value = false;
  } catch (err: any) {
    formError.value = err.message ?? 'Failed to save entry.';
  } finally {
    isSaving.value = false;
  }
}

const confirmDeleteId = ref<string | null>(null);

async function confirmDelete() {
  if (!confirmDeleteId.value) return;
  try {
    await deleteMockLeaderboardEntry(confirmDeleteId.value);
    confirmDeleteId.value = null;
    await refresh();
  } catch (err: any) {
    console.error('[AdminLeaderboard] Failed to delete:', err);
  }
}

/* ── Styles ─────────────────────────────────────────────────────────────── */

const rankBadge: Record<number, string> = {
  1: 'bg-gold text-ink-900',
  2: 'bg-ink-200 text-ink-900',
  3: 'bg-coral-soft text-coral-dim',
};
</script>

<template>
  <AdminShell>
    <div class="max-w-5xl mx-auto px-5 py-6">
      <!-- Header -->
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 class="font-display text-xl font-bold text-ink-900 flex items-center gap-2">
            <Trophy class="w-5 h-5 text-gold" /> Leaderboard Management
          </h1>
          <p class="text-sm text-ink-500 mt-1">
            View student rankings by department and time period.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 text-ink-600 hover:bg-ink-50 text-sm font-semibold px-3.5 py-2 transition-colors"
            @click="shareLeaderboard"
          >
            <Check v-if="copied" class="w-4 h-4 text-brand-600" />
            <Share2 v-else class="w-4 h-4" />
            {{ copied ? 'Copied!' : 'Share' }}
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 text-ink-600 hover:bg-ink-50 text-sm font-semibold px-3.5 py-2 transition-colors"
            @click="exportCsv"
          >
            <Download class="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      <!-- Stats cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
        <div class="bg-white rounded-2xl border border-ink-100 shadow-card p-4">
          <span class="inline-flex items-center justify-center w-9 h-9 rounded-xl mb-3 bg-brand-50 text-brand-600">
            <Users class="w-4.5 h-4.5" />
          </span>
          <p class="font-mono font-bold text-2xl text-ink-900">{{ stats.totalParticipants }}</p>
          <p class="text-xs text-ink-500 mt-0.5">Participants</p>
        </div>
        <div class="bg-white rounded-2xl border border-ink-100 shadow-card p-4">
          <span class="inline-flex items-center justify-center w-9 h-9 rounded-xl mb-3 bg-gold-soft text-gold-dim">
            <Target class="w-4.5 h-4.5" />
          </span>
          <p class="font-mono font-bold text-2xl text-ink-900">{{ stats.totalExamsCompleted }}</p>
          <p class="text-xs text-ink-500 mt-0.5">Exams Completed</p>
        </div>
        <div class="bg-white rounded-2xl border border-ink-100 shadow-card p-4">
          <span class="inline-flex items-center justify-center w-9 h-9 rounded-xl mb-3 bg-brand-50 text-brand-600">
            <TrendingUp class="w-4.5 h-4.5" />
          </span>
          <p class="font-mono font-bold text-2xl text-ink-900">{{ stats.averageScore }}%</p>
          <p class="text-xs text-ink-500 mt-0.5">Average Score</p>
        </div>
        <div class="bg-white rounded-2xl border border-ink-100 shadow-card p-4">
          <span class="inline-flex items-center justify-center w-9 h-9 rounded-xl mb-3 bg-gold-soft text-gold-dim">
            <Medal class="w-4.5 h-4.5" />
          </span>
          <p class="font-sm font-semibold text-ink-900 truncate">{{ stats.topPerformerName }}</p>
          <p class="text-xs text-ink-500 mt-0.5">Top Performer · {{ stats.topPerformerScore }} pts</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1.5 mt-6 bg-ink-50 rounded-xl p-1 w-fit">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
          :class="activeTab === 'stats' ? 'bg-white text-brand-700 shadow-card' : 'text-ink-500'"
          @click="activeTab = 'stats'"
        >
          <Trophy class="w-4 h-4" /> Rankings
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
          :class="activeTab === 'mock' ? 'bg-white text-brand-700 shadow-card' : 'text-ink-500'"
          @click="activeTab = 'mock'"
        >
          <Users class="w-4 h-4" /> Mock Entries ({{ mockEntries.length }})
        </button>
      </div>

      <!-- Rankings tab -->
      <template v-if="activeTab === 'stats'">
        <!-- Filters -->
        <div class="flex items-center gap-2 flex-wrap mt-5">
          <div class="relative flex-1 min-w-[200px]">
            <Search class="w-4 h-4 text-ink-300 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search name or email…"
              class="w-full rounded-xl border border-ink-200 bg-white pl-9 pr-3.5 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>

          <!-- Department filter -->
          <div class="relative">
            <Building2 class="w-4 h-4 text-ink-300 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              v-model="selectedDepartmentId"
              class="appearance-none rounded-xl border border-ink-200 bg-white pl-9 pr-8 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              <option value="all">All Departments</option>
              <option v-for="dept in departments" :key="dept.id" :value="dept.id">
                {{ dept.name }}
              </option>
            </select>
            <ChevronDown class="w-3.5 h-3.5 text-ink-300 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <!-- Time range filter -->
          <div class="relative">
            <Calendar class="w-4 h-4 text-ink-300 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              v-model="selectedTimeRange"
              class="appearance-none rounded-xl border border-ink-200 bg-white pl-9 pr-8 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              <option value="all">All Time</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
            <ChevronDown class="w-3.5 h-3.5 text-ink-300 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <!-- Leaderboard table -->
        <div v-if="isLoading" class="text-sm text-ink-300 text-center py-16">
          Loading leaderboard…
        </div>

        <div v-else class="mt-4 bg-white rounded-2xl border border-ink-100 shadow-card overflow-hidden">
          <div class="hidden md:grid grid-cols-[50px_1fr_140px_90px_90px_90px] gap-2 px-4 py-3 text-[11px] font-mono font-semibold text-ink-400 uppercase tracking-wide border-b border-ink-50">
            <span>Rank</span>
            <span>Student</span>
            <span>Department</span>
            <span class="text-right">Avg Score</span>
            <span class="text-right">Exams</span>
            <span class="text-right">Points</span>
          </div>

          <div v-if="filteredRows.length === 0" class="text-center text-sm text-ink-300 py-10">
            No students match your filters.
          </div>

          <div v-else class="divide-y divide-ink-50">
            <div
              v-for="row in filteredRows"
              :key="row.id"
              class="grid grid-cols-2 md:grid-cols-[50px_1fr_140px_90px_90px_90px] gap-2 px-4 py-3.5 items-center"
              :class="row.rank <= 3 ? 'bg-brand-50/30' : ''"
            >
              <!-- Rank -->
              <div class="flex items-center gap-1.5">
                <span
                  class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold"
                  :class="rankBadge[row.rank] ?? 'bg-ink-50 text-ink-500'"
                >
                  {{ row.rank }}
                </span>
              </div>

              <!-- Name -->
              <div class="min-w-0">
                <p class="text-sm font-medium text-ink-900 truncate flex items-center gap-1.5">
                  {{ row.name }}
                  <span v-if="row.isMock" class="text-[9px] font-mono bg-ink-100 text-ink-400 rounded px-1 py-0.5">MOCK</span>
                </p>
                <p class="text-xs text-ink-400 truncate">{{ row.email }}</p>
              </div>

              <!-- Department -->
              <span class="text-xs text-ink-500 truncate hidden md:block">
                {{ row.departmentName }}
              </span>

              <!-- Avg score -->
              <span class="text-sm font-mono font-bold text-right" :class="row.averageScore >= 75 ? 'text-brand-600' : row.averageScore >= 50 ? 'text-gold-dim' : 'text-coral'">
                {{ row.isMock ? '—' : `${row.averageScore}%` }}
              </span>

              <!-- Exams -->
              <span class="text-sm font-mono text-ink-600 text-right hidden md:block">
                {{ row.isMock ? '—' : row.completedExams }}
              </span>

              <!-- Points -->
              <span class="text-sm font-mono font-bold text-ink-900 text-right">
                {{ row.points }}
              </span>
            </div>
          </div>
        </div>

        <!-- Summary footer -->
        <p class="text-xs text-ink-300 mt-4">
          {{ filteredRows.length }} participant(s) · {{ timeRangeLabel }}
          <template v-if="selectedDepartmentId !== 'all'">
            · {{ departments.find((d) => d.id === selectedDepartmentId)?.name }}
          </template>
        </p>
      </template>

      <!-- Mock entries tab -->
      <template v-else>
        <div class="flex justify-end mt-5 mb-3">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold px-4 py-2 transition-colors"
            @click="openCreateModal"
          >
            <Plus class="w-4 h-4" /> Add Mock Entry
          </button>
        </div>

        <div class="bg-white rounded-2xl border border-ink-100 shadow-card divide-y divide-ink-50">
          <div v-if="mockEntries.length === 0" class="text-center text-sm text-ink-300 py-10">
            No mock entries yet.
          </div>

          <div
            v-for="entry in mockEntries"
            :key="entry.id"
            class="flex items-center justify-between px-4 py-3.5 gap-3"
          >
            <div class="min-w-0">
              <p class="text-sm font-medium text-ink-900 truncate">{{ entry.displayName }}</p>
              <p class="text-xs text-ink-400">Mock competitor</p>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <span class="text-sm font-mono font-bold text-ink-900">{{ entry.points }} pts</span>
              <button
                type="button"
                class="p-2 rounded-lg text-ink-500 hover:bg-ink-50 hover:text-brand-600"
                @click="openEditModal(entry)"
              >
                <Pencil class="w-4 h-4" />
              </button>
              <button
                type="button"
                class="p-2 rounded-lg text-ink-500 hover:bg-coral-soft hover:text-coral"
                @click="confirmDeleteId = entry.id"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Mock entry form modal -->
    <div
      v-if="isModalOpen"
      class="fixed inset-0 z-30 bg-ink-900/50 backdrop-blur-sm flex items-center justify-center p-4"
    >
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

        <p
          v-if="formError"
          class="text-sm text-coral-dim bg-coral-soft border border-coral/30 rounded-xl px-3.5 py-2.5 mb-4"
        >
          {{ formError }}
        </p>

        <div class="flex gap-2.5">
          <button
            type="button"
            class="flex-1 rounded-xl border border-ink-200 text-ink-600 text-sm font-medium py-2.5"
            @click="isModalOpen = false"
          >
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
    <div
      v-if="confirmDeleteId"
      class="fixed inset-0 z-30 bg-ink-900/50 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div class="bg-white rounded-3xl shadow-panel max-w-xs w-full p-6 animate-popIn">
        <h4 class="font-display text-lg font-bold text-ink-900 mb-1.5">Delete this entry?</h4>
        <p class="text-sm text-ink-500 mb-5">This cannot be undone.</p>
        <div class="flex gap-2.5">
          <button
            type="button"
            class="flex-1 rounded-xl border border-ink-200 text-ink-600 text-sm font-medium py-2.5"
            @click="confirmDeleteId = null"
          >
            Cancel
          </button>
          <button
            type="button"
            class="flex-1 rounded-xl bg-coral text-white text-sm font-semibold py-2.5"
            @click="confirmDelete"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </AdminShell>
</template>