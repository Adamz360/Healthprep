// src/stores/walletAndGamification.ts
// Pinia store: credit wallet, referral system, daily streaks, and topic mastery
// — all backed by Firestore (cloud-first). Exam responses are read from both
// Firestore and the local Dexie exam cache for offline support.

import { defineStore } from 'pinia';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  collection,
  query,
  where,
  runTransaction,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { firestore } from '../firebase';
import { db as localDb, uid } from '../db/schema';
import type {
  Wallet,
  WalletTransaction,
  CreditTransactionType,
  Referral,
  User,
  TopicMastery,
} from '../types/healthApp';

/* ── Constants ─────────────────────────────────────────────────────────── */

const CREDIT_RULES: Record<
  Extract<CreditTransactionType, 'earned-streak' | 'earned-quiz' | 'earned-referral-bonus' | 'earned-referee-bonus'>,
  number
> = {
  'earned-streak': 5,
  'earned-quiz': 2,
  'earned-referral-bonus': 30,
  'earned-referee-bonus': 15,
};

const STARTING_BALANCE = 50;

class InsufficientCreditsError extends Error {
  constructor() {
    super('Insufficient credits for this action');
    this.name = 'InsufficientCreditsError';
  }
}

/* ── Pure helpers ──────────────────────────────────────────────────────── */

function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `REF-${code}`;
}

function isConsecutiveDay(lastDateIso: string | null, todayIso: string): boolean {
  if (!lastDateIso) return false;
  const last = new Date(lastDateIso);
  const today = new Date(todayIso);
  const diffMs = new Date(today.toDateString()).getTime() - new Date(last.toDateString()).getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return diffDays === 1;
}

function isSameDay(dateIso: string | null, todayIso: string): boolean {
  if (!dateIso) return false;
  return new Date(dateIso).toDateString() === new Date(todayIso).toDateString();
}

function errorCode(err: unknown): string {
  return (err as { code?: string })?.code ?? 'unknown';
}

/**
 * Firestore must not be touched until Firebase Auth has restored the session
 * AND it matches the user we are acting for. Otherwise request.auth is null
 * (or a different user) and every rule check fails with permission-denied.
 */
async function requireAuthenticatedUser(expectedUserId: string): Promise<void> {
  const auth = getAuth();
  await auth.authStateReady();
  const current = auth.currentUser;
  if (!current) throw new Error('You are not signed in. Please sign in and try again.');
  if (current.uid !== expectedUserId) {
    throw new Error('Signed-in account does not match the requested user.');
  }
}

/* ── Firestore helpers ─────────────────────────────────────────────────── */
/* These deliberately do NOT swallow errors. Swallowing a failed read makes   */
/* "could not read" look like "does not exist" (e.g. resetting a wallet).     */

async function fsGetWallet(userId: string): Promise<Wallet | null> {
  const snap = await getDoc(doc(firestore, 'wallets', userId));
  return snap.exists() ? (snap.data() as Wallet) : null;
}

async function fsCreateWallet(wallet: Wallet): Promise<void> {
  await setDoc(doc(firestore, 'wallets', wallet.userId), wallet);
}

async function fsGetTransactions(userId: string): Promise<WalletTransaction[]> {
  const snap = await getDocs(
    query(collection(firestore, 'wallet_transactions'), where('userId', '==', userId)),
  );
  return snap.docs.map((d) => d.data() as WalletTransaction);
}

async function fsGetUser(userId: string): Promise<User | null> {
  const snap = await getDoc(doc(firestore, 'users', userId));
  return snap.exists() ? ({ id: userId, ...snap.data() } as User) : null;
}

async function fsUpdateUser(userId: string, patch: Partial<User>): Promise<void> {
  await updateDoc(doc(firestore, 'users', userId), patch);
}

/* ── Store ─────────────────────────────────────────────────────────────── */

interface WalletGamificationState {
  userId: string | null;
  wallet: Wallet | null;
  transactions: WalletTransaction[];
  referralCode: string | null;
  currentStreak: number;
  longestStreak: number;
  topicMastery: TopicMastery[];
  isLoading: boolean;
  lastError: string | null;
}

export const useWalletAndGamificationStore = defineStore('walletAndGamification', {
  state: (): WalletGamificationState => ({
    userId: null,
    wallet: null,
    transactions: [],
    referralCode: null,
    currentStreak: 0,
    longestStreak: 0,
    topicMastery: [],
    isLoading: false,
    lastError: null,
  }),

  getters: {
    creditBalance: (state): number => state.wallet?.balance ?? 0,
    hasEnoughCredits:
      (state) =>
      (amount: number): boolean =>
        (state.wallet?.balance ?? 0) >= amount,
    recentTransactions: (state): WalletTransaction[] =>
      [...state.transactions].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 20),
    weakTopics: (state): TopicMastery[] =>
      state.topicMastery.filter((t) => t.masteryLevel === 'weak'),
  },

  actions: {
    /* ── Bootstrap ─────────────────────────────────────────────────── */

    async initForUser(userId: string) {
      this.isLoading = true;
      this.lastError = null;
      try {
        await requireAuthenticatedUser(userId);
        this.userId = userId;

        // 1) Wallet. Only create one if the read SUCCEEDED and found nothing.
        //    If the read throws, we stop (caught below) instead of overwriting
        //    an existing wallet with the starting balance.
        let wallet = await fsGetWallet(userId);
        if (!wallet) {
          wallet = {
            userId,
            balance: STARTING_BALANCE,
            totalEarned: STARTING_BALANCE,
            totalSpent: 0,
            updatedAt: new Date().toISOString(),
          };
          await fsCreateWallet(wallet);
        }
        this.wallet = wallet;

        // 2) Profile (non-critical: failures here must not block the wallet)
        try {
          const user = await fsGetUser(userId);
          if (user) {
            this.referralCode = user.referralCode;
            this.currentStreak = user.currentStreak;
            this.longestStreak = user.longestStreak;
          }
        } catch (err) {
          console.error('[wallet] load user profile failed', errorCode(err), err);
        }

        // 3) Transactions (non-critical)
        try {
          this.transactions = await fsGetTransactions(userId);
        } catch (err) {
          console.error('[wallet] load transactions failed', errorCode(err), err);
        }

        // 4) Topic mastery (non-critical)
        try {
          await this.refreshTopicMastery();
        } catch (err) {
          console.error('[wallet] refresh topic mastery failed', errorCode(err), err);
        }
      } catch (err) {
        console.error('[wallet] initForUser failed', errorCode(err), err);
        this.lastError = err instanceof Error ? err.message : 'Failed to initialize wallet';
      } finally {
        this.isLoading = false;
      }
    },

    /* ── Core credit ledger ────────────────────────────────────────── */

    /**
     * Atomic: reads the CURRENT server wallet, validates the balance, and
     * writes the new wallet + ledger entry together. Two tabs/devices can no
     * longer overwrite each other with a stale cached balance.
     */
    async _applyTransaction(
      type: CreditTransactionType,
      amount: number,
      description: string,
    ): Promise<WalletTransaction> {
      if (!this.userId || !this.wallet) throw new Error('Wallet not initialized');
      const userId = this.userId;
      await requireAuthenticatedUser(userId);

      const walletRef = doc(firestore, 'wallets', userId);
      const txId = uid('tx');
      const txRef = doc(firestore, 'wallet_transactions', txId);

      const result = await runTransaction(firestore, async (t) => {
        const snap = await t.get(walletRef);
        if (!snap.exists()) throw new Error('Wallet not found');
        const current = snap.data() as Wallet;

        const newBalance = current.balance + amount;
        if (newBalance < 0) throw new InsufficientCreditsError();

        const now = new Date().toISOString();
        const tx: WalletTransaction = {
          id: txId,
          userId,
          type,
          amount,
          balanceAfter: newBalance,
          description,
          createdAt: now,
        };
        const updatedWallet: Wallet = {
          ...current,
          balance: newBalance,
          totalEarned: current.totalEarned + (amount > 0 ? amount : 0),
          totalSpent: current.totalSpent + (amount < 0 ? Math.abs(amount) : 0),
          updatedAt: now,
        };

        t.set(walletRef, updatedWallet);
        t.set(txRef, tx);
        return { tx, updatedWallet };
      });

      this.wallet = result.updatedWallet;
      this.transactions.push(result.tx);
      return result.tx;
    },

    async spendCredits(
      amount: number,
      type: CreditTransactionType,
      description: string,
    ): Promise<boolean> {
      if (amount <= 0) throw new Error('Spend amount must be positive');
      if (!this.hasEnoughCredits(amount)) return false;
      try {
        await this._applyTransaction(type, -amount, description);
        return true;
      } catch (err) {
        // Server balance was lower than the cached one
        if (err instanceof InsufficientCreditsError) return false;
        throw err;
      }
    },

    async earnCredits(
      type: CreditTransactionType,
      description: string,
      overrideAmount?: number,
    ): Promise<WalletTransaction> {
      const amount = overrideAmount ?? CREDIT_RULES[type as keyof typeof CREDIT_RULES] ?? 0;
      return this._applyTransaction(type, amount, description);
    },

    /* ── Daily login streak ────────────────────────────────────────── */

    async registerDailyLogin() {
    if (!this.userId) return; // Don't throw — just skip

    try {
      const user = await fsGetUser(this.userId);
      if (!user) {
        // User doc doesn't exist yet — create a minimal one
        try {
          await setDoc(doc(firestore, 'users', this.userId), {
            currentStreak: 1,
            longestStreak: 1,
            lastLoginDate: new Date().toISOString(),
          }, { merge: true });
        } catch { /* offline */ }
        this.currentStreak = 1;
        this.longestStreak = 1;
        return;
      }

      const todayIso = new Date().toISOString();
      if (isSameDay(user.lastLoginDate, todayIso)) return;

      const continuingStreak = isConsecutiveDay(user.lastLoginDate, todayIso);
      const newStreak = continuingStreak ? user.currentStreak + 1 : 1;
      const newLongest = Math.max(user.longestStreak, newStreak);

      await fsUpdateUser(this.userId, {
        currentStreak: newStreak,
        longestStreak: newLongest,
        lastLoginDate: todayIso,
      });

      this.currentStreak = newStreak;
      this.longestStreak = newLongest;

      await this.earnCredits('earned-streak', `Day ${newStreak} login streak bonus`);
    } catch (err) {
      // Never let streak logic crash the dashboard
      console.warn('[WalletGamification] registerDailyLogin failed:', err);
    }
  },

    /* ── Quiz completion reward ────────────────────────────────────── */

    async rewardQuizCompletion(subjectName: string) {
      await this.earnCredits('earned-quiz', `Completed a practice quiz — ${subjectName}`);
    },

    /* ── Referral system ───────────────────────────────────────────── */

    async ensureReferralCode(): Promise<string> {
      if (!this.userId) throw new Error('No active user');
      await requireAuthenticatedUser(this.userId);

      const user = await fsGetUser(this.userId);
      if (!user) throw new Error('User not found');

      if (user.referralCode) {
        this.referralCode = user.referralCode;
        return user.referralCode;
      }

      const code = generateReferralCode();
      await fsUpdateUser(this.userId, { referralCode: code });
      this.referralCode = code;
      return code;
    },

    /**
     * Must be called as the REFEREE (the signed-in user). Your Firestore rules
     * only let a user create a referral where refereeUserId == their own uid,
     * and only let them write their OWN wallet/transactions.
     *
     * Crediting the REFERRER cannot be done from the client under those rules
     * (it was the source of permission-denied errors). It must be done by a
     * trusted backend: a Cloud Function triggered by onCreate of
     * `referrals/{id}` using the Admin SDK, which bypasses rules. Until that
     * exists, the referrer is not credited here.
     */
    async processReferralSignup(
      referrerUserId: string,
      refereeUserId: string,
      refereeEmail: string,
    ): Promise<Referral> {
      await requireAuthenticatedUser(refereeUserId);

      const referral: Referral = {
        id: uid('ref'),
        referrerUserId,
        refereeUserId,
        refereeEmail,
        referrerBonusCredits: CREDIT_RULES['earned-referral-bonus'],
        refereeBonusCredits: CREDIT_RULES['earned-referee-bonus'],
        status: 'completed',
        createdAt: new Date().toISOString(),
      };

      // 1) Referral record (rules: create allowed when refereeUserId == auth uid)
      await setDoc(doc(firestore, 'referrals', referral.id), referral);

      // 2) Credit the referee (the signed-in user) atomically
      if (this.userId === refereeUserId && this.wallet) {
        await this._applyTransaction(
          'earned-referee-bonus',
          referral.refereeBonusCredits,
          'Welcome bonus for signing up via referral',
        );
      } else {
        // Wallet not initialised in this store yet (e.g. right after signup)
        const walletRef = doc(firestore, 'wallets', refereeUserId);
        const txId = uid('tx');
        const txRef = doc(firestore, 'wallet_transactions', txId);
        await runTransaction(firestore, async (t) => {
          const snap = await t.get(walletRef);
          const now = new Date().toISOString();
          const current: Wallet = snap.exists()
            ? (snap.data() as Wallet)
            : {
                userId: refereeUserId,
                balance: STARTING_BALANCE,
                totalEarned: STARTING_BALANCE,
                totalSpent: 0,
                updatedAt: now,
              };
          const newBalance = current.balance + referral.refereeBonusCredits;
          t.set(walletRef, {
            ...current,
            balance: newBalance,
            totalEarned: current.totalEarned + referral.refereeBonusCredits,
            updatedAt: now,
          });
          t.set(txRef, {
            id: txId,
            userId: refereeUserId,
            type: 'earned-referee-bonus',
            amount: referral.refereeBonusCredits,
            balanceAfter: newBalance,
            description: 'Welcome bonus for signing up via referral',
            createdAt: now,
          } satisfies WalletTransaction);
        });
      }

      // 3) Refresh local state for the signed-in user
      if (this.userId === refereeUserId) {
        try {
          this.wallet = await fsGetWallet(refereeUserId);
          this.transactions = await fsGetTransactions(refereeUserId);
        } catch (err) {
          console.error('[wallet] refresh after referral failed', errorCode(err), err);
        }
      }

      return referral;
    },

    /* ── Topic mastery ─────────────────────────────────────────────── */

    async refreshTopicMastery() {
      if (!this.userId) return;

      // Read from BOTH Firestore and the local Dexie exam cache
      let responses: any[] = [];
      try {
        const snap = await getDocs(
          query(collection(firestore, 'user_responses'), where('userId', '==', this.userId)),
        );
        responses = snap.docs.map((d) => d.data());
      } catch (err) {
        // Offline is expected; anything else (e.g. permission-denied) is a bug worth seeing
        console.warn('[wallet] remote user_responses unavailable, using local cache', errorCode(err));
      }

      // Merge local (possibly offline) responses without duplicates
      try {
        const localResponses = await localDb.user_responses
          .where('userId')
          .equals(this.userId)
          .toArray();
        const existingIds = new Set(responses.map((r) => r.id));
        for (const lr of localResponses) {
          if (!existingIds.has(lr.id)) responses.push(lr);
        }
      } catch (err) {
        console.warn('[wallet] local user_responses unavailable', err);
      }

      // Only count graded responses
      responses = responses.filter((r) => r.isCorrect !== null && r.isCorrect !== undefined);

      const byTopic = new Map<
        string,
        { subjectId: string; total: number; correct: number; lastAt: string | null }
      >();

      for (const r of responses) {
        const entry = byTopic.get(r.topicId) ?? {
          subjectId: r.subjectId,
          total: 0,
          correct: 0,
          lastAt: null,
        };
        entry.total += 1;
        if (r.isCorrect) entry.correct += 1;
        if (r.answeredAt && (!entry.lastAt || r.answeredAt > entry.lastAt)) {
          entry.lastAt = r.answeredAt;
        }
        byTopic.set(r.topicId, entry);
      }

      // Fetch topic names in parallel instead of one sequential read per topic
      const entries = Array.from(byTopic.entries());
      const topicPaths = await Promise.all(
        entries.map(async ([topicId]) => {
          try {
            const topicSnap = await getDoc(doc(firestore, 'topics', topicId));
            if (topicSnap.exists()) {
              return (topicSnap.data() as any).parentTopicPath ?? 'Unknown Topic';
            }
          } catch {
            // offline / unavailable
          }
          return 'Unknown Topic';
        }),
      );

      const mastery: TopicMastery[] = entries.map(([topicId, agg], i) => {
        const accuracyPercent = agg.total > 0 ? Math.round((agg.correct / agg.total) * 100) : 0;
        return {
          topicId,
          topicPath: topicPaths[i],
          subjectId: agg.subjectId,
          totalAttempts: agg.total,
          correctAttempts: agg.correct,
          accuracyPercent,
          lastAttemptedAt: agg.lastAt,
          masteryLevel: accuracyPercent < 50 ? 'weak' : accuracyPercent < 75 ? 'developing' : 'strong',
        };
      });

      this.topicMastery = mastery.sort((a, b) => a.accuracyPercent - b.accuracyPercent);
    },
  },
});