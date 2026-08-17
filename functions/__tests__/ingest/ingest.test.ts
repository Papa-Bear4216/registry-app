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

function makeFakeDb() {
  const stagingItems: any[] = [];
  const observations: any[] = [];
  return {
    stagingItems,
    observations,
    collection: (name: string) => ({
      add: async (data: any) => {
        if (name === 'stagingItems') stagingItems.push(data);
        if (name === 'observations') observations.push(data);
        return { id: `${name}-id` };
      },
    }),
  };
}

test('valid request creates a stagingItem and an observation scoped to the verified uid', async () => {
  const db: any = makeFakeDb();
  const req = {
    headers: { authorization: 'Bearer valid-token' },
    body: {
      collector: CollectorType.PhoneUsage,
      sourceId: 'pixel-8-abc123',
      sourceLabel: 'My Pixel 8',
      rawLabel: 'Netflix',
      rawCategory: 'Entertainment',
      rawIdentity: 'com.netflix.mediaclient',
      payload: { usageCount: 5, usageDurationMs: 600000, windowHours: 6 },
    },
  };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

  await handleIngest(db, req as any, res as any);

  expect(res.status).toHaveBeenCalledWith(200);
  expect(db.stagingItems).toHaveLength(1);
  expect(db.stagingItems[0].createdBy).toBe('alice');
  expect(db.stagingItems[0].rawLabel).toBe('Netflix');
  expect(db.observations).toHaveLength(1);
  expect(db.observations[0].createdBy).toBe('alice');
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
