# Cloud Functions Correctness Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix seven correctness bugs in `functions/src` and `firestore.rules`/`firestore.indexes.json`: a missing composite index that makes `aiRank` always throw, a permanently-null `registryItemId` on ingested observations, a missing Firestore rule for `coachDailyCounters`, a missing hallucination guard in `aiRank`, a client/server cost-normalization divergence, duplicate `taskRankings` docs from always-`add()`, and an unbounded serial retry sweep with no timeout guard.

**Architecture:** Each fix is scoped to its own file(s) and independently testable/deployable. Firestore index and rules changes are declarative config, not code — verified by `firebase deploy --only firestore:indexes,firestore:rules --dry-run` where possible, otherwise by manual review since there's no local emulator test harness evident in this repo. TypeScript fixes follow the existing patterns already present elsewhere in `functions/src` (e.g. `dedupMatch.ts`'s hallucination guard, `deviceSource.ts`'s query-then-update-or-create).

**Tech Stack:** TypeScript, Firebase Cloud Functions v2 (`onCall`, `onDocumentCreated`, `onSchedule`), `firebase-admin` Firestore SDK, Jest (confirm test runner — see Task 1 Step 0).

**Spec:** Ultra code-review findings #2, #3, #6, #8, #9, #10, #15 (registry-app full-repo review, 2026-08-17). No separate spec doc; this plan's Global Constraints capture the invariants found in the existing codebase during research.

## Global Constraints

- `functions/src/ai/dedupMatch.ts:54-55` is the existing pattern for guarding against AI-hallucinated ids — reuse its exact shape (`if (!candidates.some((c) => c.id === parsed.xId)) return null;`) rather than inventing a new one.
- `functions/src/ingest/deviceSource.ts:12-23` is the existing query-then-update-or-create pattern — reuse its shape for the `taskRankings` fix.
- Do not change the `BillingCycle` enum in `functions/src/types/enums.ts` or `src/types/enums.ts` — both cost-normalization implementations must accept it as-is.
- `firestore.rules` currently uses `isOwner(resource)` / `isOwnerOnCreate()` helper functions already defined at the top of the file (lines 4-9) — new rule blocks must reuse these, not redefine equivalent logic inline.
- Composite indexes in `firestore.indexes.json` must specify `collectionGroup`, `queryScope`, and `fields` in the same shape as the existing `observations` index (lines 3-11).

---

### Task 1: Add missing composite Firestore index for `aiRank`'s query

**Files:**
- Modify: `firestore.indexes.json`

**Interfaces:**
- Consumes: none.
- Produces: a composite index covering `registryItems` filtered by `createdBy` (equality) + `taskCategories` (array-contains), which `functions/src/ai/aiRank.ts:16-20` requires but does not currently have.

- [ ] **Step 0: Confirm the test/deploy tooling available in this repo**

Run: `cd functions && cat package.json | grep -A3 '"scripts"'`
Note the test runner (likely `jest` or `mocha` based on `package.json`) and whether a `firebase emulators:exec` script exists — later steps in this plan reference `npm test` generically; substitute the actual script name found here if different.

- [ ] **Step 1: Add the composite index for `registryItems(createdBy, taskCategories)`**

In `firestore.indexes.json`, add a second entry to the `"indexes"` array (after the existing `observations` index, before the closing `]`):

```json
    {
      "collectionGroup": "registryItems",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "createdBy", "order": "ASCENDING" },
        { "fieldPath": "taskCategories", "arrayConfig": "CONTAINS" }
      ]
    }
```

The full file becomes:

```json
{
  "indexes": [
    {
      "collectionGroup": "observations",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "createdBy", "order": "ASCENDING" },
        { "fieldPath": "registryItemId", "order": "ASCENDING" },
        { "fieldPath": "observedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "registryItems",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "createdBy", "order": "ASCENDING" },
        { "fieldPath": "taskCategories", "arrayConfig": "CONTAINS" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 2: Validate the JSON is well-formed**

Run: `node -e "JSON.parse(require('fs').readFileSync('firestore.indexes.json', 'utf8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 3: Deploy the index (or dry-run if the project isn't linked in this environment)**

Run: `firebase deploy --only firestore:indexes`
Expected: Deploy succeeds; Firebase console shows the new composite index building (can take several minutes to go from "Building" to "Enabled" — the fix is not fully live until it finishes). If `firebase` CLI isn't authenticated/linked in this environment, skip this step and note it must be run manually before the `aiRank` fix is considered deployed.

- [ ] **Step 4: Commit**

```bash
git add firestore.indexes.json
git commit -m "fix: add missing composite index for aiRank's createdBy+taskCategories query"
```

---

### Task 2: Add hallucination guard to `aiRank`'s `isValidRanking`

**Files:**
- Modify: `functions/src/ai/aiRank.ts`
- Test: `functions/src/ai/aiRank.test.ts`

**Interfaces:**
- Consumes: `candidates: { id: string; name: string }[]` (already computed at `aiRank.ts:22`).
- Produces: `rankCategory` now rejects (throws) a malformed AI response whose `bestItemId` isn't among the actual candidate ids sent to the model, matching `dedupMatch.ts`'s existing guard pattern.

- [ ] **Step 1: Check for an existing test file and existing test patterns**

Run: `ls functions/src/ai/*.test.ts 2>/dev/null || find functions/src -name "*.test.ts"`
If test files exist for `dedupMatch.ts` or similar, read one to match its mocking style for `OpenAI`/`Firestore` before writing Step 4 below.

- [ ] **Step 2: Add the membership check inside `rankCategory`, after parsing but before writing**

In `functions/src/ai/aiRank.ts`, replace lines 28-31:

```typescript
  const parsed = await callJsonMode(openai, systemPrompt, userPrompt);
  if (!isValidRanking(parsed)) {
    throw new Error('Malformed ranking response from AI');
  }
```

with:

```typescript
  const parsed = await callJsonMode(openai, systemPrompt, userPrompt);
  if (!isValidRanking(parsed)) {
    throw new Error('Malformed ranking response from AI');
  }

  // Guard against the AI hallucinating an id that wasn't among the candidates sent to it.
  const candidateIds = new Set(candidates.map((c) => c.id));
  if (!candidateIds.has(parsed.bestItemId) || !parsed.orderedItemIds.every((id) => candidateIds.has(id))) {
    throw new Error('AI ranking response referenced an item id not in the candidate set');
  }
```

- [ ] **Step 3: Run the existing test suite to confirm nothing else broke**

Run: `cd functions && npm test -- aiRank`
Expected: existing tests (if any) still pass; if no test file exists yet, this step is a no-op and Step 4 creates one.

- [ ] **Step 4: Write a test proving the guard rejects a hallucinated id**

Read `functions/src/ai/openaiClient.ts` first to confirm `callJsonMode`'s exact export shape, then write:

```typescript
import { rankCategory } from './aiRank';
import * as openaiClientModule from './openaiClient';

jest.mock('./openaiClient');

describe('rankCategory', () => {
  it('rejects a bestItemId not present among the candidates', async () => {
    const mockDb = {
      collection: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          docs: [
            { id: 'item-1', data: () => ({ name: 'Todoist' }), ref: { update: jest.fn() } },
            { id: 'item-2', data: () => ({ name: 'Asana' }), ref: { update: jest.fn() } },
          ],
        }),
        add: jest.fn(),
      }),
    } as any;

    (openaiClientModule.callJsonMode as jest.Mock).mockResolvedValue({
      orderedItemIds: ['item-1', 'item-2'],
      bestItemId: 'item-999-hallucinated',
    });

    await expect(
      rankCategory({} as any, mockDb, 'test-uid', 'productivity')
    ).rejects.toThrow('AI ranking response referenced an item id not in the candidate set');
  });

  it('accepts a bestItemId that is among the candidates', async () => {
    const updateMock = jest.fn();
    const addMock = jest.fn().mockResolvedValue({ id: 'ranking-1' });
    const mockDb = {
      collection: jest.fn((name: string) => {
        if (name === 'registryItems') {
          return {
            where: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({
              docs: [
                { id: 'item-1', data: () => ({ name: 'Todoist' }), ref: { update: updateMock } },
              ],
            }),
          };
        }
        return { add: addMock };
      }),
    } as any;

    (openaiClientModule.callJsonMode as jest.Mock).mockResolvedValue({
      orderedItemIds: ['item-1'],
      bestItemId: 'item-1',
    });

    await expect(
      rankCategory({} as any, mockDb, 'test-uid', 'productivity')
    ).resolves.not.toThrow();
    expect(addMock).toHaveBeenCalled();
  });
});
```

Adjust the `mockDb.collection` mock shape to match whatever pattern an existing test file in `functions/src/ai/` already uses (found in Step 1) rather than inventing a new mocking style if one is established.

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `cd functions && npm test -- aiRank`
Expected: PASS (2 new tests, plus any pre-existing ones)

- [ ] **Step 6: Commit**

```bash
git add functions/src/ai/aiRank.ts functions/src/ai/aiRank.test.ts
git commit -m "fix: guard aiRank against AI hallucinating an item id outside the candidate set"
```

---

### Task 3: Backfill `registryItemId` on observations after AI classification resolves a match

**Files:**
- Modify: `functions/src/ai/aiClassify.ts`
- Test: `functions/src/ai/aiClassify.test.ts`

**Interfaces:**
- Consumes: `data.sourceId: string` and `data.createdBy: string` from the `stagingItems` doc (already read in `processStagingItem`), plus the resolved `suggestedMatch: string | null` computed in the same function.
- Produces: when `processStagingItem` resolves a `suggestedMatch`, it now also updates the matching `observations` doc(s) (matched by `createdBy` + `sourceId` via the staging item's originating `deviceSourceId`/`sourceId` — see Step 1 for exactly which field ties them together) to set `registryItemId` to the resolved match.

- [ ] **Step 1: Determine how `observations` docs correlate back to the `stagingItems` doc that resolves them**

Read `functions/src/ingest/ingest.ts:54-79` again: both the `stagingItems` doc and the `observations` doc are written in the same `handleIngest` call, from the same `body.sourceId`/`body.collector`/`uid`, but with different `capturedAt`/`observedAt` timestamps (both set to the same `now`, though) and no shared foreign key between them (`stagingItems` has no `observations`-pointing field, and `observations` has no `stagingItemId` field). This is a real gap that must be closed as part of this fix, since without a shared key, "backfill the matching observation" is ambiguous when multiple ingests happen close together.

The minimal, correct fix: add a `stagingItemId` field to the `observations` doc at write time (Task 3a below, in `ingest.ts`), so `aiClassify.ts` can later query `observations` by that exact id. This is a necessary companion change to the originally-scoped `aiClassify.ts` fix — without it, there is no reliable join key. Add it here, in Task 3, rather than as a separate task, since the backfill is meaningless without it.

- [ ] **Step 1a: Add `stagingItemId` to the observation write in `ingest.ts`**

In `functions/src/ingest/ingest.ts`, replace lines 54-68 (the `stagingItems.add(...)` call) to capture the created doc reference:

```typescript
  const stagingRef = await db.collection('stagingItems').add({
    rawLabel: body.rawLabel,
    rawCategory: body.rawCategory ?? null,
    rawIdentity: body.rawIdentity ?? null,
    payloadSnapshot: JSON.stringify(body.payload),
    collector: body.collector,
    sourceId: body.sourceId,
    capturedAt: now,
    suggestedMatch: null,
    suggestionConfidence: null,
    resolved: false,
    resolvedAt: null,
    classifiedAt: null,
    createdBy: uid,
  });
```

Then replace lines 70-79 (the `observations.add(...)` call) to include the new field:

```typescript
  await db.collection('observations').add({
    registryItemId: null,
    stagingItemId: stagingRef.id,
    deviceSourceId,
    collector: body.collector,
    observedAt: now,
    windowHours: body.payload.windowHours,
    usageCount: body.payload.usageCount,
    usageDurationMs: body.payload.usageDurationMs,
    createdBy: uid,
  });
```

- [ ] **Step 1b: Verify no other code reads `observations` docs in a way `stagingItemId`'s addition would break**

Run: `grep -rn "collection('observations')" functions/src src`
Read each match to confirm none assume a fixed field set that would reject an extra field (Firestore documents are schemaless, so this is a formality check, not expected to find any issue — TypeScript consumers like `src/hooks/useObservations.ts` typically spread `...doc.data()` and would simply gain an extra optional field).

- [ ] **Step 2: Add the backfill call in `aiClassify.ts`'s `processStagingItem`**

In `functions/src/ai/aiClassify.ts`, replace the `processStagingItem` function body's final block (originally lines 56-67):

```typescript
  const classification = await classifyStagingItem(openai, data);

  await doc.ref.update({
    suggestedMatch,
    suggestionConfidence,
    classifiedKind: classification.kind,
    classifiedCategory: classification.category,
    classifiedActive: classification.active,
    classifiedConfidence: classification.confidence,
    resolved: false, // stays false until the user approves/ignores in the Staging screen
    classifiedAt: new Date().toISOString(), // marks successful classification so the retry sweep skips this item
  });
```

with:

```typescript
  const classification = await classifyStagingItem(openai, data);

  await doc.ref.update({
    suggestedMatch,
    suggestionConfidence,
    classifiedKind: classification.kind,
    classifiedCategory: classification.category,
    classifiedActive: classification.active,
    classifiedConfidence: classification.confidence,
    resolved: false, // stays false until the user approves/ignores in the Staging screen
    classifiedAt: new Date().toISOString(), // marks successful classification so the retry sweep skips this item
  });

  // Backfill registryItemId on the observation this staging item originated
  // from, so usage data becomes queryable by item once a match is resolved.
  // Without this, ingest.ts's hardcoded registryItemId: null is never corrected.
  if (suggestedMatch) {
    const observations = await db
      .collection('observations')
      .where('stagingItemId', '==', doc.id)
      .get();
    for (const obsDoc of observations.docs) {
      await obsDoc.ref.update({ registryItemId: suggestedMatch });
    }
  }
```

- [ ] **Step 3: Add a Firestore index for the new `observations.stagingItemId` query if required**

Single-field equality queries on a field with no other filter combined do not require a composite index in Firestore (single-field indexes are automatic) — confirm this holds by checking whether `stagingItemId` might later be combined with another `.where()` in the same query chain. It is not, in the code written in Step 2 above, so no `firestore.indexes.json` change is needed for this specific query. No action required for this step; documented here so the omission is explicit as verified, not simply overlooked.

- [ ] **Step 4: Write a test proving the backfill happens when a match is resolved**

Read `functions/src/ai/aiClassify.ts`'s existing imports and, if a test file already exists, its mocking conventions, before writing this. Otherwise:

```typescript
import { processStagingItem } from './aiClassify';
import * as dedupMatchModule from './dedupMatch';
import * as openaiClientModule from './openaiClient';

jest.mock('./dedupMatch');
jest.mock('./openaiClient');

describe('processStagingItem', () => {
  it('backfills registryItemId on the originating observation when a match is resolved', async () => {
    const updateObservationMock = jest.fn();
    const updateStagingMock = jest.fn();

    (dedupMatchModule.findExactMatch as jest.Mock).mockResolvedValue({ id: 'item-42' });
    (openaiClientModule.callJsonMode as jest.Mock).mockResolvedValue({
      kind: 'app',
      category: 'productivity',
      active: true,
      confidence: 0.9,
    });

    const mockDoc = {
      id: 'staging-1',
      data: () => ({
        rawLabel: 'Todoist',
        rawIdentity: 'com.todoist',
        createdBy: 'uid-1',
      }),
      ref: { update: updateStagingMock },
    };

    const mockDb = {
      collection: jest.fn((name: string) => {
        if (name === 'observations') {
          return {
            where: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({
              docs: [{ ref: { update: updateObservationMock } }],
            }),
          };
        }
        return { where: jest.fn().mockReturnThis(), get: jest.fn() };
      }),
    } as any;

    await processStagingItem({} as any, mockDb, mockDoc as any);

    expect(updateObservationMock).toHaveBeenCalledWith({ registryItemId: 'item-42' });
  });

  it('does not touch observations when no match is resolved', async () => {
    (dedupMatchModule.findExactMatch as jest.Mock).mockResolvedValue(null);
    (dedupMatchModule.findFuzzyMatch as jest.Mock).mockResolvedValue(null);
    (openaiClientModule.callJsonMode as jest.Mock).mockResolvedValue({
      kind: 'app',
      category: 'productivity',
      active: true,
      confidence: 0.9,
    });

    const updateStagingMock = jest.fn();
    const mockDoc = {
      id: 'staging-2',
      data: () => ({ rawLabel: 'Unknown App', createdBy: 'uid-1' }),
      ref: { update: updateStagingMock },
    };

    const collectionMock = jest.fn();
    const mockDb = { collection: collectionMock } as any;

    await processStagingItem({} as any, mockDb, mockDoc as any);

    expect(collectionMock).not.toHaveBeenCalledWith('observations');
  });
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd functions && npm test -- aiClassify`
Expected: PASS (2 new tests)

- [ ] **Step 6: Commit**

```bash
git add functions/src/ingest/ingest.ts functions/src/ai/aiClassify.ts functions/src/ai/aiClassify.test.ts
git commit -m "fix: backfill registryItemId on observations once AI classification resolves a match"
```

---

### Task 4: Add Firestore rule for `coachDailyCounters`

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: none.
- Produces: a `match /coachDailyCounters/{counterId}` block using the same `isOwner`/`isOwnerOnCreate` pattern as the other collections, so client writes from `AnonymousCounters.kt` are no longer denied by default.

- [ ] **Step 1: Add the rule block**

In `firestore.rules`, add after the `taskRankings` block (after line 45, before the closing `}` at line 46):

```
    match /coachDailyCounters/{counterId} {
      allow create: if isOwnerOnCreate();
      allow read, delete: if isOwner(resource);
      allow update: if isOwner(resource) && isOwnerOnCreate();
    }
```

- [ ] **Step 2: Validate rules syntax**

Run: `firebase deploy --only firestore:rules --dry-run`
If the CLI isn't authenticated/linked in this environment, instead run: `node -e "require('fs').readFileSync('firestore.rules', 'utf8')" ` as a basic sanity check and note that full rules validation requires either `firebase deploy --only firestore:rules --dry-run` or the Firestore emulator, to be run manually before this is considered verified.

- [ ] **Step 3: Deploy the rules**

Run: `firebase deploy --only firestore:rules`
Expected: Deploy succeeds.

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "fix: add Firestore rule for coachDailyCounters (client writes were denied by default)"
```

---

### Task 5: Unify `costNormalization.ts` behavior for unrecognized `billingCycle`

**Files:**
- Modify: `functions/src/lib/costNormalization.ts`
- Test: `functions/src/lib/costNormalization.test.ts`

**Interfaces:**
- Consumes: `functions/src/types/enums.ts` (need to add `BillingCycle` there — it currently only exists in `src/types/enums.ts`, confirm via Step 1).
- Produces: `functions/src/lib/costNormalization.ts`'s `monthlyEquivalent` takes a typed `BillingCycle` parameter (not a raw `string`) and has no `default` case, matching `src/lib/costNormalization.ts`'s exhaustive-switch behavior — both sides now fail the same way (a TypeScript compile error for a missing case, and a runtime `undefined` return for a genuinely bad string at the Firestore-document boundary) instead of diverging into "client crashes, server silently mis-costs."

- [ ] **Step 1: Confirm whether `functions/src/types/enums.ts` already has a `BillingCycle` enum**

Read `functions/src/types/enums.ts` (already read during planning research — it currently has `CollectorType`, `MatchConfidence`, `SuggestionAction`, `SuggestionResponse`, but no `BillingCycle`). Confirm this is still accurate before proceeding, since the file may have changed.

- [ ] **Step 2: Add `BillingCycle` to `functions/src/types/enums.ts`, matching `src/types/enums.ts`'s values exactly**

Read `src/types/enums.ts` first to get the exact `BillingCycle` member names and string values (referenced indirectly via `src/lib/costNormalization.ts`'s `BillingCycle.Weekly` / `.Monthly` / `.Quarterly` / `.Annual` / `.OneTime` — confirm the exact string values assigned to each, since `functions/src/lib/costNormalization.ts`'s current raw-string cases are `'weekly'`, `'monthly'`, `'quarterly'`, `'annual'`, `'one_time'` and these must match exactly for the enum values to represent the same Firestore-stored strings).

Add to `functions/src/types/enums.ts` (at the end of the file):

```typescript

export enum BillingCycle {
  Weekly = 'weekly',
  Monthly = 'monthly',
  Quarterly = 'quarterly',
  Annual = 'annual',
  OneTime = 'one_time',
}
```

(Adjust the string values to exactly match whatever `src/types/enums.ts` actually contains if it differs from the inferred values above — this must be a byte-for-byte match since these strings are what's stored in Firestore documents and read by both the client and functions.)

- [ ] **Step 3: Rewrite `functions/src/lib/costNormalization.ts` to use the typed enum with no default case**

Replace the full file contents:

```typescript
import { BillingCycle } from '../types/enums';

export function monthlyEquivalent(cost: number, cycle: BillingCycle): number {
  switch (cycle) {
    case BillingCycle.Weekly:
      return cost * 4.33;
    case BillingCycle.Monthly:
      return cost;
    case BillingCycle.Quarterly:
      return cost / 3;
    case BillingCycle.Annual:
      return cost / 12;
    case BillingCycle.OneTime:
      return 0;
  }
}
```

This is now identical in shape to `src/lib/costNormalization.ts` — TypeScript's exhaustiveness checking on the enum switch means both sides now: (a) fail to compile if a new `BillingCycle` member is ever added without updating both files, and (b) return `undefined` at runtime for a value that bypasses the type system (e.g. malformed Firestore data read as `any` before being passed in) — consistent behavior instead of the previous client-crash-vs-server-silent-wrong-math divergence.

- [ ] **Step 4: Find and update all call sites in `functions/src` that currently pass a raw string**

Run: `grep -rn "monthlyEquivalent" functions/src`
For each call site found, confirm the value being passed is already a `BillingCycle`-typed value from a Firestore document read (e.g. `(doc.data() as RegistryItem).billingCycle` where `RegistryItem`'s `billingCycle` field should be typed as `BillingCycle`, not `string`). If any call site's source type is `string` rather than `BillingCycle`, either widen the source type through the `RegistryItem` interface in `functions/src/types/models.ts` (check if it exists and what `billingCycle` is currently typed as) or cast at the call site with `body.billingCycle as BillingCycle` if the value definitely originates from a client that already uses the same enum values (true here, since `src/types/enums.ts`'s `BillingCycle` produces the exact strings stored in Firestore).

- [ ] **Step 5: Build to confirm no TypeScript errors**

Run: `cd functions && npm run build` (or `npx tsc --noEmit` if no dedicated build script — confirm via the `package.json` scripts checked in the other plan's Task 1 Step 0, or check this repo's `functions/package.json` directly)
Expected: no type errors.

- [ ] **Step 6: Write a test confirming both implementations now behave identically for all valid cycles**

```typescript
import { monthlyEquivalent } from './costNormalization';
import { BillingCycle } from '../types/enums';

describe('monthlyEquivalent', () => {
  it('converts weekly to monthly', () => {
    expect(monthlyEquivalent(10, BillingCycle.Weekly)).toBeCloseTo(43.3);
  });

  it('leaves monthly unchanged', () => {
    expect(monthlyEquivalent(10, BillingCycle.Monthly)).toBe(10);
  });

  it('converts quarterly to monthly', () => {
    expect(monthlyEquivalent(30, BillingCycle.Quarterly)).toBe(10);
  });

  it('converts annual to monthly', () => {
    expect(monthlyEquivalent(120, BillingCycle.Annual)).toBe(10);
  });

  it('treats one_time as zero monthly cost', () => {
    expect(monthlyEquivalent(500, BillingCycle.OneTime)).toBe(0);
  });
});
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd functions && npm test -- costNormalization`
Expected: PASS (5 tests)

- [ ] **Step 8: Commit**

```bash
git add functions/src/types/enums.ts functions/src/lib/costNormalization.ts functions/src/lib/costNormalization.test.ts
git commit -m "fix: unify server-side costNormalization with client's typed BillingCycle enum, removing silent-fallback divergence"
```

---

### Task 6: Fix `aiRank` to upsert `taskRankings` instead of always creating a new doc

**Files:**
- Modify: `functions/src/ai/aiRank.ts`
- Test: `functions/src/ai/aiRank.test.ts`

**Interfaces:**
- Consumes: same `db`, `uid`, `taskCategory` already in scope in `rankCategory`.
- Produces: `rankCategory` now queries for an existing `taskRankings` doc matching `(createdBy, taskCategory)` and updates it if found, matching `deviceSource.ts`'s `findOrCreateDeviceSource` pattern, instead of unconditionally `add()`-ing a new doc every call.

- [ ] **Step 1: Replace the unconditional `add()` with query-then-update-or-create**

In `functions/src/ai/aiRank.ts`, replace lines 33-40 (the `await db.collection('taskRankings').add({...})` block):

```typescript
  const existingRanking = await db
    .collection('taskRankings')
    .where('createdBy', '==', uid)
    .where('taskCategory', '==', taskCategory)
    .limit(1)
    .get();

  const rankingData = {
    taskCategory,
    orderedItems: parsed.orderedItemIds,
    lastRankedAt: new Date().toISOString(),
    manuallyOverridden: false,
    overrideNote: null,
    createdBy: uid,
  };

  if (existingRanking.empty) {
    await db.collection('taskRankings').add(rankingData);
  } else {
    await existingRanking.docs[0].ref.update(rankingData);
  }
```

- [ ] **Step 2: Add the composite index this new query requires**

The query `.where('createdBy', '==', uid).where('taskCategory', '==', taskCategory)` combines two equality filters — Firestore does not require a composite index for multiple equality-only filters (only range/array-contains combinations need one), so no `firestore.indexes.json` change is needed here. Confirm this is still accurate: run `firebase deploy --only firestore:rules,firestore:indexes --dry-run` after this change and check for any `FAILED_PRECONDITION` index-suggestion errors in the deploy output if a live test is run against the query in Step 4 below.

- [ ] **Step 3: Run the existing test suite to confirm the earlier `aiRank` tests (Task 2) still pass with this change**

Run: `cd functions && npm test -- aiRank`
Expected: The two tests from Task 2 need their `mockDb.collection('taskRankings')` mock shape updated to support `.where().where().limit().get()` in addition to `.add()`, since the code path changed. Update both tests from Task 2's Step 4 in `functions/src/ai/aiRank.test.ts`:

Replace the `mockDb.collection` mock in the "accepts a bestItemId" test (Task 2 Step 4's second test) — the `else` branch (`return { add: addMock };`) needs to also handle the `taskRankings` query-then-create path:

```typescript
    const mockDb = {
      collection: jest.fn((name: string) => {
        if (name === 'registryItems') {
          return {
            where: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({
              docs: [
                { id: 'item-1', data: () => ({ name: 'Todoist' }), ref: { update: updateMock } },
              ],
            }),
          };
        }
        // taskRankings: query-then-create/update path
        return {
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          add: addMock,
        };
      }),
    } as any;
```

- [ ] **Step 4: Write a new test proving an existing ranking doc is updated, not duplicated**

```typescript
  it('updates the existing taskRankings doc instead of creating a duplicate', async () => {
    const updateItemMock = jest.fn();
    const updateRankingMock = jest.fn();
    const addMock = jest.fn();
    const existingRankingDoc = { ref: { update: updateRankingMock } };

    const mockDb = {
      collection: jest.fn((name: string) => {
        if (name === 'registryItems') {
          return {
            where: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({
              docs: [
                { id: 'item-1', data: () => ({ name: 'Todoist' }), ref: { update: updateItemMock } },
              ],
            }),
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ empty: false, docs: [existingRankingDoc] }),
          add: addMock,
        };
      }),
    } as any;

    (openaiClientModule.callJsonMode as jest.Mock).mockResolvedValue({
      orderedItemIds: ['item-1'],
      bestItemId: 'item-1',
    });

    await rankCategory({} as any, mockDb, 'test-uid', 'productivity');

    expect(updateRankingMock).toHaveBeenCalled();
    expect(addMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 5: Run all `aiRank` tests to verify they pass**

Run: `cd functions && npm test -- aiRank`
Expected: PASS (4 tests total: 2 from Task 2, 2 new/updated here)

- [ ] **Step 6: Commit**

```bash
git add functions/src/ai/aiRank.ts functions/src/ai/aiRank.test.ts
git commit -m "fix: upsert taskRankings instead of always creating a new doc, preventing duplicate/non-deterministic rankings"
```

---

### Task 7: Bound the `dormancyCheck` retry sweep with pagination

**Files:**
- Modify: `functions/src/scheduled/dormancyCheck.ts`
- Test: `functions/src/scheduled/dormancyCheck.test.ts`

**Interfaces:**
- Consumes: `onSchedule` from `firebase-functions/v2/scheduler` (already imported).
- Produces: `runRetrySweep` now paginates through the `stagingItems` backlog in bounded batches (so a single invocation processes at most `BATCH_SIZE` items) and `dormancyCheck`'s `onSchedule` call gets an explicit `timeoutSeconds` so long-running sweeps fail predictably rather than silently hitting the platform default.

- [ ] **Step 1: Add a bounded batch limit to the sweep query**

In `functions/src/scheduled/dormancyCheck.ts`, replace lines 7-22:

```typescript
type ProcessFn = (openai: OpenAI, db: Firestore, doc: DocumentSnapshot) => Promise<void>;

const BATCH_SIZE = 50;

export async function runRetrySweep(openai: OpenAI, db: Firestore, processFn: ProcessFn = processStagingItem): Promise<void> {
  const stuck = await db
    .collection('stagingItems')
    .where('resolved', '==', false)
    .where('classifiedAt', '==', null)
    .limit(BATCH_SIZE)
    .get();

  if (stuck.size === BATCH_SIZE) {
    console.warn(
      `dormancyCheck retry sweep hit the ${BATCH_SIZE}-item batch cap — backlog may exceed this run's capacity and will continue next scheduled run.`
    );
  }

  for (const doc of stuck.docs) {
    try {
      await processFn(openai, db, doc);
    } catch (e) {
      console.error(`Retry sweep failed for staging item ${doc.id}:`, e);
    }
  }
}
```

This bounds each run's work so it can't grow unbounded, and logs (not silently drops) when the cap is hit, so a growing backlog is observable in Cloud Functions logs. It still fully drains a backlog over multiple daily runs (each run processes up to 50 stuck items; next day's run picks up the rest since processed items get `classifiedAt` set and drop out of the query), rather than one run trying to process an unbounded set until it times out and restarts from zero.

- [ ] **Step 2: Add an explicit `timeoutSeconds` to the scheduled function**

Replace lines 24-33:

```typescript
export const dormancyCheck = onSchedule(
  { schedule: 'every day 03:00', timeoutSeconds: 300 },
  async () => {
    const admin = await import('firebase-admin');
    const db = admin.firestore();
    const openai = getOpenAIClient();
    // Dormancy itself is derived client-side at read time (per the base spec's
    // "never store dormant as a field" rule) — this scheduled job's own
    // responsibility is solely the staging retry sweep. A future deadMoneyAlert
    // run (Task 4, next) is what actually needs a server-side dormancy check.
    await runRetrySweep(openai, db);
  }
);
```

`onSchedule` accepts either a plain string (as it was) or a `ScheduleOptions` object with a `schedule` field plus other options like `timeoutSeconds` — confirm this against the installed `firebase-functions` version's type signature before finalizing (run `grep -n "\"firebase-functions\"" functions/package.json` to check the version, then check `node_modules/firebase-functions/lib/v2/scheduler.d.ts` — or the installed types — for `ScheduleOptions`'s exact fields if this errors on build). 300 seconds (5 minutes) is chosen as generous headroom for 50 sequential OpenAI-round-trip classifications; adjust if `classifyStagingItem`'s typical latency (visible in existing logs/monitoring, not available in this static review) suggests otherwise.

- [ ] **Step 3: Build to confirm the `onSchedule` options object is valid for the installed version**

Run: `cd functions && npm run build`
Expected: no type errors. If `onSchedule` in the installed version doesn't accept an options-object first argument, check its actual signature and adjust (some versions take `(schedule: string, opts: ScheduleOptions, handler)` as three args instead of `(opts, handler)` — match whatever `node_modules/firebase-functions/lib/v2/scheduler.d.ts` declares).

- [ ] **Step 4: Write a test proving the sweep is capped at `BATCH_SIZE`**

```typescript
import { runRetrySweep } from './dormancyCheck';

describe('runRetrySweep', () => {
  it('caps the query at the batch size limit', async () => {
    const limitMock = jest.fn().mockReturnThis();
    const getMock = jest.fn().mockResolvedValue({ size: 0, docs: [] });
    const mockDb = {
      collection: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: limitMock,
        get: getMock,
      }),
    } as any;
    const processFn = jest.fn();

    await runRetrySweep({} as any, mockDb, processFn);

    expect(limitMock).toHaveBeenCalledWith(50);
  });

  it('processes every doc returned up to the cap and continues past individual failures', async () => {
    const docs = [
      { id: 'a', ref: {} },
      { id: 'b', ref: {} },
      { id: 'c', ref: {} },
    ];
    const mockDb = {
      collection: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ size: 3, docs }),
      }),
    } as any;
    const processFn = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);

    await runRetrySweep({} as any, mockDb, processFn);

    expect(processFn).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd functions && npm test -- dormancyCheck`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add functions/src/scheduled/dormancyCheck.ts functions/src/scheduled/dormancyCheck.test.ts
git commit -m "fix: bound dormancyCheck retry sweep to a batch limit and set an explicit function timeout"
```

---

### Task 8: Full verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run the full functions test suite**

Run: `cd functions && npm test`
Expected: all tests pass, including the new/updated ones from Tasks 2, 3, 5, 6, 7.

- [ ] **Step 2: Run a full TypeScript build**

Run: `cd functions && npm run build`
Expected: no type errors.

- [ ] **Step 3: Confirm `firestore.indexes.json` and `firestore.rules` are both valid and deployable**

Run: `firebase deploy --only firestore --dry-run` (or, if the project isn't linked in this environment, note that this must be run manually before considering Tasks 1 and 4 fully deployed).

- [ ] **Step 4: Commit if any build step produced formatting changes (otherwise skip)**

```bash
git status
```

If nothing changed beyond the prior tasks' commits, there is nothing further to commit.
