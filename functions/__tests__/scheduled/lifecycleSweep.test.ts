import { runLifecycleSweep } from '../../src/scheduled/lifecycleSweep';

describe('runLifecycleSweep', () => {
  it('updates expired Keep items to Review and returns accurate counts', async () => {
    const updates: Record<string, any> = {};
    const batchOps: any[] = [];
    let monthlyReviewsSaved: any = null;

    const fakeDb: any = {
      collection: (colName: string) => {
        if (colName === 'registryItems') {
          return {
            get: async () => ({
              empty: false,
              docs: [
                {
                  id: 'item-1',
                  data: () => ({
                    name: 'Test Shortcut',
                    status: 'keep',
                    tierEnteredAt: '2026-01-01T00:00:00Z',
                    keepClockExpiresAt: '2026-01-15T00:00:00Z',
                    reusabilityCount: 5,
                    promotionScore: 10,
                    createdBy: 'user-1',
                  }),
                },
              ],
            }),
            doc: (id: string) => ({
              id,
            }),
          };
        }
        if (colName === 'monthlyReviews') {
          return {
            doc: (docId: string) => ({
              set: async (data: any) => {
                monthlyReviewsSaved = data;
              },
            }),
          };
        }
        return {};
      },
      batch: () => ({
        update: (ref: any, data: any) => {
          updates[ref.id] = data;
          batchOps.push({ ref, data });
        },
        commit: async () => {},
      }),
    };

    // Run sweep on 2026-01-16 (1 day after 2026-01-15 expiration)
    const sweepDate = new Date('2026-01-16T00:00:00Z');
    const result = await runLifecycleSweep(fakeDb, sweepDate);

    expect(result.updatedCount).toBe(1);
    expect(result.monthlyReviewCount).toBe(1);
    expect(updates['item-1'].status).toBe('review');
    expect(updates['item-1'].reviewReason).toBe('dormant');
    expect(monthlyReviewsSaved).not.toBeNull();
    expect(monthlyReviewsSaved.itemCount).toBe(1);
  });

  it('handles empty registryItems cleanly', async () => {
    const fakeDb: any = {
      collection: () => ({
        get: async () => ({ empty: true, docs: [] }),
      }),
    };

    const result = await runLifecycleSweep(fakeDb);
    expect(result.updatedCount).toBe(0);
    expect(result.monthlyReviewCount).toBe(0);
  });
});
