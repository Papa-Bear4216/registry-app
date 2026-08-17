import { classifyStagingItem, processStagingItem } from '../../src/ai/aiClassify';
import { CollectorType, MatchConfidence } from '../../src/types/enums';

test('classifyStagingItem returns a validated classification from a well-formed AI response', async () => {
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify({ kind: 'subscription', category: 'media', active: true, confidence: 0.9 }) } }],
    }) } },
  };
  const stagingItem = { rawLabel: 'Netflix', rawCategory: 'Entertainment' } as any;
  const result = await classifyStagingItem(fakeOpenai, stagingItem);
  expect(result).toEqual({ kind: 'subscription', category: 'media', active: true, confidence: 0.9 });
});

test('classifyStagingItem throws on a malformed AI response (missing required field)', async () => {
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify({ kind: 'subscription' }) } }],
    }) } },
  };
  const stagingItem = { rawLabel: 'Netflix', rawCategory: 'Entertainment' } as any;
  await expect(classifyStagingItem(fakeOpenai, stagingItem)).rejects.toThrow();
});

test('processStagingItem writes structured fields and leaves resolved=false for user review', async () => {
  const updates: any[] = [];
  const fakeDoc = { id: 'staging-1', data: () => ({ rawLabel: 'Netflix', rawCategory: 'Entertainment', rawIdentity: null, collector: CollectorType.Gmail, createdBy: 'alice' }), ref: { update: async (data: any) => updates.push(data) } };
  const fakeDb: any = {
    collection: () => ({
      where: () => ({ where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }), get: async () => ({ docs: [] }) }),
    }),
  };
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify({ kind: 'subscription', category: 'media', active: true, confidence: 0.9 }) } }],
    }) } },
  };

  await processStagingItem(fakeOpenai, fakeDb, fakeDoc as any);

  expect(updates).toHaveLength(1);
  expect(updates[0].resolved).toBe(false);
  expect(updates[0].classifiedKind).toBe('subscription');
});
