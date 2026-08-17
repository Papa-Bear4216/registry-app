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

function makeFakeDb(existingIdempotencyKeys: string[] = []) {
  const stagingItems: any[] = [];
  const observations: any[] = [];
  return {
    stagingItems,
    observations,
    collection: (name: string) => ({
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
