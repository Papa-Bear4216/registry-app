import { Firestore, DocumentSnapshot } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getOpenAIClient } from '../ai/openaiClient';
import { processStagingItem } from '../ai/aiClassify';

type ProcessFn = (openai: OpenAI, db: Firestore, doc: DocumentSnapshot) => Promise<void>;

export async function runRetrySweep(openai: OpenAI, db: Firestore, processFn: ProcessFn = processStagingItem): Promise<void> {
  const stuck = await db.collection('stagingItems').where('resolved', '==', false).get();
  for (const doc of stuck.docs) {
    try {
      await processFn(openai, db, doc);
    } catch (e) {
      console.error(`Retry sweep failed for staging item ${doc.id}:`, e);
    }
  }
}

export const dormancyCheck = onSchedule('every day 03:00', async () => {
  const admin = await import('firebase-admin');
  const db = admin.firestore();
  const openai = getOpenAIClient();
  // Dormancy itself is derived client-side at read time (per the base spec's
  // "never store dormant as a field" rule) — this scheduled job's own
  // responsibility is solely the staging retry sweep. A future deadMoneyAlert
  // run (Task 4, next) is what actually needs a server-side dormancy check.
  await runRetrySweep(openai, db);
});
