import { formatPackageLabel, promoteWorkflowSuggestion, WorkflowSuggestionPayload } from '../../src/ingest/workflowSuggestionIngest';
import { CollectorType } from '../../src/types/enums';

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

describe('workflowSuggestionIngest', () => {
  describe('formatPackageLabel', () => {
    it('formats known packages to human-readable names', () => {
      expect(formatPackageLabel('com.google.android.apps.messaging')).toBe('Google Messages');
      expect(formatPackageLabel('com.todoist')).toBe('Todoist');
      expect(formatPackageLabel('com.google.android.apps.bard')).toBe('Google Gemini');
      expect(formatPackageLabel('com.android.chrome')).toBe('Google Chrome');
      expect(formatPackageLabel('com.samsung.android.dialer')).toBe('Samsung Dialer');
    });

    it('falls back to capitalized last package segment for unknown packages', () => {
      expect(formatPackageLabel('com.mycompany.myplanner')).toBe('Myplanner');
      expect(formatPackageLabel('org.videolan.vlc')).toBe('Vlc');
    });

    it('handles empty or malformed inputs safely', () => {
      expect(formatPackageLabel('')).toBe('Unknown App');
      expect(formatPackageLabel(null as any)).toBe('Unknown App');
    });
  });

  describe('promoteWorkflowSuggestion', () => {
    it('promotes a valid on-device suggestion to a SecondGuess StagingItem', async () => {
      const db = makeMockFirestore();
      const suggestionId = 'nano-sug-42';
      const payload: WorkflowSuggestionPayload = {
        createdBy: 'user-michael-1',
        fromPackage: 'com.google.android.apps.messaging',
        toPackage: 'com.todoist',
        title: 'Draft Task from Incoming Messages',
        evidenceCount: 6,
        confidence: 0.94,
        estimatedSecondsSaved: 60,
        reason: 'Repeated transition after text copy',
        generatedBy: 'gemini-nano',
        createdAt: 1726680000000,
        status: 'suggested',
      };

      // Seed suggestion doc in mock
      db.suggestionDocs[suggestionId] = { ...payload };

      const result = await promoteWorkflowSuggestion(db, suggestionId, payload);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('suggestion-nano-sug-42');
      expect(result?.workflowTitle).toBe('Draft Task from Incoming Messages');
      expect(result?.rawIdentity).toBe('com.google.android.apps.messaging->com.todoist');
      expect(result?.collector).toBe(CollectorType.PhoneUsage);
      expect(result?.sourceId).toBe('gut_instinct_nano');
      expect(result?.sourceSuggestionId).toBe('nano-sug-42');
      expect(result?.classifiedActive).toBe(true);
      expect(result?.classifiedAt).toBeTruthy();
      expect(result?.resolved).toBe(false);
      expect(result?.actionType).toBe('multi_step');
      expect(result?.steps).toHaveLength(2);
      expect(result?.steps?.[0]).toEqual({
        order: 1,
        label: 'Google Messages',
        target: 'com.google.android.apps.messaging',
        delayMs: 120,
        type: 'app_launch',
      });
      expect(result?.steps?.[1]).toEqual({
        order: 2,
        label: 'Todoist',
        target: 'com.todoist',
        delayMs: 120,
        type: 'app_launch',
      });

      // Verify staged in db
      expect(db.stagingDocs['suggestion-nano-sug-42']).toBeDefined();
      expect(db.suggestionDocs[suggestionId].status).toBe('staged');
      expect(db.suggestionDocs[suggestionId].stagingItemId).toBe('suggestion-nano-sug-42');
    });

    it('is idempotent and returns existing StagingItem without re-creating', async () => {
      const db = makeMockFirestore();
      const suggestionId = 'nano-sug-idem';
      const existingStagingItem: any = {
        id: 'suggestion-nano-sug-idem',
        rawLabel: 'Existing Pre-staged Item',
        resolved: false,
      };
      db.stagingDocs['suggestion-nano-sug-idem'] = existingStagingItem;

      const payload: WorkflowSuggestionPayload = {
        createdBy: 'user-michael-1',
        fromPackage: 'com.android.chrome',
        toPackage: 'com.slack',
      };

      const result = await promoteWorkflowSuggestion(db, suggestionId, payload);
      expect(result).toEqual(existingStagingItem);
      expect(result?.rawLabel).toBe('Existing Pre-staged Item');
    });

    it('rejects incomplete suggestion data missing required fields', async () => {
      const db = makeMockFirestore();
      const invalidPayload = {
        createdBy: 'user-michael-1',
        fromPackage: 'com.android.chrome',
        toPackage: '', // missing
      } as any;

      const result = await promoteWorkflowSuggestion(db, 'bad-sug', invalidPayload);
      expect(result).toBeNull();
      expect(Object.keys(db.stagingDocs)).toHaveLength(0);
    });
  });
});
