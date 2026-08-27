// src/stores/session.ts
// Local-first "auth": since exams must work fully offline, the app
// provisions a local user profile on first launch rather than requiring a
// network login. If/when a backend is introduced, this is the seam where
// a real auth flow would hydrate `currentUser` instead of creating one.

import { defineStore } from 'pinia';
import { db, uid } from '../db';
import type { User } from '../types/healthApp';

const CURRENT_USER_ID_KEY = 'healthcbt:currentUserId';

interface SessionState {
  currentUser: User | null;
  isReady: boolean;
}

function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `REF-${code}`;
}

export const useSessionStore = defineStore('session', {
  state: (): SessionState => ({
    currentUser: null,
    isReady: false,
  }),

  getters: {
    userId: (state): string | null => state.currentUser?.id ?? null,
    hasChosenDepartment: (state): boolean => Boolean(state.currentUser?.departmentId),
  },

  actions: {
    /**
     * Loads the existing local user, or provisions a fresh one on first
     * ever launch. Called once at app boot (see router guard / App.vue).
     */
    async initSession() {
      if (this.isReady) return;

      const storedId = localStorage.getItem(CURRENT_USER_ID_KEY);
      let user = storedId ? await db.users.get(storedId) : undefined;

      if (!user) {
        let code = generateReferralCode();
        while (await db.users.where('referralCode').equals(code).first()) {
          code = generateReferralCode();
        }

        user = {
          id: uid('user'),
          fullName: 'Guest Candidate',
          email: '',
          departmentId: '',
          createdAt: new Date().toISOString(),
          referralCode: code,
          referredByCode: null,
          currentStreak: 0,
          longestStreak: 0,
          lastLoginDate: null,
        };
        await db.users.add(user);
        localStorage.setItem(CURRENT_USER_ID_KEY, user.id);
      }

      this.currentUser = user;
      this.isReady = true;
    },

    async updateProfile(patch: Partial<Pick<User, 'fullName' | 'email' | 'departmentId'>>) {
      if (!this.currentUser) return;
      const updated: User = { ...this.currentUser, ...patch };
      await db.users.put(updated);
      this.currentUser = updated;
    },

    async chooseDepartment(departmentId: string) {
      await this.updateProfile({ departmentId });
    },
  },
});
