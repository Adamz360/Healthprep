<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronLeft, Coins, Clock, Zap, Target, ListChecks } from 'lucide-vue-next';
import { db, uid, ensureSubjectDownloaded } from '../db';
import { useAuthStore } from '../stores/auth';
import { useWalletAndGamificationStore } from '../stores/walletAndGamification';
import type { Subject, ExamSession, ExamMode, Question } from '../types/healthApp';

const props = defineProps<{ subjectId: string }>();
const router = useRouter();
const auth = useAuthStore();
const wallet = useWalletAndGamificationStore();

const subject = ref<Subject | null>(null);
const isLoading = ref(true);
const isStarting = ref(false);
const errorMessage = ref<string | null>(null);

type ModeOption = {
  mode: ExamMode;
  label: string;
  description: string;
  icon: typeof Zap;
  questionCount: number;
  durationMinutes: number;
  costCredits: number;
};

const selectedModeKey = ref<ExamMode>('practice');

onMounted(async () => {
  subject.value = (await ensureSubjectDownloaded(props.subjectId)) ?? (await db.subjects.get(props.subjectId)) ?? null;
  if (auth.userId) {
    await wallet.initForUser(auth.userId);
  }
  isLoading.value = false;
});

const modeOptions = computed<ModeOption[]>(() => {
  const total = subject.value?.totalQuestionCount ?? 20;
  return [
    {
      mode: 'practice',
      label: 'Practice Quiz',
      description: 'Untimed, 10 questions, free — great for casual review.',
      icon: ListChecks,
      questionCount: Math.min(10, total),
      durationMinutes: 30,
      costCredits: 0,
    },
    {
      mode: 'timed-drill',
      label: 'Timed Drill',
      description: '20 questions under real exam time pressure.',
      icon: Zap,
      questionCount: Math.min(20, total),
      durationMinutes: 20,
      costCredits: 0,
    },
    {
      mode: 'mock',
      label: 'Full Mock Exam',
      description: 'Complete simulation of the licensing exam format.',
      icon: Target,
      questionCount: Math.min(60, total),
      durationMinutes: 60,
      costCredits: subject.value?.creditsToUnlockMock ?? 20,
    },
  ];
});

const selectedMode = computed(() => modeOptions.value.find((m) => m.mode === selectedModeKey.value)!);

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function startExam() {
  if (!subject.value || !auth.userId) return;
  errorMessage.value = null;
  isStarting.value = true;

  try {
    const config = selectedMode.value;

    if (config.costCredits > 0) {
      const spent = await wallet.spendCredits(
        config.costCredits,
        'spent-mock-unlock',
        `Unlocked full mock exam — ${subject.value.name}`
      );
      if (!spent) {
        errorMessage.value = `You need ${config.costCredits} credits for a full mock exam. You have ${wallet.creditBalance}.`;
        isStarting.value = false;
        return;
      }
    }

    const allQuestions: Question[] = await db.questions.where('subjectId').equals(subject.value.id).toArray();
    const questionOrder = shuffle(allQuestions)
      .slice(0, config.questionCount)
      .map((q) => q.id);

    const newSession: ExamSession = {
      id: uid('exam'),
      userId: auth.userId,
      subjectId: subject.value.id,
      departmentId: subject.value.departmentId,
      mode: config.mode,
      totalQuestions: questionOrder.length,
      durationSeconds: config.durationMinutes * 60,
      remainingSeconds: config.durationMinutes * 60,
      status: 'in-progress',
      startedAt: new Date().toISOString(),
      submittedAt: null,
      scorePercent: null,
      correctCount: null,
      wrongCount: null,
      unansweredCount: null,
      questionOrder,
    };

    await db.exam_sessions.add(newSession);
    router.push({ name: 'exam-session', params: { examSessionId: newSession.id } });
  } finally {
    isStarting.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-canvas">
    <header class="bg-white border-b border-ink-100 px-4 py-4">
      <div class="max-w-2xl mx-auto flex items-center gap-3">
        <button type="button" class="p-1.5 -ml-1.5 rounded-lg hover:bg-ink-50" @click="router.back()">
          <ChevronLeft class="w-5 h-5 text-ink-700" />
        </button>
        <h1 class="font-display font-bold text-ink-900">{{ subject?.name ?? 'Set up your exam' }}</h1>
      </div>
    </header>

    <div v-if="isLoading" class="text-sm text-ink-300 text-center py-16">Preparing subject…</div>

    <div v-else class="max-w-2xl mx-auto px-4 py-6">
      <div class="flex items-center justify-between mb-5">
        <p class="text-sm text-ink-500">Choose how you want to practice</p>
        <span class="readout text-xs bg-gold text-ink-900">
          <Coins class="w-3.5 h-3.5" /> {{ wallet.creditBalance }}
        </span>
      </div>

      <div class="space-y-3">
        <button
          v-for="option in modeOptions"
          :key="option.mode"
          type="button"
          class="w-full text-left rounded-2xl border-2 px-4 py-4 transition-colors"
          :class="selectedModeKey === option.mode ? 'border-brand-500 bg-brand-50' : 'border-ink-100 bg-white hover:border-ink-200'"
          @click="selectedModeKey = option.mode"
        >
          <div class="flex items-center gap-3">
            <span
              class="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
              :class="selectedModeKey === option.mode ? 'bg-brand-600 text-white' : 'bg-ink-50 text-ink-500'"
            >
              <component :is="option.icon" class="w-5 h-5" />
            </span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <p class="font-semibold text-ink-900 text-sm">{{ option.label }}</p>
                <span v-if="option.costCredits > 0" class="text-xs font-mono font-bold text-gold-dim shrink-0">{{ option.costCredits }} cr</span>
                <span v-else class="text-xs font-bold text-brand-600 shrink-0">Free</span>
              </div>
              <p class="text-xs text-ink-500 mt-0.5">{{ option.description }}</p>
              <div class="flex items-center gap-3 mt-2 text-[11px] text-ink-300 font-mono">
                <span class="inline-flex items-center gap-1"><ListChecks class="w-3 h-3" /> {{ option.questionCount }}Q</span>
                <span class="inline-flex items-center gap-1"><Clock class="w-3 h-3" /> {{ option.durationMinutes }}m</span>
              </div>
            </div>
          </div>
        </button>
      </div>

      <p v-if="errorMessage" class="text-sm text-coral-dim bg-coral-soft border border-coral/30 rounded-xl px-3.5 py-2.5 mt-4">
        {{ errorMessage }}
      </p>

      <button
        type="button"
        class="w-full mt-6 rounded-2xl bg-brand-700 hover:bg-brand-800 text-white font-semibold py-3.5 disabled:opacity-50 transition-colors"
        :disabled="isStarting"
        @click="startExam"
      >
        {{ isStarting ? 'Starting…' : `Start ${selectedMode.label}` }}
      </button>
    </div>
  </div>
</template>
