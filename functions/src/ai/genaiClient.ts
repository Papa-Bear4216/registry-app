import { GoogleGenAI } from '@google/genai';
import { defineSecret } from 'firebase-functions/params';

export const geminiApiKey = defineSecret('GEMINI_API_KEY');

const MODEL = 'gemini-3.6-flash';

let client: GoogleGenAI | null = null;

export function getGenaiClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export async function callJsonMode(
  genai: GoogleGenAI,
  systemPrompt: string,
  userPrompt: string
): Promise<unknown> {
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
}
