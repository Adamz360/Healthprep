<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Search, Coins, ShieldCheck, GraduationCap, Plus, Minus } from 'lucide-vue-next';
import { db, uid, ensureWalletExists } from '../../db';
import AdminShell from '../../components/AdminShell.vue';
import type { User, Department, Wallet } from '../../types/healthApp';

interface UserRow {
  user: User;
  departmentName: string;
  wallet: Wallet;
}

const rows = ref<UserRow[]>([]);
const isLoading = ref(true);
const searchQuery = ref('');

const adjustingUserId = ref<string | null>(null);
const adjustAmount = ref<number>(50);
const isSavingAdjustment = ref(false);

onMounted(async () => {
  await loadUsers();
});

async function loadUsers() {
  isLoading.value = true;
  const [users, departments] = await Promise.all([db.users.toArray(), db.departments.toArray()]);
  const deptById = new Map<string, Department>(departments.map((d) => [d.id, d]));

  const built: UserRow[] = [];
  for (const user of users) {
    const wallet = await ensureWalletExists(user.id);
    built.push({
      user,
      departmentName: deptById.get(user.departmentId)?.name ?? '—',
      wallet,
    });
  }

  // Newest accounts first
  built.sort((a, b) => (a.user.createdAt < b.user.createdAt ? 1 : -1));
  rows.value = built;
  isLoading.value = false;
}

const filteredRows = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return rows.value;
  return rows.value.filter((r) => r.user.fullName.toLowerCase().includes(q) || r.user.email.toLowerCase().includes(q));
});

function openAdjust(userId: string) {
  adjustingUserId.value = userId;
  adjustAmount.value = 50;
}

function closeAdjust() {
  adjustingUserId.value = null;
}

async function applyAdjustment(direction: 1 | -1) {
  if (!adjustingUserId.value || adjustAmount.value <= 0) return;
  isSavingAdjustment.value = true;

  try {
    const row = rows.value.find((r) => r.user.id === adjustingUserId.value);
    if (!row) return;

    const delta = direction * adjustAmount.value;
    const newBalance = Math.max(0, row.wallet.balance + delta);
    const actualDelta = newBalance - row.wallet.balance;

    const updatedWallet: Wallet = {
      ...row.wallet,
      balance: newBalance,
      totalEarned: row.wallet.totalEarned + (actualDelta > 0 ? actualDelta : 0),
      totalSpent: row.wallet.totalSpent + (actualDelta < 0 ? Math.abs(actualDelta) : 0),
      updatedAt: new Date().toISOString(),
    };

    await db.transaction('rw', db.wallet, db.wallet_transactions, async () => {
      await db.wallet.put(updatedWallet);
      await db.wallet_transactions.add({
        id: uid('tx'),
        userId: row.user.id,
        type: direction > 0 ? 'earned-quiz' : 'spent-mock-unlock',
        amount: actualDelta,
        balanceAfter: newBalance,
        description: `Admin adjustment: ${direction > 0 ? '+' : ''}${actualDelta} credits`,
        createdAt: new Date().toISOString(),
      });
    });

    row.wallet = updatedWallet;
    closeAdjust();
  } finally {
    isSavingAdjustment.value = false;
  }
}
</script>

<template>
  <AdminShell>
    <div class="max-w-5xl mx-auto px-5 py-6">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 class="font-display text-xl font-bold text-ink-900">Users</h1>
          <p class="text-sm text-ink-500 mt-1">{{ rows.length }} registered accounts.</p>
        </div>

        <div class="relative">
          <Search class="w-4 h-4 text-ink-300 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search name or email…"
            class="rounded-xl border border-ink-200 bg-white pl-9 pr-3.5 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 w-64 max-w-full"
          />
        </div>
      </div>

      <div v-if="isLoading" class="text-sm text-ink-300 text-center py-16">Loading users…</div>

      <div v-else class="mt-5 bg-white rounded-2xl border border-ink-100 shadow-card overflow-hidden">
        <div class="hidden sm:grid grid-cols-[1fr_140px_90px_90px_120px] gap-2 px-4 py-3 text-[11px] font-mono font-semibold text-ink-400 uppercase tracking-wide border-b border-ink-50">
          <span>User</span>
          <span>Course</span>
          <span>Role</span>
          <span class="text-right">Credits</span>
          <span class="text-right">Action</span>
        </div>

        <div v-if="filteredRows.length === 0" class="text-center text-sm text-ink-300 py-10">No users match your search.</div>

        <div v-else class="divide-y divide-ink-50">
          <div
            v-for="row in filteredRows"
            :key="row.user.id"
            class="grid grid-cols-2 sm:grid-cols-[1fr_140px_90px_90px_120px] gap-2 px-4 py-3.5 items-center"
          >
            <div class="col-span-2 sm:col-span-1 min-w-0">
              <p class="text-sm font-medium text-ink-900 truncate">{{ row.user.fullName }}</p>
              <p class="text-xs text-ink-500 truncate">{{ row.user.email }}</p>
            </div>
            <span class="text-xs text-ink-600 truncate">{{ row.departmentName }}</span>
            <span
              class="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 w-fit"
              :class="row.user.role === 'admin' ? 'bg-gold-soft text-gold-dim' : 'bg-brand-50 text-brand-600'"
            >
              <ShieldCheck v-if="row.user.role === 'admin'" class="w-3 h-3" />
              <GraduationCap v-else class="w-3 h-3" />
              {{ row.user.role }}
            </span>
            <span class="text-sm font-mono font-bold text-ink-900 text-right sm:text-right">{{ row.wallet.balance }}</span>
            <div class="text-right">
              <button
                type="button"
                class="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 border border-brand-200 bg-brand-50 rounded-full px-2.5 py-1.5"
                @click="openAdjust(row.user.id)"
              >
                <Coins class="w-3 h-3" /> Adjust
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Adjust credits modal -->
    <div v-if="adjustingUserId" class="fixed inset-0 z-30 bg-ink-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl shadow-panel max-w-xs w-full p-6 animate-popIn">
        <h4 class="font-display text-lg font-bold text-ink-900 mb-1">Adjust Credits</h4>
        <p class="text-sm text-ink-500 mb-4">
          {{ rows.find((r) => r.user.id === adjustingUserId)?.user.fullName }}
        </p>

        <label class="block text-xs font-semibold text-ink-500 mb-1.5">Amount</label>
        <input
          v-model.number="adjustAmount"
          type="number"
          min="1"
          class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 text-sm font-mono text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 mb-4"
        />

        <div class="flex gap-2.5">
          <button
            type="button"
            class="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold py-2.5 disabled:opacity-50 transition-colors"
            :disabled="isSavingAdjustment"
            @click="applyAdjustment(1)"
          >
            <Plus class="w-4 h-4" /> Add
          </button>
          <button
            type="button"
            class="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-coral hover:brightness-95 text-white text-sm font-semibold py-2.5 disabled:opacity-50 transition-colors"
            :disabled="isSavingAdjustment"
            @click="applyAdjustment(-1)"
          >
            <Minus class="w-4 h-4" /> Deduct
          </button>
        </div>

        <button type="button" class="w-full mt-3 text-center text-sm font-medium text-ink-500 py-2" @click="closeAdjust">
          Cancel
        </button>
      </div>
    </div>
  </AdminShell>
</template>
