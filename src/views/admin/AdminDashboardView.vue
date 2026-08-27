<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Users,
  Building2,
  GraduationCap,
  BookOpen,
  FileQuestion,
  ClipboardList,
  Wallet as WalletIcon,
  TrendingUp,
  ArrowRight,
  UserPlus,
  CheckCircle2,
  Landmark,
} from 'lucide-vue-next';
import { computeAdminStats, getRecentActivity } from '../../db';
import AdminShell from '../../components/AdminShell.vue';
import type { AdminStats, RecentActivityItem } from '../../types/healthApp';

const router = useRouter();
const stats = ref<AdminStats | null>(null);
const recentActivity = ref<RecentActivityItem[]>([]);
const isLoading = ref(true);

onMounted(async () => {
  const [statsResult, activityResult] = await Promise.all([computeAdminStats(), getRecentActivity(8)]);
  stats.value = statsResult;
  recentActivity.value = activityResult;
  isLoading.value = false;
});

const statCards = [
  { key: 'totalStudents' as const, label: 'Students', icon: Users, color: 'text-brand-600 bg-brand-50' },
  { key: 'totalDepartments' as const, label: 'Departments', icon: Building2, color: 'text-brand-600 bg-brand-50' },
  { key: 'totalCourses' as const, label: 'Courses', icon: GraduationCap, color: 'text-gold-dim bg-gold-soft' },
  { key: 'totalSubjects' as const, label: 'Subjects', icon: BookOpen, color: 'text-brand-600 bg-brand-50' },
  { key: 'totalQuestions' as const, label: 'Questions', icon: FileQuestion, color: 'text-gold-dim bg-gold-soft' },
  { key: 'totalExamSessions' as const, label: 'Exams', icon: ClipboardList, color: 'text-pulse-dim bg-brand-50' },
  { key: 'totalPayments' as const, label: 'Payments', icon: WalletIcon, color: 'text-coral bg-coral-soft' },
  { key: 'totalRevenueNaira' as const, label: 'Revenue', icon: TrendingUp, color: 'text-brand-600 bg-brand-50', prefix: '₦' },
];

const activityIcons: Record<RecentActivityItem['type'], typeof UserPlus> = {
  'user-registered': UserPlus,
  'exam-completed': CheckCircle2,
  'payment-successful': Landmark,
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
</script>

<template>
  <AdminShell>
    <div class="max-w-5xl mx-auto px-5 py-6">
      <h1 class="font-display text-xl font-bold text-ink-900">Dashboard</h1>
      <p class="text-sm text-ink-500 mt-1">Platform overview at a glance.</p>

      <div v-if="isLoading" class="text-sm text-ink-300 text-center py-16">Loading stats…</div>

      <template v-else-if="stats">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3.5 mt-6">
          <div v-for="card in statCards" :key="card.key" class="bg-white rounded-2xl border border-ink-100 shadow-card p-4">
            <span class="inline-flex items-center justify-center w-9 h-9 rounded-xl mb-3" :class="card.color">
              <component :is="card.icon" class="w-4.5 h-4.5" />
            </span>
            <p class="font-mono font-bold text-2xl text-ink-900">
              {{ card.prefix ?? '' }}{{ stats[card.key].toLocaleString() }}
            </p>
            <p class="text-xs text-ink-500 mt-0.5">{{ card.label }}</p>
          </div>
        </div>

        <div class="grid md:grid-cols-3 gap-3.5 mt-6">
          <button
            type="button"
            class="flex items-center justify-between bg-white rounded-2xl border border-ink-100 shadow-card px-5 py-4 text-left hover:border-brand-300 transition-colors"
            @click="router.push({ name: 'admin-academic' })"
          >
            <div>
              <p class="font-semibold text-ink-900 text-sm">Academic Structure</p>
              <p class="text-xs text-ink-500 mt-0.5">Departments, courses &amp; subjects</p>
            </div>
            <ArrowRight class="w-4 h-4 text-ink-300" />
          </button>
          <button
            type="button"
            class="flex items-center justify-between bg-white rounded-2xl border border-ink-100 shadow-card px-5 py-4 text-left hover:border-brand-300 transition-colors"
            @click="router.push({ name: 'admin-content' })"
          >
            <div>
              <p class="font-semibold text-ink-900 text-sm">Manage Content</p>
              <p class="text-xs text-ink-500 mt-0.5">Questions &amp; CSV import</p>
            </div>
            <ArrowRight class="w-4 h-4 text-ink-300" />
          </button>
          <button
            type="button"
            class="flex items-center justify-between bg-white rounded-2xl border border-ink-100 shadow-card px-5 py-4 text-left hover:border-brand-300 transition-colors"
            @click="router.push({ name: 'admin-payments' })"
          >
            <div>
              <p class="font-semibold text-ink-900 text-sm">Payments</p>
              <p class="text-xs text-ink-500 mt-0.5">Revenue &amp; transaction records</p>
            </div>
            <ArrowRight class="w-4 h-4 text-ink-300" />
          </button>
        </div>

        <!-- Recent activity -->
        <div class="mt-6">
          <p class="text-sm font-semibold text-ink-700 mb-3">Recent Activity</p>
          <div class="bg-white rounded-2xl border border-ink-100 shadow-card divide-y divide-ink-50">
            <div v-if="recentActivity.length === 0" class="text-center text-sm text-ink-300 py-8">No activity yet.</div>
            <div v-for="item in recentActivity" :key="item.id" class="flex items-center gap-3 px-4 py-3">
              <span
                class="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
                :class="{
                  'bg-brand-50 text-brand-600': item.type === 'user-registered',
                  'bg-gold-soft text-gold-dim': item.type === 'exam-completed',
                  'bg-coral-soft text-coral-dim': item.type === 'payment-successful',
                }"
              >
                <component :is="activityIcons[item.type]" class="w-4 h-4" />
              </span>
              <div class="flex-1 min-w-0">
                <p class="text-sm text-ink-900 truncate">{{ item.title }}</p>
                <p class="text-xs text-ink-500 truncate">{{ item.subtitle }}</p>
              </div>
              <span class="text-[11px] text-ink-300 font-mono shrink-0">{{ formatRelativeTime(item.timestamp) }}</span>
            </div>
          </div>
        </div>

        <p class="text-xs text-ink-300 mt-6">
          {{ stats.completedExamSessions }} of {{ stats.totalExamSessions }} exam sessions completed ·
          {{ stats.averageScorePercent }}% average score · {{ stats.totalAdmins }} admin account(s) ·
          {{ stats.totalCreditsInCirculation }} credits in circulation
        </p>
      </template>
    </div>
  </AdminShell>
</template>
