import { classifyStagingItem, processStagingItem } from '../../src/ai/aiClassify';
import { CollectorType, MatchConfidence } from '../../src/types/enums';

test('classifyStagingItem returns a validated classification from a well-formed AI response', async () => {
  const fakeGenai: any = {
    models: { generateContent: async () => ({
      text: JSON.stringify({ kind: 'subscription', category: 'media', active: true, confidence: 0.9, description: 'Streaming video service.' }),
    }) },
  };
  const stagingItem = { rawLabel: 'Netflix', rawCategory: 'Entertainment' } as any;
  const result = await classifyStagingItem(fakeGenai, stagingItem);
  expect(result).toEqual({ kind: 'subscription', category: 'media', active: true, confidence: 0.9, description: 'Streaming video service.' });
});

test('classifyStagingItem throws on a malformed AI response (missing description)', async () => {
  const fakeGenai: any = {
    models: { generateContent: async () => ({
      text: JSON.stringify({ kind: 'subscription', category: 'media', active: true, confidence: 0.9 }),
    }) },
  };
  const stagingItem = { rawLabel: 'Netflix', rawCategory: 'Entertainment' } as any;
  await expect(classifyStagingItem(fakeGenai, stagingItem)).rejects.toThrow();
});

test('classifyStagingItem throws on a malformed AI response (missing required field)', async () => {
  const fakeGenai: any = {
    models: { generateContent: async () => ({
      text: JSON.stringify({ kind: 'subscription' }),
    }) },
  };
  const stagingItem = { rawLabel: 'Netflix', rawCategory: 'Entertainment' } as any;
  await expect(classifyStagingItem(fakeGenai, stagingItem)).rejects.toThrow();
});

test('processStagingItem writes structured fields and leaves resolved=false for user review', async () => {
  const updates: any[] = [];
  const fakeDoc = { id: 'staging-1', data: () => ({ rawLabel: 'Netflix', rawCategory: 'Entertainment', rawIdentity: null, collector: CollectorType.Gmail, createdBy: 'alice' }), ref: { update: async (data: any) => updates.push(data) } };
  const fakeDb: any = {
    collection: (name: string) => {
      if (name === 'observations') {
        // No match resolved in this test (suggestedMatchId: null), so the
        // backfill branch is never reached — this query should not be called.
        return { where: () => ({ get: async () => { throw new Error('observations should not be queried when no match is resolved'); } }) };
      }
      return {
        where: () => ({ where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }), get: async () => ({ docs: [] }) }),
      };
    },
  };
  // This fake Gemini client backs two distinct calls inside processStagingItem, in order:
  // findFuzzyMatch (expects { suggestedMatchId, confidence: 'low' | 'confirmed' }), then
  // classifyStagingItem (expects { kind, category, active, confidence: number }). Their
  // `confidence` shapes conflict, so respond differently per call rather than reusing one fixture.
  let callCount = 0;
  const responses = [
    { suggestedMatchId: null, confidence: 'low' },
    { kind: 'subscription', category: 'media', active: true, confidence: 0.9, description: 'Streaming video service.' },
  ];
  const fakeGenai: any = {
    models: { generateContent: async () => ({
      text: JSON.stringify(responses[callCount++]),
    }) },
  };

  await processStagingItem(fakeGenai, fakeDb, fakeDoc as any);

  expect(updates).toHaveLength(1);
  expect(updates[0].resolved).toBe(false);
  expect(updates[0].classifiedKind).toBe('subscription');
  expect(updates[0].classifiedDescription).toBe('Streaming video service.');
  expect(typeof updates[0].classifiedAt).toBe('string');
  expect(updates[0].classifiedAt).not.toBeNull();
});

test('processStagingItem backfills registryItemId on the originating observation when an exact match is resolved', async () => {
  const stagingUpdates: any[] = [];
  const observationUpdates: any[] = [];
  const fakeDoc = {
    id: 'staging-1',
    data: () => ({ rawLabel: 'Todoist', rawCategory: null, rawIdentity: 'com.todoist', collector: CollectorType.PhoneUsage, createdBy: 'alice' }),
    ref: { update: async (data: any) => stagingUpdates.push(data) },
  };
  const fakeDb: any = {
    collection: (name: string) => {
      if (name === 'registryItems') {
        // findExactMatch: where(createdBy).where(canonicalIdentity).limit(1).get()
        return {
          where: () => ({
            where: () => ({
              limit: () => ({ get: async () => ({ empty: false, docs: [{ id: 'item-42' }] }) }),
            }),
          }),
        };
      }
      if (name === 'observations') {
        return {
          where: (field: string, op: string, value: string) => ({
            get: async () => {
              expect(field).toBe('stagingItemId');
              expect(value).toBe('staging-1');
              return { docs: [{ ref: { update: async (d: any) => observationUpdates.push(d) } }] };
            },
          }),
        };
      }
      throw new Error(`unexpected collection: ${name}`);
    },
  };
  const fakeGenai: any = {
    models: { generateContent: async () => ({
      text: JSON.stringify({ kind: 'app', category: 'productivity', active: true, confidence: 0.9, description: 'Task manager.' }),
    }) },
  };

  await processStagingItem(fakeGenai, fakeDb, fakeDoc as any);

  expect(stagingUpdates[0].suggestedMatch).toBe('item-42');
  expect(observationUpdates).toEqual([{ registryItemId: 'item-42' }]);
});
