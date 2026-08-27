<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronLeft, Trophy, Medal } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useLeaderboard } from '../composables/useLeaderboard';

const router = useRouter();
const auth = useAuthStore();
const { entries, isLoading, refresh } = useLeaderboard();

onMounted(async () => {
  await refresh(auth.userId);
});

const rankStyles: Record<number, string> = {
  1: 'bg-gold text-ink-900',
  2: 'bg-ink-200 text-ink-900',
  3: 'bg-coral-soft text-coral-dim',
};
</script>

<template>
  <div class="min-h-screen bg-canvas">
    <header class="bg-gradient-to-br from-ink-900 to-brand-800 px-4 pt-6 pb-8 rounded-b-[2rem]">
      <div class="max-w-2xl mx-auto flex items-center gap-3">
        <button type="button" class="p-1.5 -ml-1.5 rounded-lg hover:bg-white/10" @click="router.back()">
          <ChevronLeft class="w-5 h-5 text-white" />
        </button>
        <div class="flex items-center gap-2">
          <Trophy class="w-5 h-5 text-gold" />
          <h1 class="font-display font-bold text-white text-lg">Leaderboard</h1>
        </div>
      </div>
    </header>

    <div class="max-w-2xl mx-auto px-4 -mt-5 pb-8">
      <div class="bg-white rounded-3xl border border-ink-100 shadow-panel overflow-hidden">
        <div class="grid grid-cols-[48px_1fr_72px] gap-2 px-4 py-3 text-[11px] font-mono font-semibold text-ink-400 uppercase tracking-wide border-b border-ink-50">
          <span>Rank</span>
          <span>User</span>
          <span class="text-right">Score</span>
        </div>

        <div v-if="isLoading" class="text-center text-ink-300 text-sm py-10">Loading leaderboard…</div>

        <div v-else class="divide-y divide-ink-50">
          <div
            v-for="entry in entries"
            :key="entry.id"
            class="grid grid-cols-[48px_1fr_72px] gap-2 px-4 py-3.5 items-center"
            :class="entry.isCurrentUser ? 'bg-brand-50' : ''"
          >
            <span
              class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono font-bold"
              :class="rankStyles[entry.rank] ?? 'bg-ink-50 text-ink-500'"
            >
              <Medal v-if="entry.rank <= 3" class="w-4 h-4" />
              <template v-else>{{ entry.rank }}</template>
            </span>
            <span class="text-sm font-medium truncate" :class="entry.isCurrentUser ? 'text-brand-700' : 'text-ink-800'">
              {{ entry.displayName }}
            </span>
            <span class="text-sm font-mono font-bold text-right text-ink-900">{{ entry.points }}</span>
          </div>
        </div>
      </div>

      <p class="text-center text-ink-300 text-xs mt-4">
        Score = correct answers × 10 + streak bonus + lifetime credits earned.
      </p>
    </div>
  </div>
</template>
