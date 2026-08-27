<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useWalletAndGamificationStore } from '../stores/walletAndGamification';
import CbtExamView from '../components/CbtExamView.vue';
import { db } from '../db';
import type { ExamSession } from '../types/healthApp';

const props = defineProps<{ examSessionId: string }>();
const router = useRouter();
const auth = useAuthStore();
const wallet = useWalletAndGamificationStore();

async function handleSubmitted(finishedSession: ExamSession) {
  // Reward quiz completion (credits) and refresh weak-area analytics before
  // handing off to the results screen.
  const subject = await db.subjects.get(finishedSession.subjectId);
  await wallet.rewardQuizCompletion(subject?.name ?? 'exam');
  await wallet.refreshTopicMastery();

  router.replace({ name: 'exam-results', params: { examSessionId: finishedSession.id } });
}
</script>

<template>
  <CbtExamView
    v-if="auth.userId"
    :exam-session-id="props.examSessionId"
    :user-id="auth.userId"
    :credit-balance="wallet.creditBalance"
    @exam-submitted="handleSubmitted"
  />
</template>
