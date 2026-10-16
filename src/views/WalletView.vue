<!-- src/views/WalletView.vue -->
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  ChevronLeft,
  Coins,
  Copy,
  Check,
  Flame,
  TrendingUp,
  TrendingDown,
  Plus,
  Landmark,
  LogOut,
  ShieldCheck,
} from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useWalletAndGamificationStore } from '../stores/walletAndGamification';
import {
  createPendingPayment,
  markPaymentSuccessful,
  markPaymentFailed,
  generatePaymentReference,
} from '../services/wallet';
import type { CreditPackage, PaymentGateway, MockVirtualAccount } from '../types/healthApp';

const router = useRouter();
const auth = useAuthStore();
const wallet = useWalletAndGamificationStore();
const isLoading = ref(true);
const codeCopied = ref(false);

onMounted(async () => {
  if (auth.userId) {
    await wallet.initForUser(auth.userId);
    await wallet.ensureReferralCode();
  }
  isLoading.value = false;
});

const referralShareText = computed(
  () => `Join me on HealthPrep CBT and get bonus credits! Use my code ${wallet.referralCode} when you sign up.`,
);

async function copyReferralCode() {
  if (!wallet.referralCode) return;
  try {
    await navigator.clipboard.writeText(wallet.referralCode);
    codeCopied.value = true;
    setTimeout(() => (codeCopied.value = false), 2000);
  } catch {
    // Clipboard API unavailable
  }
}

function shareReferral() {
  if (navigator.share) {
    navigator.share({ title: 'HealthPrep CBT', text: referralShareText.value }).catch(() => {});
  } else {
    copyReferralCode();
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function handleLogout() {
  await auth.logout();
  router.replace({ name: 'login' });
}

/* ── Buy Credit flow ───────────────────────────────────────────────────── */

const CREDIT_PACKAGES: CreditPackage[] = [
  { id: 'pkg-100', credits: 100, amountNaira: 500 },
  { id: 'pkg-250', credits: 250, amountNaira: 1000, isPopular: true },
  { id: 'pkg-600', credits: 600, amountNaira: 2000 },
];

const GATEWAYS: { id: PaymentGateway; label: string; sublabel: string }[] = [
  { id: 'paystack-titan-trust', label: 'Paystack', sublabel: 'Titan Trust Bank virtual account' },
  { id: 'flutterwave', label: 'Flutterwave', sublabel: 'Wema Bank virtual account' },
];

type BuyStep = 'closed' | 'amount' | 'gateway' | 'account' | 'success';

const buyStep = ref<BuyStep>('closed');
const selectedPackage = ref<CreditPackage | null>(null);
const selectedGateway = ref<PaymentGateway | null>(null);
const virtualAccount = ref<MockVirtualAccount | null>(null);
const currentPaymentId = ref<string | null>(null);
const isVerifying = ref(false);
const accountCopied = ref(false);

function openBuyCredit() {
  selectedPackage.value = null;
  selectedGateway.value = null;
  virtualAccount.value = null;
  currentPaymentId.value = null;
  buyStep.value = 'amount';
}

function closeBuyCredit() {
  buyStep.value = 'closed';
}

function choosePackage(pkg: CreditPackage) {
  selectedPackage.value = pkg;
  buyStep.value = 'gateway';
}

function generateMockAccountNumber(): string {
  let digits = '';
  for (let i = 0; i < 10; i++) digits += Math.floor(Math.random() * 10);
  return digits;
}

async function chooseGateway(gateway: PaymentGateway) {
  if (!selectedPackage.value || !auth.userId) return;
  selectedGateway.value = gateway;

  const bankName = gateway === 'paystack-titan-trust'
    ? 'Titan Trust Bank'
    : 'Wema Bank (Flutterwave)';
  const accountNumber = generateMockAccountNumber();
  const reference = generatePaymentReference();

  virtualAccount.value = {
    gateway,
    bankName,
    accountNumber,
    accountName: 'HealthPrep CBT / ' + (auth.currentUser?.fullName ?? 'Candidate'),
    amountNaira: selectedPackage.value.amountNaira,
    credits: selectedPackage.value.credits,
    reference,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };

  try {
    const payment = await createPendingPayment({
      userId: auth.userId,
      gateway,
      amountNaira: selectedPackage.value.amountNaira,
      credits: selectedPackage.value.credits,
      virtualAccountNumber: accountNumber,
      virtualBankName: bankName,
      reference,
    });
    currentPaymentId.value = payment.id;
    buyStep.value = 'account';
  } catch (err: any) {
    console.error('[Wallet] Failed to create payment:', err);
  }
}

async function copyAccountNumber() {
  if (!virtualAccount.value) return;
  try {
    await navigator.clipboard.writeText(virtualAccount.value.accountNumber);
    accountCopied.value = true;
    setTimeout(() => (accountCopied.value = false), 2000);
  } catch {
    // ignore
  }
}

async function verifyPayment() {
  if (!virtualAccount.value || !currentPaymentId.value) return;
  isVerifying.value = true;

  try {
    // Mock verification — real integration would poll Paystack/Flutterwave
    await new Promise((resolve) => setTimeout(resolve, 1500));

    try {
      const walletTx = await wallet.earnCredits(
        'purchased-credit',
        `Purchased ${virtualAccount.value.credits} credits via ${
          virtualAccount.value.gateway === 'paystack-titan-trust'
            ? 'Paystack (Titan Trust)'
            : 'Flutterwave'
        }`,
        virtualAccount.value.credits,
      );
      await markPaymentSuccessful(currentPaymentId.value, walletTx.id);
      buyStep.value = 'success';
    } catch {
      await markPaymentFailed(currentPaymentId.value);
      buyStep.value = 'success';
    }
  } finally {
    isVerifying.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-canvas">
    <header class="bg-white border-b border-ink-100 px-4 py-4 sticky top-0 z-10">
      <div class="max-w-2xl mx-auto flex items-center gap-3">
        <button type="button" class="p-1.5 -ml-1.5 rounded-lg hover:bg-ink-50" @click="router.back()">
          <ChevronLeft class="w-5 h-5 text-ink-700" />
        </button>
        <h1 class="font-display font-bold text-ink-900">Wallet & Rewards</h1>
      </div>
    </header>

    <div v-if="isLoading" class="text-sm text-ink-300 text-center py-16">Loading wallet…</div>

    <div v-else class="max-w-2xl mx-auto px-4 py-5 space-y-5">
      <!-- Balance card -->
      <div class="bg-gradient-to-br from-ink-900 to-brand-800 rounded-3xl p-5 text-white shadow-panel">
        <p class="text-brand-200 text-xs font-mono uppercase tracking-wide">Credit Balance</p>
        <p class="font-display text-5xl font-bold mt-1.5 flex items-center gap-2">
          <Coins class="w-8 h-8 text-gold" />
          <span class="font-mono">{{ wallet.creditBalance }}</span>
        </p>
        <div class="flex items-center justify-between mt-4">
          <div class="flex gap-4 text-xs text-brand-200 font-mono">
            <span>Earned: {{ wallet.wallet?.totalEarned ?? 0 }}</span>
            <span>Spent: {{ wallet.wallet?.totalSpent ?? 0 }}</span>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full bg-pulse text-ink-900 text-xs font-semibold px-3.5 py-2 hover:brightness-95 transition-all"
            @click="openBuyCredit"
          >
            <Plus class="w-3.5 h-3.5" /> Buy Credit
          </button>
        </div>
      </div>

      <!-- Streak -->
      <div class="bg-white rounded-2xl border border-ink-100 shadow-card p-4 flex items-center gap-3">
        <span class="flex items-center justify-center w-11 h-11 rounded-xl bg-coral-soft text-coral shrink-0">
          <Flame class="w-5.5 h-5.5" />
        </span>
        <div>
          <p class="text-sm font-semibold text-ink-900">
            <span class="font-mono">{{ wallet.currentStreak }}</span> day streak
          </p>
          <p class="text-xs text-ink-500">
            Longest: <span class="font-mono">{{ wallet.longestStreak }}</span> days · +5 credits per day
          </p>
        </div>
      </div>

      <!-- Referral -->
      <div class="bg-white rounded-2xl border border-ink-100 shadow-card p-4">
        <p class="text-sm font-semibold text-ink-900 mb-1">Invite friends, earn credits</p>
        <p class="text-xs text-ink-500 mb-3">
          You get 30 credits, they get 15 — for every friend who joins with your code.
        </p>

        <div class="flex items-center gap-2">
          <div class="flex-1 bg-canvas border border-dashed border-ink-200 rounded-xl px-3 py-2.5 font-mono font-bold text-brand-700 text-center tracking-wider">
            {{ wallet.referralCode }}
          </div>
          <button
            type="button"
            class="p-2.5 rounded-xl border border-ink-200 text-ink-600 hover:bg-ink-50 shrink-0 transition-colors"
            @click="copyReferralCode"
          >
            <Check v-if="codeCopied" class="w-4 h-4 text-brand-600" />
            <Copy v-else class="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          class="w-full mt-3 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium py-2.5 transition-colors"
          @click="shareReferral"
        >
          Share Invite
        </button>
      </div>

      <!-- Transaction history -->
      <div class="bg-white rounded-2xl border border-ink-100 shadow-card p-4">
        <p class="text-sm font-semibold text-ink-900 mb-3">Recent Activity</p>

        <div v-if="wallet.recentTransactions.length === 0" class="text-xs text-ink-300 text-center py-6">
          No transactions yet.
        </div>

        <div v-else class="divide-y divide-ink-50">
          <div
            v-for="tx in wallet.recentTransactions"
            :key="tx.id"
            class="flex items-center justify-between py-2.5 gap-2"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <span
                class="flex items-center justify-center w-7 h-7 rounded-full shrink-0"
                :class="tx.amount > 0 ? 'bg-brand-50 text-brand-600' : 'bg-coral-soft text-coral'"
              >
                <TrendingUp v-if="tx.amount > 0" class="w-3.5 h-3.5" />
                <TrendingDown v-else class="w-3.5 h-3.5" />
              </span>
              <div class="min-w-0">
                <p class="text-xs font-medium text-ink-700 truncate">{{ tx.description }}</p>
                <p class="text-[11px] text-ink-300 font-mono">{{ formatDate(tx.createdAt) }}</p>
              </div>
            </div>
            <span
              class="text-sm font-mono font-bold shrink-0"
              :class="tx.amount > 0 ? 'text-brand-600' : 'text-coral'"
            >
              {{ tx.amount > 0 ? '+' : '' }}{{ tx.amount }}
            </span>
          </div>
        </div>
      </div>

      <!-- Account -->
      <div class="bg-white rounded-2xl border border-ink-100 shadow-card p-4">
        <p class="text-sm font-semibold text-ink-900 mb-0.5">{{ auth.currentUser?.fullName }}</p>
        <p class="text-xs text-ink-500 mb-3">{{ auth.currentUser?.email }}</p>
        <button
          type="button"
          class="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-ink-200 text-ink-600 hover:bg-ink-50 text-sm font-medium py-2.5 transition-colors"
          @click="handleLogout"
        >
          <LogOut class="w-4 h-4" /> Sign Out
        </button>
      </div>
    </div>

    <!-- Buy Credit modal flow -->
    <div
      v-if="buyStep !== 'closed'"
      class="fixed inset-0 z-30 bg-ink-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div class="bg-white rounded-t-3xl sm:rounded-3xl shadow-panel max-w-sm w-full p-6 animate-popIn max-h-[90vh] overflow-y-auto">
        <!-- Step: choose amount -->
        <template v-if="buyStep === 'amount'">
          <h4 class="font-display text-lg font-bold text-ink-900 mb-1">Buy Credits</h4>
          <p class="text-sm text-ink-500 mb-4">Choose a credit package.</p>

          <div class="space-y-2.5">
            <button
              v-for="pkg in CREDIT_PACKAGES"
              :key="pkg.id"
              type="button"
              class="w-full flex items-center justify-between rounded-2xl border-2 border-ink-100 hover:border-brand-400 px-4 py-3.5 text-left transition-colors"
              @click="choosePackage(pkg)"
            >
              <div>
                <p class="font-mono font-bold text-ink-900 text-sm flex items-center gap-1.5">
                  {{ pkg.credits }} credits
                  <span
                    v-if="pkg.isPopular"
                    class="text-[10px] font-sans font-semibold bg-gold-soft text-gold-dim rounded-full px-2 py-0.5"
                  >
                    POPULAR
                  </span>
                </p>
                <p class="text-xs text-ink-500 mt-0.5">One-time purchase</p>
              </div>
              <p class="font-mono font-bold text-brand-700">₦{{ pkg.amountNaira.toLocaleString() }}</p>
            </button>
          </div>

          <button
            type="button"
            class="w-full mt-4 text-center text-sm font-medium text-ink-500 py-2"
            @click="closeBuyCredit"
          >
            Cancel
          </button>
        </template>

        <!-- Step: choose gateway -->
        <template v-else-if="buyStep === 'gateway'">
          <h4 class="font-display text-lg font-bold text-ink-900 mb-1">Pay via Bank Transfer</h4>
          <p class="text-sm text-ink-500 mb-4">
            {{ selectedPackage?.credits }} credits for
            <span class="font-mono font-semibold text-ink-700">
              ₦{{ selectedPackage?.amountNaira.toLocaleString() }}
            </span>
            — choose a provider.
          </p>

          <div class="space-y-2.5">
            <button
              v-for="gw in GATEWAYS"
              :key="gw.id"
              type="button"
              class="w-full flex items-center gap-3 rounded-2xl border-2 border-ink-100 hover:border-brand-400 px-4 py-3.5 text-left transition-colors"
              @click="chooseGateway(gw.id)"
            >
              <span class="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-50 text-brand-600 shrink-0">
                <Landmark class="w-5 h-5" />
              </span>
              <div>
                <p class="font-semibold text-ink-900 text-sm">{{ gw.label }}</p>
                <p class="text-xs text-ink-500 mt-0.5">{{ gw.sublabel }}</p>
              </div>
            </button>
          </div>

          <button
            type="button"
            class="w-full mt-4 text-center text-sm font-medium text-ink-500 py-2"
            @click="buyStep = 'amount'"
          >
            Back
          </button>
        </template>

        <!-- Step: virtual account details -->
        <template v-else-if="buyStep === 'account' && virtualAccount">
          <h4 class="font-display text-lg font-bold text-ink-900 mb-1">Transfer to complete</h4>
          <p class="text-sm text-ink-500 mb-4">
            Send exactly this amount from your bank app. Credits apply instantly after verification.
          </p>

          <div class="bg-ink-900 rounded-2xl p-5 text-white space-y-3.5">
            <div>
              <p class="text-brand-200 text-[11px] font-mono uppercase tracking-wide">Bank Name</p>
              <p class="font-semibold text-sm mt-0.5">{{ virtualAccount.bankName }}</p>
            </div>
            <div>
              <p class="text-brand-200 text-[11px] font-mono uppercase tracking-wide">Account Number</p>
              <div class="flex items-center gap-2 mt-0.5">
                <p class="font-mono font-bold text-xl tracking-wider text-pulse">
                  {{ virtualAccount.accountNumber }}
                </p>
                <button type="button" class="text-white/70 hover:text-white" @click="copyAccountNumber">
                  <Check v-if="accountCopied" class="w-4 h-4 text-pulse" />
                  <Copy v-else class="w-4 h-4" />
                </button>
              </div>
            </div>
            <div>
              <p class="text-brand-200 text-[11px] font-mono uppercase tracking-wide">Account Name</p>
              <p class="font-semibold text-sm mt-0.5 truncate">{{ virtualAccount.accountName }}</p>
            </div>
            <div class="flex items-center justify-between pt-3 border-t border-white/10">
              <p class="text-brand-200 text-[11px] font-mono uppercase tracking-wide">Amount</p>
              <p class="font-mono font-bold text-lg text-gold">
                ₦{{ virtualAccount.amountNaira.toLocaleString() }}
              </p>
            </div>
          </div>

          <p class="text-xs text-ink-400 mt-3 font-mono">Ref: {{ virtualAccount.reference }}</p>

          <button
            type="button"
            class="w-full mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-semibold py-3.5 disabled:opacity-60 transition-colors"
            :disabled="isVerifying"
            @click="verifyPayment"
          >
            <ShieldCheck class="w-4 h-4" />
            {{ isVerifying ? 'Verifying…' : 'Verify Payment' }}
          </button>

          <button
            type="button"
            class="w-full mt-2 text-center text-sm font-medium text-ink-500 py-2"
            @click="closeBuyCredit"
          >
            Cancel
          </button>
        </template>

        <!-- Step: success -->
        <template v-else-if="buyStep === 'success' && virtualAccount">
          <div class="text-center py-4">
            <span class="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-50 text-brand-600 mb-4">
              <ShieldCheck class="w-7 h-7" />
            </span>
            <h4 class="font-display text-lg font-bold text-ink-900">Payment verified!</h4>
            <p class="text-sm text-ink-500 mt-1.5">
              <span class="font-mono font-semibold text-brand-700">
                {{ virtualAccount.credits }} credits
              </span>
              have been added to your wallet.
            </p>
          </div>

          <button
            type="button"
            class="w-full mt-2 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-semibold py-3 transition-colors"
            @click="closeBuyCredit"
          >
            Done
          </button>
        </template>
      </div>
    </div>
  </div>
</template>