import { Firestore } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import { onCall } from 'firebase-functions/v2/https';
import { extractReceiptFromMessage } from './processGmailMessage';
import { CollectorType } from '../types/enums';

interface GmailMessage {
  id: string;
  subject: string;
  snippet: string;
}

interface GmailClient {
  listMessages(query: string): Promise<GmailMessage[]>;
  getMessageBody(messageId: string): Promise<string>;
}

export async function handleGmailScan(
  db: Firestore,
  openai: OpenAI,
  gmailClient: GmailClient,
  uid: string
): Promise<{ stagingItemsCreated: number }> {
  const messages = await gmailClient.listMessages(
    'subject:(receipt OR invoice OR subscription OR billing) newer_than:30d'
  );

  let created = 0;
  for (const message of messages) {
    const body = await gmailClient.getMessageBody(message.id);
    const extracted = await extractReceiptFromMessage(openai, message.subject, body);
    if (!extracted) continue;

    await db.collection('stagingItems').add({
      rawLabel: extracted.rawLabel,
      rawCategory: extracted.rawCategory,
      rawIdentity: null,
      payloadSnapshot: JSON.stringify({ subject: message.subject, snippet: message.snippet }),
      collector: CollectorType.Gmail,
      sourceId: 'gmail',
      capturedAt: new Date().toISOString(),
      suggestedMatch: null,
      suggestionConfidence: null,
      resolved: false,
      resolvedAt: null,
      createdBy: uid,
    });
    created++;
  }

  return { stagingItemsCreated: created };
}

export const gmailScan = onCall(async (request) => {
  if (!request.auth) {
    throw new Error('Unauthenticated');
  }
  // Real Gmail API client construction (OAuth token exchange) is a follow-up
  // implementation detail once the client-side "Scan Gmail" OAuth flow exists —
  // this callable's shape is stable regardless of that client work.
  throw new Error('Gmail client wiring not yet implemented — see plan Task 3 notes');
});
