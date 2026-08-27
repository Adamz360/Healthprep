<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Plus, Pencil, Trash2, Eye, EyeOff, Building2, GraduationCap, BookOpen } from 'lucide-vue-next';
import {
  db,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  createCourse,
  updateCourse,
  deleteCourse,
  createSubject,
  updateSubject,
  deleteSubject,
} from '../../db';
import AdminShell from '../../components/AdminShell.vue';
import type { Department, Course, Subject } from '../../types/healthApp';

type Tab = 'departments' | 'courses' | 'subjects';
const activeTab = ref<Tab>('departments');

const departments = ref<Department[]>([]);
const courses = ref<Course[]>([]);
const subjects = ref<Subject[]>([]);
const isLoading = ref(true);

onMounted(async () => {
  await refreshAll();
});

async function refreshAll() {
  isLoading.value = true;
  [departments.value, courses.value, subjects.value] = await Promise.all([
    db.departments.toArray(),
    db.courses.toArray(),
    db.subjects.toArray(),
  ]);
  isLoading.value = false;
}

function departmentName(id: string): string {
  return departments.value.find((d) => d.id === id)?.name ?? '—';
}
function courseName(id: string): string {
  return courses.value.find((c) => c.id === id)?.name ?? '—';
}

const actionError = ref<string | null>(null);

/* -------------------------------------------------------------------------- */
/*  Department form                                                          */
/* -------------------------------------------------------------------------- */

const deptModalOpen = ref(false);
const editingDeptId = ref<string | null>(null);
const deptForm = ref({ name: '', slug: '', description: '', iconName: 'Stethoscope' });
const deptSaving = ref(false);
const deptFormError = ref<string | null>(null);

function openCreateDept() {
  editingDeptId.value = null;
  deptForm.value = { name: '', slug: '', description: '', iconName: 'Stethoscope' };
  deptFormError.value = null;
  deptModalOpen.value = true;
}
function openEditDept(dept: Department) {
  editingDeptId.value = dept.id;
  deptForm.value = { name: dept.name, slug: dept.slug, description: dept.description, iconName: dept.iconName };
  deptFormError.value = null;
  deptModalOpen.value = true;
}
async function saveDept() {
  deptFormError.value = null;
  if (deptForm.value.name.trim().length < 2) return (deptFormError.value = 'Please enter a name.');
  if (deptForm.value.slug.trim().length < 2) return (deptFormError.value = 'Please enter a slug.');

  deptSaving.value = true;
  try {
    if (editingDeptId.value) {
      await updateDepartment(editingDeptId.value, { ...deptForm.value });
    } else {
      await createDepartment({ ...deptForm.value });
    }
    await refreshAll();
    deptModalOpen.value = false;
  } finally {
    deptSaving.value = false;
  }
}
async function toggleDeptActive(dept: Department) {
  await updateDepartment(dept.id, { isActive: !dept.isActive });
  await refreshAll();
}
const confirmDeleteDeptId = ref<string | null>(null);
async function confirmDeleteDept() {
  if (!confirmDeleteDeptId.value) return;
  const err = await deleteDepartment(confirmDeleteDeptId.value);
  actionError.value = err;
  confirmDeleteDeptId.value = null;
  if (!err) await refreshAll();
}

/* -------------------------------------------------------------------------- */
/*  Course form                                                              */
/* -------------------------------------------------------------------------- */

const courseModalOpen = ref(false);
const editingCourseId = ref<string | null>(null);
const courseForm = ref({ departmentId: '', name: '', slug: '', description: '' });
const courseSaving = ref(false);
const courseFormError = ref<string | null>(null);

function openCreateCourse() {
  editingCourseId.value = null;
  courseForm.value = { departmentId: departments.value[0]?.id ?? '', name: '', slug: '', description: '' };
  courseFormError.value = null;
  courseModalOpen.value = true;
}
function openEditCourse(course: Course) {
  editingCourseId.value = course.id;
  courseForm.value = { departmentId: course.departmentId, name: course.name, slug: course.slug, description: course.description };
  courseFormError.value = null;
  courseModalOpen.value = true;
}
async function saveCourse() {
  courseFormError.value = null;
  if (!courseForm.value.departmentId) return (courseFormError.value = 'Please select a department.');
  if (courseForm.value.name.trim().length < 2) return (courseFormError.value = 'Please enter a name.');
  if (courseForm.value.slug.trim().length < 2) return (courseFormError.value = 'Please enter a slug.');

  courseSaving.value = true;
  try {
    if (editingCourseId.value) {
      await updateCourse(editingCourseId.value, { ...courseForm.value });
    } else {
      await createCourse({ ...courseForm.value });
    }
    await refreshAll();
    courseModalOpen.value = false;
  } finally {
    courseSaving.value = false;
  }
}
async function toggleCourseActive(course: Course) {
  await updateCourse(course.id, { isActive: !course.isActive });
  await refreshAll();
}
const confirmDeleteCourseId = ref<string | null>(null);
async function confirmDeleteCourse() {
  if (!confirmDeleteCourseId.value) return;
  const err = await deleteCourse(confirmDeleteCourseId.value);
  actionError.value = err;
  confirmDeleteCourseId.value = null;
  if (!err) await refreshAll();
}

/* -------------------------------------------------------------------------- */
/*  Subject form                                                             */
/* -------------------------------------------------------------------------- */

const subjectModalOpen = ref(false);
const editingSubjectId = ref<string | null>(null);
const subjectForm = ref({ courseId: '', name: '', slug: '', creditsToUnlockMock: 20 });
const subjectSaving = ref(false);
const subjectFormError = ref<string | null>(null);

function openCreateSubject() {
  editingSubjectId.value = null;
  subjectForm.value = { courseId: courses.value[0]?.id ?? '', name: '', slug: '', creditsToUnlockMock: 20 };
  subjectFormError.value = null;
  subjectModalOpen.value = true;
}
function openEditSubject(subject: Subject) {
  editingSubjectId.value = subject.id;
  subjectForm.value = {
    courseId: subject.courseId,
    name: subject.name,
    slug: subject.slug,
    creditsToUnlockMock: subject.creditsToUnlockMock,
  };
  subjectFormError.value = null;
  subjectModalOpen.value = true;
}
async function saveSubject() {
  subjectFormError.value = null;
  if (!subjectForm.value.courseId) return (subjectFormError.value = 'Please select a course.');
  if (subjectForm.value.name.trim().length < 2) return (subjectFormError.value = 'Please enter a name.');
  if (subjectForm.value.slug.trim().length < 2) return (subjectFormError.value = 'Please enter a slug.');

  subjectSaving.value = true;
  try {
    if (editingSubjectId.value) {
      await updateSubject(editingSubjectId.value, { ...subjectForm.value });
    } else {
      await createSubject({ ...subjectForm.value });
    }
    await refreshAll();
    subjectModalOpen.value = false;
  } finally {
    subjectSaving.value = false;
  }
}
async function toggleSubjectActive(subject: Subject) {
  await updateSubject(subject.id, { isActive: !subject.isActive });
  await refreshAll();
}
const confirmDeleteSubjectId = ref<string | null>(null);
async function confirmDeleteSubject() {
  if (!confirmDeleteSubjectId.value) return;
  const err = await deleteSubject(confirmDeleteSubjectId.value);
  actionError.value = err;
  confirmDeleteSubjectId.value = null;
  if (!err) await refreshAll();
}

function cancelDeleteConfirmations() {
  confirmDeleteDeptId.value = null;
  confirmDeleteCourseId.value = null;
  confirmDeleteSubjectId.value = null;
}

function runPendingDelete() {
  if (confirmDeleteDeptId.value) return confirmDeleteDept();
  if (confirmDeleteCourseId.value) return confirmDeleteCourse();
  if (confirmDeleteSubjectId.value) return confirmDeleteSubject();
}

const tabs: { id: Tab; label: string; icon: typeof Building2 }[] = [
  { id: 'departments', label: 'Departments', icon: Building2 },
  { id: 'courses', label: 'Courses', icon: GraduationCap },
  { id: 'subjects', label: 'Subjects', icon: BookOpen },
];
</script>

<template>
  <AdminShell>
    <div class="max-w-4xl mx-auto px-5 py-6">
      <h1 class="font-display text-xl font-bold text-ink-900">Academic Management</h1>
      <p class="text-sm text-ink-500 mt-1">Department → Course → Subject → Questions hierarchy.</p>

      <div class="flex gap-1.5 mt-5 bg-ink-50 rounded-xl p-1 w-fit">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors"
          :class="activeTab === tab.id ? 'bg-white text-brand-700 shadow-card' : 'text-ink-500'"
          @click="activeTab = tab.id"
        >
          <component :is="tab.icon" class="w-4 h-4" /> {{ tab.label }}
        </button>
      </div>

      <p v-if="actionError" class="text-sm text-coral-dim bg-coral-soft border border-coral/30 rounded-xl px-3.5 py-2.5 mt-4">
        {{ actionError }}
      </p>

      <div v-if="isLoading" class="text-sm text-ink-300 text-center py-16">Loading academic structure…</div>

      <!-- Departments tab -->
      <template v-else-if="activeTab === 'departments'">
        <div class="flex justify-end mt-4 mb-2">
          <button type="button" class="inline-flex items-center gap-1.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold px-4 py-2 transition-colors" @click="openCreateDept">
            <Plus class="w-4 h-4" /> Add Department
          </button>
        </div>
        <div class="bg-white rounded-2xl border border-ink-100 shadow-card divide-y divide-ink-50">
          <div v-for="dept in departments" :key="dept.id" class="flex items-center justify-between px-4 py-3.5 gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-ink-900 truncate">{{ dept.name }}</p>
              <p class="text-xs text-ink-500 truncate">{{ dept.description }}</p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="text-[11px] font-semibold rounded-full px-2 py-0.5" :class="dept.isActive ? 'bg-brand-50 text-brand-600' : 'bg-ink-100 text-ink-400'">
                {{ dept.isActive ? 'Active' : 'Inactive' }}
              </span>
              <button type="button" class="p-2 rounded-lg text-ink-500 hover:bg-ink-50" @click="toggleDeptActive(dept)">
                <EyeOff v-if="dept.isActive" class="w-4 h-4" />
                <Eye v-else class="w-4 h-4" />
              </button>
              <button type="button" class="p-2 rounded-lg text-ink-500 hover:bg-ink-50 hover:text-brand-600" @click="openEditDept(dept)">
                <Pencil class="w-4 h-4" />
              </button>
              <button type="button" class="p-2 rounded-lg text-ink-500 hover:bg-coral-soft hover:text-coral" @click="confirmDeleteDeptId = dept.id">
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- Courses tab -->
      <template v-else-if="activeTab === 'courses'">
        <div class="flex justify-end mt-4 mb-2">
          <button type="button" class="inline-flex items-center gap-1.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold px-4 py-2 transition-colors" @click="openCreateCourse">
            <Plus class="w-4 h-4" /> Add Course
          </button>
        </div>
        <div class="bg-white rounded-2xl border border-ink-100 shadow-card divide-y divide-ink-50">
          <div v-for="course in courses" :key="course.id" class="flex items-center justify-between px-4 py-3.5 gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-ink-900 truncate">{{ course.name }}</p>
              <p class="text-xs text-ink-500 truncate">{{ departmentName(course.departmentId) }} · {{ course.subjectIds.length }} subjects</p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="text-[11px] font-semibold rounded-full px-2 py-0.5" :class="course.isActive ? 'bg-brand-50 text-brand-600' : 'bg-ink-100 text-ink-400'">
                {{ course.isActive ? 'Active' : 'Inactive' }}
              </span>
              <button type="button" class="p-2 rounded-lg text-ink-500 hover:bg-ink-50" @click="toggleCourseActive(course)">
                <EyeOff v-if="course.isActive" class="w-4 h-4" />
                <Eye v-else class="w-4 h-4" />
              </button>
              <button type="button" class="p-2 rounded-lg text-ink-500 hover:bg-ink-50 hover:text-brand-600" @click="openEditCourse(course)">
                <Pencil class="w-4 h-4" />
              </button>
              <button type="button" class="p-2 rounded-lg text-ink-500 hover:bg-coral-soft hover:text-coral" @click="confirmDeleteCourseId = course.id">
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- Subjects tab -->
      <template v-else>
        <div class="flex justify-end mt-4 mb-2">
          <button type="button" class="inline-flex items-center gap-1.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold px-4 py-2 transition-colors" @click="openCreateSubject">
            <Plus class="w-4 h-4" /> Add Subject
          </button>
        </div>
        <div class="bg-white rounded-2xl border border-ink-100 shadow-card divide-y divide-ink-50">
          <div v-for="subject in subjects" :key="subject.id" class="flex items-center justify-between px-4 py-3.5 gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-ink-900 truncate">{{ subject.name }}</p>
              <p class="text-xs text-ink-500 truncate">{{ courseName(subject.courseId) }} · {{ subject.totalQuestionCount }} questions</p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="text-[11px] font-semibold rounded-full px-2 py-0.5" :class="subject.isActive ? 'bg-brand-50 text-brand-600' : 'bg-ink-100 text-ink-400'">
                {{ subject.isActive ? 'Active' : 'Inactive' }}
              </span>
              <button type="button" class="p-2 rounded-lg text-ink-500 hover:bg-ink-50" @click="toggleSubjectActive(subject)">
                <EyeOff v-if="subject.isActive" class="w-4 h-4" />
                <Eye v-else class="w-4 h-4" />
              </button>
              <button type="button" class="p-2 rounded-lg text-ink-500 hover:bg-ink-50 hover:text-brand-600" @click="openEditSubject(subject)">
                <Pencil class="w-4 h-4" />
              </button>
              <button type="button" class="p-2 rounded-lg text-ink-500 hover:bg-coral-soft hover:text-coral" @click="confirmDeleteSubjectId = subject.id">
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Department modal -->
    <div v-if="deptModalOpen" class="fixed inset-0 z-30 bg-ink-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl shadow-panel max-w-sm w-full p-6 animate-popIn">
        <h4 class="font-display text-lg font-bold text-ink-900 mb-4">{{ editingDeptId ? 'Edit Department' : 'Add Department' }}</h4>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-semibold text-ink-500 mb-1.5">Name</label>
            <input v-model="deptForm.name" type="text" placeholder="e.g. Nursing" class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-ink-500 mb-1.5">Slug</label>
            <input v-model="deptForm.slug" type="text" placeholder="e.g. nursing" class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 text-sm font-mono text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-ink-500 mb-1.5">Description</label>
            <textarea v-model="deptForm.description" rows="2" class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 resize-none"></textarea>
          </div>
          <p v-if="deptFormError" class="text-sm text-coral-dim bg-coral-soft border border-coral/30 rounded-xl px-3.5 py-2.5">{{ deptFormError }}</p>
        </div>
        <div class="flex gap-2.5 mt-5">
          <button type="button" class="flex-1 rounded-xl border border-ink-200 text-ink-600 text-sm font-medium py-2.5" @click="deptModalOpen = false">Cancel</button>
          <button type="button" class="flex-1 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold py-2.5 disabled:opacity-50 transition-colors" :disabled="deptSaving" @click="saveDept">
            {{ deptSaving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Course modal -->
    <div v-if="courseModalOpen" class="fixed inset-0 z-30 bg-ink-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl shadow-panel max-w-sm w-full p-6 animate-popIn">
        <h4 class="font-display text-lg font-bold text-ink-900 mb-4">{{ editingCourseId ? 'Edit Course' : 'Add Course' }}</h4>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-semibold text-ink-500 mb-1.5">Department</label>
            <select v-model="courseForm.departmentId" class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200">
              <option v-for="d in departments" :key="d.id" :value="d.id">{{ d.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-ink-500 mb-1.5">Name</label>
            <input v-model="courseForm.name" type="text" placeholder="e.g. RN Programme" class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-ink-500 mb-1.5">Slug</label>
            <input v-model="courseForm.slug" type="text" placeholder="e.g. rn-programme" class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 text-sm font-mono text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-ink-500 mb-1.5">Description</label>
            <textarea v-model="courseForm.description" rows="2" class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 resize-none"></textarea>
          </div>
          <p v-if="courseFormError" class="text-sm text-coral-dim bg-coral-soft border border-coral/30 rounded-xl px-3.5 py-2.5">{{ courseFormError }}</p>
        </div>
        <div class="flex gap-2.5 mt-5">
          <button type="button" class="flex-1 rounded-xl border border-ink-200 text-ink-600 text-sm font-medium py-2.5" @click="courseModalOpen = false">Cancel</button>
          <button type="button" class="flex-1 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold py-2.5 disabled:opacity-50 transition-colors" :disabled="courseSaving" @click="saveCourse">
            {{ courseSaving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Subject modal -->
    <div v-if="subjectModalOpen" class="fixed inset-0 z-30 bg-ink-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl shadow-panel max-w-sm w-full p-6 animate-popIn">
        <h4 class="font-display text-lg font-bold text-ink-900 mb-4">{{ editingSubjectId ? 'Edit Subject' : 'Add Subject' }}</h4>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-semibold text-ink-500 mb-1.5">Course</label>
            <select v-model="subjectForm.courseId" class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200">
              <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.name }} ({{ departmentName(c.departmentId) }})</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-ink-500 mb-1.5">Name</label>
            <input v-model="subjectForm.name" type="text" placeholder="e.g. Pharmacology" class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-ink-500 mb-1.5">Slug</label>
            <input v-model="subjectForm.slug" type="text" placeholder="e.g. pharmacology" class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 text-sm font-mono text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-ink-500 mb-1.5">Credits to unlock mock exam</label>
            <input v-model.number="subjectForm.creditsToUnlockMock" type="number" min="0" class="w-full rounded-xl border border-ink-200 bg-canvas px-3.5 py-2.5 text-sm font-mono text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200" />
          </div>
          <p v-if="subjectFormError" class="text-sm text-coral-dim bg-coral-soft border border-coral/30 rounded-xl px-3.5 py-2.5">{{ subjectFormError }}</p>
        </div>
        <div class="flex gap-2.5 mt-5">
          <button type="button" class="flex-1 rounded-xl border border-ink-200 text-ink-600 text-sm font-medium py-2.5" @click="subjectModalOpen = false">Cancel</button>
          <button type="button" class="flex-1 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold py-2.5 disabled:opacity-50 transition-colors" :disabled="subjectSaving" @click="saveSubject">
            {{ subjectSaving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete confirmations -->
    <div v-if="confirmDeleteDeptId || confirmDeleteCourseId || confirmDeleteSubjectId" class="fixed inset-0 z-30 bg-ink-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl shadow-panel max-w-xs w-full p-6 animate-popIn">
        <h4 class="font-display text-lg font-bold text-ink-900 mb-1.5">Delete this record?</h4>
        <p class="text-sm text-ink-500 mb-5">Records with children (courses/subjects/questions) can't be deleted until those are removed first.</p>
        <div class="flex gap-2.5">
          <button type="button" class="flex-1 rounded-xl border border-ink-200 text-ink-600 text-sm font-medium py-2.5" @click="cancelDeleteConfirmations">
            Cancel
          </button>
          <button type="button" class="flex-1 rounded-xl bg-coral text-white text-sm font-semibold py-2.5" @click="runPendingDelete">
            Delete
          </button>
        </div>
      </div>
    </div>
  </AdminShell>
</template>
