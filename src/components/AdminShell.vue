<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { LayoutDashboard, Users, Building2, BookOpen, Trophy, Wallet as WalletIcon, LogOut, ShieldCheck } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const navItems = [
  { name: 'admin-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { name: 'admin-users', label: 'Users', icon: Users },
  { name: 'admin-academic', label: 'Academic', icon: Building2 },
  { name: 'admin-content', label: 'Content', icon: BookOpen },
  { name: 'admin-payments', label: 'Payments', icon: WalletIcon },
  { name: 'admin-leaderboard', label: 'Leaderboard', icon: Trophy },
];

function handleLogout() {
  auth.logout();
  router.replace({ name: 'login' });
}
</script>

<template>
  <div class="min-h-screen flex bg-canvas">
    <!-- Sidebar (desktop) -->
    <aside class="hidden md:flex md:flex-col w-60 shrink-0 bg-ink-900 min-h-screen">
      <div class="px-5 pt-6 pb-5 border-b border-white/10">
        <span class="inline-flex items-center gap-1.5 text-pulse text-[11px] font-mono font-semibold tracking-wide">
          <ShieldCheck class="w-3.5 h-3.5" /> ADMIN PORTAL
        </span>
        <p class="text-white font-display font-bold text-sm mt-1.5">HealthPrep CBT</p>
      </div>

      <nav class="flex-1 px-3 py-4 space-y-1">
        <button
          v-for="item in navItems"
          :key="item.name"
          type="button"
          class="w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors"
          :class="route.name === item.name ? 'bg-pulse text-ink-900' : 'text-ink-100/70 hover:bg-white/5 hover:text-white'"
          @click="router.push({ name: item.name })"
        >
          <component :is="item.icon" class="w-4.5 h-4.5" />
          {{ item.label }}
        </button>
      </nav>

      <div class="px-3 pb-5 pt-3 border-t border-white/10">
        <p class="px-3.5 text-xs text-ink-100/60 truncate mb-2">{{ auth.currentUser?.email }}</p>
        <button
          type="button"
          class="w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-ink-100/70 hover:bg-white/5 hover:text-coral transition-colors"
          @click="handleLogout"
        >
          <LogOut class="w-4.5 h-4.5" /> Sign Out
        </button>
      </div>
    </aside>

    <!-- Main column -->
    <div class="flex-1 min-w-0 flex flex-col">
      <!-- Top bar (mobile) -->
      <header class="md:hidden bg-ink-900 px-4 py-3.5 flex items-center justify-between sticky top-0 z-20">
        <span class="inline-flex items-center gap-1.5 text-pulse text-[11px] font-mono font-semibold tracking-wide">
          <ShieldCheck class="w-3.5 h-3.5" /> ADMIN
        </span>
        <button type="button" class="text-ink-100/70 hover:text-coral" @click="handleLogout">
          <LogOut class="w-4.5 h-4.5" />
        </button>
      </header>

      <main class="flex-1 min-w-0">
        <slot />
      </main>

      <!-- Bottom tab bar (mobile) -->
      <nav class="md:hidden sticky bottom-0 bg-ink-900 border-t border-white/10 flex overflow-x-auto px-1 py-1.5 gap-1">
        <button
          v-for="item in navItems"
          :key="item.name"
          type="button"
          class="flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-xl text-[10px] font-medium shrink-0"
          :class="route.name === item.name ? 'text-pulse' : 'text-ink-100/60'"
          @click="router.push({ name: item.name })"
        >
          <component :is="item.icon" class="w-4.5 h-4.5" />
          {{ item.label }}
        </button>
      </nav>
    </div>
  </div>
</template>
