// src/composables/useWeakAreaEngine.ts
// Analyzes historical IndexedDB test responses to extract weak topics and
// suggest targeted practice quizzes + revision videos.

import { ref, computed, type Ref } from 'vue';
import { db } from '../db';
import type { TopicMastery, WeakAreaRecommendation, UserResponse } from '../types/healthApp';

/* -------------------------------------------------------------------------- */
/*  Tunables                                                                   */
/* -------------------------------------------------------------------------- */

const WEAK_THRESHOLD = 50; // accuracy % below this => "weak"
const DEVELOPING_THRESHOLD = 75; // accuracy % below this (and >= WEAK) => "developing"
const MIN_ATTEMPTS_FOR_CONFIDENCE = 3; // don't flag a topic weak on 1 lucky/unlucky guess
const RECOMMENDED_QUESTIONS_PER_TOPIC = 10;

/* -------------------------------------------------------------------------- */
/*  Composable                                                                 */
/* -------------------------------------------------------------------------- */

export function useWeakAreaEngine(userId: Ref<string | null> | string | null) {
  const isAnalyzing = ref(false);
  const error = ref<string | null>(null);
  const topicMastery = ref<TopicMastery[]>([]);
  const recommendations = ref<WeakAreaRecommendation[]>([]);

  function resolveUserId(): string | null {
    return typeof userId === 'string' || userId === null ? userId : userId.value;
  }

  const weakTopics = computed(() => topicMastery.value.filter((t) => t.masteryLevel === 'weak'));
  const developingTopics = computed(() => topicMastery.value.filter((t) => t.masteryLevel === 'developing'));
  const strongTopics = computed(() => topicMastery.value.filter((t) => t.masteryLevel === 'strong'));

  const overallAccuracyPercent = computed(() => {
    const total = topicMastery.value.reduce((sum, t) => sum + t.totalAttempts, 0);
    const correct = topicMastery.value.reduce((sum, t) => sum + t.correctAttempts, 0);
    return total > 0 ? Math.round((correct / total) * 100) : 0;
  });

  /**
   * Classifies mastery level, but treats low-attempt topics as "developing"
   * at worst — we shouldn't scare a student with "weak" off a single miss.
   */
  function classify(accuracyPercent: number, totalAttempts: number): TopicMastery['masteryLevel'] {
    if (totalAttempts < MIN_ATTEMPTS_FOR_CONFIDENCE) {
      return accuracyPercent < WEAK_THRESHOLD ? 'developing' : 'strong';
    }
    if (accuracyPercent < WEAK_THRESHOLD) return 'weak';
    if (accuracyPercent < DEVELOPING_THRESHOLD) return 'developing';
    return 'strong';
  }

  /**
   * Pulls every graded response for the user from IndexedDB and aggregates
   * accuracy per topic.
   */
  async function analyze(): Promise<TopicMastery[]> {
    const uidVal = resolveUserId();
    if (!uidVal) {
      topicMastery.value = [];
      return [];
    }

    isAnalyzing.value = true;
    error.value = null;

    try {
      const responses: UserResponse[] = await db.user_responses
        .where('userId')
        .equals(uidVal)
        .and((r) => r.isCorrect !== null)
        .toArray();

      const byTopic = new Map<
        string,
        { subjectId: string; total: number; correct: number; lastAt: string | null }
      >();

      for (const r of responses) {
        const agg = byTopic.get(r.topicId) ?? { subjectId: r.subjectId, total: 0, correct: 0, lastAt: null };
        agg.total += 1;
        if (r.isCorrect) agg.correct += 1;
        if (r.answeredAt && (!agg.lastAt || r.answeredAt > agg.lastAt)) agg.lastAt = r.answeredAt;
        byTopic.set(r.topicId, agg);
      }

      const results: TopicMastery[] = [];
      for (const [topicId, agg] of byTopic.entries()) {
        const topic = await db.topics.get(topicId);
        const accuracyPercent = agg.total > 0 ? Math.round((agg.correct / agg.total) * 100) : 0;
        results.push({
          topicId,
          topicPath: topic?.parentTopicPath ?? 'Unknown Topic',
          subjectId: agg.subjectId,
          totalAttempts: agg.total,
          correctAttempts: agg.correct,
          accuracyPercent,
          lastAttemptedAt: agg.lastAt,
          masteryLevel: classify(accuracyPercent, agg.total),
        });
      }

      // Weakest first so the dashboard widget can just take(N)
      topicMastery.value = results.sort((a, b) => a.accuracyPercent - b.accuracyPercent);
      return topicMastery.value;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to analyze performance history';
      return [];
    } finally {
      isAnalyzing.value = false;
    }
  }

  /**
   * Builds concrete, actionable recommendations for each weak topic:
   * a fresh batch of practice questions the user hasn't necessarily seen
   * before, plus any linked revision videos for that topic.
   */
  async function buildRecommendations(limitTopics = 5): Promise<WeakAreaRecommendation[]> {
    const uidVal = resolveUserId();
    if (!uidVal) {
      recommendations.value = [];
      return [];
    }

    const targets = weakTopics.value.length > 0 ? weakTopics.value : developingTopics.value;
    const chosen = targets.slice(0, limitTopics);

    const built: WeakAreaRecommendation[] = [];

    for (const topic of chosen) {
      const candidateQuestions = await db.questions
        .where('topicId')
        .equals(topic.topicId)
        .toArray();

      const previouslySeenIds = new Set(
        (
          await db.user_responses
            .where('userId')
            .equals(uidVal)
            .and((r) => r.topicId === topic.topicId)
            .toArray()
        ).map((r) => r.questionId)
      );

      // Prefer unseen questions first, then fall back to seen ones so we
      // always have something to recommend even on a small question bank.
      const unseen = candidateQuestions.filter((q) => !previouslySeenIds.has(q.id));
      const seen = candidateQuestions.filter((q) => previouslySeenIds.has(q.id));
      const orderedQuestionIds = [...unseen, ...seen].slice(0, RECOMMENDED_QUESTIONS_PER_TOPIC).map((q) => q.id);

      const videos = await db.videos.where('topicId').equals(topic.topicId).toArray();

      built.push({
        topic,
        recommendedQuestionIds: orderedQuestionIds,
        recommendedVideoIds: videos.map((v) => v.id),
        reason:
          topic.masteryLevel === 'weak'
            ? `Only ${topic.accuracyPercent}% accuracy across ${topic.totalAttempts} attempts on "${topic.topicPath}" — prioritize this topic.`
            : `${topic.accuracyPercent}% accuracy on "${topic.topicPath}" — a bit more practice will lock this in.`,
      });
    }

    recommendations.value = built;
    return built;
  }

  /**
   * Convenience: runs analyze() then buildRecommendations() in one call,
   * as the dashboard widget typically wants both at once.
   */
  async function refreshAll(limitTopics = 5) {
    await analyze();
    await buildRecommendations(limitTopics);
  }

  return {
    // state
    isAnalyzing,
    error,
    topicMastery,
    recommendations,
    // derived
    weakTopics,
    developingTopics,
    strongTopics,
    overallAccuracyPercent,
    // actions
    analyze,
    buildRecommendations,
    refreshAll,
  };
}
