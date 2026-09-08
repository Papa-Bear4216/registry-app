import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { handleIngest } from './ingest/ingest';
import { aiClassify } from './ai/aiClassify';
import { gmailScan } from './gmail/gmailScan';
import { dormancyCheck } from './scheduled/dormancyCheck';
import { deadMoneyAlert } from './scheduled/deadMoneyAlert';
import { weeklyDigest } from './scheduled/weeklyDigest';
import { aiSuggest } from './ai/aiSuggest';
import { aiRank } from './ai/aiRank';
import { lifecycleSweep } from './scheduled/lifecycleSweep';

admin.initializeApp();

export const ingest = onRequest(async (req, res) => {
  await handleIngest(admin.firestore(), req, res);
});

export const exportCandidates = onRequest(async (req, res) => {
  const { verifyIdToken } = await import('./lib/auth');
  const { exportCandidatePool, LifecycleTier, PatternKind, TaskCategory } = await import('@registry/pattern-analyzer');
  let uid: string;
  try {
    uid = await verifyIdToken(req.headers.authorization as string | undefined);
  } catch (e) {
    res.status(401).json({ error: e instanceof Error ? e.message : 'Unauthorized' });
    return;
  }

  const db = admin.firestore();
  const snapshot = await db.collection('registryItems').where('createdBy', '==', uid).get();
  const now = new Date();
  const patterns = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || 'Untitled Pattern',
      description: data.description || '',
      kind: data.kind || PatternKind.ShortcutCandidate,
      taskCategory: data.taskCategory || TaskCategory.Productivity,
      tier: (data.status as any) || LifecycleTier.Candidate,
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

  const exportResult = exportCandidatePool(patterns, undefined, now);
  res.status(200).json(exportResult);
});

export { aiClassify };
export { gmailScan };
export { dormancyCheck, deadMoneyAlert, weeklyDigest };
export { aiSuggest, aiRank };
export { lifecycleSweep };
