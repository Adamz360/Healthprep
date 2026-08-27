// src/stores/walletAndGamification.ts
// Pinia store: credit wallet, referral system, daily streaks, and topic mastery scores

import { defineStore } from 'pinia';
import { db, uid, ensureWalletExists } from '../db';
import type {
  Wallet,
  WalletTransaction,
  CreditTransactionType,
  Referral,
  User,
  TopicMastery,
} from '../types/healthApp';

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const CREDIT_RULES: Record<Extract<CreditTransactionType, 'earned-streak' | 'earned-quiz' | 'earned-referral-bonus' | 'earned-referee-bonus'>, number> = {
  'earned-streak': 5, // credits per day of an unbroken login streak
  'earned-quiz': 2, // credits per completed practice quiz
  'earned-referral-bonus': 30, // credits to the referrer
  'earned-referee-bonus': 15, // credits to the new signup
};

function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
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

/* -------------------------------------------------------------------------- */
/*  Store State Shape                                                         */
/* -------------------------------------------------------------------------- */

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
    weakTopics: (state): TopicMastery[] => state.topicMastery.filter((t) => t.masteryLevel === 'weak'),
  },

  actions: {
    /* ---------------------------------------------------------------- */
    /*  Bootstrap                                                        */
    /* ---------------------------------------------------------------- */

    async initForUser(userId: string) {
      this.isLoading = true;
      this.lastError = null;
      try {
        this.userId = userId;
        const wallet = await ensureWalletExists(userId);
        this.wallet = wallet;

        const user = await db.users.get(userId);
        if (user) {
          this.referralCode = user.referralCode;
          this.currentStreak = user.currentStreak;
          this.longestStreak = user.longestStreak;
        }

        this.transactions = await db.wallet_transactions.where('userId').equals(userId).toArray();
        await this.refreshTopicMastery();
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : 'Failed to initialize wallet';
      } finally {
        this.isLoading = false;
      }
    },

    /* ---------------------------------------------------------------- */
    /*  Core credit ledger primitives                                    */
    /* ---------------------------------------------------------------- */

    async _applyTransaction(type: CreditTransactionType, amount: number, description: string): Promise<WalletTransaction> {
      if (!this.userId || !this.wallet) throw new Error('Wallet not initialized');

      const newBalance = this.wallet.balance + amount;
      if (newBalance < 0) {
        throw new Error('Insufficient credits for this action');
      }

      const tx: WalletTransaction = {
        id: uid('tx'),
        userId: this.userId,
        type,
        amount,
        balanceAfter: newBalance,
        description,
        createdAt: new Date().toISOString(),
      };

      const updatedWallet: Wallet = {
        ...this.wallet,
        balance: newBalance,
        totalEarned: this.wallet.totalEarned + (amount > 0 ? amount : 0),
        totalSpent: this.wallet.totalSpent + (amount < 0 ? Math.abs(amount) : 0),
        updatedAt: tx.createdAt,
      };

      await db.transaction('rw', db.wallet, db.wallet_transactions, async () => {
        await db.wallet.put(updatedWallet);
        await db.wallet_transactions.add(tx);
      });

      this.wallet = updatedWallet;
      this.transactions.push(tx);
      return tx;
    },

    async spendCredits(amount: number, type: CreditTransactionType, description: string): Promise<boolean> {
      if (amount <= 0) throw new Error('Spend amount must be positive');
      if (!this.hasEnoughCredits(amount)) return false;
      await this._applyTransaction(type, -amount, description);
      return true;
    },

    async earnCredits(type: CreditTransactionType, description: string, overrideAmount?: number): Promise<WalletTransaction> {
      const amount = overrideAmount ?? CREDIT_RULES[type as keyof typeof CREDIT_RULES] ?? 0;
      return this._applyTransaction(type, amount, description);
    },

    /* ---------------------------------------------------------------- */
    /*  Daily login streak                                               */
    /* ---------------------------------------------------------------- */

    async registerDailyLogin() {
      if (!this.userId) throw new Error('No active user');
      const user = await db.users.get(this.userId);
      if (!user) throw new Error('User not found');

      const todayIso = new Date().toISOString();

      if (isSameDay(user.lastLoginDate, todayIso)) {
        // already logged in today, no streak change / no double credit
        return;
      }

      const continuingStreak = isConsecutiveDay(user.lastLoginDate, todayIso);
      const newStreak = continuingStreak ? user.currentStreak + 1 : 1;
      const newLongest = Math.max(user.longestStreak, newStreak);

      const updatedUser: User = {
        ...user,
        currentStreak: newStreak,
        longestStreak: newLongest,
        lastLoginDate: todayIso,
      };
      await db.users.put(updatedUser);

      this.currentStreak = newStreak;
      this.longestStreak = newLongest;

      await this.earnCredits('earned-streak', `Day ${newStreak} login streak bonus`);
    },

    /* ---------------------------------------------------------------- */
    /*  Quiz completion reward                                           */
    /* ---------------------------------------------------------------- */

    async rewardQuizCompletion(subjectName: string) {
      await this.earnCredits('earned-quiz', `Completed a practice quiz — ${subjectName}`);
    },

    /* ---------------------------------------------------------------- */
    /*  Referral system                                                  */
    /* ---------------------------------------------------------------- */

    async ensureReferralCode(): Promise<string> {
      if (!this.userId) throw new Error('No active user');
      const user = await db.users.get(this.userId);
      if (!user) throw new Error('User not found');

      if (user.referralCode) {
        this.referralCode = user.referralCode;
        return user.referralCode;
      }

      let code = generateReferralCode();
      // extremely unlikely collision guard
      while (await db.users.where('referralCode').equals(code).first()) {
        code = generateReferralCode();
      }

      await db.users.update(this.userId, { referralCode: code });
      this.referralCode = code;
      return code;
    },

    /**
     * Simulates a referral signup: a new user (referee) signs up using an
     * existing user's referral code. Both parties are credited.
     */
    async processReferralSignup(referrerUserId: string, refereeUserId: string, refereeEmail: string): Promise<Referral> {
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

      await db.referrals.add(referral);

      // Credit the referrer
      const referrerWallet = await ensureWalletExists(referrerUserId);
      await db.transaction('rw', db.wallet, db.wallet_transactions, async () => {
        const newBalance = referrerWallet.balance + referral.referrerBonusCredits;
        await db.wallet.put({
          ...referrerWallet,
          balance: newBalance,
          totalEarned: referrerWallet.totalEarned + referral.referrerBonusCredits,
          updatedAt: new Date().toISOString(),
        });
        await db.wallet_transactions.add({
          id: uid('tx'),
          userId: referrerUserId,
          type: 'earned-referral-bonus',
          amount: referral.referrerBonusCredits,
          balanceAfter: newBalance,
          description: `Referral bonus — ${refereeEmail} joined using your code`,
          createdAt: new Date().toISOString(),
        });
      });

      // Credit the referee
      const refereeWallet = await ensureWalletExists(refereeUserId);
      await db.transaction('rw', db.wallet, db.wallet_transactions, async () => {
        const newBalance = refereeWallet.balance + referral.refereeBonusCredits;
        await db.wallet.put({
          ...refereeWallet,
          balance: newBalance,
          totalEarned: refereeWallet.totalEarned + referral.refereeBonusCredits,
          updatedAt: new Date().toISOString(),
        });
        await db.wallet_transactions.add({
          id: uid('tx'),
          userId: refereeUserId,
          type: 'earned-referee-bonus',
          amount: referral.refereeBonusCredits,
          balanceAfter: newBalance,
          description: 'Welcome bonus for signing up via referral',
          createdAt: new Date().toISOString(),
        });
      });

      // refresh local state if the current user was involved
      if (this.userId === referrerUserId || this.userId === refereeUserId) {
        this.wallet = (await db.wallet.get(this.userId)) ?? null;
        this.transactions = await db.wallet_transactions.where('userId').equals(this.userId).toArray();
      }

      return referral;
    },

    /* ---------------------------------------------------------------- */
    /*  Topic mastery (feeds the Weak Area Engine + dashboard widgets)   */
    /* ---------------------------------------------------------------- */

    async refreshTopicMastery() {
      if (!this.userId) return;

      const responses = await db.user_responses
        .where('userId')
        .equals(this.userId)
        .and((r) => r.isCorrect !== null)
        .toArray();

      const byTopic = new Map<string, { subjectId: string; total: number; correct: number; lastAt: string | null }>();

      for (const r of responses) {
        const entry = byTopic.get(r.topicId) ?? { subjectId: r.subjectId, total: 0, correct: 0, lastAt: null };
        entry.total += 1;
        if (r.isCorrect) entry.correct += 1;
        if (r.answeredAt && (!entry.lastAt || r.answeredAt > entry.lastAt)) entry.lastAt = r.answeredAt;
        byTopic.set(r.topicId, entry);
      }

      const mastery: TopicMastery[] = [];
      for (const [topicId, agg] of byTopic.entries()) {
        const topic = await db.topics.get(topicId);
        const accuracyPercent = agg.total > 0 ? Math.round((agg.correct / agg.total) * 100) : 0;
        mastery.push({
          topicId,
          topicPath: topic?.parentTopicPath ?? 'Unknown Topic',
          subjectId: agg.subjectId,
          totalAttempts: agg.total,
          correctAttempts: agg.correct,
          accuracyPercent,
          lastAttemptedAt: agg.lastAt,
          masteryLevel: accuracyPercent < 50 ? 'weak' : accuracyPercent < 75 ? 'developing' : 'strong',
        });
      }

      this.topicMastery = mastery.sort((a, b) => a.accuracyPercent - b.accuracyPercent);
    },
  },
});
