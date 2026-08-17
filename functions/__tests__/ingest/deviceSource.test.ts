import { findOrCreateDeviceSource } from '../../src/ingest/deviceSource';
import { CollectorType } from '../../src/types/enums';

function makeFakeDb(existingDocs: any[] = []) {
  const created: any[] = [];
  const updated: any[] = [];
  // transaction.get() below is stubbed directly (not routed through this
  // query chain) since the fake only needs to prove findOrCreateDeviceSource
  // reads via transaction.get and writes via transaction.set/update — the
  // real query construction is exercised by the type-checked call site itself.
  const collectionRef = {
    where: () => ({ where: () => ({ limit: () => ({}) }) }),
    doc: () => ({ id: 'new-device-source-id' }),
  };
  return {
    created,
    updated,
    collection: () => collectionRef,
    runTransaction: async (fn: (t: any) => Promise<any>) => {
      const transaction = {
        get: async (_query: any) => ({
          empty: existingDocs.length === 0,
          docs: existingDocs.map((d) => ({ id: d.id, ref: { id: d.id } })),
        }),
        update: (ref: any, data: any) => {
          updated.push({ id: ref.id, data });
        },
        set: (ref: any, data: any) => {
          created.push({ id: ref.id, ...data });
        },
      };
      return fn(transaction);
    },
  };
}

test('creates a new deviceSource when none exists for (uid, sourceId)', async () => {
  const db: any = makeFakeDb([]);
  const id = await findOrCreateDeviceSource(db, 'alice', 'pixel-8-abc123', CollectorType.PhoneUsage, 'My Pixel 8');
  expect(id).toBe('new-device-source-id');
  expect(db.created).toHaveLength(1);
  expect(db.created[0].createdBy).toBe('alice');
  expect(db.created[0].sourceId).toBe('pixel-8-abc123');
});

test('updates lastSeen on an existing deviceSource instead of creating a duplicate', async () => {
  const db: any = makeFakeDb([{ id: 'existing-id' }]);
  const id = await findOrCreateDeviceSource(db, 'alice', 'pixel-8-abc123', CollectorType.PhoneUsage, 'My Pixel 8');
  expect(id).toBe('existing-id');
  expect(db.created).toHaveLength(0);
  expect(db.updated).toHaveLength(1);
});

test('the read-then-write happens inside a single runTransaction call', async () => {
  const transactionCalls: string[] = [];
  const db: any = {
    collection: () => ({
      where: () => ({ where: () => ({ limit: () => ({}) }) }),
      doc: () => ({ id: 'new-id' }),
    }),
    runTransaction: async (fn: (t: any) => Promise<any>) => {
      transactionCalls.push('start');
      const transaction = {
        get: async () => {
          transactionCalls.push('get');
          return { empty: true, docs: [] };
        },
        set: () => {
          transactionCalls.push('set');
        },
        update: () => {
          transactionCalls.push('update');
        },
      };
      const result = await fn(transaction);
      transactionCalls.push('end');
      return result;
    },
  };

  await findOrCreateDeviceSource(db, 'alice', 'pixel-8-abc123', CollectorType.PhoneUsage, 'My Pixel 8');

  expect(transactionCalls).toEqual(['start', 'get', 'set', 'end']);
});
