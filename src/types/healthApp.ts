// src/types/healthApp.ts
// Core domain models for the Health Sciences CBT / Test-Prep PWA

/* -------------------------------------------------------------------------- */
/*  Enums / Literal Unions                                                    */
/* -------------------------------------------------------------------------- */

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export type ExamMode = 'mock' | 'practice' | 'timed-drill' | 'weak-area-drill';

export type ExamStatus = 'in-progress' | 'submitted' | 'auto-submitted' | 'abandoned';

export type ResponseFlag = 'answered' | 'flagged' | 'unvisited' | 'flagged-answered';

export type CreditTransactionType =
  | 'earned-streak'
  | 'earned-quiz'
  | 'earned-referral-bonus'
  | 'earned-referee-bonus'
  | 'purchased-credit'
  | 'spent-mock-unlock'
  | 'spent-video-unlock'
  | 'spent-revision-module';

export type NetworkStatus = 'online' | 'offline';

/* -------------------------------------------------------------------------- */
/*  User & Auth                                                               */
/* -------------------------------------------------------------------------- */

export type UserRole = 'student' | 'admin';

export interface User {
  id: string; // uuid
  fullName: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  avatarUrl?: string;
  role: UserRole;
  departmentId: string; // FK -> Department.id
  createdAt: string; // ISO date
  referralCode: string; // e.g. REF-8K3P9Q
  referredByCode?: string | null;
  currentStreak: number;
  longestStreak: number;
  lastLoginDate: string | null; // ISO date, used for streak calc
}

/* -------------------------------------------------------------------------- */
/*  Departments / Subjects / Topics                                          */
/* -------------------------------------------------------------------------- */

export interface Department {
  id: string;
  slug: string;
  name: string; // "Nursing", "Community Health (CHEW/JCHEW)", "Pharmacy Technician"
  description: string;
  iconName: string; // lucide-vue-next icon name
  subjectIds: string[];
  isActive: boolean;
  createdAt: string;
}

export interface Course {
  id: string;
  departmentId: string; // FK -> Department.id
  name: string; // e.g. "Registered Nursing Programme"
  slug: string;
  description: string;
  isActive: boolean;
  subjectIds: string[];
  createdAt: string;
}

export interface Subject {
  id: string;
  departmentId: string;
  courseId: string; // FK -> Course.id
  name: string; // "Pharmacology", "Primary Health Care"
  slug: string;
  topicIds: string[];
  totalQuestionCount: number;
  isDownloaded: boolean; // whether question bank is cached in IndexedDB
  isActive: boolean;
  creditsToUnlockMock: number;
}

export interface Topic {
  id: string;
  subjectId: string;
  name: string; // "Antibiotics", "Cardiovascular System"
  parentTopicPath: string; // "Pharmacology -> Antibiotics"
}

/* -------------------------------------------------------------------------- */
/*  Questions & Responses                                                    */
/* -------------------------------------------------------------------------- */

export interface QuestionOption {
  key: 'A' | 'B' | 'C' | 'D' | 'E';
  text: string;
}

export interface Question {
  id: string;
  subjectId: string;
  topicId: string;
  departmentId: string;
  stem: string; // question text
  options: QuestionOption[];
  correctOptionKey: QuestionOption['key'];
  explanation: string;
  difficulty: QuestionDifficulty;
  tags: string[];
  imageUrl?: string;
  createdAt: string;
}

export interface UserResponse {
  id: string; // uuid, local-first record
  userId: string;
  examSessionId: string;
  questionId: string;
  topicId: string;
  subjectId: string;
  selectedOptionKey: QuestionOption['key'] | null;
  isCorrect: boolean | null; // null until graded
  flag: ResponseFlag;
  timeSpentSeconds: number;
  answeredAt: string | null; // ISO date, null if unvisited
  syncedToServer: boolean; // for future backend sync
}

/* -------------------------------------------------------------------------- */
/*  Exam Sessions                                                             */
/* -------------------------------------------------------------------------- */

export interface ExamSession {
  id: string;
  userId: string;
  subjectId: string;
  departmentId: string;
  mode: ExamMode;
  totalQuestions: number;
  durationSeconds: number;
  remainingSeconds: number;
  status: ExamStatus;
  startedAt: string;
  submittedAt: string | null;
  scorePercent: number | null;
  correctCount: number | null;
  wrongCount: number | null;
  unansweredCount: number | null;
  questionOrder: string[]; // ordered Question ids for this session
}

/* -------------------------------------------------------------------------- */
/*  Wallet / Credits / Referrals                                             */
/* -------------------------------------------------------------------------- */

export interface WalletTransaction {
  id: string;
  userId: string;
  type: CreditTransactionType;
  amount: number; // positive = earned, negative = spent
  balanceAfter: number;
  description: string;
  createdAt: string;
}

export interface Wallet {
  userId: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
  updatedAt: string;
}

export interface Referral {
  id: string;
  referrerUserId: string;
  refereeUserId: string;
  refereeEmail: string;
  referrerBonusCredits: number;
  refereeBonusCredits: number;
  status: 'pending' | 'completed';
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*  Analytics / Weak Areas                                                   */
/* -------------------------------------------------------------------------- */

export interface TopicMastery {
  topicId: string;
  topicPath: string; // "Pharmacology -> Antibiotics"
  subjectId: string;
  totalAttempts: number;
  correctAttempts: number;
  accuracyPercent: number;
  lastAttemptedAt: string | null;
  masteryLevel: 'weak' | 'developing' | 'strong';
}

export interface WeakAreaRecommendation {
  topic: TopicMastery;
  recommendedQuestionIds: string[];
  recommendedVideoIds: string[];
  reason: string; // human-readable explanation for the suggestion
}

export interface PerformanceSummary {
  examSessionId: string;
  subjectName: string;
  scorePercent: number;
  correctCount: number;
  totalQuestions: number;
  timeTakenSeconds: number;
  accuracyBadge: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  weakTopics: TopicMastery[];
  strongTopics: TopicMastery[];
}

/* -------------------------------------------------------------------------- */
/*  Video Revision Hub                                                       */
/* -------------------------------------------------------------------------- */

export interface Video {
  id: string;
  subjectId: string;
  topicId: string;
  title: string;
  durationSeconds: number;
  thumbnailUrl: string;
  videoUrl: string;
  creditsToUnlock: number;
  hasQuickQuiz: boolean;
  quickQuizQuestionIds: string[];
}

export interface VideoBookmark {
  id: string;
  userId: string;
  videoId: string;
  timestampSeconds: number; // where the user left off
  playbackSpeed: number; // 0.5, 1, 1.25, 1.5, 2
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*  App / UI State                                                           */
/* -------------------------------------------------------------------------- */

export interface AppNetworkState {
  status: NetworkStatus;
  lastCheckedAt: string;
}

export interface TimerWorkerMessage {
  type: 'START' | 'PAUSE' | 'RESUME' | 'TICK' | 'WARNING' | 'EXPIRED' | 'STOP';
  remainingSeconds?: number;
  durationSeconds?: number;
}

/* -------------------------------------------------------------------------- */
/*  Leaderboard                                                               */
/* -------------------------------------------------------------------------- */

export interface LeaderboardEntry {
  id: string; // userId for real users, mock entry id for seeded competitors
  displayName: string;
  points: number;
  rank: number;
  isCurrentUser: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Wallet — Buy Credit (mock payment)                                       */
/* -------------------------------------------------------------------------- */

export type PaymentGateway = 'paystack-titan-trust' | 'flutterwave';

export interface CreditPackage {
  id: string;
  credits: number;
  amountNaira: number;
  isPopular?: boolean;
}

export interface MockVirtualAccount {
  gateway: PaymentGateway;
  bankName: string;
  accountNumber: string;
  accountName: string;
  amountNaira: number;
  credits: number;
  reference: string;
  expiresAt: string; // ISO date
}

/* -------------------------------------------------------------------------- */
/*  Payment records (backs the Payment Dashboard / Records page)             */
/* -------------------------------------------------------------------------- */

export type PaymentStatus = 'pending' | 'successful' | 'failed' | 'refunded';
export type PaymentType = 'credit-purchase';

export interface Payment {
  id: string;
  userId: string;
  reference: string;
  paymentType: PaymentType;
  gateway: PaymentGateway;
  amountNaira: number;
  credits: number;
  status: PaymentStatus;
  virtualAccountNumber: string;
  virtualBankName: string;
  walletTransactionId: string | null; // links to the credit-ledger entry once successful
  createdAt: string;
  completedAt: string | null;
}

export interface PaymentStatsBucket {
  label: string; // e.g. "2026-08-25", "Week 34", "Aug 2026"
  count: number;
  revenueNaira: number;
}

export interface PaymentStats {
  totalPayments: number;
  totalRevenueNaira: number;
  successfulCount: number;
  pendingCount: number;
  failedCount: number;
  refundedCount: number;
  daily: PaymentStatsBucket[];
  weekly: PaymentStatsBucket[];
  monthly: PaymentStatsBucket[];
  yearly: PaymentStatsBucket[];
}

/* -------------------------------------------------------------------------- */
/*  Admin portal                                                             */
/* -------------------------------------------------------------------------- */

export interface AdminStats {
  totalUsers: number;
  totalStudents: number;
  totalAdmins: number;
  totalExamSessions: number;
  completedExamSessions: number;
  averageScorePercent: number;
  totalCreditsInCirculation: number;
  totalDepartments: number;
  totalCourses: number;
  totalSubjects: number;
  totalQuestions: number;
  totalPayments: number;
  totalRevenueNaira: number;
}

export type RecentActivityType = 'user-registered' | 'exam-completed' | 'payment-successful';

export interface RecentActivityItem {
  id: string;
  type: RecentActivityType;
  title: string;
  subtitle: string;
  timestamp: string;
}

export interface PasswordResetToken {
  id: string;
  userId: string;
  email: string;
  token: string;
  expiresAt: string;   // ISO timestamp
  used: boolean;
  createdAt: string;
}