<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Lock, ArrowLeft, CheckCircle2, AlertCircle, Loader2, XCircle } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const token = ref('');
const email = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const isVerifying = ref(true);
const isSubmitting = ref(false);
const isValid = ref(false);
const errorMsg = ref('');
const successMsg = ref('');

onMounted(async () => {
  token.value = (route.query.token as string) ?? '';

  if (!token.value) {
    errorMsg.value = 'No reset token provided.';
    isVerifying.value = false;
    return;
  }

  const result = await auth.validateResetToken(token.value);

  if (result.valid && result.email) {
    isValid.value = true;
    email.value = result.email;
  } else {
    errorMsg.value = result.error ?? 'Invalid or expired reset link.';
  }

  isVerifying.value = false;
});

async function handleReset() {
  errorMsg.value = '';

  if (newPassword.value !== confirmPassword.value) {
    errorMsg.value = 'Passwords do not match.';
    return;
  }

  isSubmitting.value = true;

  const result = await auth.resetPasswordWithToken(token.value, newPassword.value);

  if (result.success) {
    successMsg.value = 'Password updated successfully. Redirecting to login…';
    setTimeout(() => router.replace({ name: 'login' }), 2000);
  } else {
    errorMsg.value = result.error ?? 'Something went wrong.';
  }

  isSubmitting.value = false;
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-ink-50">
    <!-- Top bar -->
    <div class="px-5 pt-6">
      <button
        type="button"
        class="flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800 transition-colors"
        @click="router.replace({ name: 'login' })"
      >
        <ArrowLeft class="w-4 h-4" />
        Back to login
      </button>
    </div>

    <div class="flex-1 flex items-start justify-center px-5 pt-10">
      <div class="w-full max-w-sm">

        <!-- Verifying token -->
        <template v-if="isVerifying">
          <div class="flex flex-col items-center gap-3 py-12">
            <Loader2 class="w-6 h-6 text-brand-600 animate-spin" />
            <p class="text-sm text-ink-500">Verifying your reset link…</p>
          </div>
        </template>

        <!-- Invalid token -->
        <template v-else-if="!isValid">
          <div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-coral/10 text-coral mx-auto mb-5">
            <XCircle class="w-6 h-6" />
          </div>

          <h1 class="font-display text-xl font-bold text-ink-900 text-center">
            Invalid reset link
          </h1>

          <div
            class="flex items-start gap-2 bg-coral/10 border border-coral/20 text-coral text-sm rounded-xl px-4 py-3 mt-4"
          >
            <AlertCircle class="w-4 h-4 mt-0.5 shrink-0" />
            <span>{{ errorMsg }}</span>
          </div>

          <button
            type="button"
            class="w-full mt-6 bg-brand-600 text-white font-semibold text-sm rounded-xl px-4 py-3
                   hover:bg-brand-700 transition-colors"
            @click="router.replace({ name: 'forgot-password' })"
          >
            Request a new link
          </button>
        </template>

        <!-- Valid token — show reset form -->
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

          <!-- Success -->
          <div
            v-if="successMsg"
            class="flex items-start gap-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3 mt-5"
          >
            <CheckCircle2 class="w-4 h-4 mt-0.5 shrink-0" />
            <span>{{ successMsg }}</span>
          </div>

          <!-- Error -->
          <div
            v-if="errorMsg"
            class="flex items-start gap-2 bg-coral/10 border border-coral/20 text-coral text-sm rounded-xl px-4 py-3 mt-5"
          >
            <AlertCircle class="w-4 h-4 mt-0.5 shrink-0" />
            <span>{{ errorMsg }}</span>
          </div>

          <form v-if="!successMsg" class="mt-6 space-y-4" @submit.prevent="handleReset">
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