import { defineStore } from 'pinia';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail as firebaseSendResetEmail,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  getDocs, collection,
} from 'firebase/firestore';
import { auth, firestore } from '../firebase';
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

async function checkIsAdmin(uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(firestore, 'admins', uid));
    return snap.exists();
  } catch {
    return false;
  }
}

async function fetchUserProfile(uid: string): Promise<User | null> {
  try {
    const snap = await getDoc(doc(firestore, 'users', uid));
    if (!snap.exists()) return null;
    return { id: uid, ...snap.data() } as User;
  } catch {
    return null;
  }
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
    async initAuth() {
      if (this.isReady) return;

      return new Promise<void>((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
          unsubscribe();

          if (fbUser) {
            const profile = await fetchUserProfile(fbUser.uid);

            if (profile) {
              const isAdmin = await checkIsAdmin(fbUser.uid);
              if (isAdmin) profile.role = 'admin';
              this.currentUser = profile;
              this.isAuthenticated = true;
            } else {
              const fallback: User = {
                id: fbUser.uid,
                fullName: fbUser.displayName ?? fbUser.email?.split('@')[0] ?? 'User',
                email: fbUser.email ?? '',
                role: 'student',
                departmentId: '',
                createdAt: new Date().toISOString(),
                referralCode: generateReferralCode(),
                referredByCode: null,
                currentStreak: 0,
                longestStreak: 0,
                lastLoginDate: null,
              } as User;
              try {
                await setDoc(doc(firestore, 'users', fbUser.uid), fallback);
              } catch { /* offline */ }
              this.currentUser = fallback;
              this.isAuthenticated = true;
            }
          } else {
            this.currentUser = null;
            this.isAuthenticated = false;
          }

          this.isReady = true;
          resolve();
        });
      });
    },

    async register(input: {
      fullName: string;
      email: string;
      password: string;
      departmentId: string;
    }): Promise<{ success: boolean; error?: string }> {
      this.authError = null;
      const fullName = input.fullName.trim();
      const email = input.email.trim().toLowerCase();
      const password = input.password;
      const departmentId = input.departmentId;

      if (fullName.length < 2) return this.fail('Please enter your full name.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return this.fail('Please enter a valid email address.');
      if (password.length < 6) return this.fail('Password must be at least 6 characters.');
      if (!departmentId) return this.fail('Please select your course.');

      try {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const fbUser = credential.user;

        const user: User = {
          id: fbUser.uid,
          fullName,
          email,
          role: 'student',
          departmentId,
          createdAt: new Date().toISOString(),
          referralCode: generateReferralCode(),
          referredByCode: null,
          currentStreak: 0,
          longestStreak: 0,
          lastLoginDate: null,
        } as User;

        await setDoc(doc(firestore, 'users', fbUser.uid), user);

        this.currentUser = user;
        this.isAuthenticated = true;
        localStorage.setItem(AUTH_USER_ID_KEY, fbUser.uid);

        return { success: true };
      } catch (err: any) {
        return this.fail(mapFirebaseAuthError(err));
      }
    },

    async login(input: {
      email: string;
      password: string;
    }): Promise<{ success: boolean; error?: string }> {
      this.authError = null;
      const email = input.email.trim().toLowerCase();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return this.fail('Please enter a valid email address.');
      if (!input.password) return this.fail('Please enter your password.');

      try {
        const credential = await signInWithEmailAndPassword(auth, email, input.password);
        const fbUser = credential.user;

        const profile = await fetchUserProfile(fbUser.uid);

        if (profile) {
          const isAdmin = await checkIsAdmin(fbUser.uid);
          if (isAdmin) profile.role = 'admin';
          this.currentUser = profile;
        } else {
          const fallback: User = {
            id: fbUser.uid,
            fullName: fbUser.displayName ?? email.split('@')[0],
            email,
            role: 'student',
            departmentId: '',
            createdAt: new Date().toISOString(),
            referralCode: generateReferralCode(),
            referredByCode: null,
            currentStreak: 0,
            longestStreak: 0,
            lastLoginDate: null,
          } as User;
          await setDoc(doc(firestore, 'users', fbUser.uid), fallback);
          this.currentUser = fallback;
        }

        this.isAuthenticated = true;
        localStorage.setItem(AUTH_USER_ID_KEY, fbUser.uid);
        return { success: true };
      } catch (err: any) {
        return this.fail(mapFirebaseAuthError(err));
      }
    },

    async logout() {
      try {
        await signOut(auth);
      } catch { /* ignore */ }
      localStorage.removeItem(AUTH_USER_ID_KEY);
      this.currentUser = null;
      this.isAuthenticated = false;
    },

    async updateProfile(patch: Partial<Pick<User, 'fullName' | 'departmentId'>>): Promise<void> {
      if (!this.currentUser) return;
      const uid = this.currentUser.id;

      if (patch.fullName && patch.fullName.trim().length < 2) {
        this.authError = 'Please enter your full name.';
        return;
      }

      const updated: User = { ...this.currentUser, ...patch };
      try {
        await updateDoc(doc(firestore, 'users', uid), patch);
      } catch { /* offline */ }
      this.currentUser = updated;
    },

    async chooseDepartment(departmentId: string) {
      await this.updateProfile({ departmentId });
    },

    async promoteToAdmin(userId: string): Promise<{ success: boolean; error?: string }> {
      if (!this.isAdmin) return this.fail('Only admins can promote users.');
      try {
        await setDoc(doc(firestore, 'admins', userId), {
          role: 'admin',
          promotedAt: new Date().toISOString(),
          promotedBy: this.currentUser?.id,
        });
        await updateDoc(doc(firestore, 'users', userId), { role: 'admin' });
        if (this.currentUser?.id === userId) {
          this.currentUser = { ...this.currentUser, role: 'admin' };
        }
        return { success: true };
      } catch (err: any) {
        return this.fail(err.message ?? 'Failed to promote user.');
      }
    },

    async demoteToStudent(userId: string): Promise<{ success: boolean; error?: string }> {
      if (!this.isAdmin) return this.fail('Only admins can demote users.');
      if (this.currentUser?.id === userId) return this.fail('You cannot demote yourself.');
      try {
        await deleteDoc(doc(firestore, 'admins', userId));
        await updateDoc(doc(firestore, 'users', userId), { role: 'student' });
        return { success: true };
      } catch (err: any) {
        return this.fail(err.message ?? 'Failed to demote user.');
      }
    },

    async getAllUsers(): Promise<User[]> {
      if (!this.isAdmin) return [];
      try {
        const snap = await getDocs(collection(firestore, 'users'));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as User);
      } catch {
        return [];
      }
    },

    async deleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
      if (!this.isAdmin) return this.fail('Only admins can delete users.');
      if (this.currentUser?.id === userId) return this.fail('You cannot delete your own account.');
      try {
        const snap = await getDoc(doc(firestore, 'users', userId));
        if (!snap.exists()) return this.fail('User not found.');
        await deleteDoc(doc(firestore, 'users', userId));
        await deleteDoc(doc(firestore, 'admins', userId)).catch(() => {});
        return { success: true };
      } catch (err: any) {
        return this.fail(err.message ?? 'Failed to delete user.');
      }
    },

    async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
      this.authError = null;
      const normalizedEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return this.fail('Please enter a valid email address.');
      }
      try {
        await firebaseSendResetEmail(auth, normalizedEmail);
        return { success: true };
      } catch (err: any) {
        return this.fail(mapFirebaseAuthError(err));
      }
    },

    async validateResetToken(_token: string): Promise<{ valid: boolean; email?: string; error?: string }> {
      return { valid: true };
    },

    async resetPasswordWithToken(_token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
      if (newPassword.length < 6) return this.fail('Password must be at least 6 characters.');
      return { success: true };
    },

    async seedAdmin(): Promise<void> {
      // Admin is created via Firebase Console (admins/{uid} doc)
    },

    fail(message: string): { success: false; error: string } {
      this.authError = message;
      return { success: false, error: message };
    },
  },
});

function mapFirebaseAuthError(err: any): string {
  const code: string = err?.code ?? '';
  if (code.includes('email-already-in-use')) return 'An account with this email already exists.';
  if (code.includes('invalid-email')) return 'Please enter a valid email address.';
  if (code.includes('weak-password')) return 'Password is too weak. Use at least 6 characters.';
  if (code.includes('user-not-found')) return 'No account found for this email.';
  if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'Incorrect email or password.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Please wait and try again.';
  if (code.includes('network-request-failed')) return 'Network error. Check your connection and try again.';
  if (code.includes('user-disabled')) return 'This account has been disabled.';
  return err?.message ?? 'Something went wrong. Please try again.';
}