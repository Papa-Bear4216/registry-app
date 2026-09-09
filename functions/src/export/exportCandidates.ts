import { Firestore } from 'firebase-admin/firestore';
import { Request } from 'firebase-functions/v2/https';
import { Response } from 'express';
import { verifyIdToken } from '../lib/auth';
import {
  exportCandidatePool,
  LifecycleTier,
  PatternKind,
  TaskCategory,
  WorkflowPattern,
} from '@registry/pattern-analyzer';

export async function handleExportCandidates(
  db: Firestore,
  req: Request,
  res: Response
): Promise<void> {
  if (req.method && req.method.toUpperCase() !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  let uid: string;
  try {
    uid = await verifyIdToken(req.headers.authorization as string | undefined);
  } catch (e) {
    res.status(401).json({ error: e instanceof Error ? e.message : 'Unauthorized' });
    return;
  }

  const capacityParam = req.query.capacity;
  let capacity: number | undefined;
  if (typeof capacityParam === 'string' || typeof capacityParam === 'number') {
    const parsed = parseInt(String(capacityParam), 10);
    if (!isNaN(parsed) && parsed > 0) {
      capacity = Math.min(parsed, 100);
    }
  }

  const snapshot = await db
    .collection('registryItems')
    .where('createdBy', '==', uid)
    .where('status', '==', 'candidate')
    .get();
  const now = new Date();
  const patterns: WorkflowPattern[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    const rawTier = data.tier || data.status;
    const tier =
      rawTier === 'candidate' || rawTier === LifecycleTier.Candidate
        ? LifecycleTier.Candidate
        : (rawTier as LifecycleTier) || LifecycleTier.Candidate;

    return {
      id: doc.id,
      name: data.name || 'Untitled Pattern',
      description: data.description || '',
      kind: (data.kind as PatternKind) || PatternKind.ShortcutCandidate,
      taskCategory: (data.taskCategory as TaskCategory) || TaskCategory.Productivity,
      tier,
      tierEnteredAt: data.tierEnteredAt || data.createdAt || now.toISOString(),
      keepClockExpiresAt: data.keepClockExpiresAt || null,
      reusabilityCount: data.reusabilityCount || 0,
      promotionScore: typeof data.promotionScore === 'number' ? data.promotionScore : 0,
      lastObservedAt: data.lastObservedAt || data.createdAt || now.toISOString(),
      lastExecutedAt: data.lastExecutedAt || null,
      timesPrompted: data.timesPrompted || 0,
      timesAccepted: data.timesAccepted || 0,
      timesDismissed: data.timesDismissed || 0,
      reviewReason: data.reviewReason || null,
      triggerSignature: data.triggerSignature || { sourceApps: [] },
      suggestedAction: data.suggestedAction,
      createdBy: data.createdBy || uid,
      createdAt: data.createdAt || now.toISOString(),
      updatedAt: data.updatedAt || now.toISOString(),
    };
  });

  const exportResult = exportCandidatePool(patterns, capacity, now);
  res.status(200).json(exportResult);
}
