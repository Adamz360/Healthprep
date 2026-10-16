// src/services/content.ts
// Topic / Question / Leaderboard CRUD — Firestore as primary DB.

import { doc, setDoc, deleteDoc, updateDoc, getDoc, getDocs, collection, query, where, writeBatch } from 'firebase/firestore';
import { firestore } from '../firebase';
import { uid } from '@/db/schema';
import type { Topic, Question, Subject } from '../types/healthApp';

export interface LeaderboardMockRecord {
  id: string;
  displayName: string;
  points: number;
}

/* ── Topic helper ──────────────────────────────────────────────────────── */

export async function resolveOrCreateTopic(subjectId: string, topicName: string): Promise<Topic> {
  const trimmed = topicName.trim();

  const snap = await getDocs(query(collection(firestore, 'topics'), where('subjectId', '==', subjectId)));
  const match = snap.docs
    .map((d) => d.data() as Topic)
    .find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
  if (match) return match;

  const subjSnap = await getDoc(doc(firestore, 'subjects', subjectId));
  const subject = subjSnap.exists() ? subjSnap.data() as Subject : null;

  const topic: Topic = {
    id: uid('topic'),
    subjectId,
    name: trimmed,
    parentTopicPath: `${subject?.name ?? 'Subject'} -> ${trimmed}`,
  };

  const batch = writeBatch(firestore);
  batch.set(doc(firestore, 'topics', topic.id), topic);
  batch.update(doc(firestore, 'subjects', subjectId), {
    topicIds: [...(subject?.topicIds ?? []), topic.id],
  });
  await batch.commit();

  return topic;
}

/* ── Question CRUD ─────────────────────────────────────────────────────── */

async function recalcSubjectQuestionCount(subjectId: string): Promise<void> {
  const snap = await getDocs(query(collection(firestore, 'questions'), where('subjectId', '==', subjectId)));
  await updateDoc(doc(firestore, 'subjects', subjectId), { totalQuestionCount: snap.size });
}

export async function createQuestion(input: Omit<Question, 'id' | 'createdAt'>): Promise<Question> {
  const question: Question = { ...input, id: uid('q'), createdAt: new Date().toISOString() };
  await setDoc(doc(firestore, 'questions', question.id), question);
  await recalcSubjectQuestionCount(question.subjectId);
  return question;
}

export async function updateQuestion(id: string, patch: Partial<Omit<Question, 'id'>>): Promise<void> {
  await updateDoc(doc(firestore, 'questions', id), patch);
}

export async function deleteQuestion(id: string): Promise<void> {
  const snap = await getDoc(doc(firestore, 'questions', id));
  const question = snap.exists() ? snap.data() as Question : null;

  await deleteDoc(doc(firestore, 'questions', id));
  if (question) await recalcSubjectQuestionCount(question.subjectId);
}

/* ── Leaderboard mock CRUD ─────────────────────────────────────────────── */

export async function createMockLeaderboardEntry(displayName: string, points: number): Promise<LeaderboardMockRecord> {
  const record: LeaderboardMockRecord = { id: uid('lb'), displayName, points };
  await setDoc(doc(firestore, 'leaderboard_mock', record.id), record);
  return record;
}

export async function updateMockLeaderboardEntry(id: string, patch: Partial<Omit<LeaderboardMockRecord, 'id'>>): Promise<void> {
  await updateDoc(doc(firestore, 'leaderboard_mock', id), patch);
}

export async function deleteMockLeaderboardEntry(id: string): Promise<void> {
  await deleteDoc(doc(firestore, 'leaderboard_mock', id));
}