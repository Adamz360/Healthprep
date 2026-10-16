<!-- src/views/DepartmentSelectView.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { getDocs, collection } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuthStore } from '../stores/auth';
import { useWalletAndGamificationStore } from '../stores/walletAndGamification';
import PulseLine from '../components/PulseLine.vue';
import type { Department } from '../types/healthApp';

const router = useRouter();
const auth = useAuthStore();
const wallet = useWalletAndGamificationStore();

const departments = ref<Department[]>([]);
const isLoading = ref(true);
const isSelecting = ref(false);

onMounted(async () => {
  try {
    const snap = await getDocs(collection(firestore, 'departments'));
    departments.value = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Department)
      .filter((d) => d.isActive !== false)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error('[DepartmentSelect] Failed to load:', err);
  } finally {
    isLoading.value = false;
  }
});

async function selectDepartment(dept: Department) {
  if (isSelecting.value) return;
  isSelecting.value = true;

  try {
    await auth.chooseDepartment(dept.id);

    // Initialize wallet + gamification for the new user
    if (auth.userId) {
      await wallet.initForUser(auth.userId);
      await wallet.registerDailyLogin();
    }

    router.replace({ name: 'home' });
  } catch (err) {
    console.error('[DepartmentSelect] Failed to save selection:', err);
  } finally {
    isSelecting.value = false;
  }
}

const iconMap: Record<string, string> = {
  Stethoscope: '🩺',
  HeartPulse: '💓',
  Pill: '💊',
};
</script>

<template>
  <div class="min-h-screen flex flex-col bg-gradient-to-b from-ink-900 via-brand-800 to-brand-700 px-6 py-10">
    <div class="relative max-w-lg mx-auto w-full flex-1 flex flex-col justify-center">
      <div class="absolute inset-x-0 top-1/4 -translate-y-1/2 opacity-20 pointer-events-none">
        <PulseLine stroke="#2EE6B8" :height="60" />
      </div>

      <!-- Header -->
      <div class="relative text-center mb-8">
        <span
          class="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 text-pulse text-[11px] font-mono font-semibold px-3 py-1 mb-4 tracking-wide"
        >
          HEALTHPREP CBT
        </span>
        <h1 class="font-display text-2xl font-bold text-white">Choose your course</h1>
        <p class="text-brand-100 text-sm mt-1.5">
          This sets up your exam question bank. Pick the course that matches your programme.
        </p>
      </div>

      <!-- Loading -->
      <div v-if="isLoading" class="text-center text-white/70 text-sm py-12">
        Loading courses…
      </div>

      <!-- Department cards -->
      <div v-else class="relative space-y-3">
        <button
          v-for="dept in departments"
          :key="dept.id"
          type="button"
          class="w-full flex items-center gap-4 bg-white/10 border border-white/15 hover:bg-white/20 hover:border-pulse/50 rounded-2xl px-5 py-5 text-left transition-all disabled:opacity-50"
          :disabled="isSelecting"
          @click="selectDepartment(dept)"
        >
          <span class="flex items-center justify-center w-12 h-12 rounded-xl bg-white/15 text-2xl shrink-0">
            {{ iconMap[dept.iconName] ?? '📚' }}
          </span>
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-white text-sm">{{ dept.name }}</p>
            <p class="text-brand-200 text-xs mt-0.5 line-clamp-2">{{ dept.description }}</p>
          </div>
          <svg
            class="w-4 h-4 text-white/50 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <p v-if="departments.length === 0" class="text-center text-white/60 text-sm py-8">
          No courses available yet. Please check back later.
        </p>
      </div>

      <!-- Footer -->
      <p class="relative text-center text-white/50 text-xs mt-8">
        You can contact support if you need to change your course later.
      </p>
    </div>
  </div>
</template>