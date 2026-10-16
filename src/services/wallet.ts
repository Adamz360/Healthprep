// src/services/wallet.ts
// Wallet & Payments — Firestore only. Requires internet.

import { doc, setDoc, updateDoc, getDoc, getDocs, collection } from 'firebase/firestore';

import { firestore } from '../firebase';
import { uid } from '@/db/schema';
import type {
  Wallet, WalletTransaction, Payment,
  PaymentGateway, PaymentStats, PaymentStatsBucket,
  AdminStats, RecentActivityItem,
} from '../types/healthApp';

/* ── Wallet ───────────────────────────────────────────────────────────── */

export async function ensureWalletExists(userId: string, startingBalance = 50): Promise<Wallet> {
  const snap = await getDoc(doc(firestore, 'wallets', userId));
  if (snap.exists()) return snap.data() as Wallet;

  const wallet: Wallet = {
    userId,
    balance: startingBalance,
    totalEarned: startingBalance,
    totalSpent: 0,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(doc(firestore, 'wallets', userId), wallet);
  return wallet;
}

/* ── Payments ─────────────────────────────────────────────────────────── */

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
  await setDoc(doc(firestore, 'payments', payment.id), payment);
  return payment;
}

export async function markPaymentSuccessful(paymentId: string, walletTransactionId: string): Promise<void> {
  await updateDoc(doc(firestore, 'payments', paymentId), {
    status: 'successful',
    walletTransactionId,
    completedAt: new Date().toISOString(),
  });
}

export async function markPaymentFailed(paymentId: string): Promise<void> {
  await updateDoc(doc(firestore, 'payments', paymentId), {
    status: 'failed',
    completedAt: new Date().toISOString(),
  });
}

export async function refundPayment(paymentId: string): Promise<string | null> {
  const paySnap = await getDoc(doc(firestore, 'payments', paymentId));
  if (!paySnap.exists()) return 'Payment not found.';
  const payment = paySnap.data() as Payment;
  if (payment.status !== 'successful') return 'Only successful payments can be refunded.';

  await ensureWalletExists(payment.userId);
  const walletSnap = await getDoc(doc(firestore, 'wallets', payment.userId));
  const wallet = walletSnap.data() as Wallet;

  const newBalance = Math.max(0, wallet.balance - payment.credits);
  const actualDelta = newBalance - wallet.balance;

  await updateDoc(doc(firestore, 'wallets', payment.userId), {
    balance: newBalance,
    totalSpent: wallet.totalSpent + Math.abs(actualDelta),
    updatedAt: new Date().toISOString(),
  });

  const tx: WalletTransaction = {
    id: uid('tx'),
    userId: payment.userId,
    type: 'spent-mock-unlock',
    amount: actualDelta,
    balanceAfter: newBalance,
    description: `Refund for payment ${payment.reference}`,
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(firestore, 'wallet_transactions', tx.id), tx);

  await updateDoc(doc(firestore, 'payments', paymentId), {
    status: 'refunded',
    completedAt: new Date().toISOString(),
  });

  return null;
}

export function generatePaymentReference(): string {
  return `HPC-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
}

/* ── Admin stats (reads from Firestore) ───────────────────────────────── */

export async function computeAdminStats(): Promise<AdminStats> {
  const [usersSnap, sessionsSnap, deptsSnap, coursesSnap, subjectsSnap, questionsSnap, paymentsSnap, walletsSnap] =
    await Promise.all([
      getDocs(collection(firestore, 'users')),
      getDocs(collection(firestore, 'exam_sessions')),
      getDocs(collection(firestore, 'departments')),
      getDocs(collection(firestore, 'courses')),
      getDocs(collection(firestore, 'subjects')),
      getDocs(collection(firestore, 'questions')),
      getDocs(collection(firestore, 'payments')),
      getDocs(collection(firestore, 'wallets')),
    ]);

  const users = usersSnap.docs.map((d) => d.data() as any);
  const sessions = sessionsSnap.docs.map((d) => d.data() as any);
  const payments = paymentsSnap.docs.map((d) => d.data() as any);
  const wallets = walletsSnap.docs.map((d) => d.data() as Wallet);

  const completed = sessions.filter((s: any) => s.status === 'submitted' || s.status === 'auto-submitted');
  const avgScore = completed.length > 0
    ? Math.round(completed.reduce((s: any, e: any) => s + (e.scorePercent ?? 0), 0) / completed.length)
    : 0;

  const successfulPayments = payments.filter((p: Payment) => p.status === 'successful');

  return {
    totalUsers: usersSnap.size,
    totalStudents: users.filter((u: any) => u.role !== 'admin').length,
    totalAdmins: users.filter((u: any) => u.role === 'admin').length,
    totalExamSessions: sessionsSnap.size,
    completedExamSessions: completed.length,
    averageScorePercent: avgScore,
    totalCreditsInCirculation: wallets.reduce((sum, w) => sum + w.balance, 0),
    totalDepartments: deptsSnap.size,
    totalCourses: coursesSnap.size,
    totalSubjects: subjectsSnap.size,
    totalQuestions: questionsSnap.size,
    totalPayments: paymentsSnap.size,
    totalRevenueNaira: successfulPayments.reduce((sum, p) => sum + p.amountNaira, 0),
  };
}

/* ── Payment stats ────────────────────────────────────────────────────── */

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
  const snap = await getDocs(collection(firestore, 'payments'));
  const payments = snap.docs.map((d) => d.data() as Payment);
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

/* ── Recent activity ──────────────────────────────────────────────────── */

export async function getRecentActivity(limit = 10): Promise<RecentActivityItem[]> {
  const [usersSnap, sessionsSnap, paymentsSnap] = await Promise.all([
    getDocs(collection(firestore, 'users')),
    getDocs(collection(firestore, 'exam_sessions')),
    getDocs(collection(firestore, 'payments')),
  ]);

  const items: RecentActivityItem[] = [];

  for (const d of usersSnap.docs) {
    const u = d.data() as any;
    items.push({
      id: `user-${d.id}`,
      type: 'user-registered',
      title: `${u.fullName} registered`,
      subtitle: u.email,
      timestamp: u.createdAt,
    });
  }

  for (const d of sessionsSnap.docs) {
    const s = d.data() as any;
    if (!s.submittedAt) continue;
    items.push({
      id: `exam-${d.id}`,
      type: 'exam-completed',
      title: `Exam ${s.status === 'auto-submitted' ? 'auto-submitted' : 'submitted'} — ${s.scorePercent ?? 0}%`,
      subtitle: `${s.correctCount ?? 0}/${s.totalQuestions} correct`,
      timestamp: s.submittedAt,
    });
  }

  for (const d of paymentsSnap.docs) {
    const p = d.data() as Payment;
    if (p.status !== 'successful') continue;
    items.push({
      id: `payment-${d.id}`,
      type: 'payment-successful',
      title: `Payment received — ₦${p.amountNaira.toLocaleString()}`,
      subtitle: `${p.credits} credits · ${p.reference}`,
      timestamp: p.completedAt ?? p.createdAt,
    });
  }

  return items.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, limit);
}