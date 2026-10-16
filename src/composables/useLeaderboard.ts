// src/composables/useLeaderboard.ts
import { ref } from 'vue';
import { getDocs, collection, onSnapshot } from 'firebase/firestore';
import { firestore } from '../firebase';
import type { Wallet } from '../types/healthApp';

export interface LeaderboardEntry {
  id: string;
  displayName: string;
  points: number;
  isCurrentUser: boolean;
  rank: number;
}

export function useLeaderboard() {
  const entries = ref<LeaderboardEntry[]>([]);
  const isLoading = ref(true);
  const currentUserName = ref<string>('You');
  let unsubscribe: (() => void) | null = null;

  async function refresh(currentUid: string | null) {
  isLoading.value = true;

  // Load mock entries (public read — always works)
  let mockEntries: { id: string; displayName: string; points: number }[] = [];
  try {
    const mockSnap = await getDocs(collection(firestore, 'leaderboard_mock'));
    mockEntries = mockSnap.docs.map((d) => {
      const m = d.data() as { displayName: string; points: number };
      return { id: d.id, displayName: m.displayName, points: m.points };
    });
  } catch (err) {
    console.warn('[Leaderboard] Mock entries unavailable:', err);
  }

  // Load real users + wallets (may fail for non-admins — that's OK)
  let realEntries: { id: string; displayName: string; points: number }[] = [];
  try {
    const [usersSnap, walletsSnap] = await Promise.all([
      getDocs(collection(firestore, 'users')),
      getDocs(collection(firestore, 'wallets')),
    ]);
    const walletsById = new Map<string, Wallet>(
      walletsSnap.docs.map((d) => [d.id, d.data() as Wallet]),
    );
    realEntries = usersSnap.docs.map((d) => {
      const u = d.data() as { fullName: string };
      const wallet = walletsById.get(d.id);
      return { id: d.id, displayName: u.fullName, points: wallet?.totalEarned ?? 0 };
    });
    if (currentUid) {
      const userDoc = usersSnap.docs.find((d) => d.id === currentUid);
      if (userDoc) currentUserName.value = (userDoc.data() as any).fullName ?? 'You';
    }
  } catch {
    // Student can't read all users — show mock entries only
    console.warn('[Leaderboard] Showing mock entries only (insufficient permissions)');
  }

  const merged = [...mockEntries, ...realEntries]
    .sort((a, b) => b.points - a.points)
    .map((e, idx) => ({ ...e, isCurrentUser: e.id === currentUid, rank: idx + 1 }));

  entries.value = merged;
  isLoading.value = false;
}

  function watch(currentUid: string | null) {
    refresh(currentUid);
    unsubscribe = onSnapshot(collection(firestore, 'leaderboard_mock'), () => refresh(currentUid));
  }

  function stop() {
    unsubscribe?.();
    unsubscribe = null;
  }

  return { entries, isLoading, refresh, watch, stop, currentUserName };
}