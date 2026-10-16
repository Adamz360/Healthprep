// src/db/schema.ts
// Minimal IndexedDB — ONLY used as offline cache during CBT exam mode.
// All other data (users, wallets, payments, admin) lives in Firestore.

import Dexie, { type Table } from 'dexie';
import type { Question, ExamSession, UserResponse, Subject } from '../types/healthApp';

export interface LeaderboardMockRecord {
  id: string;
  displayName: string;
  points: number;
}

export class CbtDatabase extends Dexie {
  // Exam cache — populated when student downloads a subject for offline
  questions!: Table<Question, string>;
  exam_sessions!: Table<ExamSession, string>;
  user_responses!: Table<UserResponse, string>;
  subjects!: Table<Subject, string>;
  leaderboard_mock!: Table<LeaderboardMockRecord, string>;

  constructor() {
    super('CbtExamCache');

    this.version(1).stores({
      questions: 'id, subjectId, topicId, departmentId, difficulty',
      exam_sessions: 'id, userId, subjectId, status, startedAt',
      user_responses:
        'id, userId, examSessionId, questionId, topicId, subjectId, [userId+topicId], [examSessionId+questionId]',
      subjects: 'id, departmentId, courseId, slug',
      leaderboard_mock: 'id, points',
    });
  }
}

export const db = new CbtDatabase();

export function uid(prefix = ''): string {
  const rand = crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return prefix ? `${prefix}_${rand}` : rand;
}