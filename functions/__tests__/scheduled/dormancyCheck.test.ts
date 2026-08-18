import { runRetrySweep } from '../../src/scheduled/dormancyCheck';

// Builds a fake Firestore collection whose where() actually filters the held
// doc set by field/op/value, and is chainable, so tests can prove filtering
// behavior rather than just that get() was eventually called.
function fakeCollectionOf(seedDocs: Array<{ id: string; fields: Record<string, any> }>) {
  function makeQuery(docs: typeof seedDocs) {
    return {
      where: (field: string, op: string, value: any) => {
        if (op !== '==') throw new Error(`unsupported op in fake: ${op}`);
        return makeQuery(docs.filter((d) => d.fields[field] === value));
      },
      limit: (n: number) => makeQuery(docs.slice(0, n)),
      get: async () => ({
        docs: docs.map((d) => ({ id: d.id, data: () => d.fields })),
      }),
    };
  }
  return makeQuery(seedDocs);
}

test('re-processes stagingItems where resolved is false and classifiedAt is null', async () => {
  const processed: string[] = [];
  const fakeDb: any = {
    collection: () =>
      fakeCollectionOf([{ id: 'stuck-item', fields: { rawLabel: 'Hulu', resolved: false, classifiedAt: null } }]),
  };
  const fakeProcessFn = async (openai: any, db: any, doc: any) => {
    processed.push(doc.id);
  };
  const fakeGenai: any = {};

  await runRetrySweep(fakeGenai, fakeDb, fakeProcessFn);

  expect(processed).toEqual(['stuck-item']);
});

test('does not process anything when no stagingItems are stuck', async () => {
  const fakeDb: any = { collection: () => fakeCollectionOf([]) };
  let called = false;
  const fakeProcessFn = async () => { called = true; };

  await runRetrySweep({} as any, fakeDb, fakeProcessFn);

  expect(called).toBe(false);
});

test('continues processing remaining docs when one doc throws', async () => {
  const processed: string[] = [];
  const fakeDb: any = {
    collection: () =>
      fakeCollectionOf([
        { id: 'failing-item', fields: { rawLabel: 'Boom', resolved: false, classifiedAt: null } },
        { id: 'ok-item', fields: { rawLabel: 'Fine', resolved: false, classifiedAt: null } },
      ]),
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

test('skips items that were successfully classified and are only awaiting user review', async () => {
  const processed: string[] = [];
  const fakeDb: any = {
    collection: () =>
      fakeCollectionOf([
        { id: 'never-classified', fields: { rawLabel: 'Hulu', resolved: false, classifiedAt: null } },
        {
          id: 'awaiting-review',
          fields: { rawLabel: 'Spotify', resolved: false, classifiedAt: '2026-08-15T00:00:00.000Z' },
        },
      ]),
  };
  const fakeProcessFn = async (openai: any, db: any, doc: any) => {
    processed.push(doc.id);
  };

  await runRetrySweep({} as any, fakeDb, fakeProcessFn);

  expect(processed).toEqual(['never-classified']);
});

test('caps the sweep at 50 items per run even when more are stuck', async () => {
  const seed = Array.from({ length: 75 }, (_, i) => ({
    id: `stuck-${i}`,
    fields: { rawLabel: `App ${i}`, resolved: false, classifiedAt: null },
  }));
  const processed: string[] = [];
  const fakeDb: any = { collection: () => fakeCollectionOf(seed) };
  const fakeProcessFn = async (openai: any, db: any, doc: any) => {
    processed.push(doc.id);
  };

  await runRetrySweep({} as any, fakeDb, fakeProcessFn);

  expect(processed).toHaveLength(50);
});
