<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import {
  Wifi,
  WifiOff,
  Coins,
  Flag,
  CheckCircle2,
  Circle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Send,
} from 'lucide-vue-next';
import { db, uid } from '../db';
import type { Question, UserResponse, ExamSession, ResponseFlag, QuestionOption } from '../types/healthApp';

/* -------------------------------------------------------------------------- */
/*  Props / Emits                                                             */
/* -------------------------------------------------------------------------- */

const props = defineProps<{
  examSessionId: string;
  userId: string;
  creditBalance: number;
}>();

const emit = defineEmits<{
  (e: 'exam-submitted', session: ExamSession): void;
}>();

/* -------------------------------------------------------------------------- */
/*  State                                                                     */
/* -------------------------------------------------------------------------- */

const session = ref<ExamSession | null>(null);
const questions = ref<Question[]>([]);
const responsesByQuestionId = ref<Map<string, UserResponse>>(new Map());
const currentIndex = ref(0);
const remainingSeconds = ref(0);
const isWarningActive = ref(false);
const isOnline = ref(navigator.onLine);
const isSubmitting = ref(false);
const isLoading = ref(true);

let timerWorker: Worker | null = null;

/* -------------------------------------------------------------------------- */
/*  Derived state                                                             */
/* -------------------------------------------------------------------------- */

const currentQuestion = computed<Question | null>(() => questions.value[currentIndex.value] ?? null);

const currentResponse = computed<UserResponse | null>(() => {
  if (!currentQuestion.value) return null;
  return responsesByQuestionId.value.get(currentQuestion.value.id) ?? null;
});

const formattedTime = computed(() => {
  const m = Math.floor(remainingSeconds.value / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(remainingSeconds.value % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
});

const progressStats = computed(() => {
  let answered = 0;
  let flagged = 0;
  let unvisited = 0;
  for (const q of questions.value) {
    const r = responsesByQuestionId.value.get(q.id);
    if (!r || r.flag === 'unvisited') unvisited++;
    else if (r.flag === 'flagged' || r.flag === 'flagged-answered') flagged++;
    else if (r.flag === 'answered') answered++;
  }
  return { answered, flagged, unvisited, total: questions.value.length };
});

function paletteState(question: Question): ResponseFlag {
  return responsesByQuestionId.value.get(question.id)?.flag ?? 'unvisited';
}

const paletteClasses: Record<ResponseFlag, string> = {
  answered: 'bg-brand-600 text-white border-brand-600',
  flagged: 'bg-gold text-ink-900 border-gold',
  'flagged-answered': 'bg-gold text-ink-900 border-brand-600 ring-2 ring-brand-500',
  unvisited: 'bg-white text-ink-500 border-ink-200',
};

/* -------------------------------------------------------------------------- */
/*  Lifecycle: load exam + set up timer worker + network listeners            */
/* -------------------------------------------------------------------------- */

onMounted(async () => {
  isLoading.value = true;

  const loadedSession = await db.exam_sessions.get(props.examSessionId);
  if (!loadedSession) {
    isLoading.value = false;
    return;
  }
  session.value = loadedSession;

  const loadedQuestions = await Promise.all(loadedSession.questionOrder.map((qid) => db.questions.get(qid)));
  questions.value = loadedQuestions.filter((q): q is Question => Boolean(q));

  const existingResponses = await db.user_responses
    .where('examSessionId')
    .equals(props.examSessionId)
    .toArray();

  const map = new Map<string, UserResponse>();
  for (const r of existingResponses) map.set(r.questionId, r);

  const toCreate: UserResponse[] = [];
  for (const q of questions.value) {
    if (!map.has(q.id)) {
      const fresh: UserResponse = {
        id: uid('resp'),
        userId: props.userId,
        examSessionId: props.examSessionId,
        questionId: q.id,
        topicId: q.topicId,
        subjectId: q.subjectId,
        selectedOptionKey: null,
        isCorrect: null,
        flag: 'unvisited',
        timeSpentSeconds: 0,
        answeredAt: null,
        syncedToServer: false,
      };
      map.set(q.id, fresh);
      toCreate.push(fresh);
    }
  }
  if (toCreate.length > 0) {
    await db.user_responses.bulkAdd(toCreate);
  }
  responsesByQuestionId.value = map;

  startTimerWorker(loadedSession.remainingSeconds || loadedSession.durationSeconds);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  isLoading.value = false;
});

onBeforeUnmount(() => {
  timerWorker?.postMessage({ type: 'STOP' });
  timerWorker?.terminate();
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
});

function handleOnline() {
  isOnline.value = true;
}
function handleOffline() {
  isOnline.value = false;
}

/* -------------------------------------------------------------------------- */
/*  Timer worker wiring                                                       */
/* -------------------------------------------------------------------------- */

function startTimerWorker(durationSeconds: number) {
  timerWorker = new Worker(new URL('../workers/timer.worker.ts', import.meta.url), { type: 'module' });

  timerWorker.onmessage = (event: MessageEvent<{ type: string; remainingSeconds: number }>) => {
    const { type, remainingSeconds: rs } = event.data;
    remainingSeconds.value = rs;

    if (type === 'WARNING') {
      isWarningActive.value = true;
    }
    if (type === 'EXPIRED') {
      void autoSubmit();
    }
    if ((type === 'TICK' || type === 'WARNING') && session.value && rs % 5 === 0) {
      void db.exam_sessions.update(session.value.id, { remainingSeconds: rs });
    }
  };

  timerWorker.postMessage({ type: 'START', durationSeconds });
}

/* -------------------------------------------------------------------------- */
/*  Answer persistence — optimistic writes to IndexedDB                       */
/* -------------------------------------------------------------------------- */

async function selectOption(optionKey: QuestionOption['key']) {
  const q = currentQuestion.value;
  if (!q || !session.value) return;

  const prev = responsesByQuestionId.value.get(q.id);
  const wasFlagged = prev?.flag === 'flagged' || prev?.flag === 'flagged-answered';

  const updated: UserResponse = {
    ...(prev as UserResponse),
    selectedOptionKey: optionKey,
    isCorrect: optionKey === q.correctOptionKey,
    flag: wasFlagged ? 'flagged-answered' : 'answered',
    answeredAt: new Date().toISOString(),
  };

  responsesByQuestionId.value.set(q.id, updated);
  responsesByQuestionId.value = new Map(responsesByQuestionId.value);
  await db.user_responses.put(updated);
}

async function toggleFlag() {
  const q = currentQuestion.value;
  if (!q) return;
  const prev = responsesByQuestionId.value.get(q.id);
  if (!prev) return;

  let nextFlag: ResponseFlag;
  if (prev.flag === 'flagged') nextFlag = prev.selectedOptionKey ? 'flagged-answered' : 'unvisited';
  else if (prev.flag === 'flagged-answered') nextFlag = 'answered';
  else if (prev.flag === 'answered') nextFlag = 'flagged-answered';
  else nextFlag = 'flagged';

  const updated: UserResponse = { ...prev, flag: nextFlag };
  responsesByQuestionId.value.set(q.id, updated);
  responsesByQuestionId.value = new Map(responsesByQuestionId.value);
  await db.user_responses.put(updated);
}

/* -------------------------------------------------------------------------- */
/*  Navigation                                                                */
/* -------------------------------------------------------------------------- */

function goTo(index: number) {
  if (index < 0 || index >= questions.value.length) return;
  currentIndex.value = index;
}

function next() {
  goTo(currentIndex.value + 1);
}
function prev() {
  goTo(currentIndex.value - 1);
}

/* -------------------------------------------------------------------------- */
/*  Hotkeys (A–D select option, arrows navigate)                              */
/* -------------------------------------------------------------------------- */

function handleKeydown(e: KeyboardEvent) {
  const key = e.key.toUpperCase();
  const optionKeys: QuestionOption['key'][] = ['A', 'B', 'C', 'D', 'E'];
  if (optionKeys.includes(key as QuestionOption['key'])) {
    const exists = currentQuestion.value?.options.some((o) => o.key === key);
    if (exists) void selectOption(key as QuestionOption['key']);
  } else if (e.key === 'ArrowRight') {
    next();
  } else if (e.key === 'ArrowLeft') {
    prev();
  } else if (e.key.toLowerCase() === 'f') {
    void toggleFlag();
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown));

/* -------------------------------------------------------------------------- */
/*  Submission (manual + auto)                                                */
/* -------------------------------------------------------------------------- */

async function gradeAndFinalize(status: ExamSession['status']): Promise<ExamSession> {
  if (!session.value) {
    // This is the failure mode that used to make the Submit button look
    // "broken" — the exam session record was missing (e.g. a stale/expired
    // reference) and the handler silently no-opped instead of surfacing
    // anything to the candidate. Throw instead so the caller can show an
    // error and the button never just sits there doing nothing.
    throw new Error('Could not find your exam session. Your answers are saved — please go back and try submitting again.');
  }

  const allResponses = Array.from(responsesByQuestionId.value.values());
  const correctCount = allResponses.filter((r) => r.isCorrect === true).length;
  const wrongCount = allResponses.filter((r) => r.selectedOptionKey !== null && r.isCorrect === false).length;
  const unansweredCount = allResponses.filter((r) => r.selectedOptionKey === null).length;
  const scorePercent = questions.value.length > 0 ? Math.round((correctCount / questions.value.length) * 100) : 0;

  const updatedSession: ExamSession = {
    ...session.value,
    status,
    submittedAt: new Date().toISOString(),
    scorePercent,
    correctCount,
    wrongCount,
    unansweredCount,
    remainingSeconds: status === 'auto-submitted' ? 0 : remainingSeconds.value,
  };

  await db.exam_sessions.put(updatedSession);
  session.value = updatedSession;
  return updatedSession;
}

async function submitExam() {
  if (isSubmitting.value) return;
  isSubmitting.value = true;
  submitError.value = null;
  try {
    // Stop the timer first so no further TICK/WARNING/EXPIRED messages can
    // race with (or duplicate) this manual submission.
    timerWorker?.postMessage({ type: 'STOP' });
    const finalizedSession = await gradeAndFinalize('submitted');
    confirmSubmitOpen.value = false;
    emit('exam-submitted', finalizedSession);
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : 'Something went wrong submitting your exam. Please try again.';
  } finally {
    isSubmitting.value = false;
  }
}

async function autoSubmit() {
  if (isSubmitting.value) return;
  isSubmitting.value = true;
  submitError.value = null;
  try {
    const finalizedSession = await gradeAndFinalize('auto-submitted');
    confirmSubmitOpen.value = false;
    emit('exam-submitted', finalizedSession);
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : 'Something went wrong auto-submitting your exam.';
  } finally {
    isSubmitting.value = false;
  }
}

const confirmSubmitOpen = ref(false);
const submitError = ref<string | null>(null);
</script>

<template>
  <div class="min-h-screen bg-canvas flex flex-col">
    <div v-if="isLoading" class="flex-1 flex items-center justify-center">
      <p class="text-ink-300 text-sm font-mono">Loading exam…</p>
    </div>

    <template v-else-if="session && currentQuestion">
      <!-- Header -->
      <header class="sticky top-0 z-20 bg-ink-900 shadow-panel">
        <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-2.5">
            <span class="readout text-sm bg-white/10 text-gold">
              <Coins class="w-4 h-4" />
              {{ props.creditBalance }}
            </span>

            <span
              class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-mono font-medium border"
              :class="isOnline ? 'bg-brand-500/15 border-brand-400/30 text-pulse' : 'bg-white/5 border-white/10 text-ink-100/70'"
            >
              <Wifi v-if="isOnline" class="w-3.5 h-3.5" />
              <WifiOff v-else class="w-3.5 h-3.5" />
              {{ isOnline ? 'ONLINE' : 'OFFLINE — CONTINUES NORMALLY' }}
            </span>
          </div>

          <div
            class="readout text-lg px-4 py-2"
            :class="isWarningActive ? 'bg-coral text-white animate-pulse' : 'bg-white/10 text-pulse'"
          >
            <Clock class="w-4.5 h-4.5" />
            {{ formattedTime }}
          </div>
        </div>
      </header>

      <div class="max-w-6xl mx-auto w-full px-4 py-6 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 flex-1">
        <!-- Question panel -->
        <section class="bg-white rounded-3xl border border-ink-100 shadow-card p-6 flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <span class="text-xs font-mono font-semibold text-ink-300 tracking-wide">
              QUESTION {{ currentIndex + 1 }} / {{ questions.length }}
            </span>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 text-sm font-medium rounded-full px-3 py-1.5 border transition-colors"
              :class="
                currentResponse?.flag === 'flagged' || currentResponse?.flag === 'flagged-answered'
                  ? 'bg-gold border-gold text-ink-900'
                  : 'bg-white border-ink-200 text-ink-600 hover:bg-ink-50'
              "
              @click="toggleFlag"
            >
              <Flag class="w-4 h-4" />
              Mark for Review
              <kbd class="ml-1 text-[10px] opacity-60 font-mono">F</kbd>
            </button>
          </div>

          <p class="font-display text-lg text-ink-900 leading-relaxed mb-6">{{ currentQuestion.stem }}</p>

          <div class="space-y-3 flex-1">
            <button
              v-for="option in currentQuestion.options"
              :key="option.key"
              type="button"
              class="w-full text-left flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 transition-colors"
              :class="
                currentResponse?.selectedOptionKey === option.key
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-ink-100 hover:border-brand-300 hover:bg-ink-50'
              "
              @click="selectOption(option.key)"
            >
              <span
                class="flex items-center justify-center w-7 h-7 rounded-lg border-2 text-sm font-mono font-bold shrink-0"
                :class="
                  currentResponse?.selectedOptionKey === option.key
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-ink-200 text-ink-500'
                "
              >
                {{ option.key }}
              </span>
              <span class="text-ink-700 text-sm">{{ option.text }}</span>
            </button>
          </div>

          <div class="flex items-center justify-between mt-6 pt-4 border-t border-ink-50">
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-xl px-4 py-2.5 text-sm font-medium border border-ink-200 text-ink-600 disabled:opacity-40"
              :disabled="currentIndex === 0"
              @click="prev"
            >
              <ChevronLeft class="w-4 h-4" /> Previous
            </button>

            <button
              v-if="currentIndex < questions.length - 1"
              type="button"
              class="inline-flex items-center gap-1 rounded-xl px-5 py-2.5 text-sm font-semibold bg-brand-700 text-white hover:bg-brand-800 transition-colors"
              @click="next"
            >
              Next <ChevronRight class="w-4 h-4" />
            </button>
            <button
              v-else
              type="button"
              class="inline-flex items-center gap-1 rounded-xl px-5 py-2.5 text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 transition-colors"
              @click="confirmSubmitOpen = true"
            >
              <Send class="w-4 h-4" /> Submit Exam
            </button>
          </div>
        </section>

        <!-- Question palette -->
        <aside class="bg-white rounded-3xl border border-ink-100 shadow-card p-4 h-fit lg:sticky lg:top-24">
          <h3 class="text-xs font-mono font-semibold text-ink-400 tracking-wide mb-3">QUESTION PALETTE</h3>

          <div class="grid grid-cols-5 gap-2 mb-4">
            <button
              v-for="(q, idx) in questions"
              :key="q.id"
              type="button"
              class="aspect-square rounded-lg border text-xs font-mono font-semibold flex items-center justify-center transition-transform hover:scale-105"
              :class="[paletteClasses[paletteState(q)], idx === currentIndex ? 'ring-2 ring-brand-500 ring-offset-1' : '']"
              @click="goTo(idx)"
            >
              {{ idx + 1 }}
            </button>
          </div>

          <div class="space-y-1.5 text-xs text-ink-600">
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-1.5"><CheckCircle2 class="w-3.5 h-3.5 text-brand-500" /> Answered</span>
              <span class="font-mono font-semibold">{{ progressStats.answered }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-1.5"><Flag class="w-3.5 h-3.5 text-gold" /> Flagged</span>
              <span class="font-mono font-semibold">{{ progressStats.flagged }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-1.5"><Circle class="w-3.5 h-3.5 text-ink-300" /> Unvisited</span>
              <span class="font-mono font-semibold">{{ progressStats.unvisited }}</span>
            </div>
          </div>

          <button
            type="button"
            class="w-full mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold bg-brand-700 text-white hover:bg-brand-800 transition-colors"
            @click="confirmSubmitOpen = true"
          >
            <Send class="w-4 h-4" /> Submit Exam
          </button>
        </aside>
      </div>

      <!-- Submit confirmation modal -->
      <div v-if="confirmSubmitOpen" class="fixed inset-0 z-30 bg-ink-900/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-white rounded-3xl shadow-panel max-w-sm w-full p-6 animate-popIn">
          <h4 class="font-display text-lg font-bold text-ink-900 mb-2">Submit exam?</h4>
          <p class="text-sm text-ink-500 mb-5">
            You've answered <span class="font-mono font-semibold text-ink-700">{{ progressStats.answered }}</span> of
            <span class="font-mono font-semibold text-ink-700">{{ progressStats.total }}</span> questions.
            {{ progressStats.total - progressStats.answered }} remain unanswered. This cannot be undone.
          </p>

          <p v-if="submitError" class="flex items-start gap-1.5 text-sm text-coral-dim bg-coral-soft border border-coral/30 rounded-xl px-3.5 py-2.5 mb-4">
            {{ submitError }}
          </p>

          <div class="flex gap-3 justify-end">
            <button
              type="button"
              class="px-4 py-2.5 rounded-xl text-sm font-medium border border-ink-200 text-ink-600"
              @click="confirmSubmitOpen = false"
            >
              Keep Reviewing
            </button>
            <button
              type="button"
              class="px-4 py-2.5 rounded-xl text-sm font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              :disabled="isSubmitting"
              @click="submitExam"
            >
              {{ isSubmitting ? 'Submitting…' : submitError ? 'Retry Submit' : 'Yes, Submit' }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="flex-1 flex items-center justify-center">
      <p class="text-ink-400 text-sm">Exam session not found.</p>
    </div>
  </div>
</template>
