// src/services/academic.ts
// Department / Course / Subject CRUD — Firestore as primary DB.

import {
  doc, setDoc, deleteDoc, updateDoc, getDoc,
  getDocs, collection, query, where, writeBatch,
} from 'firebase/firestore';
import { firestore } from '../firebase';
import { uid } from '@/db/schema';
import type { Department, Course, Subject } from '../types/healthApp';
/* ── Department CRUD ───────────────────────────────────────────────────── */

export async function createDepartment(input: {
  name: string;
  slug: string;
  description: string;
  iconName: string;
}): Promise<Department> {
  const department: Department = {
    id: uid('dept'),
    slug: input.slug as Department['slug'],
    name: input.name,
    description: input.description,
    iconName: input.iconName,
    subjectIds: [],
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(firestore, 'departments', department.id), department);
  return department;
}

export async function updateDepartment(id: string, patch: Partial<Omit<Department, 'id'>>): Promise<void> {
  await updateDoc(doc(firestore, 'departments', id), patch);
}

export async function deleteDepartment(id: string): Promise<string | null> {
  const courseSnap = await getDocs(query(collection(firestore, 'courses'), where('departmentId', '==', id)));
  if (!courseSnap.empty) {
    return `Can't delete — this department still has ${courseSnap.size} course(s). Remove or reassign them first.`;
  }
  await deleteDoc(doc(firestore, 'departments', id));
  return null;
}

/* ── Course CRUD ───────────────────────────────────────────────────────── */

export async function createCourse(input: {
  departmentId: string;
  name: string;
  slug: string;
  description: string;
}): Promise<Course> {
  const course: Course = {
    id: uid('course'),
    departmentId: input.departmentId,
    name: input.name,
    slug: input.slug,
    description: input.description,
    isActive: true,
    subjectIds: [],
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(firestore, 'courses', course.id), course);
  return course;
}

export async function updateCourse(id: string, patch: Partial<Omit<Course, 'id'>>): Promise<void> {
  await updateDoc(doc(firestore, 'courses', id), patch);
}

export async function deleteCourse(id: string): Promise<string | null> {
  const subjSnap = await getDocs(query(collection(firestore, 'subjects'), where('courseId', '==', id)));
  if (!subjSnap.empty) {
    return `Can't delete — this course still has ${subjSnap.size} subject(s). Remove or reassign them first.`;
  }
  await deleteDoc(doc(firestore, 'courses', id));
  return null;
}

/* ── Subject CRUD ──────────────────────────────────────────────────────── */

export async function createSubject(input: {
  courseId: string;
  name: string;
  slug: string;
  creditsToUnlockMock: number;
}): Promise<Subject> {
  const courseSnap = await getDoc(doc(firestore, 'courses', input.courseId));
  if (!courseSnap.exists()) throw new Error('Selected course no longer exists.');
  const course = courseSnap.data() as Course;

  const subject: Subject = {
    id: uid('subj'),
    departmentId: course.departmentId,
    courseId: input.courseId,
    name: input.name,
    slug: input.slug,
    topicIds: [],
    totalQuestionCount: 0,
    isDownloaded: false,
    isActive: true,
    creditsToUnlockMock: input.creditsToUnlockMock,
  };

  const batch = writeBatch(firestore);
  batch.set(doc(firestore, 'subjects', subject.id), subject);
  batch.update(doc(firestore, 'courses', course.id), {
    subjectIds: [...course.subjectIds, subject.id],
  });

  const deptSnap = await getDoc(doc(firestore, 'departments', course.departmentId));
  if (deptSnap.exists()) {
    const dept = deptSnap.data() as Department;
    batch.update(doc(firestore, 'departments', dept.id), {
      subjectIds: [...dept.subjectIds, subject.id],
    });
  }

  await batch.commit();
  return subject;
}

export async function updateSubject(id: string, patch: Partial<Omit<Subject, 'id'>>): Promise<void> {
  if (patch.courseId) {
    const courseSnap = await getDoc(doc(firestore, 'courses', patch.courseId));
    if (courseSnap.exists()) {
      patch = { ...patch, departmentId: (courseSnap.data() as Course).departmentId };
    }
  }
  await updateDoc(doc(firestore, 'subjects', id), patch);
}

export async function deleteSubject(id: string): Promise<string | null> {
  const qSnap = await getDocs(query(collection(firestore, 'questions'), where('subjectId', '==', id)));
  if (!qSnap.empty) {
    return `Can't delete — this subject still has ${qSnap.size} question(s). Delete them first.`;
  }

  const subjSnap = await getDoc(doc(firestore, 'subjects', id));
  const subject = subjSnap.exists() ? subjSnap.data() as Subject : null;

  const batch = writeBatch(firestore);
  batch.delete(doc(firestore, 'subjects', id));

  if (subject) {
    // Remove from course
    const courseSnap = await getDoc(doc(firestore, 'courses', subject.courseId));
    if (courseSnap.exists()) {
      const course = courseSnap.data() as Course;
      batch.update(doc(firestore, 'courses', course.id), {
        subjectIds: course.subjectIds.filter((sid) => sid !== id),
      });
    }
    // Remove from department
    const deptSnap = await getDoc(doc(firestore, 'departments', subject.departmentId));
    if (deptSnap.exists()) {
      const dept = deptSnap.data() as Department;
      batch.update(doc(firestore, 'departments', dept.id), {
        subjectIds: dept.subjectIds.filter((sid) => sid !== id),
      });
    }
  }

  await batch.commit();
  return null;
}

/* ── Download for offline exam ─────────────────────────────────────────── */

export async function ensureSubjectDownloaded(subjectId: string): Promise<Subject | undefined> {
  const { db } = await import('../db/schema');

  const subjSnap = await getDoc(doc(firestore, 'subjects', subjectId));
  if (!subjSnap.exists()) return undefined;
  const subject = subjSnap.data() as Subject;

  // Fetch all questions for this subject from Firestore
  const qSnap = await getDocs(query(collection(firestore, 'questions'), where('subjectId', '==', subjectId)));
  const questions = qSnap.docs.map((d) => d.data() as any);

  if (questions.length > 0) {
    // Cache questions to Dexie for offline exam
    await db.questions.bulkPut(questions);
    // Cache subject too
    await db.subjects.put({ ...subject, isDownloaded: true });
  }

  // Update Firestore flag
  await updateDoc(doc(firestore, 'subjects', subjectId), { isDownloaded: true });

  return { ...subject, isDownloaded: true };
}