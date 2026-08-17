import { Firestore, DocumentSnapshot } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getOpenAIClient } from '../ai/openaiClient';
import { processStagingItem } from '../ai/aiClassify';

type ProcessFn = (openai: OpenAI, db: Firestore, doc: DocumentSnapshot) => Promise<void>;

const BATCH_SIZE = 50;

export async function runRetrySweep(openai: OpenAI, db: Firestore, processFn: ProcessFn = processStagingItem): Promise<void> {
  const stuck = await db
    .collection('stagingItems')
    .where('resolved', '==', false)
    .where('classifiedAt', '==', null)
    .limit(BATCH_SIZE)
    .get();

  if (stuck.docs.length === BATCH_SIZE) {
    console.warn(
      `dormancyCheck retry sweep hit the ${BATCH_SIZE}-item batch cap — backlog may exceed this run's capacity and will continue next scheduled run.`
    );
  }

  for (const doc of stuck.docs) {
    try {
      await processFn(openai, db, doc);
    } catch (e) {
      console.error(`Retry sweep failed for staging item ${doc.id}:`, e);
    }
  }
}

export const dormancyCheck = onSchedule(
  { schedule: 'every day 03:00', timeoutSeconds: 300 },
  async () => {
    const admin = await import('firebase-admin');
    const db = admin.firestore();
    const openai = getOpenAIClient();
    // Dormancy itself is derived client-side at read time (per the base spec's
    // "never store dormant as a field" rule) — this scheduled job's own
    // responsibility is solely the staging retry sweep. A future deadMoneyAlert
    // run (Task 4, next) is what actually needs a server-side dormancy check.
    await runRetrySweep(openai, db);
  }
);
