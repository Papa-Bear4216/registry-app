import { rankCategory } from '../../src/ai/aiRank';

test('parses a well-formed ranking and writes a taskRankings doc, sets isBestForTask on the winner', async () => {
  const written: any[] = [];
  const updated: any[] = [];
  const fakeDb: any = {
    collection: (name: string) => {
      if (name === 'registryItems') {
        return {
          where: () => ({
            where: () => ({ get: async () => ({ docs: [
              { id: 'item-1', data: () => ({ name: 'VS Code' }), ref: { update: async (d: any) => updated.push({ id: 'item-1', ...d }) } },
              { id: 'item-2', data: () => ({ name: 'Sublime' }), ref: { update: async (d: any) => updated.push({ id: 'item-2', ...d }) } },
            ] }) }),
          }),
        };
      }
      // taskRankings: query-then-create/update path
      return {
        where: () => ({
          where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }),
        }),
        add: async (data: any) => { written.push(data); return { id: 'ranking-1' }; },
      };
    },
  };
  const fakeGenai: any = {
    models: { generateContent: async () => ({
      text: JSON.stringify({ orderedItemIds: ['item-1', 'item-2'], bestItemId: 'item-1' }),
    }) },
  };

  await rankCategory(fakeGenai, fakeDb, 'alice', 'coding');

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
  const fakeGenai: any = {
    models: { generateContent: async () => ({
      text: JSON.stringify({ orderedItemIds: ['item-1'] }),
    }) },
  };
  await expect(rankCategory(fakeGenai, fakeDb, 'alice', 'coding')).rejects.toThrow();
  expect(written).toHaveLength(0);
  expect(updated).toHaveLength(0);
});

test('rejects a bestItemId not present among the candidates (hallucinated id)', async () => {
  const written: any[] = [];
  const updated: any[] = [];
  const fakeDb: any = {
    collection: () => ({
      where: () => ({
        where: () => ({ get: async () => ({ docs: [
          { id: 'item-1', data: () => ({ name: 'VS Code' }), ref: { update: async (d: any) => updated.push({ id: 'item-1', ...d }) } },
          { id: 'item-2', data: () => ({ name: 'Sublime' }), ref: { update: async (d: any) => updated.push({ id: 'item-2', ...d }) } },
        ] }) }),
      }),
      add: async (data: any) => { written.push(data); return { id: 'ranking-1' }; },
    }),
  };
  const fakeGenai: any = {
    models: { generateContent: async () => ({
      text: JSON.stringify({ orderedItemIds: ['item-1', 'item-2'], bestItemId: 'item-999-hallucinated' }),
    }) },
  };

  await expect(rankCategory(fakeGenai, fakeDb, 'alice', 'coding')).rejects.toThrow(
    'AI ranking response referenced an item id not in the candidate set'
  );
  expect(written).toHaveLength(0);
  expect(updated).toHaveLength(0);
});

test('updates the existing taskRankings doc instead of creating a duplicate', async () => {
  const written: any[] = [];
  const updatedRanking: any[] = [];
  const updatedItems: any[] = [];
  const fakeDb: any = {
    collection: (name: string) => {
      if (name === 'registryItems') {
        return {
          where: () => ({
            where: () => ({ get: async () => ({ docs: [
              { id: 'item-1', data: () => ({ name: 'VS Code' }), ref: { update: async (d: any) => updatedItems.push({ id: 'item-1', ...d }) } },
            ] }) }),
          }),
        };
      }
      return {
        where: () => ({
          where: () => ({
            limit: () => ({
              get: async () => ({
                empty: false,
                docs: [{ ref: { update: async (d: any) => updatedRanking.push(d) } }],
              }),
            }),
          }),
        }),
        add: async (data: any) => { written.push(data); return { id: 'ranking-new' }; },
      };
    },
  };
  const fakeGenai: any = {
    models: { generateContent: async () => ({
      text: JSON.stringify({ orderedItemIds: ['item-1'], bestItemId: 'item-1' }),
    }) },
  };

  await rankCategory(fakeGenai, fakeDb, 'alice', 'coding');

  expect(updatedRanking).toHaveLength(1);
  expect(updatedRanking[0].orderedItems).toEqual(['item-1']);
  expect(written).toHaveLength(0);
});
