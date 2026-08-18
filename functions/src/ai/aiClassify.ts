import { Firestore, DocumentSnapshot } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getGenaiClient, callJsonMode, geminiApiKey } from './genaiClient';
import { findExactMatch, findFuzzyMatch } from './dedupMatch';
import { StagingItem } from '../types/models';

interface ClassificationResult {
  kind: string;
  category: string;
  active: boolean;
  confidence: number;
}

function isValidClassification(x: any): x is ClassificationResult {
  return (
    typeof x?.kind === 'string' &&
    typeof x?.category === 'string' &&
    typeof x?.active === 'boolean' &&
    typeof x?.confidence === 'number'
  );
}

export async function classifyStagingItem(genai: GoogleGenAI, stagingItem: Pick<StagingItem, 'rawLabel' | 'rawCategory'>): Promise<ClassificationResult> {
  const systemPrompt = `Classify a subscription/tool. Respond in JSON: { "kind": one of "app"|"subscription"|"dev_tool"|"service"|"hardware"|"other", "category": one of "writing"|"coding"|"communication"|"design"|"productivity"|"media"|"finance"|"utilities"|"other", "active": boolean (is this a real recurring cost, not a one-off), "confidence": number 0-1 }`;
  const userPrompt = `Name: "${stagingItem.rawLabel}"\nCategory hint: "${stagingItem.rawCategory ?? 'none'}"`;

  const parsed = await callJsonMode(genai, systemPrompt, userPrompt);
  if (!isValidClassification(parsed)) {
    throw new Error('Malformed classification response from AI');
  }
  return parsed;
}

export async function processStagingItem(genai: GoogleGenAI, db: Firestore, doc: DocumentSnapshot): Promise<void> {
  const data = doc.data() as StagingItem;

  let suggestedMatch: string | null = null;
  let suggestionConfidence: string | null = null;

  if (data.rawIdentity) {
    const exact = await findExactMatch(db, data.createdBy, data.rawIdentity);
    if (exact) {
      suggestedMatch = exact.id;
      suggestionConfidence = 'high';
    }
  }
  if (!suggestedMatch) {
    const fuzzy = await findFuzzyMatch(genai, db, data.createdBy, data.rawLabel);
    if (fuzzy) {
      suggestedMatch = fuzzy.id;
      suggestionConfidence = fuzzy.confidence;
    }
  }

  const classification = await classifyStagingItem(genai, data);

  await doc.ref.update({
    suggestedMatch,
    suggestionConfidence,
    classifiedKind: classification.kind,
    classifiedCategory: classification.category,
    classifiedActive: classification.active,
    classifiedConfidence: classification.confidence,
    resolved: false, // stays false until the user approves/ignores in the Staging screen
    classifiedAt: new Date().toISOString(), // marks successful classification so the retry sweep skips this item
  });

  // Backfill registryItemId on the observation this staging item originated
  // from, so usage data becomes queryable by item once a match is resolved.
  // Without this, ingest.ts's hardcoded registryItemId: null is never corrected.
  if (suggestedMatch) {
    const observations = await db
      .collection('observations')
      .where('stagingItemId', '==', doc.id)
      .get();
    for (const obsDoc of observations.docs) {
      await obsDoc.ref.update({ registryItemId: suggestedMatch });
    }
  }
}

export const aiClassify = onDocumentCreated(
  // A staging item can involve two sequential Gemini calls (fuzzy match +
  // classify), each with its own retry-on-429 backoff — default 60s isn't
  // enough headroom when a device sync fans out many staging items at once.
  { document: 'stagingItems/{stagingItemId}', secrets: [geminiApiKey], timeoutSeconds: 120 },
  async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;
  const genai = getGenaiClient();
  const db = snapshot.ref.firestore;
  try {
    await processStagingItem(genai, db, snapshot);
  } catch (e) {
    console.error(`aiClassify failed for staging item ${snapshot.id}:`, e);
    // Leave resolved: false unmodified — Task 6's daily sweep will retry.
  }
});
