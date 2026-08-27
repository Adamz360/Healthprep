<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Home, TrendingDown, Wallet as WalletIcon, Trophy } from 'lucide-vue-next';
import { useAuthStore } from './stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

onMounted(async () => {
  if (!auth.isReady) await auth.initAuth();
});

const showBottomNav = computed(() => {
  const hiddenOn = new Set([
    'login',
    'register',
    'department-select',
    'exam-session',
    'admin-dashboard',
    'admin-users',
    'admin-academic',
    'admin-content',
    'admin-payments',
    'admin-leaderboard',
  ]);
  return !hiddenOn.has(route.name as string);
});

const navItems = [
  { name: 'home', label: 'Home', icon: Home },
  { name: 'leaderboard', label: 'Ranks', icon: Trophy },
  { name: 'weak-areas', label: 'Weak Areas', icon: TrendingDown },
  { name: 'wallet', label: 'Wallet', icon: WalletIcon },
];

function isActive(routeName: string): boolean {
  return route.name === routeName || (routeName === 'home' && route.name === 'subjects');
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-canvas">
    <main class="flex-1" :class="showBottomNav ? 'pb-24' : ''">
      <router-view v-slot="{ Component, route: activeRoute }">
        <transition name="fade" mode="out-in">
          <component :is="Component" :key="activeRoute.fullPath" />
        </transition>
      </router-view>
    </main>

    <nav v-if="showBottomNav" class="fixed bottom-3 inset-x-3 z-40 max-w-2xl mx-auto">
      <div class="bg-ink-900 rounded-2xl shadow-panel px-2 py-2 grid grid-cols-4 gap-1">
        <button
          v-for="item in navItems"
          :key="item.name"
          type="button"
          class="relative flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-[10px] font-medium transition-colors"
          :class="isActive(item.name) ? 'text-ink-900 bg-pulse' : 'text-ink-100/70 hover:text-pulse'"
          @click="router.push({ name: item.name })"
        >
          <component :is="item.icon" class="w-5 h-5" :stroke-width="isActive(item.name) ? 2.5 : 2" />
          {{ item.label }}
        </button>
      </div>
    </nav>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
