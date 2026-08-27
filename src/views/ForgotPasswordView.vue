<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Mail, Lock, ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();

// ── State ────────────────────────────────────────────────────────────
const step = ref<'email' | 'reset'>('email');
const email = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const isSubmitting = ref(false);
const errorMsg = ref('');
const successMsg = ref('');

// ── Step 1: Verify email ─────────────────────────────────────────────
async function handleRequestReset() {
  errorMsg.value = '';
  isSubmitting.value = true;

  const result = await auth.requestPasswordReset(email.value);

  if (result.success) {
    step.value = 'reset';
  } else {
    errorMsg.value = result.error ?? 'Something went wrong.';
  }

  isSubmitting.value = false;
}

// ── Step 2: Set new password ─────────────────────────────────────────
async function handleResetPassword() {
  errorMsg.value = '';
  successMsg.value = '';

  if (newPassword.value !== confirmPassword.value) {
    errorMsg.value = 'Passwords do not match.';
    return;
  }

  isSubmitting.value = true;

  const result = await auth.resetPassword(email.value, newPassword.value);

  if (result.success) {
    successMsg.value = 'Password updated successfully. Redirecting to login…';
    setTimeout(() => router.replace({ name: 'login' }), 1800);
  } else {
    errorMsg.value = result.error ?? 'Something went wrong.';
  }

  isSubmitting.value = false;
}

function goBack() {
  if (step.value === 'reset') {
    step.value = 'email';
    newPassword.value = '';
    confirmPassword.value = '';
    errorMsg.value = '';
    successMsg.value = '';
  } else {
    router.replace({ name: 'login' });
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-ink-50">
    <!-- Top bar -->
    <div class="px-5 pt-6">
      <button
        type="button"
        class="flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800 transition-colors"
        @click="goBack"
      >
        <ArrowLeft class="w-4 h-4" />
        {{ step === 'reset' ? 'Back' : 'Login' }}
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 flex items-start justify-center px-5 pt-10">
      <div class="w-full max-w-sm">

        <!-- ── Step 1: Enter email ─────────────────────────────────── -->
        <template v-if="step === 'email'">
          <div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 mx-auto mb-5">
            <Mail class="w-6 h-6" />
          </div>

          <h1 class="font-display text-xl font-bold text-ink-900 text-center">
            Forgot your password?
          </h1>
          <p class="text-sm text-ink-500 text-center mt-2 leading-relaxed">
            Enter the email address linked to your account and we'll help
            you set a new password.
          </p>

          <!-- Error -->
          <div
            v-if="errorMsg"
            class="flex items-start gap-2 bg-coral/10 border border-coral/20 text-coral text-sm rounded-xl px-4 py-3 mt-5"
          >
            <AlertCircle class="w-4 h-4 mt-0.5 shrink-0" />
            <span>{{ errorMsg }}</span>
          </div>

          <form class="mt-6 space-y-4" @submit.prevent="handleRequestReset">
            <div>
              <label for="reset-email" class="block text-xs font-semibold text-ink-600 mb-1.5">
                Email address
              </label>
              <input
                id="reset-email"
                v-model="email"
                type="email"
                required
                autocomplete="email"
                placeholder="you@example.com"
                class="w-full bg-white border border-ink-200 rounded-xl px-4 py-3 text-sm text-ink-900
                       placeholder:text-ink-300 focus:outline-none focus:border-brand-400 focus:ring-2
                       focus:ring-brand-100 transition-shadow"
              />
            </div>

            <button
              type="submit"
              :disabled="isSubmitting"
              class="w-full flex items-center justify-center gap-2 bg-brand-600 text-white font-semibold
                     text-sm rounded-xl px-4 py-3 hover:bg-brand-700 active:scale-[.98] transition-all
                     disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Loader2 v-if="isSubmitting" class="w-4 h-4 animate-spin" />
              <span>{{ isSubmitting ? 'Verifying…' : 'Continue' }}</span>
            </button>
          </form>
        </template>

        <!-- ── Step 2: New password ────────────────────────────────── -->
        <template v-else>
          <div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 mx-auto mb-5">
            <Lock class="w-6 h-6" />
          </div>

          <h1 class="font-display text-xl font-bold text-ink-900 text-center">
            Set a new password
          </h1>
          <p class="text-sm text-ink-500 text-center mt-2 leading-relaxed">
            Choose a strong password for
            <span class="font-medium text-ink-700">{{ email }}</span>.
          </p>

          <!-- Local-first notice -->
          <div class="bg-brand-50 border border-brand-100 text-brand-700 text-xs rounded-xl px-4 py-3 mt-4 leading-relaxed">
            This is a local-first app — your new password is hashed and
            stored only on this device. No email is sent.
          </div>

          <!-- Success -->
          <div
            v-if="successMsg"
            class="flex items-start gap-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3 mt-4"
          >
            <CheckCircle2 class="w-4 h-4 mt-0.5 shrink-0" />
            <span>{{ successMsg }}</span>
          </div>

          <!-- Error -->
          <div
            v-if="errorMsg"
            class="flex items-start gap-2 bg-coral/10 border border-coral/20 text-coral text-sm rounded-xl px-4 py-3 mt-4"
          >
            <AlertCircle class="w-4 h-4 mt-0.5 shrink-0" />
            <span>{{ errorMsg }}</span>
          </div>

          <form v-if="!successMsg" class="mt-6 space-y-4" @submit.prevent="handleResetPassword">
            <div>
              <label for="new-password" class="block text-xs font-semibold text-ink-600 mb-1.5">
                New password
              </label>
              <input
                id="new-password"
                v-model="newPassword"
                type="password"
                required
                autocomplete="new-password"
                placeholder="At least 6 characters"
                minlength="6"
                class="w-full bg-white border border-ink-200 rounded-xl px-4 py-3 text-sm text-ink-900
                       placeholder:text-ink-300 focus:outline-none focus:border-brand-400 focus:ring-2
                       focus:ring-brand-100 transition-shadow"
              />
            </div>

            <div>
              <label for="confirm-password" class="block text-xs font-semibold text-ink-600 mb-1.5">
                Confirm password
              </label>
              <input
                id="confirm-password"
                v-model="confirmPassword"
                type="password"
                required
                autocomplete="new-password"
                placeholder="Re-enter your password"
                minlength="6"
                class="w-full bg-white border border-ink-200 rounded-xl px-4 py-3 text-sm text-ink-900
                       placeholder:text-ink-300 focus:outline-none focus:border-brand-400 focus:ring-2
                       focus:ring-brand-100 transition-shadow"
              />
            </div>

            <button
              type="submit"
              :disabled="isSubmitting"
              class="w-full flex items-center justify-center gap-2 bg-brand-600 text-white font-semibold
                     text-sm rounded-xl px-4 py-3 hover:bg-brand-700 active:scale-[.98] transition-all
                     disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Loader2 v-if="isSubmitting" class="w-4 h-4 animate-spin" />
              <span>{{ isSubmitting ? 'Resetting…' : 'Reset password' }}</span>
            </button>
          </form>
        </template>

      </div>
    </div>
  </div>
</template>