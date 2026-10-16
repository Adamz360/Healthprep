<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Eye, EyeOff, UserPlus, AlertCircle, GraduationCap } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { collection, getDocs } from 'firebase/firestore';
import { firestore } from '../firebase';
import PulseLine from '../components/PulseLine.vue';
import type { Department } from '../types/healthApp';

const router = useRouter();
const auth = useAuthStore();

const fullName = ref('');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const selectedDepartmentId = ref('');
const showPassword = ref(false);
const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);

const departments = ref<Department[]>([]);
const isLoadingDepartments = ref(true);


onMounted(async () => {
  try {
    // ★ FIRESTORE directly — NOT local Dexie
    const snap = await getDocs(collection(firestore, 'departments'));
    departments.value = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Department))
      .filter((d) => d.isActive !== false)
      .sort((a, b) => a.name.localeCompare(b.name));

    console.log('Departments loaded:', departments.value.length);

    if (departments.value.length === 0) {
      errorMessage.value = 'No courses available yet. Please contact support.';
    }
  } catch (err: any) {
    console.error('[RegisterView] Firestore error:', err.code, err.message);
    errorMessage.value = 'Could not load courses. Check your connection and try again.';
  } finally {
    isLoadingDepartments.value = false;
  }
});

const passwordsMatch = computed(() => password.value === confirmPassword.value);

async function handleSubmit() {
  errorMessage.value = null;

  if (!selectedDepartmentId.value) {
    errorMessage.value = 'Please select your course.';
    return;
  }
  if (!passwordsMatch.value) {
    errorMessage.value = 'Passwords do not match.';
    return;
  }

  isSubmitting.value = true;
  try {
    const result = await auth.register({
      fullName: fullName.value,
      email: email.value,
      password: password.value,
      departmentId: selectedDepartmentId.value,
    });
    if (!result.success) {
      errorMessage.value = result.error ?? 'Could not create your account.';
      return;
    }
    // Course was already picked during registration, so head straight to
    // the dashboard rather than the first-run department picker.
    router.replace({ name: auth.hasChosenDepartment ? 'home' : 'department-select' });
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-gradient-to-b from-ink-900 via-brand-800 to-brand-700 px-6 py-10">
    <div class="relative max-w-sm mx-auto w-full flex-1 flex flex-col justify-center">
      <div class="absolute inset-x-0 top-1/4 -translate-y-1/2 opacity-20 pointer-events-none">
        <PulseLine stroke="#2EE6B8" :height="60" />
      </div>

      <div class="relative text-center mb-6">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 text-pulse text-[11px] font-mono font-semibold px-3 py-1 mb-4 tracking-wide">
          HEALTHPREP CBT
        </span>
        <h1 class="font-display text-2xl font-bold text-white">Create your account</h1>
        <p class="text-brand-100 text-sm mt-1.5">Start prepping — even offline.</p>
      </div>

      <form class="relative bg-white rounded-3xl shadow-panel p-6 space-y-4" @submit.prevent="handleSubmit">
        <div>
          <label for="fullName" class="block text-xs font-semibold text-ink-500 mb-1.5">Full Name</label>
          <input
            id="fullName"
            v-model="fullName"
            type="text"
            autocomplete="name"
            required
            placeholder="Amaka Obi"
            class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>

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

        <div>
          <label for="course" class="block text-xs font-semibold text-ink-500 mb-1.5">
            Course <span class="text-coral">*</span>
          </label>
          <div class="relative">
            <select
              id="course"
              v-model="selectedDepartmentId"
              required
              :disabled="isLoadingDepartments"
              class="w-full appearance-none rounded-xl border border-ink-200 bg-canvas pl-10 pr-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-50"
              :class="!selectedDepartmentId ? 'text-ink-300' : ''"
            >
              <option value="" disabled>{{ isLoadingDepartments ? 'Loading courses…' : 'Select your course' }}</option>
              <option v-for="dept in departments" :key="dept.id" :value="dept.id" class="text-ink-900">
                {{ dept.name }}
              </option>
            </select>
            <GraduationCap class="w-4 h-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <p class="text-[11px] text-ink-400 mt-1.5">This sets up your exam question bank — you can't change it later without contacting support.</p>
        </div>

        <div>
          <label for="password" class="block text-xs font-semibold text-ink-500 mb-1.5">Password</label>
          <div class="relative">
            <input
              id="password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              required
              minlength="6"
              placeholder="At least 6 characters"
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

        <div>
          <label for="confirmPassword" class="block text-xs font-semibold text-ink-500 mb-1.5">Confirm Password</label>
          <input
            id="confirmPassword"
            v-model="confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password"
            required
            placeholder="Re-enter your password"
            class="w-full rounded-xl border px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-2 bg-canvas"
            :class="
              confirmPassword && !passwordsMatch
                ? 'border-coral focus:ring-coral/20'
                : 'border-ink-200 focus:border-brand-500 focus:ring-brand-200'
            "
          />
        </div>

        <p v-if="errorMessage" class="flex items-center gap-1.5 text-sm text-coral-dim bg-coral-soft border border-coral/30 rounded-xl px-3.5 py-2.5">
          <AlertCircle class="w-4 h-4 shrink-0" />
          {{ errorMessage }}
        </p>

        <button
          type="submit"
          class="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-semibold py-3 disabled:opacity-50 transition-colors"
          :disabled="isSubmitting"
        >
          <UserPlus class="w-4 h-4" />
          {{ isSubmitting ? 'Creating account…' : 'Create Account' }}
        </button>
      </form>

      <p class="relative text-center text-white/80 text-sm mt-5">
        Already have an account?
        <router-link :to="{ name: 'login' }" class="font-semibold text-pulse hover:underline">Sign in</router-link>
      </p>
    </div>
  </div>
</template>
