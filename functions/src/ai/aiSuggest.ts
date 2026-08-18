import { Firestore } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getGenaiClient, callJsonMode, geminiApiKey } from './genaiClient';

interface SuggestionEntry {
  itemId: string;
  suggestedAction: string;
  suggestedAlternativeId: string | null;
  reason: string;
}

interface SuggestionResponse {
  suggestions: SuggestionEntry[];
}

function isValidSuggestionResponse(x: any): x is SuggestionResponse {
  return (
    x !== null &&
    typeof x === 'object' &&
    Array.isArray(x.suggestions) &&
    x.suggestions.every(
      (entry: any) =>
        typeof entry?.itemId === 'string' &&
        typeof entry?.suggestedAction === 'string' &&
        (entry?.suggestedAlternativeId === null || typeof entry?.suggestedAlternativeId === 'string') &&
        typeof entry?.reason === 'string'
    )
  );
}

export async function generateSuggestions(genai: GoogleGenAI, db: Firestore, uid: string): Promise<number> {
  const items = await db.collection('registryItems').where('createdBy', '==', uid).get();
  const registrySummary = items.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const systemPrompt = `You are a spend-optimization assistant. Given a user's subscription registry, identify wasteful/redundant items. Respond in JSON as an object: { "suggestions": [{ "itemId": string, "suggestedAction": "cut"|"consolidate"|"investigate", "suggestedAlternativeId": string | null, "reason": string }] }. Only include items worth flagging — an empty array is a valid response.`;
  const userPrompt = `Registry: ${JSON.stringify(registrySummary)}`;

  const parsed = await callJsonMode(genai, systemPrompt, userPrompt);
  if (!isValidSuggestionResponse(parsed)) {
    throw new Error('Malformed suggestion response from AI');
  }
  const suggestions = parsed.suggestions;

  for (const entry of suggestions) {
    await db.collection('suggestions').add({
      item: entry.itemId,
      suggestedAction: entry.suggestedAction,
      suggestedAlternative: entry.suggestedAlternativeId,
      suggestionText: entry.reason,
      response: null,
      reason: entry.reason,
      shownAt: new Date().toISOString(),
      respondedAt: null,
      dismissedForever: false,
      createdBy: uid,
    });
  }

  return suggestions.length;
}

export const aiSuggest = onSchedule({ schedule: 'every monday 08:00', secrets: [geminiApiKey] }, async () => {
  // Runs per-user in a real multi-user deployment — for this single-user app,
  // iterating all distinct createdBy values in registryItems is sufficient;
  // a users collection isn't part of this data model. Left as an
  // implementation-time detail: query distinct createdBy values, call
  // generateSuggestions(genai, db, uid) for each.
});
