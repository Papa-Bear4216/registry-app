import { Firestore } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import { MatchConfidence } from '../types/enums';
import { callJsonMode } from './genaiClient';

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

interface FuzzyMatchResponse {
  suggestedMatchId: string | null;
  confidence: 'low' | 'confirmed';
}

function isValidFuzzyMatchResponse(x: any): x is FuzzyMatchResponse {
  return (
    typeof x === 'object' &&
    x !== null &&
    (x.suggestedMatchId === null || typeof x.suggestedMatchId === 'string') &&
    (x.confidence === 'low' || x.confidence === 'confirmed')
  );
}

export async function findFuzzyMatch(
  genai: GoogleGenAI,
  db: Firestore,
  uid: string,
  rawLabel: string
): Promise<{ id: string; confidence: MatchConfidence } | null> {
  const existing = await db.collection('registryItems').where('createdBy', '==', uid).get();
  const candidates = existing.docs.map((d) => ({ id: d.id, name: (d.data() as any).name }));

  const systemPrompt = `You match a newly discovered subscription/tool name against a user's existing registry. Respond in JSON: { "suggestedMatchId": string | null, "confidence": "low" | "confirmed" }. Return null if no candidate plausibly refers to the same tool.`;
  const userPrompt = `New item: "${rawLabel}"\nExisting registry: ${JSON.stringify(candidates)}`;

  const parsed = await callJsonMode(genai, systemPrompt, userPrompt);
  if (!isValidFuzzyMatchResponse(parsed)) {
    throw new Error('Malformed fuzzy-match response from AI');
  }

  if (!parsed.suggestedMatchId) return null;

  // Guard against the AI hallucinating an id that wasn't among the candidates sent to it.
  if (!candidates.some((c) => c.id === parsed.suggestedMatchId)) return null;

  return {
    id: parsed.suggestedMatchId,
    confidence: parsed.confidence === 'confirmed' ? MatchConfidence.Confirmed : MatchConfidence.Low,
  };
}
