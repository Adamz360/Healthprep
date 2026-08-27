<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import PerformanceDashboard from '../components/PerformanceDashboard.vue';

const props = defineProps<{ examSessionId: string }>();
const router = useRouter();
const auth = useAuthStore();

function handleRetryWeakAreas(topicIds: string[]) {
  router.push({ name: 'weak-areas', query: { focus: topicIds.join(',') } });
}

function handleBack() {
  router.push({ name: 'home' });
}
</script>

<template>
  <PerformanceDashboard
    v-if="auth.userId"
    :exam-session-id="props.examSessionId"
    :user-id="auth.userId"
    @retry-weak-areas="handleRetryWeakAreas"
    @back-to-dashboard="handleBack"
  />
</template>
