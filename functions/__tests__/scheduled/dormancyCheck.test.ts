import { runRetrySweep } from '../../src/scheduled/dormancyCheck';

test('re-processes stagingItems where resolved is false', async () => {
  const processed: string[] = [];
  const fakeDoc = { id: 'stuck-item', data: () => ({ rawLabel: 'Hulu' }) };
  const fakeDb: any = {
    collection: () => ({
      where: () => ({
        get: async () => ({ docs: [fakeDoc] }),
      }),
    }),
  };
  const fakeProcessFn = async (openai: any, db: any, doc: any) => {
    processed.push(doc.id);
  };
  const fakeOpenai: any = {};

  await runRetrySweep(fakeOpenai, fakeDb, fakeProcessFn);

  expect(processed).toEqual(['stuck-item']);
});

test('does not process anything when no stagingItems are stuck', async () => {
  const fakeDb: any = { collection: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }) };
  let called = false;
  const fakeProcessFn = async () => { called = true; };

  await runRetrySweep({} as any, fakeDb, fakeProcessFn);

  expect(called).toBe(false);
});

test('continues processing remaining docs when one doc throws', async () => {
  const processed: string[] = [];
  const fakeDocA = { id: 'failing-item', data: () => ({ rawLabel: 'Boom' }) };
  const fakeDocB = { id: 'ok-item', data: () => ({ rawLabel: 'Fine' }) };
  const fakeDb: any = {
    collection: () => ({
      where: () => ({
        get: async () => ({ docs: [fakeDocA, fakeDocB] }),
      }),
    }),
  };
  const fakeProcessFn = async (openai: any, db: any, doc: any) => {
    if (doc.id === 'failing-item') {
      throw new Error('boom');
    }
    processed.push(doc.id);
  };

  await runRetrySweep({} as any, fakeDb, fakeProcessFn);

  expect(processed).toEqual(['ok-item']);
});
