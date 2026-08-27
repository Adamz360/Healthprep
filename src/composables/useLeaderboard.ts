// src/composables/useLeaderboard.ts
// Builds a ranked leaderboard by merging seeded mock competitors with every
// real account registered on this device. Since the app is offline-first
// with no backend, "real" competition is necessarily local — but any
// account a person logs into on this device shows up with a live,
// recomputed score, while the mock rows give a fresh install something to
// rank against from day one.

import { ref } from 'vue';
import { db } from '../db';
import type { LeaderboardEntry } from '../types/healthApp';

/**
 * Points formula: 10 per correct answer (across all graded exam sessions)
 * + 2 per current login-streak day + 1 per credit ever earned. Rewards
 * consistent accuracy over raw credit-buying, while still giving streaks
 * and engagement some weight.
 */
async function computeUserPoints(userId: string): Promise<number> {
  const [correctCount, user, wallet] = await Promise.all([
    db.user_responses.where('userId').equals(userId).and((r) => r.isCorrect === true).count(),
    db.users.get(userId),
    db.wallet.get(userId),
  ]);

  const streakPoints = (user?.currentStreak ?? 0) * 2;
  const creditPoints = wallet?.totalEarned ?? 0;
  return correctCount * 10 + streakPoints + creditPoints;
}

export function useLeaderboard() {
  const entries = ref<LeaderboardEntry[]>([]);
  const isLoading = ref(false);

  async function refresh(currentUserId: string | null): Promise<LeaderboardEntry[]> {
    isLoading.value = true;
    try {
      const [mockRecords, realUsers] = await Promise.all([db.leaderboard_mock.toArray(), db.users.toArray()]);

      const realEntries = await Promise.all(
        realUsers.map(async (u) => ({
          id: u.id,
          displayName: u.id === currentUserId ? `${u.fullName} (You)` : u.fullName,
          points: await computeUserPoints(u.id),
          isCurrentUser: u.id === currentUserId,
        }))
      );

      const mockEntries = mockRecords.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        points: m.points,
        isCurrentUser: false,
      }));

      const merged = [...realEntries, ...mockEntries].sort((a, b) => b.points - a.points);

      entries.value = merged.map((entry, index) => ({ ...entry, rank: index + 1 }));
      return entries.value;
    } finally {
      isLoading.value = false;
    }
  }

  return { entries, isLoading, refresh };
}
