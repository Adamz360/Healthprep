<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronLeft, TrendingDown, TrendingUp, Minus, RotateCcw } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useWeakAreaEngine } from '../composables/useWeakAreaEngine';
import { db, uid } from '../db';
import type { ExamSession, TopicMastery } from '../types/healthApp';

const router = useRouter();
const auth = useAuthStore();

const engine = useWeakAreaEngine(auth.userId);
const isStartingDrill = ref(false);

onMounted(async () => {
  await engine.refreshAll(10);
});

const levelStyles: Record<TopicMastery['masteryLevel'], { badge: string; icon: typeof TrendingDown }> = {
  weak: { badge: 'bg-coral text-white', icon: TrendingDown },
  developing: { badge: 'bg-gold text-ink-900', icon: Minus },
  strong: { badge: 'bg-brand-500 text-white', icon: TrendingUp },
};

async function startWeakAreaDrill() {
  if (!auth.userId || engine.recommendations.value.length === 0) return;
  isStartingDrill.value = true;

  try {
    const questionIds = engine.recommendations.value.flatMap((r) => r.recommendedQuestionIds).slice(0, 25);
    if (questionIds.length === 0) return;

    const firstTopic = engine.recommendations.value[0].topic;
    const newSession: ExamSession = {
      id: uid('exam'),
      userId: auth.userId,
      subjectId: firstTopic.subjectId,
      departmentId: auth.currentUser?.departmentId ?? '',
      mode: 'weak-area-drill',
      totalQuestions: questionIds.length,
      durationSeconds: questionIds.length * 60,
      remainingSeconds: questionIds.length * 60,
      status: 'in-progress',
      startedAt: new Date().toISOString(),
      submittedAt: null,
      scorePercent: null,
      correctCount: null,
      wrongCount: null,
      unansweredCount: null,
      questionOrder: questionIds,
    };

    await db.exam_sessions.add(newSession);
    router.push({ name: 'exam-session', params: { examSessionId: newSession.id } });
  } finally {
    isStartingDrill.value = false;
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
        <div>
          <h1 class="font-display font-bold text-ink-900">Weak Area Analysis</h1>
          <p class="text-xs text-ink-500 font-mono">Overall accuracy: {{ engine.overallAccuracyPercent.value }}%</p>
        </div>
      </div>
    </header>

    <div class="max-w-2xl mx-auto px-4 py-5">
      <div v-if="engine.isAnalyzing.value" class="text-sm text-ink-300 text-center py-16">Analyzing your history…</div>

      <template v-else>
        <div v-if="engine.topicMastery.value.length === 0" class="text-center py-16">
          <p class="text-sm text-ink-500">No graded attempts yet.</p>
          <p class="text-xs text-ink-300 mt-1">Complete a few practice quizzes and your weak areas will show up here.</p>
        </div>

        <template v-else>
          <button
            type="button"
            class="w-full inline-flex items-center justify-center gap-1.5 rounded-2xl bg-brand-700 hover:bg-brand-800 text-white font-semibold py-3.5 mb-5 disabled:opacity-50 transition-colors"
            :disabled="isStartingDrill || engine.recommendations.value.length === 0"
            @click="startWeakAreaDrill"
          >
            <RotateCcw class="w-4 h-4" />
            {{ isStartingDrill ? 'Building drill…' : 'Start Targeted Practice Drill' }}
          </button>

          <div class="space-y-2.5">
            <div
              v-for="topic in engine.topicMastery.value"
              :key="topic.topicId"
              class="bg-white rounded-2xl border border-ink-100 shadow-card px-4 py-3.5"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-medium text-ink-900">{{ topic.topicPath }}</p>
                  <p class="text-xs text-ink-500 mt-0.5 font-mono">{{ topic.correctAttempts }}/{{ topic.totalAttempts }} correct</p>
                </div>
                <span class="readout text-xs shrink-0" :class="levelStyles[topic.masteryLevel].badge">
                  <component :is="levelStyles[topic.masteryLevel].icon" class="w-3.5 h-3.5" />
                  {{ topic.accuracyPercent }}%
                </span>
              </div>
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>
