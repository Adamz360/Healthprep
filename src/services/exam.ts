// src/services/exam.ts
// Exam sessions — Firestore primary, Dexie cache for offline exam mode.
// Scoring: correctCount / totalQuestions (NOT just answered questions).

import {
  doc, setDoc, updateDoc, getDoc,
  getDocs, collection, query, where,
} from 'firebase/firestore';
import { firestore } from '../firebase';
import { db, uid } from '../db/schema';
import type { ExamSession, UserResponse, Question } from '../types/healthApp';

/* ── Start exam (caches questions for offline) ──────────────────────────── */

export async function startExamSession(
  userId: string,
  subjectId: string,
  questionCount: number,
): Promise<{ session: ExamSession; questions: Question[] }> {
  // 1. Get questions — try Firestore first, fall back to local cache
  let questions: Question[] = [];
  try {
    const snap = await getDocs(
      query(collection(firestore, 'questions'), where('subjectId', '==', subjectId)),
    );
    questions = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Question);
  } catch {
    // Offline — use cached questions
    questions = await db.questions.where('subjectId').equals(subjectId).toArray() as Question[];
    if (questions.length === 0) {
      throw new Error('No cached questions for this subject. Connect to internet first.');
    }
  }

  // Shuffle and pick
  const shuffled = [...questions].sort(() => Math.random() - 0.5).slice(0, questionCount);

  // 2. Create session
  const session = {
    id: uid('exam'),
    userId,
    subjectId,
    questionOrder: shuffled.map((q) => q.id),
    status: 'in-progress',
    startedAt: new Date().toISOString(),
    totalQuestions: shuffled.length,
    scorePercent: null,
    correctCount: null,
    wrongCount: null,
    unansweredCount: null,
    submittedAt: null,
  } as unknown as ExamSession;

  // 3. Save to Firestore (primary) and Dexie (offline cache)
  try {
    await setDoc(doc(firestore, 'exam_sessions', session.id), session);
  } catch {
    // Offline — Firestore write deferred
  }
  await db.exam_sessions.put(session as any);

  // Cache the questions used in this exam (for offline continuation + grading)
  await db.questions.bulkPut(shuffled);

  return { session, questions: shuffled };
}

/* ── Submit answer (during exam — may be offline) ──────────────────────── */

export async function submitAnswer(response: UserResponse): Promise<void> {
  // Always save to local cache first (exam must work offline)
  await db.user_responses.put(response);

  // Try to sync to Firestore
  try {
    await setDoc(doc(firestore, 'user_responses', response.id), response);
  } catch {
    // Offline — will sync later via syncPendingResponses()
  }
}

/* ── Submit exam — GRADES HERE ──────────────────────────────────────────── */

export async function submitExamSession(sessionId: string): Promise<ExamSession> {
  // Load session from local cache (always available during exam)
  let session = await db.exam_sessions.get(sessionId) as (ExamSession & { questionOrder?: string[] }) | undefined;
  if (!session) {
    // Fallback to Firestore
    const snap = await getDoc(doc(firestore, 'exam_sessions', sessionId));
    if (!snap.exists()) throw new Error('Exam session not found.');
    session = { id: snap.id, ...snap.data() } as ExamSession & { questionOrder?: string[] };
  }

  const totalQuestions = session.totalQuestions;
  const questionOrder = session.questionOrder ?? [];

  // ── Load ALL responses for this session ──
  const responses = await db.user_responses
    .where('examSessionId')
    .equals(sessionId)
    .toArray() as UserResponse[];

  // ── Build question lookup (for grading) ──
  // Local cache first
  const questionsMap = new Map<string, Question>();
  try {
    const localQuestions = await db.questions.toArray() as Question[];
    for (const q of localQuestions) {
      questionsMap.set(q.id, q);
    }
  } catch { /* empty cache */ }

  // Fetch any missing questions from Firestore
  for (const qid of questionOrder) {
    if (!questionsMap.has(qid)) {
      try {
        const snap = await getDoc(doc(firestore, 'questions', qid));
        if (snap.exists()) {
          questionsMap.set(qid, { id: snap.id, ...snap.data() } as Question);
        }
      } catch { /* offline */ }
    }
  }

  // ── GRADE each response ──
  let correctCount = 0;
  let wrongCount = 0;
  const gradedResponses: UserResponse[] = [];

  for (const response of responses) {
    const question = questionsMap.get(response.questionId);
    if (!question) continue;

    // ★ THE FIX: compare selected answer with correct answer
    const isCorrect = response.selectedOptionKey === question.correctOptionKey;

    const graded = {
      ...response,
      isCorrect,
      correctOptionKey: question.correctOptionKey,
    } as unknown as UserResponse;

    if (isCorrect) correctCount++;
    else wrongCount++;

    gradedResponses.push(graded);
  }

  // ── ★ THE FIX: Score = correct / TOTAL questions (not just answered) ──
  const unansweredCount = Math.max(0, totalQuestions - gradedResponses.length);
  const scorePercent = totalQuestions > 0
    ? Math.round((correctCount / totalQuestions) * 100)
    : 0;

  console.log(
    `[Exam] Graded: ${correctCount} correct / ${wrongCount} wrong / ` +
    `${unansweredCount} unanswered / ${totalQuestions} total = ${scorePercent}%`
  );

  // ── Build updated session ──
  const updated = {
    ...session,
    status: 'submitted',
    submittedAt: new Date().toISOString(),
    correctCount,
    wrongCount,
    unansweredCount,
    scorePercent,
  } as unknown as ExamSession;

  // ── Save graded session locally first ──
  await db.exam_sessions.put(updated as any);

  // ── Save graded responses locally ──
  for (const graded of gradedResponses) {
    await db.user_responses.put(graded);
  }

  // ── Sync to Firestore ──
  try {
    await updateDoc(doc(firestore, 'exam_sessions', sessionId), {
      status: 'submitted',
      submittedAt: updated.submittedAt,
      correctCount,
      wrongCount,
      unansweredCount,
      scorePercent,
    });

    // Sync all graded responses
    for (const graded of gradedResponses) {
      await setDoc(doc(firestore, 'user_responses', graded.id), graded);
    }

    // Sync any other pending data
    await syncPendingResponses(session.userId);
  } catch {
    // Offline — will sync when connection returns
  }

  return updated;
}

/* ── Sync pending offline data to Firestore ─────────────────────────────── */

export async function syncPendingResponses(userId: string): Promise<number> {
  if (!userId) return 0;
  let synced = 0;

  try {
    const localResponses = await db.user_responses
      .where('userId')
      .equals(userId)
      .toArray();
    for (const response of localResponses) {
      try {
        await setDoc(doc(firestore, 'user_responses', response.id), response);
        synced++;
      } catch {
        break;
      }
    }

    const localSessions = await db.exam_sessions
      .where('userId')
      .equals(userId)
      .toArray();
    for (const session of localSessions) {
      try {
        await setDoc(doc(firestore, 'exam_sessions', session.id), session);
      } catch {
        break;
      }
    }
  } catch {
    // ignore
  }

  return synced;
}

/* ── Get exam results ───────────────────────────────────────────────────── */

export async function getExamResults(sessionId: string): Promise<{
  session: ExamSession;
  responses: UserResponse[];
} | null> {
  // Try local first (faster), fall back to Firestore
  let session = await db.exam_sessions.get(sessionId) as ExamSession | undefined;

  if (!session) {
    try {
      const snap = await getDoc(doc(firestore, 'exam_sessions', sessionId));
      if (!snap.exists()) return null;
      session = { id: snap.id, ...snap.data() } as ExamSession;
      await db.exam_sessions.put(session as any);
    } catch {
      return null;
    }
  }

  let responses = await db.user_responses
    .where('examSessionId')
    .equals(sessionId)
    .toArray() as UserResponse[];

  if (responses.length === 0) {
    try {
      const respSnap = await getDocs(
        query(collection(firestore, 'user_responses'), where('examSessionId', '==', sessionId)),
      );
      responses = respSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as UserResponse);
      await db.user_responses.bulkPut(responses);
    } catch {
      // Offline with no local data
    }
  }

  return { session, responses };
}