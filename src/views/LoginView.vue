<!-- src/views/LoginView.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Eye, EyeOff, LogIn, AlertCircle } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import PulseLine from '../components/PulseLine.vue';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);

async function handleSubmit() {
  errorMessage.value = null;
  isSubmitting.value = true;

  try {
    const result = await auth.login({ email: email.value, password: password.value });
    if (!result.success) {
      errorMessage.value = result.error ?? 'Could not sign in.';
      return;
    }

    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : null;
    if (redirect) {
      router.replace(redirect);
    } else if (auth.isAdmin) {
      router.replace({ name: 'admin-dashboard' });
    } else {
      router.replace({ name: auth.hasChosenDepartment ? 'home' : 'department-select' });
    }
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-gradient-to-b from-ink-900 via-brand-800 to-brand-700 px-6 py-10">
    <div class="relative max-w-sm mx-auto w-full flex-1 flex flex-col justify-center">
      <div class="absolute inset-x-0 top-1/3 -translate-y-1/2 opacity-20 pointer-events-none">
        <PulseLine stroke="#2EE6B8" :height="60" />
      </div>

      <div class="relative text-center mb-8">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 text-pulse text-[11px] font-mono font-semibold px-3 py-1 mb-4 tracking-wide">
          HEALTHPREP CBT
        </span>
        <h1 class="font-display text-2xl font-bold text-white">Welcome back</h1>
        <p class="text-brand-100 text-sm mt-1.5">Sign in to continue your exam prep.</p>
      </div>

      <form class="relative bg-white rounded-3xl shadow-panel p-6 space-y-4" @submit.prevent="handleSubmit">
        <!-- Email -->
        <div>
          <label for="email" class="block text-xs font-semibold text-ink-500 mb-1.5">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            autocomplete="email"
            required
            placeholder="you@example.com"
            class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>

        <!-- Password -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label for="password" class="block text-xs font-semibold text-ink-500">Password</label>
            <router-link
              :to="{ name: 'forgot-password' }"
              class="text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              Forgot password?
            </router-link>
          </div>
          <div class="relative">
            <input
              id="password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              required
              placeholder="••••••••"
              class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 pr-11 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 px-3 flex items-center text-ink-400 hover:text-ink-600"
              @click="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" class="w-4 h-4" />
              <Eye v-else class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Error -->
        <p
          v-if="errorMessage"
          class="flex items-center gap-1.5 text-sm text-coral-dim bg-coral-soft border border-coral/30 rounded-xl px-3.5 py-2.5"
        >
          <AlertCircle class="w-4 h-4 shrink-0" />
          {{ errorMessage }}
        </p>

        <!-- Submit -->
        <button
          type="submit"
          class="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-semibold py-3 disabled:opacity-50 transition-colors"
          :disabled="isSubmitting"
        >
          <LogIn class="w-4 h-4" />
          {{ isSubmitting ? 'Signing in…' : 'Sign In' }}
        </button>
      </form>

      <!-- Register link -->
      <p class="relative text-center text-white/80 text-sm mt-5">
        New here?
        <router-link :to="{ name: 'register' }" class="font-semibold text-pulse hover:underline">
          Create an account
        </router-link>
      </p>
    </div>
  </div>
</template>