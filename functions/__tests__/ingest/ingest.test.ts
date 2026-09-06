import { handleIngest } from '../../src/ingest/ingest';
import { CollectorType } from '../../src/types/enums';

jest.mock('../../src/lib/auth', () => ({
  verifyIdToken: jest.fn((header: string | undefined) => {
    if (header === 'Bearer valid-token') return Promise.resolve('alice');
    throw new Error('Missing Authorization header');
  }),
}));

jest.mock('../../src/ingest/deviceSource', () => ({
  findOrCreateDeviceSource: jest.fn(() => Promise.resolve('device-source-id')),
}));

function makeFakeDb(existingIdempotencyKeys: string[] = [], initialRegistryItems: Record<string, any> = {}) {
  const stagingItems: any[] = [];
  const observations: any[] = [];
  const registryItems: Record<string, any> = { ...initialRegistryItems };
  return {
    stagingItems,
    observations,
    registryItems,
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => ({
          exists: !!registryItems[id],
          data: () => registryItems[id],
        }),
        update: async (patch: any) => {
          registryItems[id] = { ...registryItems[id], ...patch };
        },
      }),
      where: (field: string, _op: string, value: any) => ({
        where: (field2: string, _op2: string, value2: any) => ({
          limit: () => ({
            get: async () => {
              const matched = field2 === 'idempotencyKey' && existingIdempotencyKeys.includes(value2);
              return { empty: !matched, docs: matched ? [{ id: 'existing-obs-id' }] : [] };
            },
          }),
        }),
      }),
      add: async (data: any) => {
        if (name === 'stagingItems') stagingItems.push(data);
        if (name === 'observations') observations.push(data);
        return { id: `${name}-id` };
      },
    }),
  };
}

function validBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    collector: CollectorType.PhoneUsage,
    sourceId: 'pixel-8-abc123',
    sourceLabel: 'My Pixel 8',
    rawLabel: 'Netflix',
    rawCategory: 'Entertainment',
    rawIdentity: 'com.netflix.mediaclient',
    idempotencyKey: 'pixel-8-abc123:com.netflix.mediaclient:1700000000000',
    payload: { usageCount: 5, usageDurationMs: 600000, windowHours: 6 },
    ...overrides,
  };
}

test('valid request creates a stagingItem and an observation scoped to the verified uid', async () => {
  const db: any = makeFakeDb();
  const req = {
    headers: { authorization: 'Bearer valid-token' },
    body: validBody(),
  };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

  await handleIngest(db, req as any, res as any);

  expect(res.status).toHaveBeenCalledWith(200);
  expect(db.stagingItems).toHaveLength(1);
  expect(db.stagingItems[0].createdBy).toBe('alice');
  expect(db.stagingItems[0].rawLabel).toBe('Netflix');
  expect(db.observations).toHaveLength(1);
  expect(db.observations[0].createdBy).toBe('alice');
  expect(db.observations[0].stagingItemId).toBe('stagingItems-id');
  expect(db.observations[0].idempotencyKey).toBe('pixel-8-abc123:com.netflix.mediaclient:1700000000000');
});

test('rejects a body missing idempotencyKey', async () => {
  const db: any = makeFakeDb();
  const { idempotencyKey, ...bodyWithoutKey } = validBody();
  const req = {
    headers: { authorization: 'Bearer valid-token' },
    body: bodyWithoutKey,
  };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

  await handleIngest(db, req as any, res as any);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(db.observations).toHaveLength(0);
});

test('a retried idempotencyKey is deduped: no new stagingItem/observation written', async () => {
  const db: any = makeFakeDb(['pixel-8-abc123:com.netflix.mediaclient:1700000000000']);
  const req = {
    headers: { authorization: 'Bearer valid-token' },
    body: validBody(),
  };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

  await handleIngest(db, req as any, res as any);

  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({ ok: true, deduped: true });
  expect(db.stagingItems).toHaveLength(0);
  expect(db.observations).toHaveLength(0);
});

test('missing Authorization header returns 401 and writes nothing', async () => {
  const db: any = makeFakeDb();
  const req = { headers: {}, body: {} };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

  await handleIngest(db, req as any, res as any);

  expect(res.status).toHaveBeenCalledWith(401);
  expect(db.stagingItems).toHaveLength(0);
});

test('malformed payload (missing required field) returns 400', async () => {
  const db: any = makeFakeDb();
  const req = {
    headers: { authorization: 'Bearer valid-token' },
    body: { collector: CollectorType.PhoneUsage }, // missing sourceId, rawLabel, payload
  };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

  await handleIngest(db, req as any, res as any);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(db.stagingItems).toHaveLength(0);
});

test('ingesting observation with registryItemId resets 14-day clock and increments reusabilityCount', async () => {
  const initialItem = {
    name: 'Quick Log Shortcut',
    status: 'review',
    createdBy: 'alice',
    keepClockExpiresAt: '2026-01-01T00:00:00Z',
    reusabilityCount: 3,
  };
  const db: any = makeFakeDb([], { 'item-123': initialItem });
  const req = {
    headers: { authorization: 'Bearer valid-token' },
    body: validBody({
      registryItemId: 'item-123',
      idempotencyKey: 'exec:item-123:1700000000',
      payload: { usageCount: 2, usageDurationMs: 5000, windowHours: 1 },
    }),
  };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

  await handleIngest(db, req as any, res as any);

  expect(res.status).toHaveBeenCalledWith(200);
  expect(db.observations[0].registryItemId).toBe('item-123');
  const updatedItem = db.registryItems['item-123'];
  expect(updatedItem.status).toBe('keep');
  expect(updatedItem.reusabilityCount).toBe(5); // 3 + 2
  expect(typeof updatedItem.lastObservedAt).toBe('string');
  expect(typeof updatedItem.lastExecutedAt).toBe('string');
  expect(typeof updatedItem.keepClockExpiresAt).toBe('string');
  expect(new Date(updatedItem.keepClockExpiresAt).getTime()).toBeGreaterThan(new Date('2026-01-01T00:00:00Z').getTime());
});
