// src/composables/useWeakAreaEngine.ts
import { ref, computed } from 'vue';
import { getDocs, getDoc, collection, doc, query, where } from 'firebase/firestore';
import { firestore } from '../firebase';
import { db as localDb } from '../db/schema';

export interface TopicMasteryEntry {
  topicId: string;
  topicPath: string;
  subjectId: string;
  totalAttempts: number;
  correctAttempts: number;
  accuracyPercent: number;
  masteryLevel: string;
}

export interface WeakAreaRecommendation {
  topicId: string;
  topicPath: string;
  subjectId: string;
  accuracyPercent: number;
  masteryLevel: string;
  recommendedQuestionCount: number;
  recommendedVideoIds: string[];
}

export function useWeakAreaEngine(userId: string | null) {
  const recommendations = ref<WeakAreaRecommendation[]>([]);
  const topicMastery = ref<TopicMasteryEntry[]>([]);
  const isLoading = ref(true);

  const weakTopics = computed(() =>
    topicMastery.value.filter((t) => t.masteryLevel !== 'strong'),
  );
  const strongTopics = computed(() =>
    topicMastery.value.filter((t) => t.masteryLevel === 'strong'),
  );
  const hasWeakAreas = computed(() => recommendations.value.length > 0);

  const overallAccuracyPercent = computed(() => {
    const all = topicMastery.value;
    if (all.length === 0) return 0;
    const total = all.reduce((s: number, t: TopicMasteryEntry) => s + t.totalAttempts, 0);
    const correct = all.reduce((s: number, t: TopicMasteryEntry) => s + t.correctAttempts, 0);
    return total > 0 ? Math.round((correct / total) * 100) : 0;
  });

  async function build() {
    if (!userId) {
      isLoading.value = false;
      return;
    }
    isLoading.value = true;

    // Gather responses from Firestore + local cache
    let responses: any[] = [];
    try {
      const snap = await getDocs(
        query(collection(firestore, 'user_responses'), where('userId', '==', userId)),
      );
      responses = snap.docs.map((d) => d.data());
    } catch { /* offline */ }

    try {
      const local = await localDb.user_responses.where('userId').equals(userId).toArray();
      const ids = new Set(responses.map((r) => r.id));
      for (const lr of local) if (!ids.has(lr.id)) responses.push(lr);
    } catch { /* no cache */ }

    responses = responses.filter((r: any) => r.isCorrect !== null && r.isCorrect !== undefined);

    // Aggregate by topic
    const byTopic = new Map<string, { subjectId: string; total: number; correct: number }>();
    for (const r of responses) {
      const entry = byTopic.get(r.topicId) ?? { subjectId: r.subjectId, total: 0, correct: 0 };
      entry.total += 1;
      if (r.isCorrect) entry.correct += 1;
      byTopic.set(r.topicId, entry);
    }

    // Build mastery + weak recommendations
    const mastery: TopicMasteryEntry[] = [];
    const recs: WeakAreaRecommendation[] = [];

    for (const [topicId, agg] of byTopic.entries()) {
      const accuracyPercent = agg.total > 0 ? Math.round((agg.correct / agg.total) * 100) : 0;
      const level = accuracyPercent < 50 ? 'weak' : accuracyPercent < 75 ? 'developing' : 'strong';

      let topicPath = 'Unknown Topic';
      try {
        const snap = await getDoc(doc(firestore, 'topics', topicId));
        if (snap.exists()) topicPath = (snap.data() as any).parentTopicPath ?? topicPath;
      } catch { /* offline */ }

      mastery.push({
        topicId, topicPath, subjectId: agg.subjectId,
        totalAttempts: agg.total, correctAttempts: agg.correct,
        accuracyPercent, masteryLevel: level,
      });

      if (accuracyPercent < 50) {
        let questionCount = 0;
        try {
          const qSnap = await getDocs(
            query(collection(firestore, 'questions'), where('topicId', '==', topicId)),
          );
          questionCount = qSnap.size;
        } catch { /* offline */ }

        recs.push({
          topicId, topicPath, subjectId: agg.subjectId,
          accuracyPercent,
          masteryLevel: accuracyPercent < 30 ? 'critical' : 'weak',
          recommendedQuestionCount: Math.min(questionCount, 10),
          recommendedVideoIds: [],
        });
      }
    }

    topicMastery.value = mastery.sort((a, b) => a.accuracyPercent - b.accuracyPercent);
    recommendations.value = recs.sort((a, b) => a.accuracyPercent - b.accuracyPercent);
    isLoading.value = false;
  }

  async function analyze() { await build(); }
  async function buildRecommendations() { await build(); }

  return {
    recommendations,
    topicMastery,
    isLoading,
    hasWeakAreas,
    weakTopics,
    strongTopics,
    overallAccuracyPercent,
    build,
    analyze,
    buildRecommendations,
  };
}