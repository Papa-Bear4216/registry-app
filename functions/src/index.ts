import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { handleIngest } from './ingest/ingest';
import { aiClassify } from './ai/aiClassify';

admin.initializeApp();

export const ingest = onRequest(async (req, res) => {
  await handleIngest(admin.firestore(), req, res);
});

export { aiClassify };
