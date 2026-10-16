<!-- src/views/SubjectListView.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronLeft, ChevronRight, Download, CheckCircle2 } from 'lucide-vue-next';
import {
  getDoc, getDocs, doc,
  collection, query, where,
} from 'firebase/firestore';
import { firestore } from '../firebase';
import { ensureSubjectDownloaded } from '../services/academic';
import type { Department, Subject } from '../types/healthApp';

const props = defineProps<{ departmentId: string }>();
const router = useRouter();

const department = ref<Department | null>(null);
const subjects = ref<Subject[]>([]);
const isLoading = ref(true);
const downloadingId = ref<string | null>(null);

onMounted(async () => {
  try {
    // Load department from Firestore
    const deptSnap = await getDoc(doc(firestore, 'departments', props.departmentId));
    department.value = deptSnap.exists()
      ? { id: deptSnap.id, ...deptSnap.data() } as Department
      : null;

    if (department.value) {
      // Load subjects for this department
      const subjSnap = await getDocs(
        query(
          collection(firestore, 'subjects'),
          where('departmentId', '==', department.value.id),
        ),
      );
      subjects.value = subjSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Subject)
        .filter((s) => s.isActive !== false);
    }
  } catch (err) {
    console.error('[SubjectList] Failed to load:', err);
  } finally {
    isLoading.value = false;
  }
});

async function downloadSubject(subject: Subject) {
  downloadingId.value = subject.id;
  try {
    const updated = await ensureSubjectDownloaded(subject.id);
    if (updated) {
      const idx = subjects.value.findIndex((s) => s.id === subject.id);
      if (idx !== -1) subjects.value[idx] = updated;
    }
  } catch (err) {
    console.error('[SubjectList] Download failed:', err);
  } finally {
    downloadingId.value = null;
  }
}

function openSubject(subject: Subject) {
  router.push({ name: 'exam-setup', params: { subjectId: subject.id } });
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
          <h1 class="font-display font-bold text-ink-900">{{ department?.name ?? 'Subjects' }}</h1>
          <p class="text-xs text-ink-500">{{ subjects.length }} subjects</p>
        </div>
      </div>
    </header>

    <div class="max-w-2xl mx-auto px-4 py-5">
      <div v-if="isLoading" class="text-sm text-ink-300 text-center py-10">Loading subjects…</div>

      <div v-else class="space-y-3">
        <div
          v-for="subject in subjects"
          :key="subject.id"
          class="bg-white rounded-2xl border border-ink-100 shadow-card px-4 py-4"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="font-semibold text-ink-900 text-sm">{{ subject.name }}</p>
              <p class="text-xs text-ink-500 mt-0.5">
                {{ subject.totalQuestionCount }} questions ·
                <span class="font-mono">{{ subject.creditsToUnlockMock }}</span> credits for full mock
              </p>
            </div>

            <button
              v-if="!subject.isDownloaded"
              type="button"
              class="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 border border-brand-200 bg-brand-50 rounded-full px-3 py-1.5 disabled:opacity-50 shrink-0"
              :disabled="downloadingId === subject.id"
              @click="downloadSubject(subject)"
            >
              <Download class="w-3.5 h-3.5" />
              {{ downloadingId === subject.id ? 'Preparing…' : 'Get Offline' }}
            </button>
            <span v-else class="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 shrink-0">
              <CheckCircle2 class="w-3.5 h-3.5" /> Ready
            </span>
          </div>

          <button
            type="button"
            class="w-full mt-3.5 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold py-2.5 transition-colors"
            @click="openSubject(subject)"
          >
            Start Practicing <ChevronRight class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>