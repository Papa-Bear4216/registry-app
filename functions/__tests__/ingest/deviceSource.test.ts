import { findOrCreateDeviceSource } from '../../src/ingest/deviceSource';
import { CollectorType } from '../../src/types/enums';

function makeFakeDb(existingDocs: any[] = []) {
  const created: any[] = [];
  const updated: any[] = [];
  return {
    created,
    updated,
    collection: () => ({
      where: (field: string, op: string, value: any) => ({
        where: (field2: string, op2: string, value2: any) => ({
          limit: () => ({
            get: async () => ({
              empty: existingDocs.length === 0,
              docs: existingDocs.map((d) => ({ id: d.id, ref: { update: (data: any) => updated.push({ id: d.id, data }) } })),
            }),
          }),
        }),
      }),
      add: async (data: any) => {
        created.push(data);
        return { id: 'new-device-source-id' };
      },
    }),
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
