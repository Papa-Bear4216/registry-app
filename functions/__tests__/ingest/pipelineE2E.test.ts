import { promoteWorkflowSuggestion, WorkflowSuggestionPayload } from '../../src/ingest/workflowSuggestionIngest';
import { processStagingItem } from '../../src/ai/aiClassify';
import { CollectorType } from '../../src/types/enums';
import { StagingItem } from '../../src/types/models';

describe('Gut-Instinct ➔ SecondGuess E2E Pipeline', () => {
  function makeMockFirestore() {
    const stagingDocs: Record<string, any> = {};
    const suggestionDocs: Record<string, any> = {};

    const db: any = {
      stagingDocs,
      suggestionDocs,
      collection: (collName: string) => ({
        doc: (docId: string) => ({
          get: async () => {
            const store = collName === 'stagingItems' ? stagingDocs : suggestionDocs;
            return {
              exists: !!store[docId],
              data: () => store[docId],
            };
          },
          set: async (data: any) => {
            const store = collName === 'stagingItems' ? stagingDocs : suggestionDocs;
            store[docId] = { ...data };
          },
          update: async (patch: any) => {
            const store = collName === 'stagingItems' ? stagingDocs : suggestionDocs;
            if (store[docId]) {
              store[docId] = { ...store[docId], ...patch };
            }
          },
        }),
      }),
    };

    return db;
  }

  it('runs complete flow: Android habit discovery ➔ Firestore promotion ➔ AI skip ➔ Staging view', async () => {
    const db = makeMockFirestore();
    const userId = 'galaxy-s26-user-42';
    const suggestionId = 'habit-chrome-slack-789';

    // Step 1: Gut-Instinct Android app (FirebaseWorkflowSync.kt) generates an on-device habit suggestion
    const androidSuggestionPayload: WorkflowSuggestionPayload = {
      createdBy: userId,
      fromPackage: 'com.android.chrome',
      toPackage: 'com.slack',
      title: 'Share Article Link to Slack Channel',
      evidenceCount: 5,
      confidence: 0.96,
      estimatedSecondsSaved: 45,
      reason: 'Frequent browser to Slack transition during work hours',
      generatedBy: 'gemini-nano',
      createdAt: Date.now(),
      status: 'suggested',
    };
    db.suggestionDocs[suggestionId] = { ...androidSuggestionPayload };

    // Step 2: Cloud Function onDocumentCreated triggers promoteWorkflowSuggestion
    const stagingItem = await promoteWorkflowSuggestion(db, suggestionId, androidSuggestionPayload);

    expect(stagingItem).not.toBeNull();
    expect(stagingItem?.id).toBe(`suggestion-${suggestionId}`);
    expect(stagingItem?.rawLabel).toBe('Share Article Link to Slack Channel');
    expect(stagingItem?.collector).toBe(CollectorType.PhoneUsage);
    expect(stagingItem?.sourceId).toBe('gut_instinct_nano');
    expect(stagingItem?.sourceSuggestionId).toBe(suggestionId);
    expect(stagingItem?.createdBy).toBe(userId);
    expect(stagingItem?.steps).toHaveLength(2);
    expect(stagingItem?.steps?.[0]).toEqual({
      order: 1,
      label: 'Google Chrome',
      target: 'com.android.chrome',
      delayMs: 120,
      type: 'app_launch',
    });
    expect(stagingItem?.steps?.[1]).toEqual({
      order: 2,
      label: 'Slack',
      target: 'com.slack',
      delayMs: 120,
      type: 'app_launch',
    });

    // Verify source document updated to staged
    expect(db.suggestionDocs[suggestionId].status).toBe('staged');
    expect(db.suggestionDocs[suggestionId].stagingItemId).toBe(`suggestion-${suggestionId}`);

    // Step 3: Cloud Function aiClassify trigger runs processStagingItem
    // Mock GenAI client to verify it is NEVER called for nano items
    const mockGenAi: any = {
      models: {
        generateContent: jest.fn().mockRejectedValue(new Error('Cloud GenAI should not be called!')),
      },
    };

    const docSnapshot: any = {
      id: stagingItem!.id,
      data: () => db.stagingDocs[stagingItem!.id],
      ref: {
        update: jest.fn(),
      },
    };

    await expect(processStagingItem(mockGenAi, db, docSnapshot)).resolves.toBeUndefined();
    expect(mockGenAi.models.generateContent).not.toHaveBeenCalled();
    expect(docSnapshot.ref.update).not.toHaveBeenCalled();

    // Step 4: Simulate SecondGuess React Native client hook `useStagingItems` query
    // Query condition: createdBy == userId, resolved == false, classifiedAt !== null
    const rawStagingDocs: StagingItem[] = Object.values(db.stagingDocs);
    const visibleToClient = rawStagingDocs
      .filter((item) => item.createdBy === userId && item.resolved === false)
      .filter((item) => item.classifiedAt !== null);

    expect(visibleToClient).toHaveLength(1);
    const displayedItem = visibleToClient[0];
    expect(displayedItem.id).toBe(`suggestion-${suggestionId}`);
    expect(displayedItem.workflowTitle).toBe('Share Article Link to Slack Channel');
    expect(displayedItem.actionType).toBe('multi_step');
    expect(displayedItem.classifiedConfidence).toBe(0.96);
    expect(displayedItem.estimatedSecondsSaved).toBe(45);
  });
});
