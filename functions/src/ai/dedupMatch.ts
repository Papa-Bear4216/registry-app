import { Firestore } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import { MatchConfidence } from '../types/enums';
import { callJsonMode } from './openaiClient';

export async function findExactMatch(
  db: Firestore,
  uid: string,
  canonicalIdentity: string
): Promise<{ id: string } | null> {
  const result = await db
    .collection('registryItems')
    .where('createdBy', '==', uid)
    .where('canonicalIdentity', '==', canonicalIdentity)
    .limit(1)
    .get();
  if (result.empty) return null;
  return { id: result.docs[0].id };
}

export async function findFuzzyMatch(
  openai: OpenAI,
  db: Firestore,
  uid: string,
  rawLabel: string
): Promise<{ id: string; confidence: MatchConfidence } | null> {
  const existing = await db.collection('registryItems').where('createdBy', '==', uid).get();
  const candidates = existing.docs.map((d) => ({ id: d.id, name: (d.data() as any).name }));

  const systemPrompt = `You match a newly discovered subscription/tool name against a user's existing registry. Respond in JSON: { "suggestedMatchId": string | null, "confidence": "low" | "confirmed" }. Return null if no candidate plausibly refers to the same tool.`;
  const userPrompt = `New item: "${rawLabel}"\nExisting registry: ${JSON.stringify(candidates)}`;

  const parsed = (await callJsonMode(openai, systemPrompt, userPrompt)) as {
    suggestedMatchId: string | null;
    confidence: 'low' | 'confirmed';
  };

  if (!parsed.suggestedMatchId) return null;
  return {
    id: parsed.suggestedMatchId,
    confidence: parsed.confidence === 'confirmed' ? MatchConfidence.Confirmed : MatchConfidence.Low,
  };
}
