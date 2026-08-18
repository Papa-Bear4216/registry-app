import { ApiError, GoogleGenAI } from '@google/genai';
import { defineSecret } from 'firebase-functions/params';

export const geminiApiKey = defineSecret('GEMINI_API_KEY');

const MODEL = 'gemini-3.6-flash';

// Free tier caps at 5 requests/minute per model — a single device sync can
// create one staging item per installed app, all triggering aiClassify
// nearly simultaneously, so 429s here are the expected common case, not a
// rare edge. Retry with backoff instead of dropping the classification.
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1500;

let client: GoogleGenAI | null = null;

export function getGenaiClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callJsonMode(
  genai: GoogleGenAI,
  systemPrompt: string,
  userPrompt: string
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await genai.models.generateContent({
        model: MODEL,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
        },
      });
      const content = response.text;
      if (!content) throw new Error('Empty Gemini response');
      return JSON.parse(content);
    } catch (e) {
      lastError = e;
      const isRateLimited = e instanceof ApiError && e.status === 429;
      if (!isRateLimited || attempt === MAX_RETRIES) throw e;
      // Exponential backoff with jitter, so a batch of items retrying
      // together doesn't re-collide on the same window.
      const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * 1000;
      await sleep(delay);
    }
  }
  throw lastError;
}
