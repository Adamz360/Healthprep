// src/db/index.ts
// Barrel re-exports — every existing `import { ... } from '../db'` keeps
// working. Internals now use Firestore (cloud-first) with Dexie as
// offline exam cache only.

// Schema (minimal Dexie for exam offline cache)
export { CbtDatabase, db, uid } from './schema';
export type { LeaderboardMockRecord } from './schema';

// Academic CRUD (Firestore)
export {
  createDepartment,
  updateDepartment,
  deleteDepartment,
  createCourse,
  updateCourse,
  deleteCourse,
  createSubject,
  updateSubject,
  deleteSubject,
  ensureSubjectDownloaded,
} from '../services/academic';

// Content CRUD (Firestore)
export {
  resolveOrCreateTopic,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  createMockLeaderboardEntry,
  updateMockLeaderboardEntry,
  deleteMockLeaderboardEntry,
} from '../services/content';

// Exam (Firestore + offline cache)
export {
  startExamSession,
  submitAnswer,
  submitExamSession,
  syncPendingResponses,
  getExamResults,
} from '../services/exam';

// Wallet / Payments / Admin Stats (Firestore)
export {
  ensureWalletExists,
  createPendingPayment,
  markPaymentSuccessful,
  markPaymentFailed,
  refundPayment,
  generatePaymentReference,
  computeAdminStats,
  computePaymentStats,
  getRecentActivity,
} from '../services/wallet';