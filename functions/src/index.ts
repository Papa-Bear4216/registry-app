import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { handleIngest } from './ingest/ingest';
import { aiClassify } from './ai/aiClassify';
import { gmailScan } from './gmail/gmailScan';
import { dormancyCheck } from './scheduled/dormancyCheck';
import { deadMoneyAlert } from './scheduled/deadMoneyAlert';
import { aiSuggest } from './ai/aiSuggest';
import { aiRank } from './ai/aiRank';

admin.initializeApp();

export const ingest = onRequest(async (req, res) => {
  await handleIngest(admin.firestore(), req, res);
});

export { aiClassify };
export { gmailScan };
export { dormancyCheck, deadMoneyAlert };
export { aiSuggest, aiRank };
