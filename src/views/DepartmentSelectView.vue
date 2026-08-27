<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Stethoscope, HeartPulse, Pill, FlaskConical, Users, ChevronRight } from 'lucide-vue-next';
import { db } from '../db';
import { useAuthStore } from '../stores/auth';
import PulseLine from '../components/PulseLine.vue';
import type { Department } from '../types/healthApp';

const router = useRouter();
const auth = useAuthStore();
const departments = ref<Department[]>([]);
const isLoading = ref(true);
const isChoosing = ref(false);

const iconMap: Record<string, typeof Stethoscope> = {
  Stethoscope,
  HeartPulse,
  Pill,
  FlaskConical,
  Users,
};

onMounted(async () => {
  departments.value = (await db.departments.toArray()).filter((d) => d.isActive);
  isLoading.value = false;
});

async function choose(dept: Department) {
  isChoosing.value = true;
  await auth.chooseDepartment(dept.id);
  router.push({ name: 'home' });
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-canvas">
    <!-- Hero -->
    <header class="relative bg-gradient-to-b from-ink-900 via-brand-800 to-brand-700 pt-14 pb-16 px-6 overflow-hidden">
      <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 opacity-40">
        <PulseLine stroke="#2EE6B8" :height="70" />
      </div>

      <div class="relative max-w-md mx-auto text-center">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 text-pulse text-[11px] font-mono font-semibold px-3 py-1 mb-5 tracking-wide">
          OFFLINE-READY CBT
        </span>
        <h1 class="font-display text-3xl font-bold text-white leading-tight">
          Sharpen your exam vitals.
        </h1>
        <p class="text-brand-100 text-sm mt-2.5 max-w-xs mx-auto">
          {{ auth.currentUser?.fullName ? `Welcome, ${auth.currentUser.fullName.split(' ')[0]}.` : 'Welcome.' }}
          Choose your track to get started.
        </p>
      </div>
    </header>

    <!-- Track picker -->
    <div class="flex-1 max-w-md w-full mx-auto px-5 -mt-8 pb-10">
      <div class="bg-white rounded-3xl shadow-panel px-4 pt-5 pb-4">
        <p class="text-ink-500 text-xs font-semibold uppercase tracking-wide mb-3 px-1">Choose your track</p>

        <div v-if="isLoading" class="text-center text-ink-300 text-sm py-10">Loading tracks…</div>

        <div v-else class="space-y-2.5">
          <button
            v-for="dept in departments"
            :key="dept.id"
            type="button"
            :disabled="isChoosing"
            class="w-full flex items-center gap-3.5 bg-canvas hover:bg-brand-50 rounded-2xl px-4 py-3.5 text-left transition-colors disabled:opacity-60 border border-transparent hover:border-brand-200"
            @click="choose(dept)"
          >
            <span class="flex items-center justify-center w-11 h-11 rounded-xl bg-brand-700 text-pulse shrink-0">
              <component :is="iconMap[dept.iconName] ?? Stethoscope" class="w-5 h-5" />
            </span>
            <span class="flex-1 min-w-0">
              <span class="block font-semibold text-ink-900 text-sm">{{ dept.name }}</span>
              <span class="block text-xs text-ink-500 mt-0.5 truncate">{{ dept.description }}</span>
            </span>
            <ChevronRight class="w-4.5 h-4.5 text-ink-300 shrink-0" />
          </button>
        </div>
      </div>

      <p class="text-center text-ink-300 text-xs mt-5">You can switch tracks anytime from your profile.</p>
    </div>
  </div>
</template>
