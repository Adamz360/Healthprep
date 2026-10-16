<!-- src/views/HomeDashboardView.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Coins, Flame, TrendingDown, ChevronRight,
  BookOpen, Radio, Trophy, Medal, LogOut,
} from 'lucide-vue-next';
import { getDoc, doc, getDocs, query, where, collection } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuthStore } from '../stores/auth';
import { useWalletAndGamificationStore } from '../stores/walletAndGamification';
import { useLeaderboard } from '../composables/useLeaderboard';
import type { Department, Subject } from '../types/healthApp';

const router = useRouter();
const auth = useAuthStore();
const wallet = useWalletAndGamificationStore();
const { entries: leaderboardEntries, refresh: refreshLeaderboard } = useLeaderboard();

const department = ref<Department | null>(null);
const subjects = ref<Subject[]>([]);
const isLoading = ref(true);

onMounted(async () => {
  if (!auth.userId) {
    isLoading.value = false;
    return;
  }

  try {
    await wallet.initForUser(auth.userId);
  } catch (err) {
    console.warn('[HomeDashboard] wallet init failed:', err);
  }

  try {
    await wallet.registerDailyLogin();
  } catch (err) {
    console.warn('[HomeDashboard] daily login failed:', err);
  }

  try {
    await refreshLeaderboard(auth.userId);
  } catch (err) {
    console.warn('[HomeDashboard] leaderboard failed:', err);
  }

  if (auth.currentUser?.departmentId) {
    try {
      const deptSnap = await getDoc(
        doc(firestore, 'departments', auth.currentUser.departmentId),
      );
      department.value = deptSnap.exists()
        ? { id: deptSnap.id, ...deptSnap.data() } as Department
        : null;

      if (department.value) {
        const subjSnap = await getDocs(
          query(
            collection(firestore, 'subjects'),
            where('departmentId', '==', department.value.id),
          ),
        );
        subjects.value = subjSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Subject)
          .filter((s) => s.isActive !== false);
      }
    } catch (err) {
      console.error('[HomeDashboard] Failed to load department:', err);
    }
  }

  isLoading.value = false;
});

const topWeakTopics = computed(() => wallet.weakTopics.slice(0, 3));
const topLeaderboardEntries = computed(() => leaderboardEntries.value.slice(0, 3));

function openSubjects() {
  if (department.value) {
    router.push({ name: 'subjects', params: { departmentId: department.value.id } });
  }
}

function startSubject(subject: Subject) {
  router.push({ name: 'exam-setup', params: { subjectId: subject.id } });
}

async function handleLogout() {
  await auth.logout();
  router.replace({ name: 'login' });
}

const rankStyles: Record<number, string> = {
  1: 'bg-gold text-ink-900',
  2: 'bg-ink-200 text-ink-900',
  3: 'bg-coral-soft text-coral-dim',
};
</script>

<template>
  <div class="min-h-screen">
    <!-- Header -->
    <header class="bg-gradient-to-br from-ink-900 to-brand-800 px-5 pt-8 pb-7 rounded-b-[2rem]">
      <div class="max-w-2xl mx-auto">
        <!-- Top row: department + logout -->
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-1.5 text-brand-200 text-xs font-mono uppercase tracking-wide">
            <Radio class="w-3.5 h-3.5 text-pulse" />
            {{ department?.name ?? 'Welcome' }}
          </div>
          <button
            type="button"
            class="flex items-center gap-1.5 text-brand-200 text-xs font-medium hover:text-white transition-colors -mt-0.5"
            @click="handleLogout"
          >
            <LogOut class="w-3.5 h-3.5" />
            Logout
          </button>
        </div>

        <h1 class="font-display text-white text-2xl font-bold mt-1">
          {{ auth.currentUser?.fullName ?? 'Welcome back' }}
        </h1>

        <!-- Credit Balance -->
        <div class="flex gap-3 mt-5">
          <div class="flex-1 bg-white/8 backdrop-blur rounded-2xl px-4 py-3.5 flex items-center gap-3 border border-white/10">
            <span class="flex items-center justify-center w-9 h-9 rounded-xl bg-gold/15 text-gold shrink-0">
              <Coins class="w-4.5 h-4.5" />
            </span>
            <div class="min-w-0">
              <p class="font-mono font-bold text-lg leading-none text-white">{{ wallet.creditBalance }}</p>
              <p class="text-brand-200 text-[11px] mt-1.5">Credits</p>
            </div>
          </div>
          <div class="flex-1 bg-white/8 backdrop-blur rounded-2xl px-4 py-3.5 flex items-center gap-3 border border-white/10">
            <span class="flex items-center justify-center w-9 h-9 rounded-xl bg-coral/15 text-coral shrink-0">
              <Flame class="w-4.5 h-4.5" />
            </span>
            <div class="min-w-0">
              <p class="font-mono font-bold text-lg leading-none text-white">{{ wallet.currentStreak }}d</p>
              <p class="text-brand-200 text-[11px] mt-1.5">Streak</p>
            </div>
          </div>
        </div>
      </div>
    </header>

    <div class="max-w-2xl mx-auto px-5 pb-8">
      <!-- Leaderboard snippet -->
      <section class="mt-6">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold text-ink-700 flex items-center gap-1.5">
            <Trophy class="w-4 h-4 text-gold" /> Leaderboard
          </h2>
          <button
            type="button"
            class="text-xs font-semibold text-brand-600"
            @click="router.push({ name: 'leaderboard' })"
          >
            View full ranking
          </button>
        </div>
        <div class="bg-white rounded-2xl border border-ink-100 shadow-card divide-y divide-ink-50">
          <div
            v-for="entry in topLeaderboardEntries"
            :key="entry.id"
            class="flex items-center gap-3 px-4 py-3"
            :class="entry.isCurrentUser ? 'bg-brand-50' : ''"
          >
            <span
              class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0"
              :class="rankStyles[entry.rank] ?? 'bg-ink-50 text-ink-500'"
            >
              <Medal v-if="entry.rank <= 3" class="w-3.5 h-3.5" />
              <template v-else>{{ entry.rank }}</template>
            </span>
            <span
              class="flex-1 text-sm font-medium truncate"
              :class="entry.isCurrentUser ? 'text-brand-700' : 'text-ink-800'"
            >
              {{ entry.displayName }}
            </span>
            <span class="text-sm font-mono font-bold text-ink-900">{{ entry.points }}</span>
          </div>
        </div>
      </section>

      <!-- Weak areas preview -->
      <section v-if="topWeakTopics.length > 0" class="mt-6">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold text-ink-700 flex items-center gap-1.5">
            <TrendingDown class="w-4 h-4 text-coral" /> Needs Improvement
          </h2>
          <button
            type="button"
            class="text-xs font-semibold text-brand-600"
            @click="router.push({ name: 'weak-areas' })"
          >
            See all
          </button>
        </div>
        <div class="bg-white rounded-2xl border border-ink-100 shadow-card divide-y divide-ink-50">
          <div
            v-for="topic in topWeakTopics"
            :key="topic.topicId"
            class="flex items-center justify-between px-4 py-3.5"
          >
            <span class="text-sm text-ink-700">{{ topic.topicPath }}</span>
            <span class="readout text-xs bg-coral text-white px-2.5 py-1">{{ topic.accuracyPercent }}%</span>
          </div>
        </div>
      </section>

      <!-- Enrolled subjects -->
      <section class="mt-7">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold text-ink-700 flex items-center gap-1.5">
            <BookOpen class="w-4 h-4" /> Enrolled Subjects
          </h2>
          <button type="button" class="text-xs font-semibold text-brand-600" @click="openSubjects">
            Browse all
          </button>
        </div>

        <div v-if="isLoading" class="text-sm text-ink-300 py-8 text-center">Loading…</div>

        <div v-else class="grid grid-cols-2 gap-2.5">
          <button
            v-for="subject in subjects"
            :key="subject.id"
            type="button"
            class="flex flex-col items-start gap-2 bg-white rounded-2xl border border-ink-100 shadow-card px-4 py-3.5 text-left hover:border-brand-300 transition-colors"
            @click="startSubject(subject)"
          >
            <span
              v-if="subject.isDownloaded"
              class="text-[10px] font-mono font-semibold text-brand-600 bg-brand-50 rounded-full px-2 py-0.5"
            >
              OFFLINE
            </span>
            <p class="font-semibold text-ink-900 text-sm leading-snug">{{ subject.name }}</p>
            <p class="text-xs text-ink-500 flex items-center gap-1 mt-auto">
              {{ subject.totalQuestionCount }} questions <ChevronRight class="w-3 h-3" />
            </p>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>