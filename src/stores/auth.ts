// src/stores/auth.ts
// Local-first authentication. There's no backend — this is an offline-first
// PWA — but the app still supports real Name/Email/Password registration
// and login so a shared device (a library computer, a friend's phone) can
// hold multiple separate accounts safely. Passwords are hashed with a
// per-user salt (see src/utils/crypto.ts) and never stored in plaintext.

import { defineStore } from 'pinia';
import { db, uid } from '../db';
import { generateSalt, hashPassword, verifyPassword, isValidEmail } from '../utils/crypto';
import type { User } from '../types/healthApp';

const AUTH_USER_ID_KEY = 'healthcbt:authUserId';

interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
  isReady: boolean;
  authError: string | null;
}

function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `REF-${code}`;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    currentUser: null,
    isAuthenticated: false,
    isReady: false,
    authError: null,
  }),

  getters: {
    userId: (state): string | null => state.currentUser?.id ?? null,
    hasChosenDepartment: (state): boolean => Boolean(state.currentUser?.departmentId),
    isAdmin: (state): boolean => state.currentUser?.role === 'admin',
  },

  actions: {
    /**
     * Restores a previously logged-in session from localStorage, if any.
     * Called once at app boot and from the router guard. Safe to call
     * multiple times — it no-ops once `isReady` is true.
     */
    async initAuth() {
      if (this.isReady) return;

      const storedId = localStorage.getItem(AUTH_USER_ID_KEY);
      if (storedId) {
        const user = await db.users.get(storedId);
        if (user) {
          this.currentUser = user;
          this.isAuthenticated = true;
        } else {
          localStorage.removeItem(AUTH_USER_ID_KEY);
        }
      }

      this.isReady = true;
    },

    /**
     * Seeds a default admin account if none exists.
     * Called once at app boot after initAuth(). Safe to call multiple
     * times — it no-ops if the admin email is already in the database.
     */
    async seedAdmin() {
      const adminEmail = 'admin@healthcbt.com';
      const existing = await db.users.where('email').equals(adminEmail).first();
      if (existing) return;

      const salt = generateSalt();
      const password = 'Admin@123';
      const passwordHash = await hashPassword(password, salt);

      const admin: User = {
        id: uid('user'),
        fullName: 'System Admin',
        email: adminEmail,
        passwordHash,
        passwordSalt: salt,
        role: 'admin',
        departmentId: '',
        createdAt: new Date().toISOString(),
        referralCode: generateReferralCode(),
        referredByCode: null,
        currentStreak: 0,
        longestStreak: 0,
        lastLoginDate: null,
      };

      await db.users.add(admin);
    },

    /**
     * Promotes an existing user to admin by their user ID.
     * Only callable by an authenticated admin.
     */
    async promoteToAdmin(userId: string): Promise<{ success: boolean; error?: string }> {
      if (!this.isAdmin) return this.fail('Only admins can promote users.');

      const user = await db.users.get(userId);
      if (!user) return this.fail('User not found.');

      const updated: User = { ...user, role: 'admin' };
      await db.users.put(updated);

      // If the promoted user is the current user, update session
      if (this.currentUser?.id === userId) {
        this.currentUser = updated;
      }

      return { success: true };
    },

    /**
     * Demotes an admin back to student by their user ID.
     * Only callable by an authenticated admin. Cannot demote yourself.
     */
    async demoteToStudent(userId: string): Promise<{ success: boolean; error?: string }> {
      if (!this.isAdmin) return this.fail('Only admins can demote users.');
      if (this.currentUser?.id === userId) return this.fail('You cannot demote yourself.');

      const user = await db.users.get(userId);
      if (!user) return this.fail('User not found.');

      const updated: User = { ...user, role: 'student' };
      await db.users.put(updated);

      return { success: true };
    },

    async register(input: { fullName: string; email: string; password: string; departmentId: string }): Promise<{ success: boolean; error?: string }> {
      this.authError = null;
      const fullName = input.fullName.trim();
      const email = input.email.trim().toLowerCase();
      const password = input.password;
      const departmentId = input.departmentId;

      if (fullName.length < 2) return this.fail('Please enter your full name.');
      if (!isValidEmail(email)) return this.fail('Please enter a valid email address.');
      if (password.length < 6) return this.fail('Password must be at least 6 characters.');
      if (!departmentId) return this.fail('Please select your course.');

      const existing = await db.users.where('email').equals(email).first();
      if (existing) return this.fail('An account with this email already exists.');

      const salt = generateSalt();
      const passwordHash = await hashPassword(password, salt);

      let referralCode = generateReferralCode();
      while (await db.users.where('referralCode').equals(referralCode).first()) {
        referralCode = generateReferralCode();
      }

      const user: User = {
        id: uid('user'),
        fullName,
        email,
        passwordHash,
        passwordSalt: salt,
        role: 'student',
        departmentId,
        createdAt: new Date().toISOString(),
        referralCode,
        referredByCode: null,
        currentStreak: 0,
        longestStreak: 0,
        lastLoginDate: null,
      };

      await db.users.add(user);
      this.setSession(user);
      return { success: true };
    },

    async login(input: { email: string; password: string }): Promise<{ success: boolean; error?: string }> {
      this.authError = null;
      const email = input.email.trim().toLowerCase();

      if (!isValidEmail(email)) return this.fail('Please enter a valid email address.');
      if (!input.password) return this.fail('Please enter your password.');

      const user = await db.users.where('email').equals(email).first();
      if (!user) return this.fail('No account found for this email.');

      const passwordOk = await verifyPassword(input.password, user.passwordSalt, user.passwordHash);
      if (!passwordOk) return this.fail('Incorrect password.');

      this.setSession(user);
      return { success: true };
    },

    logout() {
      localStorage.removeItem(AUTH_USER_ID_KEY);
      this.currentUser = null;
      this.isAuthenticated = false;
    },

    setSession(user: User) {
      this.currentUser = user;
      this.isAuthenticated = true;
      localStorage.setItem(AUTH_USER_ID_KEY, user.id);
    },

    fail(message: string): { success: false; error: string } {
      this.authError = message;
      return { success: false, error: message };
    },

    async updateProfile(patch: Partial<Pick<User, 'fullName' | 'email' | 'departmentId'>>) {
      if (!this.currentUser) return;

      // Validate email if it's being changed
      if (patch.email) {
        const email = patch.email.trim().toLowerCase();
        if (!isValidEmail(email)) return this.fail('Please enter a valid email address.');
        const existing = await db.users.where('email').equals(email).first();
        if (existing && existing.id !== this.currentUser.id) {
          return this.fail('An account with this email already exists.');
        }
        patch.email = email;
      }

      // Validate fullName if it's being changed
      if (patch.fullName && patch.fullName.trim().length < 2) {
        return this.fail('Please enter your full name.');
      }

      const updated: User = { ...this.currentUser, ...patch };
      await db.users.put(updated);
      this.currentUser = updated;
    },

    async chooseDepartment(departmentId: string) {
      await this.updateProfile({ departmentId });
    },

    /**
     * Returns all users. Admin-only.
     */
    async getAllUsers(): Promise<User[]> {
      if (!this.isAdmin) return [];
      return db.users.toArray();
    },

    /**
     * Deletes a user account by ID. Admin-only.
     * Cannot delete yourself.
     */
    async deleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
      if (!this.isAdmin) return this.fail('Only admins can delete users.');
      if (this.currentUser?.id === userId) return this.fail('You cannot delete your own account.');

      const user = await db.users.get(userId);
      if (!user) return this.fail('User not found.');

      await db.users.delete(userId);
      return { success: true };
    },
  },
});