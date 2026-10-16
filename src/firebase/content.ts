// src/firebase/content.ts
// Firestore CRUD helpers — one `put` / `delete` per collection.

import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { firestore } from './index';

/* ── Generic real-time watch ───────────────────────────────────────────── */

export function watchCollection(
  colName: string,
  callback: (rows: Record<string, unknown>[]) => void,
): Unsubscribe {
  return onSnapshot(collection(firestore, colName), (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(rows);
  });
}

/* ── Departments ───────────────────────────────────────────────────────── */

export async function putDepartmentFs(data: any): Promise<void> {
  await setDoc(doc(firestore, 'departments', data.id), data);
}

export async function deleteDepartmentFs(id: string): Promise<void> {
  await deleteDoc(doc(firestore, 'departments', id));
}

/* ── Courses ───────────────────────────────────────────────────────────── */

export async function putCourseFs(data: any): Promise<void> {
  await setDoc(doc(firestore, 'courses', data.id), data);
}

export async function deleteCourseFs(id: string): Promise<void> {
  await deleteDoc(doc(firestore, 'courses', id));
}

/* ── Subjects ──────────────────────────────────────────────────────────── */

export async function putSubjectFs(data: any): Promise<void> {
  await setDoc(doc(firestore, 'subjects', data.id), data);
}

export async function deleteSubjectFs(id: string): Promise<void> {
  await deleteDoc(doc(firestore, 'subjects', id));
}

/* ── Topics ────────────────────────────────────────────────────────────── */

export async function putTopicFs(data: any): Promise<void> {
  await setDoc(doc(firestore, 'topics', data.id), data);
}

/* ── Questions ─────────────────────────────────────────────────────────── */

export async function putQuestionFs(data: any): Promise<void> {
  await setDoc(doc(firestore, 'questions', data.id), data);
}

export async function deleteQuestionFs(id: string): Promise<void> {
  await deleteDoc(doc(firestore, 'questions', id));
}

/* ── Leaderboard mock ──────────────────────────────────────────────────── */

export async function putLeaderboardMockFs(data: any): Promise<void> {
  await setDoc(doc(firestore, 'leaderboard_mock', data.id), data);
}

export async function deleteLeaderboardMockFs(id: string): Promise<void> {
  await deleteDoc(doc(firestore, 'leaderboard_mock', id));
}