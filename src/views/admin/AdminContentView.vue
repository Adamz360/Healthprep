<!-- src/views/admin/AdminContentView.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { Plus, Pencil, Trash2, FileQuestion, UploadCloud } from 'lucide-vue-next';
import { getDocs, getDoc, doc, collection, query, where } from 'firebase/firestore';
import { firestore } from '../../firebase';
import { createQuestion, updateQuestion, deleteQuestion } from '../../services/content';
import AdminShell from '../../components/AdminShell.vue';
import AdminImportQuestionsModal from '../../components/AdminImportQuestionsModal.vue';
import type {
  Department,
  Subject,
  Topic,
  Question,
  QuestionDifficulty,
  QuestionOption,
} from '../../types/healthApp';

const departments = ref<Department[]>([]);
const subjects = ref<Subject[]>([]);
const topics = ref<Topic[]>([]);
const questions = ref<Question[]>([]);

const selectedDepartmentId = ref('');
const selectedSubjectId = ref('');
const isLoading = ref(true);

onMounted(async () => {
  try {
    const snap = await getDocs(collection(firestore, 'departments'));
    departments.value = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Department)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (departments.value.length > 0) {
      selectedDepartmentId.value = departments.value[0].id;
    }
  } catch (err: any) {
    console.error('[AdminContent] Failed to load departments:', err);
  } finally {
    isLoading.value = false;
  }
});

watch(selectedDepartmentId, async (deptId) => {
  if (!deptId) {
    subjects.value = [];
    selectedSubjectId.value = '';
    return;
  }
  try {
    const snap = await getDocs(
      query(collection(firestore, 'subjects'), where('departmentId', '==', deptId)),
    );
    subjects.value = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Subject)
      .sort((a, b) => a.name.localeCompare(b.name));
    selectedSubjectId.value = subjects.value[0]?.id ?? '';
  } catch (err: any) {
    console.error('[AdminContent] Failed to load subjects:', err);
    subjects.value = [];
    selectedSubjectId.value = '';
  }
});

watch(
  selectedSubjectId,
  async (subjectId) => {
    if (!subjectId) {
      topics.value = [];
      questions.value = [];
      return;
    }
    try {
      const [topicsSnap, questionsSnap] = await Promise.all([
        getDocs(query(collection(firestore, 'topics'), where('subjectId', '==', subjectId))),
        getDocs(query(collection(firestore, 'questions'), where('subjectId', '==', subjectId))),
      ]);

      topics.value = topicsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Topic);

      questions.value = questionsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Question);
    } catch (err: any) {
      console.error('[AdminContent] Failed to load topics/questions:', err);
      topics.value = [];
      questions.value = [];
    }
  },
  { immediate: true },
);

async function refreshQuestions() {
  if (!selectedSubjectId.value) return;
  try {
    const [questionsSnap, subjectSnap] = await Promise.all([
      getDocs(
        query(collection(firestore, 'questions'), where('subjectId', '==', selectedSubjectId.value)),
      ),
      getDoc(doc(firestore, 'subjects', selectedSubjectId.value)),
    ]);

    questions.value = questionsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Question);

    if (subjectSnap.exists()) {
      const subj = { id: subjectSnap.id, ...subjectSnap.data() } as Subject;
      const idx = subjects.value.findIndex((s) => s.id === subj.id);
      if (idx !== -1) subjects.value[idx] = subj;
    }
  } catch (err: any) {
    console.error('[AdminContent] Failed to refresh questions:', err);
  }
}

function topicName(topicId: string): string {
  return topics.value.find((t) => t.id === topicId)?.name ?? '—';
}

/* ── Question form modal ───────────────────────────────────────────────── */

type OptionKey = Exclude<QuestionOption['key'], 'E'>;

const isModalOpen = ref(false);
const editingQuestionId = ref<string | null>(null);
const isSaving = ref(false);
const formError = ref<string | null>(null);

const formTopicId = ref('');
const formStem = ref('');
const formOptions = ref<Record<OptionKey, string>>({ A: '', B: '', C: '', D: '' });
const formCorrectKey = ref<OptionKey>('A');
const formDifficulty = ref<QuestionDifficulty>('medium');
const formExplanation = ref('');

function openCreateModal() {
  editingQuestionId.value = null;
  formTopicId.value = topics.value[0]?.id ?? '';
  formStem.value = '';
  formOptions.value = { A: '', B: '', C: '', D: '' };
  formCorrectKey.value = 'A';
  formDifficulty.value = 'medium';
  formExplanation.value = '';
  formError.value = null;
  isModalOpen.value = true;
}

function openEditModal(question: Question) {
  editingQuestionId.value = question.id;
  formTopicId.value = question.topicId;
  formStem.value = question.stem;
  const opts: Record<OptionKey, string> = { A: '', B: '', C: '', D: '' };
  for (const o of question.options) {
    if (o.key === 'A' || o.key === 'B' || o.key === 'C' || o.key === 'D') opts[o.key] = o.text;
  }
  formOptions.value = opts;
  formCorrectKey.value = question.correctOptionKey === 'E' ? 'A' : question.correctOptionKey;
  formDifficulty.value = question.difficulty;
  formExplanation.value = question.explanation;
  formError.value = null;
  isModalOpen.value = true;
}

function closeModal() {
  isModalOpen.value = false;
}

async function saveQuestion() {
  formError.value = null;

  if (!formTopicId.value) return (formError.value = 'Please select a topic.');
  if (formStem.value.trim().length < 5) return (formError.value = 'Please enter the question text.');

  const optionEntries = (Object.entries(formOptions.value) as [OptionKey, string][]).filter(
    ([, text]) => text.trim().length > 0,
  );
  if (optionEntries.length < 2) return (formError.value = 'Please provide at least two answer options.');
  if (!formOptions.value[formCorrectKey.value]?.trim()) return (formError.value = 'The correct answer option cannot be empty.');

  isSaving.value = true;
  try {
    const options: QuestionOption[] = optionEntries.map(([key, text]) => ({
      key,
      text: text.trim(),
    }));

    if (editingQuestionId.value) {
      await updateQuestion(editingQuestionId.value, {
        topicId: formTopicId.value,
        stem: formStem.value.trim(),
        options,
        correctOptionKey: formCorrectKey.value,
        explanation: formExplanation.value.trim(),
        difficulty: formDifficulty.value,
      });
    } else {
      await createQuestion({
        subjectId: selectedSubjectId.value,
        departmentId: selectedDepartmentId.value,
        topicId: formTopicId.value,
        stem: formStem.value.trim(),
        options,
        correctOptionKey: formCorrectKey.value,
        explanation: formExplanation.value.trim(),
        difficulty: formDifficulty.value,
        tags: [topicName(formTopicId.value)],
      });
    }

    await refreshQuestions();
    isModalOpen.value = false;
  } catch (err: any) {
    formError.value = err.message ?? 'Failed to save question.';
  } finally {
    isSaving.value = false;
  }
}

const confirmDeleteId = ref<string | null>(null);

async function confirmDelete() {
  if (!confirmDeleteId.value) return;
  try {
    await deleteQuestion(confirmDeleteId.value);
    confirmDeleteId.value = null;
    await refreshQuestions();
  } catch (err: any) {
    console.error('[AdminContent] Failed to delete question:', err);
  }
}

const currentSubject = computed(
  () => subjects.value.find((s) => s.id === selectedSubjectId.value) ?? null,
);

const isImportModalOpen = ref(false);

async function handleImported() {
  await refreshQuestions();
}
</script>

<template>
  <AdminShell>
    <div class="max-w-5xl mx-auto px-5 py-6">
      <h1 class="font-display text-xl font-bold text-ink-900">Content Management</h1>
      <p class="text-sm text-ink-500 mt-1">Manage departments, subjects, and the question bank.</p>

      <div v-if="isLoading" class="text-sm text-ink-300 text-center py-16">Loading content…</div>

      <template v-else>
        <div class="grid sm:grid-cols-2 gap-3 mt-5">
          <div>
            <label class="block text-xs font-semibold text-ink-500 mb-1.5">Department / Course</label>
            <select
              v-model="selectedDepartmentId"
              class="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              <option v-for="dept in departments" :key="dept.id" :value="dept.id">{{ dept.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-ink-500 mb-1.5">Subject</label>
            <select
              v-model="selectedSubjectId"
              class="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              <option v-for="subj in subjects" :key="subj.id" :value="subj.id">{{ subj.name }}</option>
            </select>
          </div>
        </div>

        <div class="flex items-center justify-between mt-6 mb-3">
          <p class="text-sm font-semibold text-ink-700">
            {{ currentSubject?.name ?? 'Questions' }}
            <span class="text-ink-400 font-normal">· {{ questions.length }} questions</span>
          </p>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 text-ink-600 hover:bg-ink-50 text-sm font-semibold px-4 py-2 transition-colors"
              @click="isImportModalOpen = true"
            >
              <UploadCloud class="w-4 h-4" /> Import CSV
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold px-4 py-2 transition-colors disabled:opacity-50"
              :disabled="!selectedSubjectId"
              @click="openCreateModal"
            >
              <Plus class="w-4 h-4" /> Add Question
            </button>
          </div>
        </div>

        <div class="bg-white rounded-2xl border border-ink-100 shadow-card overflow-hidden">
          <div v-if="questions.length === 0" class="text-center text-sm text-ink-300 py-12">
            <FileQuestion class="w-8 h-8 mx-auto mb-2 text-ink-200" />
            No questions in this subject yet.
          </div>

          <div v-else class="divide-y divide-ink-50">
            <div
              v-for="q in questions"
              :key="q.id"
              class="px-4 py-3.5 flex items-start justify-between gap-3"
            >
              <div class="min-w-0">
                <p class="text-sm text-ink-900 line-clamp-2">{{ q.stem }}</p>
                <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span class="text-[11px] font-mono text-ink-400">{{ topicName(q.topicId) }}</span>
                  <span
                    class="text-[10px] font-semibold rounded-full px-2 py-0.5"
                    :class="{
                      'bg-brand-50 text-brand-600': q.difficulty === 'easy',
                      'bg-gold-soft text-gold-dim': q.difficulty === 'medium',
                      'bg-coral-soft text-coral-dim': q.difficulty === 'hard',
                    }"
                  >
                    {{ q.difficulty }}
                  </span>
                  <span class="text-[11px] font-mono text-brand-600">correct: {{ q.correctOptionKey }}</span>
                </div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  class="p-2 rounded-lg text-ink-500 hover:bg-ink-50 hover:text-brand-600"
                  @click="openEditModal(q)"
                >
                  <Pencil class="w-4 h-4" />
                </button>
                <button
                  type="button"
                  class="p-2 rounded-lg text-ink-500 hover:bg-coral-soft hover:text-coral"
                  @click="confirmDeleteId = q.id"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Question form modal -->
    <div
      v-if="isModalOpen"
      class="fixed inset-0 z-30 bg-ink-900/50 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div class="bg-white rounded-3xl shadow-panel max-w-lg w-full p-6 animate-popIn max-h-[90vh] overflow-y-auto">
        <h4 class="font-display text-lg font-bold text-ink-900 mb-4">
          {{ editingQuestionId ? 'Edit Question' : 'Add Question' }}
        </h4>

        <div class="space-y-3.5">
          <div>
            <label class="block text-xs font-semibold text-ink-500 mb-1.5">Topic</label>
            <select
              v-model="formTopicId"
              class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              <option v-for="t in topics" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-semibold text-ink-500 mb-1.5">Question Text</label>
            <textarea
              v-model="formStem"
              rows="3"
              placeholder="Enter the question stem…"
              class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 resize-none"
            ></textarea>
          </div>

          <div>
            <label class="block text-xs font-semibold text-ink-500 mb-1.5">Answer Options — mark the correct one</label>
            <div class="space-y-2">
              <div v-for="key in (['A', 'B', 'C', 'D'] as const)" :key="key" class="flex items-center gap-2">
                <button
                  type="button"
                  class="w-7 h-7 rounded-lg border-2 flex items-center justify-center text-xs font-mono font-bold shrink-0"
                  :class="formCorrectKey === key ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-200 text-ink-400'"
                  @click="formCorrectKey = key"
                >
                  {{ key }}
                </button>
                <input
                  v-model="formOptions[key]"
                  type="text"
                  :placeholder="`Option ${key}`"
                  class="flex-1 rounded-xl border border-ink-200 bg-canvas px-3.5 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-ink-500 mb-1.5">Difficulty</label>
              <select
                v-model="formDifficulty"
                class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-ink-500 mb-1.5">Explanation (optional)</label>
            <textarea
              v-model="formExplanation"
              rows="2"
              placeholder="Why the correct answer is correct…"
              class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 resize-none"
            ></textarea>
          </div>

          <p
            v-if="formError"
            class="text-sm text-coral-dim bg-coral-soft border border-coral/30 rounded-xl px-3.5 py-2.5"
          >
            {{ formError }}
          </p>
        </div>

        <div class="flex gap-2.5 mt-5">
          <button
            type="button"
            class="flex-1 rounded-xl border border-ink-200 text-ink-600 text-sm font-medium py-2.5"
            @click="closeModal"
          >
            Cancel
          </button>
          <button
            type="button"
            class="flex-1 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold py-2.5 disabled:opacity-50 transition-colors"
            :disabled="isSaving"
            @click="saveQuestion"
          >
            {{ isSaving ? 'Saving…' : editingQuestionId ? 'Save Changes' : 'Add Question' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete confirmation -->
    <div
      v-if="confirmDeleteId"
      class="fixed inset-0 z-30 bg-ink-900/50 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div class="bg-white rounded-3xl shadow-panel max-w-xs w-full p-6 animate-popIn">
        <h4 class="font-display text-lg font-bold text-ink-900 mb-1.5">Delete this question?</h4>
        <p class="text-sm text-ink-500 mb-5">This cannot be undone.</p>
        <div class="flex gap-2.5">
          <button
            type="button"
            class="flex-1 rounded-xl border border-ink-200 text-ink-600 text-sm font-medium py-2.5"
            @click="confirmDeleteId = null"
          >
            Cancel
          </button>
          <button
            type="button"
            class="flex-1 rounded-xl bg-coral text-white text-sm font-semibold py-2.5"
            @click="confirmDelete"
          >
            Delete
          </button>
        </div>
      </div>
    </div>

    <!-- CSV import modal -->
    <AdminImportQuestionsModal
      v-if="isImportModalOpen"
      @close="isImportModalOpen = false"
      @imported="handleImported"
    />
  </AdminShell>
</template>