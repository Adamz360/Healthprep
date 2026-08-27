<script setup lang="ts">
import { ref, computed } from 'vue';
import { UploadCloud, Download, X, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-vue-next';
import { db, createQuestion, resolveOrCreateTopic } from '../db';
import { parseCsv, toCsv, downloadTextFile } from '../utils/csv';
import type { Department, Subject, QuestionDifficulty, QuestionOption } from '../types/healthApp';

const emit = defineEmits<{ (e: 'close'): void; (e: 'imported'): void }>();

type CsvRow = Record<string, string>;

interface ParsedRow {
  index: number; // 1-based, matches spreadsheet row number (row 1 = header)
  raw: CsvRow;
  errors: string[];
  resolved: {
    department: Department | null;
    subject: Subject | null;
    topicName: string;
    stem: string;
    options: QuestionOption[];
    correctOptionKey: QuestionOption['key'];
    difficulty: QuestionDifficulty;
    explanation: string;
  } | null;
}

const REQUIRED_COLUMNS = ['department', 'subject', 'topic', 'question', 'optionA', 'optionB', 'correctOption'];
const TEMPLATE_HEADERS = [
  'department',
  'subject',
  'topic',
  'question',
  'optionA',
  'optionB',
  'optionC',
  'optionD',
  'correctOption',
  'difficulty',
  'explanation',
];

const step = ref<'upload' | 'preview' | 'summary'>('upload');
const fileName = ref('');
const parsedRows = ref<ParsedRow[]>([]);
const isValidating = ref(false);
const isImporting = ref(false);
const parseError = ref<string | null>(null);

const importedCount = ref(0);
const failedCount = ref(0);

function downloadTemplate() {
  const sampleRows = [
    {
      department: 'Nursing',
      subject: 'Pharmacology',
      topic: 'Antibiotics',
      question: 'Which class of antibiotics inhibits bacterial cell wall synthesis?',
      optionA: 'Penicillins',
      optionB: 'Macrolides',
      optionC: 'Aminoglycosides',
      optionD: 'Tetracyclines',
      correctOption: 'A',
      difficulty: 'medium',
      explanation: 'Penicillins are beta-lactams that block cell wall synthesis.',
    },
    {
      department: 'Community Health (CHEW / JCHEW)',
      subject: 'Primary Health Care',
      topic: 'PHC Principles',
      question: 'What year was the Alma-Ata Declaration adopted?',
      optionA: '1978',
      optionB: '1985',
      optionC: '1990',
      optionD: '2000',
      correctOption: 'A',
      difficulty: 'easy',
      explanation: 'The Alma-Ata Declaration was adopted in 1978.',
    },
  ];

  const csv = toCsv(sampleRows.map((r) => ({ ...TEMPLATE_HEADERS.reduce((acc, h) => ({ ...acc, [h]: (r as Record<string, string>)[h] ?? '' }), {}) })));
  downloadTextFile('question-import-template.csv', csv);
}

async function handleFileChange(event: Event) {
  parseError.value = null;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  fileName.value = file.name;
  const text = await file.text();
  const { data, errors } = parseCsv<CsvRow>(text);

  if (errors.length > 0) {
    parseError.value = errors[0];
    return;
  }
  if (data.length === 0) {
    parseError.value = 'The file has no data rows.';
    return;
  }

  const headerColumns = Object.keys(data[0]);
  const missingRequired = REQUIRED_COLUMNS.filter((c) => !headerColumns.includes(c));
  if (missingRequired.length > 0) {
    parseError.value = `Missing required column(s): ${missingRequired.join(', ')}`;
    return;
  }

  isValidating.value = true;
  try {
    const departments = await db.departments.toArray();
    const subjects = await db.subjects.toArray();

    const rows: ParsedRow[] = [];
    for (let i = 0; i < data.length; i++) {
      rows.push(await validateRow(data[i], i + 2, departments, subjects)); // +2: header is row 1, data starts row 2
    }
    parsedRows.value = rows;
    step.value = 'preview';
  } finally {
    isValidating.value = false;
  }
}

async function validateRow(
  raw: CsvRow,
  index: number,
  departments: Department[],
  subjects: Subject[]
): Promise<ParsedRow> {
  const errors: string[] = [];

  const deptName = (raw.department ?? '').trim();
  const subjectName = (raw.subject ?? '').trim();
  const topicName = (raw.topic ?? '').trim();
  const stem = (raw.question ?? '').trim();
  const correctRaw = (raw.correctOption ?? '').trim().toUpperCase();
  const difficultyRaw = (raw.difficulty ?? 'medium').trim().toLowerCase();

  const department = departments.find((d) => d.name.toLowerCase() === deptName.toLowerCase()) ?? null;
  if (!department) errors.push(`Unknown department "${deptName}"`);

  const subject = department
    ? subjects.find((s) => s.departmentId === department.id && s.name.toLowerCase() === subjectName.toLowerCase()) ?? null
    : null;
  if (department && !subject) errors.push(`Unknown subject "${subjectName}" under "${deptName}"`);

  if (!topicName) errors.push('Topic is required');
  if (stem.length < 5) errors.push('Question text is too short');

  const options: QuestionOption[] = [];
  for (const key of ['A', 'B', 'C', 'D'] as const) {
    const text = (raw[`option${key}`] ?? '').trim();
    if (text) options.push({ key, text });
  }
  if (options.length < 2) errors.push('At least two answer options (A and B) are required');

  const validKeys = options.map((o) => o.key);
  if (!validKeys.includes(correctRaw as QuestionOption['key'])) {
    errors.push(`correctOption "${correctRaw || '(blank)'}" doesn't match a filled-in option`);
  }

  const difficulty: QuestionDifficulty = (['easy', 'medium', 'hard'] as const).includes(difficultyRaw as QuestionDifficulty)
    ? (difficultyRaw as QuestionDifficulty)
    : 'medium';

  const resolved =
    errors.length === 0
      ? {
          department,
          subject,
          topicName,
          stem,
          options,
          correctOptionKey: correctRaw as QuestionOption['key'],
          difficulty,
          explanation: (raw.explanation ?? '').trim(),
        }
      : null;

  return { index, raw, errors, resolved };
}

const validRows = computed(() => parsedRows.value.filter((r) => r.errors.length === 0));
const invalidRows = computed(() => parsedRows.value.filter((r) => r.errors.length > 0));

async function confirmImport() {
  isImporting.value = true;
  let success = 0;
  let failed = invalidRows.value.length;

  try {
    for (const row of validRows.value) {
      if (!row.resolved?.subject) {
        failed += 1;
        continue;
      }
      try {
        const topic = await resolveOrCreateTopic(row.resolved.subject.id, row.resolved.topicName);
        await createQuestion({
          subjectId: row.resolved.subject.id,
          departmentId: row.resolved.subject.departmentId,
          topicId: topic.id,
          stem: row.resolved.stem,
          options: row.resolved.options,
          correctOptionKey: row.resolved.correctOptionKey,
          explanation: row.resolved.explanation,
          difficulty: row.resolved.difficulty,
          tags: [row.resolved.topicName],
        });
        success += 1;
      } catch {
        failed += 1;
      }
    }
  } finally {
    importedCount.value = success;
    failedCount.value = failed;
    isImporting.value = false;
    step.value = 'summary';
    emit('imported');
  }
}

function reset() {
  step.value = 'upload';
  fileName.value = '';
  parsedRows.value = [];
  parseError.value = null;
  importedCount.value = 0;
  failedCount.value = 0;
}
</script>

<template>
  <div class="fixed inset-0 z-30 bg-ink-900/50 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-white rounded-3xl shadow-panel max-w-2xl w-full p-6 animate-popIn max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between mb-4">
        <h4 class="font-display text-lg font-bold text-ink-900 flex items-center gap-2">
          <FileSpreadsheet class="w-5 h-5 text-brand-600" /> Import Questions (CSV)
        </h4>
        <button type="button" class="p-1.5 rounded-lg hover:bg-ink-50 text-ink-400" @click="emit('close')">
          <X class="w-4.5 h-4.5" />
        </button>
      </div>

      <!-- Step: upload -->
      <template v-if="step === 'upload'">
        <button
          type="button"
          class="w-full flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 text-brand-700 text-sm font-semibold px-4 py-3 mb-4 hover:bg-brand-100 transition-colors"
          @click="downloadTemplate"
        >
          <Download class="w-4 h-4" /> Download sample CSV template
        </button>

        <label
          class="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-200 py-10 cursor-pointer hover:border-brand-400 transition-colors"
        >
          <UploadCloud class="w-8 h-8 text-ink-300" />
          <span class="text-sm font-medium text-ink-700">{{ fileName || 'Click to choose a CSV file' }}</span>
          <span class="text-xs text-ink-400">Required columns: {{ REQUIRED_COLUMNS.join(', ') }}</span>
          <input type="file" accept=".csv,text/csv" class="hidden" @change="handleFileChange" />
        </label>

        <p v-if="isValidating" class="text-sm text-ink-400 text-center mt-4">Validating rows…</p>
        <p v-if="parseError" class="text-sm text-coral-dim bg-coral-soft border border-coral/30 rounded-xl px-3.5 py-2.5 mt-4">
          {{ parseError }}
        </p>
      </template>

      <!-- Step: preview -->
      <template v-else-if="step === 'preview'">
        <div class="flex items-center gap-4 mb-4 text-sm">
          <span class="inline-flex items-center gap-1.5 text-brand-600 font-semibold">
            <CheckCircle2 class="w-4 h-4" /> {{ validRows.length }} valid
          </span>
          <span class="inline-flex items-center gap-1.5 text-coral font-semibold">
            <AlertTriangle class="w-4 h-4" /> {{ invalidRows.length }} with errors
          </span>
        </div>

        <div class="max-h-80 overflow-y-auto border border-ink-100 rounded-2xl divide-y divide-ink-50">
          <div v-for="row in parsedRows" :key="row.index" class="px-4 py-3 text-sm">
            <div class="flex items-center justify-between gap-2">
              <span class="font-mono text-xs text-ink-400">Row {{ row.index }}</span>
              <span
                class="text-[11px] font-semibold rounded-full px-2 py-0.5"
                :class="row.errors.length === 0 ? 'bg-brand-50 text-brand-600' : 'bg-coral-soft text-coral-dim'"
              >
                {{ row.errors.length === 0 ? 'Valid' : 'Error' }}
              </span>
            </div>
            <p class="text-ink-800 mt-1 line-clamp-2">{{ row.raw.question }}</p>
            <ul v-if="row.errors.length > 0" class="mt-1.5 space-y-0.5">
              <li v-for="(err, i) in row.errors" :key="i" class="text-xs text-coral-dim">• {{ err }}</li>
            </ul>
          </div>
        </div>

        <div class="flex gap-2.5 mt-5">
          <button type="button" class="flex-1 rounded-xl border border-ink-200 text-ink-600 text-sm font-medium py-2.5" @click="reset">
            Choose Different File
          </button>
          <button
            type="button"
            class="flex-1 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold py-2.5 disabled:opacity-50 transition-colors"
            :disabled="isImporting || validRows.length === 0"
            @click="confirmImport"
          >
            {{ isImporting ? 'Importing…' : `Import ${validRows.length} Valid Row(s)` }}
          </button>
        </div>
      </template>

      <!-- Step: summary -->
      <template v-else-if="step === 'summary'">
        <div class="text-center py-4">
          <span class="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-50 text-brand-600 mb-4">
            <CheckCircle2 class="w-7 h-7" />
          </span>
          <h5 class="font-display text-lg font-bold text-ink-900">Import complete</h5>
          <p class="text-sm text-ink-500 mt-1.5">
            <span class="font-mono font-semibold text-brand-700">{{ importedCount }}</span> imported ·
            <span class="font-mono font-semibold text-coral">{{ failedCount }}</span> failed
          </p>
        </div>
        <button type="button" class="w-full rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-semibold py-3 transition-colors" @click="emit('close')">
          Done
        </button>
      </template>
    </div>
  </div>
</template>
