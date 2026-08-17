import { findExactMatch, findFuzzyMatch } from '../../src/ai/dedupMatch';
import { MatchConfidence } from '../../src/types/enums';

function makeFakeDb(matches: any[] = []) {
  return {
    collection: () => ({
      where: () => ({
        where: () => ({
          limit: () => ({
            get: async () => ({
              empty: matches.length === 0,
              docs: matches.map((m) => ({ id: m.id })),
            }),
          }),
        }),
      }),
    }),
  };
}

test('findExactMatch returns the matching registryItem id when canonicalIdentity matches', async () => {
  const db: any = makeFakeDb([{ id: 'item-1' }]);
  const result = await findExactMatch(db, 'alice', 'com.netflix.mediaclient');
  expect(result).toEqual({ id: 'item-1' });
});

test('findExactMatch returns null when no canonicalIdentity matches', async () => {
  const db: any = makeFakeDb([]);
  const result = await findExactMatch(db, 'alice', 'com.unknown.app');
  expect(result).toBeNull();
});

test('findFuzzyMatch returns a confidence-scored match from the AI response', async () => {
  const db: any = { collection: () => ({ where: () => ({ get: async () => ({ docs: [{ id: 'item-2', data: () => ({ name: 'Netflix' }) }] }) }) }) };
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify({ suggestedMatchId: 'item-2', confidence: 'confirmed' }) } }],
    }) } },
  };
  const result = await findFuzzyMatch(fakeOpenai, db, 'alice', 'Netflix.com');
  expect(result).toEqual({ id: 'item-2', confidence: MatchConfidence.Confirmed });
});

test('findFuzzyMatch returns null when the AI finds no plausible match', async () => {
  const db: any = { collection: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }) };
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify({ suggestedMatchId: null, confidence: 'low' }) } }],
    }) } },
  };
  const result = await findFuzzyMatch(fakeOpenai, db, 'alice', 'Some Obscure Tool');
  expect(result).toBeNull();
});

test('findFuzzyMatch throws on a malformed AI response (missing confidence)', async () => {
  const db: any = { collection: () => ({ where: () => ({ get: async () => ({ docs: [{ id: 'item-2', data: () => ({ name: 'Netflix' }) }] }) }) }) };
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify({ suggestedMatchId: 'item-2' }) } }],
    }) } },
  };
  await expect(findFuzzyMatch(fakeOpenai, db, 'alice', 'Netflix.com')).rejects.toThrow(
    'Malformed fuzzy-match response from AI'
  );
});

test('findFuzzyMatch throws on a malformed AI response (invalid confidence value)', async () => {
  const db: any = { collection: () => ({ where: () => ({ get: async () => ({ docs: [{ id: 'item-2', data: () => ({ name: 'Netflix' }) }] }) }) }) };
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify({ suggestedMatchId: 'item-2', confidence: 'maybe' }) } }],
    }) } },
  };
  await expect(findFuzzyMatch(fakeOpenai, db, 'alice', 'Netflix.com')).rejects.toThrow(
    'Malformed fuzzy-match response from AI'
  );
});

test('findFuzzyMatch returns null when the AI hallucinates an id not among the candidates', async () => {
  const db: any = { collection: () => ({ where: () => ({ get: async () => ({ docs: [{ id: 'item-2', data: () => ({ name: 'Netflix' }) }] }) }) }) };
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify({ suggestedMatchId: 'item-99', confidence: 'confirmed' }) } }],
    }) } },
  };
  const result = await findFuzzyMatch(fakeOpenai, db, 'alice', 'Netflix.com');
  expect(result).toBeNull();
});
