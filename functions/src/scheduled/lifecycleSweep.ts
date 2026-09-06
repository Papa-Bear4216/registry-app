import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Firestore } from 'firebase-admin/firestore';
import {
  handleNightlySweep,
  WorkflowPattern,
  LifecycleTier,
  PatternKind,
  TaskCategory,
} from '@registry/pattern-analyzer';

export async function runLifecycleSweep(
  db: Firestore,
  now: Date = new Date()
): Promise<{ updatedCount: number; monthlyReviewCount: number }> {
  const snapshot = await db.collection('registryItems').get();
  if (snapshot.empty) {
    return { updatedCount: 0, monthlyReviewCount: 0 };
  }

  const patterns: WorkflowPattern[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || 'Untitled Pattern',
      description: data.description || '',
      kind: data.kind || PatternKind.ShortcutCandidate,
      taskCategory: data.taskCategory || TaskCategory.Productivity,
      tier: (data.status as LifecycleTier) || LifecycleTier.Keep,
      tierEnteredAt: data.tierEnteredAt || data.createdAt || now.toISOString(),
      keepClockExpiresAt: data.keepClockExpiresAt || null,
      reusabilityCount: data.reusabilityCount || 0,
      promotionScore: data.promotionScore || 0,
      lastObservedAt: data.lastObservedAt || data.createdAt || now.toISOString(),
      lastExecutedAt: data.lastExecutedAt || null,
      timesPrompted: data.timesPrompted || 0,
      timesAccepted: data.timesAccepted || 0,
      timesDismissed: data.timesDismissed || 0,
      reviewReason: data.reviewReason || null,
      triggerSignature: data.triggerSignature || { sourceApps: [] },
      suggestedAction: data.suggestedAction,
      createdBy: data.createdBy,
      createdAt: data.createdAt || now.toISOString(),
      updatedAt: data.updatedAt || now.toISOString(),
    };
  });

  const { updatedPatterns, monthlyReviewItems } = handleNightlySweep(patterns, now);

  const batch = db.batch();
  let updatedCount = 0;

  for (const updated of updatedPatterns) {
    const docRef = db.collection('registryItems').doc(updated.id);
    batch.update(docRef, {
      status: updated.tier,
      tierEnteredAt: updated.tierEnteredAt,
      keepClockExpiresAt: updated.keepClockExpiresAt,
      reviewReason: updated.reviewReason ?? null,
      reusabilityCount: updated.reusabilityCount,
      promotionScore: updated.promotionScore,
      updatedAt: now.toISOString(),
    });
    updatedCount++;
  }

  await batch.commit();

  let monthlyReviewCount = 0;
  if (monthlyReviewItems.length > 0) {
    const yearMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const reviewBatchRef = db.collection('monthlyReviews').doc(yearMonth);
    await reviewBatchRef.set(
      {
        yearMonth,
        itemCount: monthlyReviewItems.length,
        items: monthlyReviewItems.map((item: WorkflowPattern) => ({
          id: item.id,
          name: item.name,
          tier: item.tier,
          reviewReason: item.reviewReason,
          reusabilityCount: item.reusabilityCount,
          lastExecutedAt: item.lastExecutedAt,
          createdBy: item.createdBy,
        })),
        updatedAt: now.toISOString(),
      },
      { merge: true }
    );
    monthlyReviewCount = monthlyReviewItems.length;
  }

  return { updatedCount, monthlyReviewCount };
}

export const lifecycleSweep = onSchedule('every day 04:00', async () => {
  const admin = await import('firebase-admin');
  const db = admin.firestore();
  await runLifecycleSweep(db);
});
