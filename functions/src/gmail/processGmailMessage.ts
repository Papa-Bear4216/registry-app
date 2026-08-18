import { GoogleGenAI } from '@google/genai';
import { callJsonMode } from '../ai/genaiClient';

interface ExtractionResponse {
  rawLabel: string | null;
  rawCategory: string | null;
}

function isValidExtractionResponse(x: any): x is ExtractionResponse {
  return (
    typeof x === 'object' &&
    x !== null &&
    (x.rawLabel === null || typeof x.rawLabel === 'string') &&
    (x.rawCategory === null || typeof x.rawCategory === 'string')
  );
}

export async function extractReceiptFromMessage(
  genai: GoogleGenAI,
  subject: string,
  body: string
): Promise<{ rawLabel: string; rawCategory: string | null } | null> {
  const systemPrompt = `Determine if this email is a subscription/tool billing receipt. Respond in JSON: { "rawLabel": string | null, "rawCategory": string | null }. Set both to null if this is not actually a subscription receipt (e.g. a newsletter, a one-time purchase, spam).`;
  const userPrompt = `Subject: ${subject}\nBody: ${body.slice(0, 2000)}`;

  const parsed = await callJsonMode(genai, systemPrompt, userPrompt);
  if (!isValidExtractionResponse(parsed)) {
    throw new Error('Malformed extraction response from AI');
  }

  if (!parsed.rawLabel) return null;
  return { rawLabel: parsed.rawLabel, rawCategory: parsed.rawCategory };
}
