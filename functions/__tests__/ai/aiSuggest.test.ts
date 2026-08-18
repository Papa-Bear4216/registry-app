import { generateSuggestions } from '../../src/ai/aiSuggest';

test('parses a well-formed suggestion array and writes one suggestion doc per entry', async () => {
  const created: any[] = [];
  const fakeDb: any = {
    collection: () => ({
      where: () => ({ get: async () => ({ docs: [{ id: 'item-1', data: () => ({ name: 'Hulu', cost: 15 }) }] }) }),
      add: async (data: any) => { created.push(data); return { id: 'suggestion-1' }; },
    }),
  };
  const fakeGenai: any = {
    models: { generateContent: async () => ({
      text: JSON.stringify({ suggestions: [{ itemId: 'item-1', suggestedAction: 'cut', suggestedAlternativeId: null, reason: 'Unused for 45 days' }] }),
    }) },
  };

  const count = await generateSuggestions(fakeGenai, fakeDb, 'alice');

  expect(count).toBe(1);
  expect(created).toHaveLength(1);
  expect(created[0].item).toBe('item-1');
  expect(created[0].suggestedAction).toBe('cut');
  expect(created[0].createdBy).toBe('alice');
});

test('throws on a malformed suggestion response (bare array, missing the object wrapper) and does not partial-write', async () => {
  const created: any[] = [];
  const fakeDb: any = {
    collection: () => ({
      where: () => ({ get: async () => ({ docs: [{ id: 'item-1', data: () => ({ name: 'Hulu', cost: 15 }) }] }) }),
      add: async (data: any) => { created.push(data); return { id: 'suggestion-1' }; },
    }),
  };
  const fakeGenai: any = {
    models: { generateContent: async () => ({
      text: JSON.stringify([{ itemId: 'item-1', suggestedAction: 'cut', suggestedAlternativeId: null, reason: 'Unused for 45 days' }]),
    }) },
  };
  await expect(generateSuggestions(fakeGenai, fakeDb, 'alice')).rejects.toThrow();
  expect(created).toHaveLength(0);
});

test('throws on a malformed suggestion entry inside a correctly-wrapped response and does not partial-write', async () => {
  const created: any[] = [];
  const fakeDb: any = {
    collection: () => ({
      where: () => ({ get: async () => ({ docs: [{ id: 'item-1', data: () => ({ name: 'Hulu', cost: 15 }) }] }) }),
      add: async (data: any) => { created.push(data); return { id: 'suggestion-1' }; },
    }),
  };
  const fakeGenai: any = {
    models: { generateContent: async () => ({
      text: JSON.stringify({ suggestions: [{ itemId: 123 }] }),
    }) },
  };
  await expect(generateSuggestions(fakeGenai, fakeDb, 'alice')).rejects.toThrow();
  expect(created).toHaveLength(0);
});
