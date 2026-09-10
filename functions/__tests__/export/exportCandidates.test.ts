import { handleExportCandidates } from '../../src/export/exportCandidates';
import { LifecycleTier, PatternKind, TaskCategory } from '@registry/pattern-analyzer';

jest.mock('../../src/lib/auth', () => ({
  verifyIdToken: jest.fn((header: string | undefined) => {
    if (header === 'Bearer valid-token') return Promise.resolve('alice');
    throw new Error('Missing or invalid Authorization header');
  }),
}));

function makeFakeDb(items: any[] = []) {
  const createQuery = (currentItems: any[]) => ({
    where: (field: string, op: string, value: any) => {
      const filtered = currentItems.filter((it) => it[field] === value);
      return createQuery(filtered);
    },
    get: async () => ({
      empty: currentItems.length === 0,
      docs: currentItems.map((doc, idx) => ({
        id: doc.id || `item-${idx}`,
        data: () => doc,
      })),
    }),
  });

  return {
    collection: (_name: string) => createQuery(items),
  } as any;
}

function makeRes() {
  const res: any = {};
  res.statusCode = 200;
  res.body = null;
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (val: any) => {
    res.body = val;
    return res;
  };
  return res;
}

describe('handleExportCandidates', () => {
  it('returns 401 when Authorization header is invalid or missing', async () => {
    const db = makeFakeDb();
    const req: any = { headers: {}, query: {} };
    const res = makeRes();

    await handleExportCandidates(db, req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Missing or invalid Authorization header' });
  });

  it('returns 405 when HTTP method is not GET', async () => {
    const db = makeFakeDb();
    const req: any = { method: 'POST', headers: { authorization: 'Bearer token-alice' }, query: {} };
    const res = makeRes();

    await handleExportCandidates(db, req, res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: 'Method Not Allowed' });
  });

  it('exports candidates bounded to capacity and sorted by promotion score', async () => {
    const items = [
      {
        id: 'c1',
        name: 'Copy Paste Pipeline',
        status: 'candidate',
        createdBy: 'alice',
        promotionScore: 10,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'c2',
        name: 'Git Commit Workflow',
        status: 'candidate',
        createdBy: 'alice',
        promotionScore: 25,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'k1',
        name: 'Active Habit',
        status: 'keep', // should be excluded by exportCandidatePool
        createdBy: 'alice',
        promotionScore: 50,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];
    const db = makeFakeDb(items);
    const req: any = {
      headers: { authorization: 'Bearer valid-token' },
      query: { capacity: '1' },
    };
    const res = makeRes();

    await handleExportCandidates(db, req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.capacity).toBe(1);
    expect(res.body.totalCandidates).toBe(2);
    expect(res.body.returned).toBe(1);
    expect(res.body.candidates).toHaveLength(1);
    // Highest candidate score should be first
    expect(res.body.candidates[0].id).toBe('c2');
    expect(res.body.candidates[0].name).toBe('Git Commit Workflow');
  });

  it('handles empty candidate collection gracefully', async () => {
    const db = makeFakeDb([]);
    const req: any = {
      headers: { authorization: 'Bearer valid-token' },
      query: {},
    };
    const res = makeRes();

    await handleExportCandidates(db, req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.totalCandidates).toBe(0);
    expect(res.body.candidates).toEqual([]);
  });

  it('clamps capacity parameter to at most 100', async () => {
    const items = [
      {
        id: 'c1',
        name: 'Pattern 1',
        status: 'candidate',
        createdBy: 'alice',
        promotionScore: 10,
      },
    ];
    const db = makeFakeDb(items);
    const req: any = {
      headers: { authorization: 'Bearer valid-token' },
      query: { capacity: '250' },
    };
    const res = makeRes();

    await handleExportCandidates(db, req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.capacity).toBe(100);
  });

  it('clamps numeric capacity parameter to at most 100', async () => {
    const items = [
      {
        id: 'c1',
        name: 'Pattern 1',
        status: 'candidate',
        createdBy: 'alice',
        promotionScore: 10,
      },
    ];
    const db = makeFakeDb(items);
    const req: any = {
      headers: { authorization: 'Bearer valid-token' },
      query: { capacity: 250 },
    };
    const res = makeRes();

    await handleExportCandidates(db, req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.capacity).toBe(100);
  });

  it('filters out non-candidate items at the database query level', async () => {
    const items = [
      {
        id: 'c1',
        name: 'Candidate Pattern',
        status: 'candidate',
        createdBy: 'alice',
        promotionScore: 10,
      },
      {
        id: 'k1',
        name: 'Keep Pattern',
        status: 'keep',
        createdBy: 'alice',
        promotionScore: 50,
      },
    ];
    const db = makeFakeDb(items);
    const req: any = {
      headers: { authorization: 'Bearer valid-token' },
      query: {},
    };
    const res = makeRes();

    await handleExportCandidates(db, req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.candidates).toHaveLength(1);
    expect(res.body.candidates[0].id).toBe('c1');
  });
});
