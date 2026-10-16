<!-- src/views/admin/AdminPaymentsView.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  Wallet as WalletIcon,
  TrendingUp,
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-vue-next';
import { getDocs, collection } from 'firebase/firestore';
import { firestore } from '../../firebase';
import { computePaymentStats, refundPayment } from '../../services/wallet';
import { toCsv, downloadTextFile } from '../../utils/csv';
import AdminShell from '../../components/AdminShell.vue';
import type { Payment, PaymentStats, PaymentStatus, User } from '../../types/healthApp';

const stats = ref<PaymentStats | null>(null);
const payments = ref<Payment[]>([]);
const usersById = ref<Map<string, User>>(new Map());
const isLoading = ref(true);
const statsRange = ref<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');

onMounted(async () => {
  await refresh();
});

async function refresh() {
  isLoading.value = true;

  try {
    // ── Fetch from Firestore ──
    const [statsResult, paymentsSnap, usersSnap] = await Promise.all([
      computePaymentStats(),
      getDocs(collection(firestore, 'payments')),
      getDocs(collection(firestore, 'users')),
    ]);

    stats.value = statsResult;

    payments.value = paymentsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Payment)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    usersById.value = new Map(
      usersSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as User]),
    );
  } catch (err: any) {
    console.error('[AdminPayments] Failed to load:', err);
  } finally {
    isLoading.value = false;
  }
}

function studentName(userId: string): string {
  return usersById.value.get(userId)?.fullName ?? 'Unknown';
}
function studentEmail(userId: string): string {
  return usersById.value.get(userId)?.email ?? '—';
}

const statusStyles: Record<PaymentStatus, { badge: string; icon: typeof CheckCircle2 }> = {
  successful: { badge: 'bg-brand-50 text-brand-600', icon: CheckCircle2 },
  pending: { badge: 'bg-gold-soft text-gold-dim', icon: Clock },
  failed: { badge: 'bg-coral-soft text-coral-dim', icon: XCircle },
  refunded: { badge: 'bg-ink-100 text-ink-500', icon: RotateCcw },
};

/* ── Search / filter / pagination ──────────────────────────────────────── */

const searchQuery = ref('');
const statusFilter = ref<PaymentStatus | 'all'>('all');
const currentPage = ref(1);
const pageSize = 10;

const filteredPayments = computed(() => {
  let list = payments.value;
  if (statusFilter.value !== 'all') list = list.filter((p) => p.status === statusFilter.value);

  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (p) =>
        p.reference.toLowerCase().includes(q) ||
        studentName(p.userId).toLowerCase().includes(q) ||
        studentEmail(p.userId).toLowerCase().includes(q),
    );
  }
  return list;
});

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredPayments.value.length / pageSize)),
);
const pagedPayments = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return filteredPayments.value.slice(start, start + pageSize);
});

function goToPage(page: number) {
  currentPage.value = Math.min(Math.max(1, page), totalPages.value);
}

function resetPagination() {
  currentPage.value = 1;
}

/* ── Export ────────────────────────────────────────────────────────────── */

function exportCsv() {
  const rows = filteredPayments.value.map((p) => ({
    student: studentName(p.userId),
    email: studentEmail(p.userId),
    reference: p.reference,
    amountNaira: p.amountNaira,
    credits: p.credits,
    paymentType: p.paymentType,
    gateway: p.gateway,
    status: p.status,
    createdAt: p.createdAt,
    completedAt: p.completedAt ?? '',
  }));
  downloadTextFile('payment-records.csv', toCsv(rows));
}

/* ── Details / refund ──────────────────────────────────────────────────── */

const detailsPayment = ref<Payment | null>(null);
const isRefunding = ref(false);
const refundError = ref<string | null>(null);

async function handleRefund() {
  if (!detailsPayment.value) return;
  isRefunding.value = true;
  refundError.value = null;

  try {
    const err = await refundPayment(detailsPayment.value.id);
    if (err) {
      refundError.value = err;
      return;
    }
    await refresh();
    detailsPayment.value = null;
  } finally {
    isRefunding.value = false;
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
</script>

<template>
  <AdminShell>
    <div class="max-w-5xl mx-auto px-5 py-6">
      <h1 class="font-display text-xl font-bold text-ink-900">Payments</h1>
      <p class="text-sm text-ink-500 mt-1">Revenue overview and full payment records.</p>

      <div v-if="isLoading" class="text-sm text-ink-300 text-center py-16">
        Loading payment data…
      </div>

      <template v-else-if="stats">
        <!-- Stat cards -->
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3.5 mt-6">
          <div class="bg-white rounded-2xl border border-ink-100 shadow-card p-4">
            <span class="inline-flex items-center justify-center w-9 h-9 rounded-xl mb-3 bg-brand-50 text-brand-600">
              <WalletIcon class="w-4.5 h-4.5" />
            </span>
            <p class="font-mono font-bold text-2xl text-ink-900">{{ stats.totalPayments }}</p>
            <p class="text-xs text-ink-500 mt-0.5">Total Payments</p>
          </div>
          <div class="bg-white rounded-2xl border border-ink-100 shadow-card p-4">
            <span class="inline-flex items-center justify-center w-9 h-9 rounded-xl mb-3 bg-gold-soft text-gold-dim">
              <TrendingUp class="w-4.5 h-4.5" />
            </span>
            <p class="font-mono font-bold text-2xl text-ink-900">₦{{ stats.totalRevenueNaira.toLocaleString() }}</p>
            <p class="text-xs text-ink-500 mt-0.5">Total Revenue</p>
          </div>
          <div class="bg-white rounded-2xl border border-ink-100 shadow-card p-4">
            <span class="inline-flex items-center justify-center w-9 h-9 rounded-xl mb-3 bg-brand-50 text-brand-600">
              <CheckCircle2 class="w-4.5 h-4.5" />
            </span>
            <p class="font-mono font-bold text-2xl text-ink-900">{{ stats.successfulCount }}</p>
            <p class="text-xs text-ink-500 mt-0.5">Successful</p>
          </div>
          <div class="bg-white rounded-2xl border border-ink-100 shadow-card p-4">
            <span class="inline-flex items-center justify-center w-9 h-9 rounded-xl mb-3 bg-gold-soft text-gold-dim">
              <Clock class="w-4.5 h-4.5" />
            </span>
            <p class="font-mono font-bold text-2xl text-ink-900">{{ stats.pendingCount }}</p>
            <p class="text-xs text-ink-500 mt-0.5">Pending</p>
          </div>
          <div class="bg-white rounded-2xl border border-ink-100 shadow-card p-4">
            <span class="inline-flex items-center justify-center w-9 h-9 rounded-xl mb-3 bg-coral-soft text-coral-dim">
              <XCircle class="w-4.5 h-4.5" />
            </span>
            <p class="font-mono font-bold text-2xl text-ink-900">{{ stats.failedCount }}</p>
            <p class="text-xs text-ink-500 mt-0.5">Failed</p>
          </div>
          <div class="bg-white rounded-2xl border border-ink-100 shadow-card p-4">
            <span class="inline-flex items-center justify-center w-9 h-9 rounded-xl mb-3 bg-ink-100 text-ink-500">
              <RotateCcw class="w-4.5 h-4.5" />
            </span>
            <p class="font-mono font-bold text-2xl text-ink-900">{{ stats.refundedCount }}</p>
            <p class="text-xs text-ink-500 mt-0.5">Refunds</p>
          </div>
        </div>

        <!-- Range breakdown -->
        <div class="mt-6">
          <div class="flex items-center justify-between mb-3">
            <p class="text-sm font-semibold text-ink-700">Revenue Breakdown</p>
            <div class="flex gap-1 bg-ink-50 rounded-lg p-1">
              <button
                v-for="range in (['daily', 'weekly', 'monthly', 'yearly'] as const)"
                :key="range"
                type="button"
                class="text-xs font-semibold rounded-md px-2.5 py-1.5 capitalize transition-colors"
                :class="statsRange === range ? 'bg-white text-brand-700 shadow-card' : 'text-ink-500'"
                @click="statsRange = range"
              >
                {{ range }}
              </button>
            </div>
          </div>
          <div class="bg-white rounded-2xl border border-ink-100 shadow-card divide-y divide-ink-50 max-h-56 overflow-y-auto">
            <div v-if="stats[statsRange].length === 0" class="text-center text-sm text-ink-300 py-8">
              No successful payments in this range yet.
            </div>
            <div
              v-for="bucket in [...stats[statsRange]].reverse()"
              :key="bucket.label"
              class="flex items-center justify-between px-4 py-2.5 text-sm"
            >
              <span class="font-mono text-ink-600">{{ bucket.label }}</span>
              <span class="text-ink-500">{{ bucket.count }} payment(s)</span>
              <span class="font-mono font-semibold text-ink-900">₦{{ bucket.revenueNaira.toLocaleString() }}</span>
            </div>
          </div>
        </div>

        <!-- Records -->
        <div class="mt-6">
          <div class="flex items-center justify-between gap-3 flex-wrap mb-3">
            <p class="text-sm font-semibold text-ink-700">Payment Records</p>
            <div class="flex items-center gap-2 flex-wrap">
              <div class="relative">
                <Search class="w-4 h-4 text-ink-300 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Search student, email, reference…"
                  class="rounded-xl border border-ink-200 bg-white pl-9 pr-3.5 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 w-64 max-w-full"
                  @input="resetPagination"
                />
              </div>
              <select
                v-model="statusFilter"
                class="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                @change="resetPagination"
              >
                <option value="all">All statuses</option>
                <option value="successful">Successful</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
                <option value="refunded">Refunded</option>
              </select>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 text-ink-600 hover:bg-ink-50 text-sm font-semibold px-3.5 py-2 transition-colors"
                @click="exportCsv"
              >
                <Download class="w-4 h-4" /> Export CSV
              </button>
            </div>
          </div>

          <div class="bg-white rounded-2xl border border-ink-100 shadow-card overflow-hidden">
            <div class="hidden md:grid grid-cols-[1fr_120px_90px_110px_100px_140px] gap-2 px-4 py-3 text-[11px] font-mono font-semibold text-ink-400 uppercase tracking-wide border-b border-ink-50">
              <span>Student</span>
              <span>Reference</span>
              <span class="text-right">Amount</span>
              <span>Method</span>
              <span>Status</span>
              <span class="text-right">Date</span>
            </div>

            <div v-if="pagedPayments.length === 0" class="text-center text-sm text-ink-300 py-10">
              No payments match your filters.
            </div>

            <div v-else class="divide-y divide-ink-50">
              <button
                v-for="p in pagedPayments"
                :key="p.id"
                type="button"
                class="w-full grid grid-cols-2 md:grid-cols-[1fr_120px_90px_110px_100px_140px] gap-2 px-4 py-3.5 items-center text-left hover:bg-ink-50/60 transition-colors"
                @click="detailsPayment = p; refundError = null"
              >
                <div class="col-span-2 md:col-span-1 min-w-0">
                  <p class="text-sm font-medium text-ink-900 truncate">{{ studentName(p.userId) }}</p>
                  <p class="text-xs text-ink-500 truncate">{{ studentEmail(p.userId) }}</p>
                </div>
                <span class="text-xs font-mono text-ink-500 truncate">{{ p.reference }}</span>
                <span class="text-sm font-mono font-bold text-ink-900 text-right">₦{{ p.amountNaira.toLocaleString() }}</span>
                <span class="text-xs text-ink-600 truncate">{{ p.gateway === 'paystack-titan-trust' ? 'Paystack' : 'Flutterwave' }}</span>
                <span
                  class="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 w-fit"
                  :class="statusStyles[p.status].badge"
                >
                  <component :is="statusStyles[p.status].icon" class="w-3 h-3" /> {{ p.status }}
                </span>
                <span class="text-xs text-ink-400 text-right">{{ formatDateTime(p.createdAt) }}</span>
              </button>
            </div>
          </div>

          <div class="flex items-center justify-between mt-3 text-sm">
            <p class="text-ink-400 text-xs">
              Page {{ currentPage }} of {{ totalPages }} · {{ filteredPayments.length }} record(s)
            </p>
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                class="p-2 rounded-lg border border-ink-200 text-ink-500 disabled:opacity-40"
                :disabled="currentPage === 1"
                @click="goToPage(currentPage - 1)"
              >
                <ChevronLeft class="w-4 h-4" />
              </button>
              <button
                type="button"
                class="p-2 rounded-lg border border-ink-200 text-ink-500 disabled:opacity-40"
                :disabled="currentPage === totalPages"
                @click="goToPage(currentPage + 1)"
              >
                <ChevronRight class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Payment details drawer -->
    <div
      v-if="detailsPayment"
      class="fixed inset-0 z-30 bg-ink-900/50 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div class="bg-white rounded-3xl shadow-panel max-w-sm w-full p-6 animate-popIn">
        <div class="flex items-center justify-between mb-4">
          <h4 class="font-display text-lg font-bold text-ink-900">Transaction Details</h4>
          <button type="button" class="p-1.5 rounded-lg hover:bg-ink-50 text-ink-400" @click="detailsPayment = null">
            <X class="w-4.5 h-4.5" />
          </button>
        </div>

        <div class="space-y-3 text-sm">
          <div class="flex justify-between">
            <span class="text-ink-500">Student</span>
            <span class="font-medium text-ink-900">{{ studentName(detailsPayment.userId) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ink-500">Reference</span>
            <span class="font-mono text-ink-900">{{ detailsPayment.reference }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ink-500">Amount</span>
            <span class="font-mono font-bold text-ink-900">₦{{ detailsPayment.amountNaira.toLocaleString() }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ink-500">Credits</span>
            <span class="font-mono text-ink-900">{{ detailsPayment.credits }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ink-500">Type</span>
            <span class="text-ink-900">{{ detailsPayment.paymentType }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ink-500">Method</span>
            <span class="text-ink-900">{{ detailsPayment.virtualBankName }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ink-500">Status</span>
            <span
              class="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5"
              :class="statusStyles[detailsPayment.status].badge"
            >
              <component :is="statusStyles[detailsPayment.status].icon" class="w-3 h-3" />
              {{ detailsPayment.status }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-ink-500">Created</span>
            <span class="text-ink-900">{{ formatDateTime(detailsPayment.createdAt) }}</span>
          </div>
          <div v-if="detailsPayment.completedAt" class="flex justify-between">
            <span class="text-ink-500">Completed</span>
            <span class="text-ink-900">{{ formatDateTime(detailsPayment.completedAt) }}</span>
          </div>
        </div>

        <p
          v-if="refundError"
          class="text-sm text-coral-dim bg-coral-soft border border-coral/30 rounded-xl px-3.5 py-2.5 mt-4"
        >
          {{ refundError }}
        </p>

        <button
          v-if="detailsPayment.status === 'successful'"
          type="button"
          class="w-full mt-5 inline-flex items-center justify-center gap-1.5 rounded-xl border border-coral/40 text-coral hover:bg-coral-soft text-sm font-semibold py-2.5 disabled:opacity-50 transition-colors"
          :disabled="isRefunding"
          @click="handleRefund"
        >
          <RotateCcw class="w-4 h-4" /> {{ isRefunding ? 'Refunding…' : 'Refund Payment' }}
        </button>
      </div>
    </div>
  </AdminShell>
</template>