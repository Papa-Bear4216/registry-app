import OpenAI from 'openai';
import { callJsonMode } from '../ai/openaiClient';

export async function extractReceiptFromMessage(
  openai: OpenAI,
  subject: string,
  body: string
): Promise<{ rawLabel: string; rawCategory: string | null } | null> {
  const systemPrompt = `Determine if this email is a subscription/tool billing receipt. Respond in JSON: { "rawLabel": string | null, "rawCategory": string | null }. Set both to null if this is not actually a subscription receipt (e.g. a newsletter, a one-time purchase, spam).`;
  const userPrompt = `Subject: ${subject}\nBody: ${body.slice(0, 2000)}`;

  const parsed = (await callJsonMode(openai, systemPrompt, userPrompt)) as {
    rawLabel: string | null;
    rawCategory: string | null;
  };

  if (!parsed.rawLabel) return null;
  return { rawLabel: parsed.rawLabel, rawCategory: parsed.rawCategory };
}
