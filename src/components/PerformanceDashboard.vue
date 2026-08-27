<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import confetti from 'canvas-confetti';
import { Share2, Trophy, TrendingDown, TrendingUp, RotateCcw, Download } from 'lucide-vue-next';
import { db } from '../db';
import { useWeakAreaEngine } from '../composables/useWeakAreaEngine';
import PulseLine from './PulseLine.vue';
import type { ExamSession, Subject, PerformanceSummary, TopicMastery } from '../types/healthApp';

/* -------------------------------------------------------------------------- */
/*  Props / Emits                                                             */
/* -------------------------------------------------------------------------- */

const props = defineProps<{
  examSessionId: string;
  userId: string;
}>();

const emit = defineEmits<{
  (e: 'retry-weak-areas', topicIds: string[]): void;
  (e: 'back-to-dashboard'): void;
}>();

/* -------------------------------------------------------------------------- */
/*  State                                                                     */
/* -------------------------------------------------------------------------- */

const session = ref<ExamSession | null>(null);
const subject = ref<Subject | null>(null);
const cardCanvasRef = ref<HTMLCanvasElement | null>(null);
const isLoading = ref(true);
const shareStatus = ref<'idle' | 'shared' | 'copied' | 'error'>('idle');

const { topicMastery, weakTopics, strongTopics, analyze, buildRecommendations } = useWeakAreaEngine(props.userId);

/* -------------------------------------------------------------------------- */
/*  Derived summary                                                           */
/* -------------------------------------------------------------------------- */

function badgeForScore(scorePercent: number): PerformanceSummary['accuracyBadge'] {
  if (scorePercent >= 90) return 'Platinum';
  if (scorePercent >= 75) return 'Gold';
  if (scorePercent >= 50) return 'Silver';
  return 'Bronze';
}

const badgeStyles: Record<PerformanceSummary['accuracyBadge'], string> = {
  Platinum: 'from-brand-800 via-brand-500 to-pulse',
  Gold: 'from-gold-dim via-gold to-yellow-300',
  Silver: 'from-ink-500 via-ink-300 to-ink-100',
  Bronze: 'from-coral-dim via-coral to-orange-300',
};

const summary = computed<PerformanceSummary | null>(() => {
  if (!session.value || !subject.value) return null;
  const scorePercent = session.value.scorePercent ?? 0;
  const timeTakenSeconds = session.value.durationSeconds - (session.value.remainingSeconds ?? 0);

  return {
    examSessionId: session.value.id,
    subjectName: subject.value.name,
    scorePercent,
    correctCount: session.value.correctCount ?? 0,
    totalQuestions: session.value.totalQuestions,
    timeTakenSeconds,
    accuracyBadge: badgeForScore(scorePercent),
    weakTopics: weakTopics.value,
    strongTopics: strongTopics.value,
  };
});

const formattedTimeTaken = computed(() => {
  if (!summary.value) return '0:00';
  const m = Math.floor(summary.value.timeTakenSeconds / 60);
  const s = summary.value.timeTakenSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
});

const topWeakTopics = computed<TopicMastery[]>(() => topicMastery.value.filter((t) => t.masteryLevel !== 'strong').slice(0, 5));

/* -------------------------------------------------------------------------- */
/*  Lifecycle                                                                 */
/* -------------------------------------------------------------------------- */

onMounted(async () => {
  isLoading.value = true;

  const loadedSession = await db.exam_sessions.get(props.examSessionId);
  session.value = loadedSession ?? null;

  if (loadedSession) {
    subject.value = (await db.subjects.get(loadedSession.subjectId)) ?? null;
  }

  await analyze();
  await buildRecommendations();

  isLoading.value = false;

  await nextTick();
  if (summary.value && summary.value.scorePercent >= 50) {
    fireConfetti(summary.value.accuracyBadge);
  }
});

/* -------------------------------------------------------------------------- */
/*  Confetti celebration — scales with performance tier                       */
/* -------------------------------------------------------------------------- */

function fireConfetti(badge: PerformanceSummary['accuracyBadge']) {
  const baseOptions: confetti.Options = { origin: { y: 0.6 }, zIndex: 9999 };

  if (badge === 'Platinum') {
    confetti({ ...baseOptions, particleCount: 160, spread: 100, colors: ['#2EE6B8', '#0F7A72', '#F2A93B'] });
    setTimeout(() => confetti({ ...baseOptions, particleCount: 80, spread: 70, angle: 60 }), 250);
    setTimeout(() => confetti({ ...baseOptions, particleCount: 80, spread: 70, angle: 120 }), 400);
  } else if (badge === 'Gold') {
    confetti({ ...baseOptions, particleCount: 120, spread: 90, colors: ['#F2A93B', '#FDECCC', '#2EE6B8'] });
  } else {
    confetti({ ...baseOptions, particleCount: 70, spread: 60, colors: ['#8AA6A2', '#0F7A72'] });
  }
}

/* -------------------------------------------------------------------------- */
/*  Shareable performance card (canvas export)                                */
/* -------------------------------------------------------------------------- */

function drawPerformanceCard(): HTMLCanvasElement | null {
  const canvas = cardCanvasRef.value;
  if (!canvas || !summary.value) return null;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const width = 1080;
  const height = 1080;
  canvas.width = width;
  canvas.height = height;

  // Background gradient — brand-deep to ink, the app's signature dark panel
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#083F3B');
  gradient.addColorStop(1, '#0B1F1E');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Card panel
  ctx.fillStyle = '#F5F8F7';
  const pad = 60;
  roundRect(ctx, pad, pad, width - pad * 2, height - pad * 2, 32);
  ctx.fill();

  // ECG pulse-line flourish
  ctx.strokeStyle = '#2EE6B8';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const baseY = pad + 130;
  const scaleX = (width - pad * 2 - 100) / 600;
  const pts: [number, number][] = [
    [0, 0], [130, 0], [155, 0], [170, -30], [190, 32], [208, 0], [225, 0], [245, -38], [262, 38], [280, 0], [600, 0],
  ];
  pts.forEach(([x, y], i) => {
    const px = pad + 50 + x * scaleX;
    const py = baseY + y;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  // App label
  ctx.fillStyle = '#0F7A72';
  ctx.font = '600 30px "IBM Plex Mono", monospace';
  ctx.fillText('HEALTHPREP CBT', pad + 50, pad + 60);

  // Subject name
  ctx.fillStyle = '#0B1F1E';
  ctx.font = 'bold 46px "Space Grotesk", sans-serif';
  wrapText(ctx, summary.value.subjectName, pad + 50, pad + 220, width - pad * 2 - 100, 54);

  // Score
  ctx.fillStyle = '#083F3B';
  ctx.font = 'bold 180px "Space Grotesk", sans-serif';
  ctx.fillText(`${summary.value.scorePercent}%`, pad + 50, pad + 470);

  // Badge
  ctx.fillStyle = '#F2A93B';
  ctx.font = 'bold 38px "Space Grotesk", sans-serif';
  ctx.fillText(`${summary.value.accuracyBadge.toUpperCase()} BADGE`, pad + 50, pad + 525);

  // Stats row
  ctx.fillStyle = '#3E5D59';
  ctx.font = '30px "IBM Plex Mono", monospace';
  ctx.fillText(
    `${summary.value.correctCount}/${summary.value.totalQuestions} correct  •  ${formattedTimeTaken.value} taken`,
    pad + 50,
    pad + 590
  );

  // Footer
  ctx.fillStyle = '#8AA6A2';
  ctx.font = '24px "IBM Plex Sans", sans-serif';
  ctx.fillText('Prep smarter. Prep offline. #HealthPrepCBT', pad + 50, height - pad - 40);

  return canvas;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  let cursorY = y;
  for (const word of words) {
    const testLine = line + word + ' ';
    if (ctx.measureText(testLine).width > maxWidth && line !== '') {
      ctx.fillText(line, x, cursorY);
      line = word + ' ';
      cursorY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, cursorY);
}

async function shareCard() {
  const canvas = drawPerformanceCard();
  if (!canvas || !summary.value) return;

  try {
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not generate image');

    const file = new File([blob], 'performance-card.png', { type: 'image/png' });
    const shareText = `I scored ${summary.value.scorePercent}% on ${summary.value.subjectName}! 🏆`;

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: 'My CBT Performance',
        text: shareText,
        files: [file],
      });
      shareStatus.value = 'shared';
    } else {
      await navigator.clipboard?.writeText(shareText);
      triggerDownload(canvas);
      shareStatus.value = 'copied';
    }
  } catch {
    shareStatus.value = 'error';
  } finally {
    setTimeout(() => (shareStatus.value = 'idle'), 3000);
  }
}

function triggerDownload(canvas: HTMLCanvasElement) {
  const link = document.createElement('a');
  link.download = 'performance-card.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function downloadCard() {
  const canvas = drawPerformanceCard();
  if (canvas) triggerDownload(canvas);
}

function shareToWhatsApp() {
  if (!summary.value) return;
  const text = encodeURIComponent(
    `I scored ${summary.value.scorePercent}% on ${summary.value.subjectName} on HealthPrep CBT! 🏆`
  );
  window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
}

function shareToTwitter() {
  if (!summary.value) return;
  const text = encodeURIComponent(
    `I scored ${summary.value.scorePercent}% on ${summary.value.subjectName} on HealthPrep CBT! 🏆 #HealthPrepCBT`
  );
  window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank', 'noopener,noreferrer');
}

function retryWeakAreas() {
  emit('retry-weak-areas', topWeakTopics.value.map((t) => t.topicId));
}
</script>

<template>
  <div class="min-h-screen bg-canvas py-8 px-4">
    <div v-if="isLoading" class="max-w-2xl mx-auto text-center text-ink-300 text-sm font-mono py-20">Crunching your results…</div>

    <div v-else-if="summary" class="max-w-2xl mx-auto space-y-5">
      <!-- Score hero card -->
      <div class="rounded-3xl overflow-hidden shadow-panel border border-ink-100 bg-white">
        <div class="relative p-8 text-center bg-gradient-to-br overflow-hidden" :class="badgeStyles[summary.accuracyBadge]">
          <div class="absolute inset-x-0 top-3 opacity-30">
            <PulseLine stroke="#ffffff" :height="40" />
          </div>
          <p class="relative text-white/90 text-sm font-medium mb-1">{{ summary.subjectName }}</p>
          <p class="relative font-display text-white text-7xl font-bold drop-shadow-sm">{{ summary.scorePercent }}%</p>
          <div class="relative inline-flex items-center gap-1.5 mt-3 bg-black/20 backdrop-blur rounded-full px-4 py-1.5 text-white font-semibold text-sm">
            <Trophy class="w-4 h-4" />
            {{ summary.accuracyBadge }} Badge
          </div>
        </div>

        <div class="grid grid-cols-3 divide-x divide-ink-50 border-t border-ink-50">
          <div class="p-4 text-center">
            <p class="font-mono text-xl font-bold text-ink-900">{{ summary.correctCount }}/{{ summary.totalQuestions }}</p>
            <p class="text-xs text-ink-500 mt-0.5">Correct</p>
          </div>
          <div class="p-4 text-center">
            <p class="font-mono text-xl font-bold text-ink-900">{{ formattedTimeTaken }}</p>
            <p class="text-xs text-ink-500 mt-0.5">Time Taken</p>
          </div>
          <div class="p-4 text-center">
            <p class="font-mono text-xl font-bold text-ink-900">{{ summary.weakTopics.length }}</p>
            <p class="text-xs text-ink-500 mt-0.5">Weak Topics</p>
          </div>
        </div>
      </div>

      <!-- Share actions -->
      <div class="bg-white rounded-3xl border border-ink-100 shadow-card p-5">
        <h3 class="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-1.5">
          <Share2 class="w-4 h-4" /> Share your achievement
        </h3>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="flex-1 min-w-[120px] rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-2.5 transition-colors"
            @click="shareToWhatsApp"
          >
            WhatsApp
          </button>
          <button
            type="button"
            class="flex-1 min-w-[120px] rounded-xl bg-ink-900 hover:bg-ink-700 text-white text-sm font-medium py-2.5 transition-colors"
            @click="shareToTwitter"
          >
            Twitter / X
          </button>
          <button
            type="button"
            class="flex-1 min-w-[120px] rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium py-2.5 transition-colors"
            @click="shareCard"
          >
            {{ shareStatus === 'shared' ? 'Shared!' : shareStatus === 'copied' ? 'Copied + Saved!' : 'Share Card' }}
          </button>
          <button
            type="button"
            class="rounded-xl border border-ink-200 text-ink-600 hover:bg-ink-50 text-sm font-medium py-2.5 px-3 inline-flex items-center gap-1.5 transition-colors"
            @click="downloadCard"
          >
            <Download class="w-4 h-4" />
          </button>
        </div>
        <canvas ref="cardCanvasRef" class="hidden"></canvas>
      </div>

      <!-- Weak areas -->
      <div v-if="topWeakTopics.length > 0" class="bg-white rounded-3xl border border-ink-100 shadow-card p-5">
        <h3 class="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-1.5">
          <TrendingDown class="w-4 h-4 text-coral" /> Needs Improvement
        </h3>
        <ul class="space-y-2">
          <li
            v-for="topic in topWeakTopics"
            :key="topic.topicId"
            class="flex items-center justify-between rounded-xl bg-canvas px-3.5 py-2.5"
          >
            <span class="text-sm text-ink-700">{{ topic.topicPath }}</span>
            <span
              class="readout text-xs px-2.5 py-1"
              :class="topic.masteryLevel === 'weak' ? 'bg-coral text-white' : 'bg-gold text-ink-900'"
            >
              {{ topic.accuracyPercent }}%
            </span>
          </li>
        </ul>
        <button
          type="button"
          class="w-full mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold py-2.5 transition-colors"
          @click="retryWeakAreas"
        >
          <RotateCcw class="w-4 h-4" /> Practice These Weak Areas
        </button>
      </div>

      <!-- Strong areas -->
      <div v-if="summary.strongTopics.length > 0" class="bg-white rounded-3xl border border-ink-100 shadow-card p-5">
        <h3 class="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-1.5">
          <TrendingUp class="w-4 h-4 text-brand-500" /> Strong Areas
        </h3>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="topic in summary.strongTopics.slice(0, 8)"
            :key="topic.topicId"
            class="text-xs font-medium rounded-full bg-brand-50 text-brand-700 border border-brand-200 px-3 py-1.5"
          >
            {{ topic.topicPath }} · <span class="font-mono">{{ topic.accuracyPercent }}%</span>
          </span>
        </div>
      </div>

      <button
        type="button"
        class="w-full text-center text-sm font-medium text-ink-500 hover:text-ink-700 py-2"
        @click="emit('back-to-dashboard')"
      >
        Back to Dashboard
      </button>
    </div>

    <div v-else class="max-w-2xl mx-auto text-center text-ink-400 text-sm py-20">Could not find this exam session.</div>
  </div>
</template>
