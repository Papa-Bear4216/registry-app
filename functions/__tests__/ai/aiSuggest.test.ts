import { generateSuggestions } from '../../src/ai/aiSuggest';

test('parses a well-formed suggestion array and writes one suggestion doc per entry', async () => {
  const created: any[] = [];
  const fakeDb: any = {
    collection: () => ({
      where: () => ({ get: async () => ({ docs: [{ id: 'item-1', data: () => ({ name: 'Hulu', cost: 15 }) }] }) }),
      add: async (data: any) => { created.push(data); return { id: 'suggestion-1' }; },
    }),
  };
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify([{ itemId: 'item-1', suggestedAction: 'cut', suggestedAlternativeId: null, reason: 'Unused for 45 days' }]) } }],
    }) } },
  };

  const count = await generateSuggestions(fakeOpenai, fakeDb, 'alice');

  expect(count).toBe(1);
  expect(created).toHaveLength(1);
  expect(created[0].item).toBe('item-1');
  expect(created[0].suggestedAction).toBe('cut');
  expect(created[0].createdBy).toBe('alice');
});

test('throws on a malformed suggestion response (not an array) and does not partial-write', async () => {
  const created: any[] = [];
  const fakeDb: any = {
    collection: () => ({
      where: () => ({ get: async () => ({ docs: [{ id: 'item-1', data: () => ({ name: 'Hulu', cost: 15 }) }] }) }),
      add: async (data: any) => { created.push(data); return { id: 'suggestion-1' }; },
    }),
  };
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify({ notAnArray: true }) } }],
    }) } },
  };
  await expect(generateSuggestions(fakeOpenai, fakeDb, 'alice')).rejects.toThrow();
  expect(created).toHaveLength(0);
});
