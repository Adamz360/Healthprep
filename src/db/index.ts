// src/db/index.ts
// Local-first IndexedDB schema via Dexie.js for the Health Sciences CBT PWA

import Dexie, { type Table } from 'dexie';
import type {
  User,
  Department,
  Course,
  Subject,
  Topic,
  Question,
  UserResponse,
  ExamSession,
  Wallet,
  WalletTransaction,
  Referral,
  Video,
  VideoBookmark,
  AdminStats,
  Payment,
  PaymentGateway,
  PaymentStats,
  PaymentStatsBucket,
  RecentActivityItem,
  PasswordResetToken,
} from '../types/healthApp';
import { generateSalt, hashPassword } from '../utils/crypto';

/* -------------------------------------------------------------------------- */
/*  Leaderboard mock entry (seeded competitors, not real accounts)            */
/* -------------------------------------------------------------------------- */

export interface LeaderboardMockRecord {
  id: string;
  displayName: string;
  points: number;
}

/* -------------------------------------------------------------------------- */
/*  Database Definition                                                       */
/* -------------------------------------------------------------------------- */

export class CbtDatabase extends Dexie {
  users!: Table<User, string>;
  departments!: Table<Department, string>;
  courses!: Table<Course, string>;
  subjects!: Table<Subject, string>;
  topics!: Table<Topic, string>;
  questions!: Table<Question, string>;
  user_responses!: Table<UserResponse, string>;
  exam_sessions!: Table<ExamSession, string>;
  wallet!: Table<Wallet, string>;
  wallet_transactions!: Table<WalletTransaction, string>;
  referrals!: Table<Referral, string>;
  videos!: Table<Video, string>;
  video_bookmarks!: Table<VideoBookmark, string>;
  leaderboard_mock!: Table<LeaderboardMockRecord, string>;
  payments!: Table<Payment, string>;
  passwordResetTokens!: Table<PasswordResetToken, string>;

  constructor() {
    super('CbtDatabase');

    // v1 schema. Indexes chosen for the query patterns the app relies on:
    // - fast lookup of questions by subject (pre-loading for offline exam)
    // - fast lookup of responses by exam session (grading, resume-in-progress)
    // - fast lookup of responses by user+topic (weak area analysis)
    this.version(1).stores({
      users: 'id, email, departmentId, referralCode',
      departments: 'id, slug',
      subjects: 'id, departmentId, slug',
      topics: 'id, subjectId',
      questions: 'id, subjectId, topicId, departmentId, difficulty',
      user_responses:
        'id, userId, examSessionId, questionId, topicId, subjectId, [userId+topicId], [examSessionId+questionId]',
      exam_sessions: 'id, userId, subjectId, status, startedAt',
      wallet: 'userId',
      wallet_transactions: 'id, userId, type, createdAt',
      referrals: 'id, referrerUserId, refereeUserId, status',
      videos: 'id, subjectId, topicId',
      video_bookmarks: 'id, userId, videoId, [userId+videoId]',
      leaderboard_mock: 'id, points',
    });

    // v2 — Academic Management (Course tier between Department and Subject)
    // and the Payment records table. Only stores that are new or whose
    // index list changed need to be repeated here; Dexie carries every
    // other v1 store forward unchanged, so existing installs upgrade
    // in-place with no data loss.
    this.version(2).stores({
      courses: 'id, departmentId, slug',
      subjects: 'id, departmentId, courseId, slug',
      payments: 'id, userId, status, createdAt, reference',
    });
    
    this.version(3).stores({
      passwordResetTokens: 'id, token, email, userId, expiresAt, used',
    });
  }
}

export const db = new CbtDatabase();

/* -------------------------------------------------------------------------- */
/*  ID helper                                                                  */
/* -------------------------------------------------------------------------- */

export function uid(prefix = ''): string {
  const rand = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return prefix ? `${prefix}_${rand}` : rand;
}

/* -------------------------------------------------------------------------- */
/*  Seed Data — Departments, Subjects, Topics, Sample Questions               */
/* -------------------------------------------------------------------------- */

interface SeedTopicDef {
  name: string;
}

interface SeedSubjectDef {
  name: string;
  slug: string;
  creditsToUnlockMock: number;
  topics: SeedTopicDef[];
}

interface SeedDepartmentDef {
  slug: Department['slug'];
  name: string;
  description: string;
  iconName: string;
  subjects: SeedSubjectDef[];
}

const SEED_DEPARTMENTS: SeedDepartmentDef[] = [
  {
    slug: 'nursing',
    name: 'Nursing',
    description: 'RN / RM exam preparation covering the full nursing curriculum.',
    iconName: 'Stethoscope',
    subjects: [
      {
        name: 'Pharmacology',
        slug: 'nursing-pharmacology',
        creditsToUnlockMock: 20,
        topics: [{ name: 'Antibiotics' }, { name: 'Analgesics' }, { name: 'Cardiac Drugs' }, { name: 'Drug Calculations' }],
      },
      {
        name: 'Anatomy & Physiology',
        slug: 'nursing-anatomy-physiology',
        creditsToUnlockMock: 20,
        topics: [{ name: 'Cardiovascular System' }, { name: 'Respiratory System' }, { name: 'Nervous System' }, { name: 'Musculoskeletal System' }],
      },
      {
        name: 'Medical-Surgical Nursing',
        slug: 'nursing-med-surg',
        creditsToUnlockMock: 25,
        topics: [{ name: 'Perioperative Care' }, { name: 'Wound Management' }, { name: 'Oncology Nursing' }],
      },
      {
        name: 'Obstetrics',
        slug: 'nursing-obstetrics',
        creditsToUnlockMock: 20,
        topics: [{ name: 'Antenatal Care' }, { name: 'Labor & Delivery' }, { name: 'Postpartum Care' }],
      },
    ],
  },
  {
    slug: 'community-health',
    name: 'Community Health (CHEW / JCHEW)',
    description: 'Community Health Extension Worker board exam preparation.',
    iconName: 'HeartPulse',
    subjects: [
      {
        name: 'Primary Health Care',
        slug: 'chew-primary-health-care',
        creditsToUnlockMock: 15,
        topics: [{ name: 'PHC Principles' }, { name: 'Health Education' }, { name: 'Environmental Health' }],
      },
      {
        name: 'Reproductive Health',
        slug: 'chew-reproductive-health',
        creditsToUnlockMock: 15,
        topics: [{ name: 'Family Planning' }, { name: 'Antenatal Care' }, { name: 'STI Management' }],
      },
      {
        name: 'Child Health',
        slug: 'chew-child-health',
        creditsToUnlockMock: 15,
        topics: [{ name: 'Immunization' }, { name: 'Growth Monitoring' }, { name: 'Nutrition' }],
      },
      {
        name: 'Communicable Diseases',
        slug: 'chew-communicable-diseases',
        creditsToUnlockMock: 15,
        topics: [{ name: 'Malaria' }, { name: 'Tuberculosis' }, { name: 'HIV/AIDS' }],
      },
    ],
  },
  {
    slug: 'pharm-tech',
    name: 'Pharmacy Technician',
    description: 'Pharmacy Technician licensing exam preparation.',
    iconName: 'Pill',
    subjects: [
      {
        name: 'Pharmacology',
        slug: 'pharmtech-pharmacology',
        creditsToUnlockMock: 20,
        topics: [{ name: 'Antibiotics' }, { name: 'Drug Classification' }, { name: 'Adverse Drug Reactions' }],
      },
      {
        name: 'Pharmaceutics',
        slug: 'pharmtech-pharmaceutics',
        creditsToUnlockMock: 20,
        topics: [{ name: 'Dosage Forms' }, { name: 'Compounding' }],
      },
      {
        name: 'Clinical Pharmacy',
        slug: 'pharmtech-clinical-pharmacy',
        creditsToUnlockMock: 20,
        topics: [{ name: 'Patient Counselling' }, { name: 'Drug Interactions' }],
      },
      {
        name: 'Drug Store Management',
        slug: 'pharmtech-drug-store-mgmt',
        creditsToUnlockMock: 15,
        topics: [{ name: 'Inventory Control' }, { name: 'Regulatory Compliance' }],
      },
    ],
  },
];

/**
 * Generates a handful of placeholder sample questions per topic so the app
 * has something to render/exam against before a real content pipeline is wired up.
 */
function buildSampleQuestions(subjectId: string, departmentId: string, topic: Topic, count = 5): Question[] {
  const questions: Question[] = [];
  for (let i = 1; i <= count; i++) {
    questions.push({
      id: uid('q'),
      subjectId,
      topicId: topic.id,
      departmentId,
      stem: `[Sample] ${topic.name} — practice question #${i}. Replace with real content bank.`,
      options: [
        { key: 'A', text: 'Option A' },
        { key: 'B', text: 'Option B' },
        { key: 'C', text: 'Option C' },
        { key: 'D', text: 'Option D' },
      ],
      correctOptionKey: (['A', 'B', 'C', 'D'] as const)[i % 4],
      explanation: `Placeholder explanation for ${topic.name} question #${i}.`,
      difficulty: (['easy', 'medium', 'hard'] as const)[i % 3],
      tags: [topic.name],
      createdAt: new Date().toISOString(),
    });
  }
  return questions;
}

/**
 * Idempotently seeds the database with departments/courses/subjects/topics/
 * questions. Safe to call on every app boot — it no-ops if data already
 * exists. Each seeded department gets one default "Core Programme" course
 * as the container for its subjects, establishing the
 * Department → Course → Subject → Question chain from the very first boot.
 */
export async function seedDatabaseIfEmpty(): Promise<void> {
  const existingDeptCount = await db.departments.count();
  if (existingDeptCount > 0) return;

  await db.transaction(
    'rw',
    db.departments,
    db.courses,
    db.subjects,
    db.topics,
    db.questions,
    async () => {
      for (const deptDef of SEED_DEPARTMENTS) {
        const departmentId = uid('dept');
        const courseId = uid('course');
        const subjectIds: string[] = [];

        for (const subjectDef of deptDef.subjects) {
          const subjectId = uid('subj');
          const topicRecords: Topic[] = subjectDef.topics.map((t) => ({
            id: uid('topic'),
            subjectId,
            name: t.name,
            parentTopicPath: `${subjectDef.name} -> ${t.name}`,
          }));

          await db.topics.bulkAdd(topicRecords);

          let allQuestions: Question[] = [];
          for (const topic of topicRecords) {
            allQuestions = allQuestions.concat(buildSampleQuestions(subjectId, departmentId, topic));
          }
          await db.questions.bulkAdd(allQuestions);

          await db.subjects.add({
            id: subjectId,
            departmentId,
            courseId,
            name: subjectDef.name,
            slug: subjectDef.slug,
            topicIds: topicRecords.map((t) => t.id),
            totalQuestionCount: allQuestions.length,
            isDownloaded: false,
            isActive: true,
            creditsToUnlockMock: subjectDef.creditsToUnlockMock,
          });

          subjectIds.push(subjectId);
        }

        await db.courses.add({
          id: courseId,
          departmentId,
          name: `${deptDef.name} — Core Programme`,
          slug: `${deptDef.slug}-core`,
          description: `Default course grouping every seeded subject under ${deptDef.name}.`,
          isActive: true,
          subjectIds,
          createdAt: new Date().toISOString(),
        });

        await db.departments.add({
          id: departmentId,
          slug: deptDef.slug,
          name: deptDef.name,
          description: deptDef.description,
          iconName: deptDef.iconName,
          subjectIds,
          isActive: true,
          createdAt: new Date().toISOString(),
        });
      }
    }
  );
}

/* -------------------------------------------------------------------------- */
/*  Migrations — backfill fields added after some installs already existed   */
/* -------------------------------------------------------------------------- */

/**
 * THE STUDENT-COUNT BUG FIX.
 *
 * `User.role` was added to the schema after this app already had real
 * accounts in some browsers' IndexedDB. Those legacy rows have `role ===
 * undefined`, so any dashboard stat computed with `u.role === 'student'`
 * silently excludes them — total users could be nonzero while "Students"
 * showed 0, even though every one of those accounts genuinely is a
 * student. This migration explicitly backfills the missing field (once,
 * idempotently) so every downstream read of `user.role` — not just the
 * dashboard — is correct. `computeAdminStats` below is also hardened to
 * treat "student" as "anyone who isn't an admin" rather than an exact
 * string match, so it stays correct even if a future field gets added the
 * same way.
 */
export async function ensureUserRoleBackfill(): Promise<void> {
  const allUsers = await db.users.toArray();
  const needsBackfill = allUsers.filter((u) => u.role !== 'admin' && u.role !== 'student');
  if (needsBackfill.length === 0) return;

  await db.transaction('rw', db.users, async () => {
    for (const user of needsBackfill) {
      const role = user.email.toLowerCase() === ADMIN_EMAIL ? 'admin' : 'student';
      await db.users.update(user.id, { role });
    }
  });
}

/**
 * Backfills `isActive` on legacy departments/subjects, and creates a
 * default "Core Programme" course for any department whose subjects
 * predate the Course tier — keeping the Department → Course → Subject
 * chain intact for data seeded before Academic Management existed.
 */
export async function ensureAcademicBackfill(): Promise<void> {
  const departments = await db.departments.toArray();

  for (const dept of departments) {
    if (dept.isActive === undefined || dept.createdAt === undefined) {
      await db.departments.update(dept.id, {
        isActive: dept.isActive ?? true,
        createdAt: dept.createdAt ?? new Date().toISOString(),
      });
    }

    const subjectsInDept = await db.subjects.where('departmentId').equals(dept.id).toArray();
    const orphanSubjects = subjectsInDept.filter((s) => !s.courseId);

    if (orphanSubjects.length > 0) {
      const existingCourse = await db.courses.where('departmentId').equals(dept.id).first();
      const course =
        existingCourse ??
        (await (async () => {
          const newCourse: Course = {
            id: uid('course'),
            departmentId: dept.id,
            name: `${dept.name} — Core Programme`,
            slug: `${dept.slug}-core`,
            description: `Default course grouping subjects seeded before Academic Management existed.`,
            isActive: true,
            subjectIds: [],
            createdAt: new Date().toISOString(),
          };
          await db.courses.add(newCourse);
          return newCourse;
        })());

      for (const subject of orphanSubjects) {
        await db.subjects.update(subject.id, { courseId: course.id, isActive: subject.isActive ?? true });
      }

      await db.courses.update(course.id, {
        subjectIds: Array.from(new Set([...course.subjectIds, ...orphanSubjects.map((s) => s.id)])),
      });
    }

    // Subjects that already had a courseId (e.g. fresh installs) may still
    // predate `isActive`.
    const stillMissingActive = subjectsInDept.filter((s) => s.courseId && s.isActive === undefined);
    for (const subject of stillMissingActive) {
      await db.subjects.update(subject.id, { isActive: true });
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Pre-loading helper — download a subject's question bank for offline use   */
/* -------------------------------------------------------------------------- */

/**
 * Confirms the full question bank for a subject is present locally and marks
 * it as downloaded. In a networked build this is where you'd fetch remote
 * questions and bulkPut them; here the seed data already lives in IndexedDB,
 * so this mainly flips the `isDownloaded` flag used by the UI to show
 * "Ready for offline exam" state.
 */
export async function ensureSubjectDownloaded(subjectId: string): Promise<Subject | undefined> {
  const subject = await db.subjects.get(subjectId);
  if (!subject) return undefined;

  const questionCount = await db.questions.where('subjectId').equals(subjectId).count();
  if (questionCount > 0 && !subject.isDownloaded) {
    await db.subjects.update(subjectId, { isDownloaded: true });
  }
  return db.subjects.get(subjectId);
}

/* -------------------------------------------------------------------------- */
/*  Wallet bootstrap                                                          */
/* -------------------------------------------------------------------------- */

export async function ensureWalletExists(userId: string, startingBalance = 50): Promise<Wallet> {
  const existing = await db.wallet.get(userId);
  if (existing) return existing;

  const wallet: Wallet = {
    userId,
    balance: startingBalance,
    totalEarned: startingBalance,
    totalSpent: 0,
    updatedAt: new Date().toISOString(),
  };
  await db.wallet.put(wallet);
  return wallet;
}

/* -------------------------------------------------------------------------- */
/*  Leaderboard mock seed                                                    */
/* -------------------------------------------------------------------------- */

const MOCK_LEADERBOARD_NAMES = [
  'Amaka Obi',
  'Chinedu Eze',
  'Fatima Bello',
  'Ibrahim Suleiman',
  'Ngozi Adeyemi',
  'Tunde Bakare',
  'Blessing Okoro',
  'Yusuf Aliyu',
  'Chiamaka Nwosu',
  'Emeka Onyekwere',
  'Zainab Mohammed',
  'Grace Effiong',
];

/**
 * Idempotently seeds a set of fictional competitor entries so the
 * leaderboard has something to rank against on a fresh install. Real
 * registered users on this device are merged in live by useLeaderboard —
 * these rows never represent actual accounts.
 */
export async function ensureLeaderboardSeed(): Promise<void> {
  const existingCount = await db.leaderboard_mock.count();
  if (existingCount > 0) return;

  const records: LeaderboardMockRecord[] = MOCK_LEADERBOARD_NAMES.map((name) => ({
    id: uid('lb'),
    displayName: name,
    points: 200 + Math.floor(Math.random() * 900),
  }));

  await db.leaderboard_mock.bulkAdd(records);
}

/* -------------------------------------------------------------------------- */
/*  Demo / test account                                                       */
/* -------------------------------------------------------------------------- */

const DEMO_EMAIL = 'user@example.com';
const DEMO_PASSWORD = 'password123';

function generateReferralCodeLocal(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `REF-${code}`;
}

/**
 * Idempotently creates a hardcoded demo account (see the login screen note)
 * so anyone picking up this build can sign in immediately without going
 * through registration. Pre-enrolled in Nursing and given a starting credit
 * boost so the dashboard, wallet, and exam flows all have something to show.
 * Safe to call on every boot — no-ops once the account exists.
 */
export async function ensureDemoUserSeeded(): Promise<void> {
  const existing = await db.users.where('email').equals(DEMO_EMAIL).first();
  if (existing) return;

  const nursingDept = await db.departments.where('slug').equals('nursing').first();

  const salt = generateSalt();
  const passwordHash = await hashPassword(DEMO_PASSWORD, salt);

  let referralCode = generateReferralCodeLocal();
  while (await db.users.where('referralCode').equals(referralCode).first()) {
    referralCode = generateReferralCodeLocal();
  }

  const demoUser: User = {
    id: uid('user'),
    fullName: 'Demo Candidate',
    email: DEMO_EMAIL,
    passwordHash,
    passwordSalt: salt,
    role: 'student',
    departmentId: nursingDept?.id ?? '',
    createdAt: new Date().toISOString(),
    referralCode,
    referredByCode: null,
    currentStreak: 3,
    longestStreak: 5,
    lastLoginDate: null,
  };

  await db.users.add(demoUser);
  await ensureWalletExists(demoUser.id, 150);
}

/* -------------------------------------------------------------------------- */
/*  Admin account                                                            */
/* -------------------------------------------------------------------------- */

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin12345';

/**
 * Idempotently creates a hardcoded admin account so the admin portal is
 * reachable immediately without a separate promotion flow. Admins have no
 * department/exam context of their own — they manage content, users, and
 * platform data instead.
 */
export async function ensureAdminUserSeeded(): Promise<void> {
  const existing = await db.users.where('email').equals(ADMIN_EMAIL).first();
  if (existing) return;

  const salt = generateSalt();
  const passwordHash = await hashPassword(ADMIN_PASSWORD, salt);

  let referralCode = generateReferralCodeLocal();
  while (await db.users.where('referralCode').equals(referralCode).first()) {
    referralCode = generateReferralCodeLocal();
  }

  const adminUser: User = {
    id: uid('user'),
    fullName: 'Platform Admin',
    email: ADMIN_EMAIL,
    passwordHash,
    passwordSalt: salt,
    role: 'admin',
    departmentId: '',
    createdAt: new Date().toISOString(),
    referralCode,
    referredByCode: null,
    currentStreak: 0,
    longestStreak: 0,
    lastLoginDate: null,
  };

  await db.users.add(adminUser);
}

/* -------------------------------------------------------------------------- */
/*  Admin academic management — Department / Course / Subject CRUD          */
/* -------------------------------------------------------------------------- */

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
  await db.departments.add(department);
  return department;
}

export async function updateDepartment(id: string, patch: Partial<Omit<Department, 'id'>>): Promise<void> {
  await db.departments.update(id, patch);
}

/** Returns an error message if the department can't be deleted (has courses), else deletes it. */
export async function deleteDepartment(id: string): Promise<string | null> {
  const courseCount = await db.courses.where('departmentId').equals(id).count();
  if (courseCount > 0) {
    return `Can't delete — this department still has ${courseCount} course(s). Remove or reassign them first.`;
  }
  await db.departments.delete(id);
  return null;
}

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
  await db.courses.add(course);
  return course;
}

export async function updateCourse(id: string, patch: Partial<Omit<Course, 'id'>>): Promise<void> {
  await db.courses.update(id, patch);
}

/** Returns an error message if the course can't be deleted (has subjects), else deletes it. */
export async function deleteCourse(id: string): Promise<string | null> {
  const subjectCount = await db.subjects.where('courseId').equals(id).count();
  if (subjectCount > 0) {
    return `Can't delete — this course still has ${subjectCount} subject(s). Remove or reassign them first.`;
  }
  await db.courses.delete(id);
  return null;
}

export async function createSubject(input: {
  courseId: string;
  name: string;
  slug: string;
  creditsToUnlockMock: number;
}): Promise<Subject> {
  const course = await db.courses.get(input.courseId);
  if (!course) throw new Error('Selected course no longer exists.');

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
  await db.subjects.add(subject);

  await db.courses.update(course.id, { subjectIds: [...course.subjectIds, subject.id] });
  const dept = await db.departments.get(course.departmentId);
  if (dept) await db.departments.update(dept.id, { subjectIds: [...dept.subjectIds, subject.id] });

  return subject;
}

export async function updateSubject(id: string, patch: Partial<Omit<Subject, 'id'>>): Promise<void> {
  // Reassigning to a different course means re-deriving departmentId too,
  // so the (kept, for backward compatibility) departmentId FK never drifts
  // out of sync with the course it actually belongs to.
  if (patch.courseId) {
    const newCourse = await db.courses.get(patch.courseId);
    if (newCourse) patch = { ...patch, departmentId: newCourse.departmentId };
  }
  await db.subjects.update(id, patch);
}

/** Returns an error message if the subject can't be deleted (has questions), else deletes it. */
export async function deleteSubject(id: string): Promise<string | null> {
  const questionCount = await db.questions.where('subjectId').equals(id).count();
  if (questionCount > 0) {
    return `Can't delete — this subject still has ${questionCount} question(s). Delete them first.`;
  }
  const subject = await db.subjects.get(id);
  await db.subjects.delete(id);
  if (subject) {
    const course = await db.courses.get(subject.courseId);
    if (course) await db.courses.update(course.id, { subjectIds: course.subjectIds.filter((sId) => sId !== id) });
    const dept = await db.departments.get(subject.departmentId);
    if (dept) await db.departments.update(dept.id, { subjectIds: dept.subjectIds.filter((sId) => sId !== id) });
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Admin content management — question CRUD                                 */
/* -------------------------------------------------------------------------- */

/**
 * Finds a topic by name (case-insensitive) within a subject, or creates one.
 * Used by both the manual "Add Question" form's topic list and the CSV bulk
 * importer, so importing questions for a brand-new topic name doesn't
 * require the admin to pre-create it by hand first.
 */
export async function resolveOrCreateTopic(subjectId: string, topicName: string): Promise<Topic> {
  const trimmedName = topicName.trim();
  const existingTopics = await db.topics.where('subjectId').equals(subjectId).toArray();
  const match = existingTopics.find((t) => t.name.toLowerCase() === trimmedName.toLowerCase());
  if (match) return match;

  const subject = await db.subjects.get(subjectId);
  const topic: Topic = {
    id: uid('topic'),
    subjectId,
    name: trimmedName,
    parentTopicPath: `${subject?.name ?? 'Subject'} -> ${trimmedName}`,
  };
  await db.topics.add(topic);
  await db.subjects.update(subjectId, { topicIds: [...(subject?.topicIds ?? []), topic.id] });
  return topic;
}

async function recalcSubjectQuestionCount(subjectId: string): Promise<void> {
  const count = await db.questions.where('subjectId').equals(subjectId).count();
  await db.subjects.update(subjectId, { totalQuestionCount: count });
}

export async function createQuestion(input: Omit<Question, 'id' | 'createdAt'>): Promise<Question> {
  const question: Question = { ...input, id: uid('q'), createdAt: new Date().toISOString() };
  await db.questions.add(question);
  await recalcSubjectQuestionCount(question.subjectId);
  return question;
}

export async function updateQuestion(id: string, patch: Partial<Omit<Question, 'id'>>): Promise<void> {
  await db.questions.update(id, patch);
}

export async function deleteQuestion(id: string): Promise<void> {
  const question = await db.questions.get(id);
  await db.questions.delete(id);
  if (question) await recalcSubjectQuestionCount(question.subjectId);
}

/* -------------------------------------------------------------------------- */
/*  Payments — CRUD backing the Buy Credit flow + admin Payment Records      */
/* -------------------------------------------------------------------------- */

export async function createPendingPayment(input: {
  userId: string;
  gateway: PaymentGateway;
  amountNaira: number;
  credits: number;
  virtualAccountNumber: string;
  virtualBankName: string;
  reference: string;
}): Promise<Payment> {
  const payment: Payment = {
    id: uid('pay'),
    userId: input.userId,
    reference: input.reference,
    paymentType: 'credit-purchase',
    gateway: input.gateway,
    amountNaira: input.amountNaira,
    credits: input.credits,
    status: 'pending',
    virtualAccountNumber: input.virtualAccountNumber,
    virtualBankName: input.virtualBankName,
    walletTransactionId: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  await db.payments.add(payment);
  return payment;
}

export async function markPaymentSuccessful(paymentId: string, walletTransactionId: string): Promise<void> {
  await db.payments.update(paymentId, {
    status: 'successful',
    walletTransactionId,
    completedAt: new Date().toISOString(),
  });
}

export async function markPaymentFailed(paymentId: string): Promise<void> {
  await db.payments.update(paymentId, { status: 'failed', completedAt: new Date().toISOString() });
}

/**
 * Admin-initiated refund: flips a successful payment to refunded and
 * reverses the credited amount from the user's wallet (clamped at 0 —
 * credits already spent elsewhere can't go negative, which is called out
 * in the README as a known limitation of a fully offline mock ledger).
 */
export async function refundPayment(paymentId: string): Promise<string | null> {
  const payment = await db.payments.get(paymentId);
  if (!payment) return 'Payment not found.';
  if (payment.status !== 'successful') return 'Only successful payments can be refunded.';

  const wallet = await ensureWalletExists(payment.userId);
  const newBalance = Math.max(0, wallet.balance - payment.credits);
  const actualDelta = newBalance - wallet.balance;

  await db.transaction('rw', db.wallet, db.wallet_transactions, db.payments, async () => {
    await db.wallet.update(payment.userId, {
      balance: newBalance,
      totalSpent: wallet.totalSpent + Math.abs(actualDelta),
      updatedAt: new Date().toISOString(),
    });
    await db.wallet_transactions.add({
      id: uid('tx'),
      userId: payment.userId,
      type: 'spent-mock-unlock',
      amount: actualDelta,
      balanceAfter: newBalance,
      description: `Refund for payment ${payment.reference}`,
      createdAt: new Date().toISOString(),
    });
    await db.payments.update(paymentId, { status: 'refunded', completedAt: new Date().toISOString() });
  });

  return null;
}

export function generatePaymentReference(): string {
  return `HPC-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
}

/**
 * Idempotently seeds a small history of mock payments (mixed statuses and
 * dates) attributed to the demo student account, so the Payment Dashboard
 * and Records page have real, DB-backed data to display on first boot
 * instead of an empty state. All figures shown in the UI are always
 * computed live from this table — only these initial rows are fabricated
 * sample data, the same pattern used for the seeded question bank.
 */
export async function ensurePaymentsSeed(): Promise<void> {
  const existingCount = await db.payments.count();
  if (existingCount > 0) return;

  const demoUser = await db.users.where('email').equals(DEMO_EMAIL).first();
  if (!demoUser) return;

  const gateways: PaymentGateway[] = ['paystack-titan-trust', 'flutterwave'];
  const packages = [
    { credits: 100, amountNaira: 500 },
    { credits: 250, amountNaira: 1000 },
    { credits: 600, amountNaira: 2000 },
  ];
  const statuses: Payment['status'][] = ['successful', 'successful', 'successful', 'pending', 'failed'];

  const records: Payment[] = [];
  for (let i = 0; i < 14; i++) {
    const pkg = packages[i % packages.length];
    const gateway = gateways[i % gateways.length];
    const status = statuses[i % statuses.length];
    const daysAgo = Math.floor(Math.random() * 60);
    const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

    records.push({
      id: uid('pay'),
      userId: demoUser.id,
      reference: generatePaymentReference(),
      paymentType: 'credit-purchase',
      gateway,
      amountNaira: pkg.amountNaira,
      credits: pkg.credits,
      status,
      virtualAccountNumber: String(1000000000 + Math.floor(Math.random() * 8999999999)),
      virtualBankName: gateway === 'paystack-titan-trust' ? 'Titan Trust Bank' : 'Wema Bank (Flutterwave)',
      walletTransactionId: null,
      createdAt,
      completedAt: status === 'pending' ? null : createdAt,
    });
  }

  await db.payments.bulkAdd(records);
}

/* -------------------------------------------------------------------------- */
/*  Admin content management — leaderboard mock CRUD                         */
/* -------------------------------------------------------------------------- */

export async function createMockLeaderboardEntry(displayName: string, points: number): Promise<LeaderboardMockRecord> {
  const record: LeaderboardMockRecord = { id: uid('lb'), displayName, points };
  await db.leaderboard_mock.add(record);
  return record;
}

export async function updateMockLeaderboardEntry(id: string, patch: Partial<Omit<LeaderboardMockRecord, 'id'>>): Promise<void> {
  await db.leaderboard_mock.update(id, patch);
}

export async function deleteMockLeaderboardEntry(id: string): Promise<void> {
  await db.leaderboard_mock.delete(id);
}

/* -------------------------------------------------------------------------- */
/*  Admin dashboard stats                                                    */
/* -------------------------------------------------------------------------- */

export async function computeAdminStats(): Promise<AdminStats> {
  const [users, examSessions, wallets, departmentCount, courseCount, subjectCount, questionCount, payments] = await Promise.all([
    db.users.toArray(),
    db.exam_sessions.toArray(),
    db.wallet.toArray(),
    db.departments.count(),
    db.courses.count(),
    db.subjects.count(),
    db.questions.count(),
    db.payments.toArray(),
  ]);

  const completedSessions = examSessions.filter((s) => s.status === 'submitted' || s.status === 'auto-submitted');
  const averageScorePercent =
    completedSessions.length > 0
      ? Math.round(completedSessions.reduce((sum, s) => sum + (s.scorePercent ?? 0), 0) / completedSessions.length)
      : 0;

  const successfulPayments = payments.filter((p) => p.status === 'successful');

  return {
    totalUsers: users.length,
    // THE FIX: count "students" as everyone who isn't an admin, rather than
    // an exact `role === 'student'` match. Legacy accounts created before
    // the `role` field existed (now backfilled by ensureUserRoleBackfill,
    // but this is a second line of defense) would otherwise be silently
    // excluded from this count even though ensureUserRoleBackfill should
    // have already normalized them.
    totalStudents: users.filter((u) => u.role !== 'admin').length,
    totalAdmins: users.filter((u) => u.role === 'admin').length,
    totalExamSessions: examSessions.length,
    completedExamSessions: completedSessions.length,
    averageScorePercent,
    totalCreditsInCirculation: wallets.reduce((sum, w) => sum + w.balance, 0),
    totalDepartments: departmentCount,
    totalCourses: courseCount,
    totalSubjects: subjectCount,
    totalQuestions: questionCount,
    totalPayments: payments.length,
    totalRevenueNaira: successfulPayments.reduce((sum, p) => sum + p.amountNaira, 0),
  };
}

/* -------------------------------------------------------------------------- */
/*  Admin payment stats — dashboard breakdown + daily/weekly/monthly/yearly  */
/* -------------------------------------------------------------------------- */

function isoWeekLabel(date: Date): string {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function bucketPayments(payments: Payment[], labelFor: (d: Date) => string): PaymentStatsBucket[] {
  const buckets = new Map<string, PaymentStatsBucket>();
  for (const p of payments) {
    if (p.status !== 'successful') continue;
    const label = labelFor(new Date(p.createdAt));
    const existing = buckets.get(label) ?? { label, count: 0, revenueNaira: 0 };
    existing.count += 1;
    existing.revenueNaira += p.amountNaira;
    buckets.set(label, existing);
  }
  return Array.from(buckets.values()).sort((a, b) => (a.label < b.label ? -1 : 1));
}

export async function computePaymentStats(): Promise<PaymentStats> {
  const payments = await db.payments.toArray();
  const successful = payments.filter((p) => p.status === 'successful');

  return {
    totalPayments: payments.length,
    totalRevenueNaira: successful.reduce((sum, p) => sum + p.amountNaira, 0),
    successfulCount: successful.length,
    pendingCount: payments.filter((p) => p.status === 'pending').length,
    failedCount: payments.filter((p) => p.status === 'failed').length,
    refundedCount: payments.filter((p) => p.status === 'refunded').length,
    daily: bucketPayments(payments, (d) => d.toISOString().slice(0, 10)),
    weekly: bucketPayments(payments, isoWeekLabel),
    monthly: bucketPayments(payments, (d) => d.toISOString().slice(0, 7)),
    yearly: bucketPayments(payments, (d) => String(d.getFullYear())),
  };
}

/* -------------------------------------------------------------------------- */
/*  Admin dashboard — recent activity feed                                   */
/* -------------------------------------------------------------------------- */

export async function getRecentActivity(limit = 10): Promise<RecentActivityItem[]> {
  const [users, examSessions, payments] = await Promise.all([
    db.users.toArray(),
    db.exam_sessions.toArray(),
    db.payments.toArray(),
  ]);

  const items: RecentActivityItem[] = [];

  for (const u of users) {
    items.push({
      id: `user-${u.id}`,
      type: 'user-registered',
      title: `${u.fullName} registered`,
      subtitle: u.role === 'admin' ? 'Admin account' : u.email,
      timestamp: u.createdAt,
    });
  }

  for (const s of examSessions) {
    if (!s.submittedAt) continue;
    items.push({
      id: `exam-${s.id}`,
      type: 'exam-completed',
      title: `Exam ${s.status === 'auto-submitted' ? 'auto-submitted' : 'submitted'} — ${s.scorePercent ?? 0}%`,
      subtitle: `${s.correctCount ?? 0}/${s.totalQuestions} correct`,
      timestamp: s.submittedAt,
    });
  }

  for (const p of payments) {
    if (p.status !== 'successful') continue;
    items.push({
      id: `payment-${p.id}`,
      type: 'payment-successful',
      title: `Payment received — ₦${p.amountNaira.toLocaleString()}`,
      subtitle: `${p.credits} credits · ${p.reference}`,
      timestamp: p.completedAt ?? p.createdAt,
    });
  }

  return items.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, limit);
}
