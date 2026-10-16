<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useWalletAndGamificationStore } from '../stores/walletAndGamification';
import CbtExamView from '../components/CbtExamView.vue';
import { getDoc, doc } from 'firebase/firestore';
import { firestore } from '../firebase';
import type { ExamSession } from '../types/healthApp';

const props = defineProps<{ examSessionId: string }>();
const router = useRouter();
const auth = useAuthStore();
const wallet = useWalletAndGamificationStore();

async function handleSubmitted(finishedSession: ExamSession) {
  try {
    // Get subject name from Firestore
    const subjectSnap = await getDoc(doc(firestore, 'subjects', finishedSession.subjectId));
    const subject = subjectSnap.exists()
      ? { id: subjectSnap.id, ...subjectSnap.data() } as { name?: string }
      : null;

    await wallet.rewardQuizCompletion(subject?.name ?? 'exam');
    await wallet.refreshTopicMastery();
  } catch (err) {
    console.error('[ExamSession] Failed to reward/refresh:', err);
  }

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
