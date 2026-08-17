import { rankCategory } from '../../src/ai/aiRank';

test('parses a well-formed ranking and writes a taskRankings doc, sets isBestForTask on the winner', async () => {
  const written: any[] = [];
  const updated: any[] = [];
  const fakeDb: any = {
    collection: (name: string) => ({
      where: () => ({
        where: () => ({ get: async () => ({ docs: [
          { id: 'item-1', data: () => ({ name: 'VS Code' }), ref: { update: async (d: any) => updated.push({ id: 'item-1', ...d }) } },
          { id: 'item-2', data: () => ({ name: 'Sublime' }), ref: { update: async (d: any) => updated.push({ id: 'item-2', ...d }) } },
        ] }) }),
      }),
      add: async (data: any) => { written.push(data); return { id: 'ranking-1' }; },
    }),
  };
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify({ orderedItemIds: ['item-1', 'item-2'], bestItemId: 'item-1' }) } }],
    }) } },
  };

  await rankCategory(fakeOpenai, fakeDb, 'alice', 'coding');

  expect(written).toHaveLength(1);
  expect(written[0].orderedItems).toEqual(['item-1', 'item-2']);
  expect(updated).toContainEqual({ id: 'item-1', isBestForTask: true });
  expect(updated).toContainEqual({ id: 'item-2', isBestForTask: false });
});

test('throws on a malformed ranking response (missing bestItemId) and does not partial-write', async () => {
  const written: any[] = [];
  const updated: any[] = [];
  const fakeDb: any = {
    collection: () => ({
      where: () => ({
        where: () => ({ get: async () => ({ docs: [
          { id: 'item-1', data: () => ({ name: 'VS Code' }), ref: { update: async (d: any) => updated.push({ id: 'item-1', ...d }) } },
        ] }) }),
      }),
      add: async (data: any) => { written.push(data); return { id: 'ranking-1' }; },
    }),
  };
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify({ orderedItemIds: ['item-1'] }) } }],
    }) } },
  };
  await expect(rankCategory(fakeOpenai, fakeDb, 'alice', 'coding')).rejects.toThrow();
  expect(written).toHaveLength(0);
  expect(updated).toHaveLength(0);
});
