import { Firestore } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import { onCall } from 'firebase-functions/v2/https';
import { callJsonMode } from './openaiClient';

interface RankingResult {
  orderedItemIds: string[];
  bestItemId: string;
}

function isValidRanking(x: any): x is RankingResult {
  return Array.isArray(x?.orderedItemIds) && typeof x?.bestItemId === 'string';
}

export async function rankCategory(openai: OpenAI, db: Firestore, uid: string, taskCategory: string): Promise<void> {
  const items = await db
    .collection('registryItems')
    .where('createdBy', '==', uid)
    .where('taskCategories', 'array-contains', taskCategory)
    .get();

  const candidates = items.docs.map((d) => ({ id: d.id, name: (d.data() as any).name }));
  if (candidates.length === 0) return;

  const systemPrompt = `Rank these tools for the "${taskCategory}" task category, best first. Respond in JSON: { "orderedItemIds": string[], "bestItemId": string }`;
  const userPrompt = `Candidates: ${JSON.stringify(candidates)}`;

  const parsed = await callJsonMode(openai, systemPrompt, userPrompt);
  if (!isValidRanking(parsed)) {
    throw new Error('Malformed ranking response from AI');
  }

  await db.collection('taskRankings').add({
    taskCategory,
    orderedItems: parsed.orderedItemIds,
    lastRankedAt: new Date().toISOString(),
    manuallyOverridden: false,
    overrideNote: null,
    createdBy: uid,
  });

  for (const doc of items.docs) {
    await doc.ref.update({ isBestForTask: doc.id === parsed.bestItemId });
  }
}

export const aiRank = onCall(async (request) => {
  if (!request.auth) {
    throw new Error('Unauthenticated');
  }
  const { taskCategory } = request.data as { taskCategory: string };
  if (typeof taskCategory !== 'string') {
    throw new Error('Missing taskCategory');
  }
  const admin = await import('firebase-admin');
  const { getOpenAIClient } = await import('./openaiClient');
  await rankCategory(getOpenAIClient(), admin.firestore(), request.auth.uid, taskCategory);
});
