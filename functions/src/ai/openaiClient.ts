import OpenAI from 'openai';

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
    client = new OpenAI({ apiKey });
  }
  return client;
}

export async function callJsonMode(
  openai: OpenAI,
  systemPrompt: string,
  userPrompt: string
): Promise<unknown> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty OpenAI response');
  return JSON.parse(content);
}
