<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Mail, ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();

const email = ref('');
const isSubmitting = ref(false);
const errorMsg = ref('');
const emailSent = ref(false);

async function handleSubmit() {
  errorMsg.value = '';
  isSubmitting.value = true;

  const result = await auth.requestPasswordReset(email.value);

  if (result.success) {
    emailSent.value = true;
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

    <!-- Content -->
    <div class="flex-1 flex items-start justify-center px-5 pt-10">
      <div class="w-full max-w-sm">

        <!-- Before sending -->
        <template v-if="!emailSent">
          <div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 mx-auto mb-5">
            <Mail class="w-6 h-6" />
          </div>

          <h1 class="font-display text-xl font-bold text-ink-900 text-center">
            Forgot your password?
          </h1>
          <p class="text-sm text-ink-500 text-center mt-2 leading-relaxed">
            Enter the email address linked to your account and we'll send
            you a link to reset your password.
          </p>

          <!-- Error -->
          <div
            v-if="errorMsg"
            class="flex items-start gap-2 bg-coral/10 border border-coral/20 text-coral text-sm rounded-xl px-4 py-3 mt-5"
          >
            <AlertCircle class="w-4 h-4 mt-0.5 shrink-0" />
            <span>{{ errorMsg }}</span>
          </div>

          <form class="mt-6 space-y-4" @submit.prevent="handleSubmit">
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
              <span>{{ isSubmitting ? 'Sending…' : 'Send reset link' }}</span>
            </button>
          </form>
        </template>

        <!-- After sending -->
        <template v-else>
          <div class="flex items-center justify-center w-14 h-14 rounded-2xl bg-green-50 text-green-600 mx-auto mb-5">
            <CheckCircle2 class="w-6 h-6" />
          </div>

          <h1 class="font-display text-xl font-bold text-ink-900 text-center">
            Check your email
          </h1>
          <p class="text-sm text-ink-500 text-center mt-2 leading-relaxed">
            We've sent a password reset link to
            <span class="font-medium text-ink-700">{{ email }}</span>.
            The link expires in 30 minutes.
          </p>
          <p class="text-xs text-ink-400 text-center mt-4">
            Didn't get it? Check your spam folder, or
            <button
              type="button"
              class="text-brand-600 font-semibold hover:underline"
              @click="emailSent = false"
            >
              try a different email
            </button>.
          </p>

          <button
            type="button"
            class="w-full mt-6 bg-ink-100 text-ink-700 font-semibold text-sm rounded-xl px-4 py-3
                   hover:bg-ink-200 transition-colors"
            @click="router.replace({ name: 'login' })"
          >
            Back to login
          </button>
        </template>

      </div>
    </div>
  </div>
</template>