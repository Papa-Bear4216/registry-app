# Native Collector + Client Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four correctness bugs spanning `native-usage-collector` (Kotlin/Android), `functions/src/ingest` (Cloud Functions), and `src/hooks` (React): duplicate Firestore docs from non-idempotent retry after partial batch failure, a leaked OkHttp connection on the success path, a race condition creating duplicate `deviceSources` docs, and a stuck-loading UI state on Firestore errors.

**Architecture:** The worker/ingest idempotency fix (Task 1) is the most involved — it threads a client-generated idempotency key through the Kotlin payload and Cloud Function write path, and makes `/ingest` a dedupe-on-write operation keyed by that value. The other three tasks are independent, narrowly-scoped fixes to their own files.

**Tech Stack:** Kotlin, OkHttp, WorkManager/Hilt (native-usage-collector); TypeScript, Firebase Cloud Functions v2, Firestore transactions (functions); React, Firebase JS SDK (`onSnapshot`).

**Spec:** Ultra code-review findings #4, #12, #13, #14 (registry-app full-repo review, 2026-08-17).

## Global Constraints

- `functions/src/ingest/ingest.ts`'s `IngestBody` interface (and its `isValidBody` type guard) is the wire contract shared with `native-usage-collector/app/src/main/kotlin/com/registry/collector/network/IngestBody` (a Kotlin `@Serializable` data class) — any field added to one side must be added to the other, and `isValidBody` must be updated to validate it.
- `native-usage-collector`'s `UsageCollectorWorker.kt` failure-handling comment (lines 30-32) documents the existing design intent: "a failed POST does not trigger aggressive retry — UsageStatsManager data persists on-device regardless, so the next cycle picks up everything since lastSuccessfulSync." The idempotency fix in Task 1 must preserve this behavior for the *no-data-loss* half while fixing the *duplicate-write* half — do not change the retry-on-failure strategy itself, only make retries safe.
- Firestore security rules (`firestore.rules`) currently do not have a `deviceSources`-specific uniqueness constraint (rules can't enforce query-based uniqueness) — the Task 3 fix must be done via `db.runTransaction()` server-side, not via a rules change.

---

### Task 1: Make `/ingest` writes idempotent via a client-generated idempotency key

**Files:**
- Modify: `native-usage-collector/app/src/main/kotlin/com/registry/collector/network/IngestApiService.kt` (confirm `IngestBody`'s location — likely a sibling file; see Step 1)
- Modify: `native-usage-collector/app/src/main/kotlin/com/registry/collector/worker/UsageCollectorWorker.kt`
- Modify: `functions/src/ingest/ingest.ts`
- Test: `functions/src/ingest/ingest.test.ts`
- Test: `native-usage-collector/app/src/test/kotlin/com/registry/collector/worker/UsageCollectorWorkerTest.kt`

**Interfaces:**
- Consumes: none new on the Kotlin side beyond `java.util.UUID` (stdlib).
- Produces: `IngestBody` gains a required `idempotencyKey: String` field. `handleIngest` in `ingest.ts` uses it to detect and skip a duplicate `observations`/`stagingItems` write pair for a retry of the same record, instead of blindly `add()`-ing every call.

- [ ] **Step 1: Locate the `IngestBody` and `IngestPayload` data class definitions**

Run: `grep -rln "data class IngestBody\|data class IngestPayload" native-usage-collector/`
Read the file found (referenced as `IngestBody`/`IngestPayload` from `UsageCollectorWorker.kt:15-16` and `IngestApiService.kt`, but not yet directly opened — confirm its exact path and current field list before editing).

- [ ] **Step 2: Add `idempotencyKey` to `IngestBody`**

In the file found in Step 1, add a new field to the `IngestBody` data class. Based on the existing usage in `UsageCollectorWorker.kt:116-128` (`IngestBody(collector = ..., sourceId = ..., sourceLabel = ..., rawLabel = ..., rawCategory = ..., rawIdentity = ..., payload = ...)`), add `idempotencyKey: String` as a new required constructor parameter:

```kotlin
@Serializable
data class IngestBody(
    val collector: String,
    val sourceId: String,
    val sourceLabel: String,
    val rawLabel: String,
    val rawCategory: String?,
    val rawIdentity: String?,
    val payload: IngestPayload,
    val idempotencyKey: String,
) {
    companion object {
        const val COLLECTOR_PHONE_USAGE = "phone_usage"
    }
}
```

(Preserve whatever the existing field ordering, `@Serializable` annotation, and `COLLECTOR_PHONE_USAGE` companion constant actually look like in the file found in Step 1 — this is illustrative of the one field being added, not a full rewrite; only insert the `idempotencyKey: String` line and thread it through the constructor call sites in Step 3.)

- [ ] **Step 3: Generate a stable idempotency key per record in `UsageCollectorWorker.toIngestBody`**

The key must be stable across retries of the *same* record (so a retried POST for the same usage window is recognized as a duplicate) but distinct across *different* records. The natural stable identity for a phone-usage record is `(sourceId, packageName, windowHours, the sync window's sinceTimestamp)` — not a random UUID, since a UUID would defeat idempotency by being different on every retry attempt.

In `native-usage-collector/app/src/main/kotlin/com/registry/collector/worker/UsageCollectorWorker.kt`, modify `doWork()`'s POST loop (originally lines 72-76) to pass `sinceTimestamp` through to `toIngestBody`:

```kotlin
        try {
            for (record in records) {
                val body = record.toIngestBody(sourceId, sourceLabel, sinceTimestamp)
                ingestApiService.postObservation(idToken, body)
            }
        } catch (e: IngestApiException) {
```

Then replace the `toIngestBody` extension function (originally lines 115-129):

```kotlin
/**
 * Maps an [AppUsageRecord] to the exact [IngestBody] shape expected by
 * functions/src/ingest/ingest.ts.
 *
 * idempotencyKey is derived deterministically from (sourceId, packageName,
 * sinceTimestamp) — NOT a random UUID — so that retrying the same sync
 * window after a partial-batch failure produces the same key on the server,
 * letting handleIngest recognize and skip an already-written duplicate.
 */
private fun AppUsageRecord.toIngestBody(sourceId: String, sourceLabel: String, sinceTimestamp: Long): IngestBody {
    return IngestBody(
        collector = IngestBody.COLLECTOR_PHONE_USAGE,
        sourceId = sourceId,
        sourceLabel = sourceLabel,
        rawLabel = appLabel,
        rawCategory = null, // Phone usage collector doesn't provide category hints
        rawIdentity = packageName, // Package name → canonicalIdentity for dedup matching
        payload = IngestPayload(
            usageCount = launchCount,
            usageDurationMs = totalTimeInForegroundMs,
            windowHours = windowHours,
        ),
        idempotencyKey = "$sourceId:$packageName:$sinceTimestamp",
    )
}
```

- [ ] **Step 4: Update `functions/src/ingest/ingest.ts` to validate and dedupe on `idempotencyKey`**

In `functions/src/ingest/ingest.ts`, replace the `IngestBody` interface and `isValidBody` (lines 8-33):

```typescript
interface IngestBody {
  collector: CollectorType;
  sourceId: string;
  sourceLabel: string;
  rawLabel: string;
  rawCategory?: string;
  rawIdentity?: string;
  idempotencyKey: string;
  payload: {
    usageCount: number;
    usageDurationMs: number;
    windowHours: number;
  };
}

function isValidBody(body: any): body is IngestBody {
  return (
    typeof body?.collector === 'string' &&
    typeof body?.sourceId === 'string' &&
    typeof body?.sourceLabel === 'string' &&
    typeof body?.rawLabel === 'string' &&
    typeof body?.idempotencyKey === 'string' &&
    body.idempotencyKey.length > 0 &&
    typeof body?.payload === 'object' &&
    typeof body?.payload?.usageCount === 'number' &&
    typeof body?.payload?.usageDurationMs === 'number' &&
    typeof body?.payload?.windowHours === 'number'
  );
}
```

Then replace `handleIngest`'s write section (originally lines 49-79) to check for an existing `observations` doc with the same `(createdBy, idempotencyKey)` before writing:

```typescript
  const body = req.body;
  const now = new Date().toISOString();

  const existing = await db
    .collection('observations')
    .where('createdBy', '==', uid)
    .where('idempotencyKey', '==', body.idempotencyKey)
    .limit(1)
    .get();

  if (!existing.empty) {
    // Already ingested — this is a retry of a partially-failed batch.
    // Returning 200 here (not re-writing) keeps the worker's retry loop
    // simple: every record in the batch either succeeds or is confirmed
    // already-succeeded, with no duplicate stagingItems/observations pair.
    res.status(200).json({ ok: true, deduped: true });
    return;
  }

  const deviceSourceId = await findOrCreateDeviceSource(db, uid, body.sourceId, body.collector, body.sourceLabel);

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

  await db.collection('observations').add({
    registryItemId: null,
    stagingItemId: stagingRef.id,
    deviceSourceId,
    idempotencyKey: body.idempotencyKey,
    collector: body.collector,
    observedAt: now,
    windowHours: body.payload.windowHours,
    usageCount: body.payload.usageCount,
    usageDurationMs: body.payload.usageDurationMs,
    createdBy: uid,
  });

  res.status(200).json({ ok: true });
```

Note: this assumes Task 3 of the companion `2026-08-17-cloud-functions-correctness-fixes.md` plan (the `stagingItemId` backfill fix) may or may not already be applied — if `stagingRef`/`stagingItemId` isn't yet present in the working tree when this task executes, keep the original `await db.collection('stagingItems').add({...})` (without capturing `stagingRef`) and omit the `stagingItemId: stagingRef.id` line from the `observations.add()` call below it; the `idempotencyKey` field is independent of that other fix and must be added either way.

- [ ] **Step 5: Add the composite index for the new dedupe query**

The dedupe query `.where('createdBy', '==', uid).where('idempotencyKey', '==', body.idempotencyKey)` combines two equality filters, which does not require a composite index in Firestore. No `firestore.indexes.json` change needed. (Confirmed by the same reasoning as Task 6 Step 2 in the companion Cloud Functions plan — multiple equality-only filters use automatic single-field indexes, not composite ones.)

- [ ] **Step 6: Build the functions package to confirm no type errors**

Run: `cd functions && npm run build`
Expected: no type errors.

- [ ] **Step 7: Write a test proving a duplicate `idempotencyKey` is deduped, not double-written**

Read `functions/src/ingest/ingest.ts`'s existing test file if one exists (`grep -rln "handleIngest" functions/src --include="*.test.ts"`) to match its request/response mocking conventions. Otherwise:

```typescript
import { handleIngest } from './ingest';
import * as authModule from '../lib/auth';
import * as deviceSourceModule from './deviceSource';

jest.mock('../lib/auth');
jest.mock('./deviceSource');

describe('handleIngest', () => {
  const baseBody = {
    collector: 'phone_usage',
    sourceId: 'device-1',
    sourceLabel: 'Pixel 8',
    rawLabel: 'Todoist',
    rawIdentity: 'com.todoist',
    idempotencyKey: 'device-1:com.todoist:1700000000000',
    payload: { usageCount: 5, usageDurationMs: 60000, windowHours: 6 },
  };

  function mockReqRes(body: any) {
    const req = { headers: { authorization: 'Bearer test' }, body } as any;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as any;
    return { req, res };
  }

  it('skips the write and returns deduped:true when idempotencyKey already exists', async () => {
    (authModule.verifyIdToken as jest.Mock).mockResolvedValue('uid-1');

    const addMock = jest.fn();
    const mockDb = {
      collection: jest.fn((name: string) => {
        if (name === 'observations') {
          return {
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ empty: false, docs: [{ id: 'existing-obs' }] }),
            add: addMock,
          };
        }
        return { add: addMock };
      }),
    } as any;

    const { req, res } = mockReqRes(baseBody);
    await handleIngest(mockDb, req, res);

    expect(addMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true, deduped: true });
  });

  it('writes normally when idempotencyKey has not been seen before', async () => {
    (authModule.verifyIdToken as jest.Mock).mockResolvedValue('uid-1');
    (deviceSourceModule.findOrCreateDeviceSource as jest.Mock).mockResolvedValue('device-source-1');

    const stagingAddMock = jest.fn().mockResolvedValue({ id: 'staging-1' });
    const observationAddMock = jest.fn().mockResolvedValue({ id: 'obs-1' });
    const mockDb = {
      collection: jest.fn((name: string) => {
        if (name === 'observations') {
          return {
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
            add: observationAddMock,
          };
        }
        if (name === 'stagingItems') {
          return { add: stagingAddMock };
        }
        return {};
      }),
    } as any;

    const { req, res } = mockReqRes(baseBody);
    await handleIngest(mockDb, req, res);

    expect(observationAddMock).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'device-1:com.todoist:1700000000000' })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects a body missing idempotencyKey', async () => {
    (authModule.verifyIdToken as jest.Mock).mockResolvedValue('uid-1');
    const { idempotencyKey, ...bodyWithoutKey } = baseBody;
    const { req, res } = mockReqRes(bodyWithoutKey);
    const mockDb = { collection: jest.fn() } as any;

    await handleIngest(mockDb, req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd functions && npm test -- ingest`
Expected: PASS (3 tests)

- [ ] **Step 9: Write a Kotlin test proving `toIngestBody` produces a stable, non-random key across calls with the same inputs**

In `native-usage-collector/app/src/test/kotlin/com/registry/collector/worker/UsageCollectorWorkerTest.kt`, read the existing test file first (referenced in the review findings as "only tests the toIngestBody() mapper") to match its existing structure, then add:

```kotlin
    @Test
    fun `toIngestBody produces the same idempotencyKey for identical inputs`() {
        val record = AppUsageRecord(
            packageName = "com.todoist",
            appLabel = "Todoist",
            launchCount = 5,
            totalTimeInForegroundMs = 60000L,
            windowHours = 6,
        )

        val body1 = record.toIngestBodyTestHook(sourceId = "device-1", sourceLabel = "Pixel 8", sinceTimestamp = 1700000000000L)
        val body2 = record.toIngestBodyTestHook(sourceId = "device-1", sourceLabel = "Pixel 8", sinceTimestamp = 1700000000000L)

        assertEquals(body1.idempotencyKey, body2.idempotencyKey)
        assertEquals("device-1:com.todoist:1700000000000", body1.idempotencyKey)
    }

    @Test
    fun `toIngestBody produces a different idempotencyKey for a different sync window`() {
        val record = AppUsageRecord(
            packageName = "com.todoist",
            appLabel = "Todoist",
            launchCount = 5,
            totalTimeInForegroundMs = 60000L,
            windowHours = 6,
        )

        val body1 = record.toIngestBodyTestHook(sourceId = "device-1", sourceLabel = "Pixel 8", sinceTimestamp = 1700000000000L)
        val body2 = record.toIngestBodyTestHook(sourceId = "device-1", sourceLabel = "Pixel 8", sinceTimestamp = 1700003600000L)

        assertNotEquals(body1.idempotencyKey, body2.idempotencyKey)
    }
```

The private `toIngestBody` extension function in `UsageCollectorWorker.kt` isn't directly callable from the test file (it's `private fun AppUsageRecord.toIngestBody(...)`, file-private). Change its visibility from `private fun` to `internal fun` and rename it to `toIngestBodyTestHook`... actually, simplest fix: just change `private fun AppUsageRecord.toIngestBody` to `internal fun AppUsageRecord.toIngestBody` in the Step 3 code above (internal is visible within the same Gradle module's test source set), and use the real name `toIngestBody` in the test rather than a fake `toIngestBodyTestHook` name — correct the two calls above from `record.toIngestBodyTestHook(...)` to `record.toIngestBody(...)`.

Confirm `AppUsageRecord`'s actual constructor field names/order by reading `native-usage-collector/app/src/main/kotlin/com/registry/collector/data/AppUsageRecord.kt` before finalizing this test, since the field names used above (`packageName`, `appLabel`, `launchCount`, `totalTimeInForegroundMs`, `windowHours`) are inferred from their usage in `UsageCollectorWorker.kt:117-127` and may not be the exact declared property names/order.

- [ ] **Step 10: Update `toIngestBody`'s visibility modifier as described in Step 9**

In `native-usage-collector/app/src/main/kotlin/com/registry/collector/worker/UsageCollectorWorker.kt`, change the function declared in Step 3 from `private fun AppUsageRecord.toIngestBody(...)` to `internal fun AppUsageRecord.toIngestBody(...)`.

- [ ] **Step 11: Run the Kotlin tests to verify they pass**

Run: `cd native-usage-collector && ./gradlew :app:testDebugUnitTest --tests "com.registry.collector.worker.UsageCollectorWorkerTest"`
Expected: PASS (existing tests + 2 new ones)

- [ ] **Step 12: Commit**

```bash
git add native-usage-collector/app/src/main/kotlin/com/registry/collector/worker/UsageCollectorWorker.kt native-usage-collector/app/src/test/kotlin/com/registry/collector/worker/UsageCollectorWorkerTest.kt functions/src/ingest/ingest.ts functions/src/ingest/ingest.test.ts
git commit -m "fix: make /ingest idempotent via a deterministic per-record key, preventing duplicates on partial-batch retry"
```

(Also commit the `IngestBody` file identified in Step 1 if it's a separate file from `IngestApiService.kt` — `git add` its actual path alongside the files above.)

---

### Task 2: Close the OkHttp response on the success path

**Files:**
- Modify: `native-usage-collector/app/src/main/kotlin/com/registry/collector/network/IngestApiService.kt`
- Test: `native-usage-collector/app/src/test/kotlin/com/registry/collector/network/IngestApiServiceTest.kt`

**Interfaces:**
- Consumes: none new.
- Produces: `postObservation` closes the OkHttp `Response` on every code path (success and failure), via `.use { }`, instead of only implicitly closing it on the error branch via `response.body?.string()`.

- [ ] **Step 1: Wrap the call in `.use { }` so the response is closed on every exit path**

In `native-usage-collector/app/src/main/kotlin/com/registry/collector/network/IngestApiService.kt`, replace `postObservation`'s body (originally lines 45-65):

```kotlin
    suspend fun postObservation(idToken: String, body: IngestBody) {
        withContext(Dispatchers.IO) {
            val jsonBody = json.encodeToString(body)
            val request = Request.Builder()
                .url("${BuildConfig.INGEST_BASE_URL}/ingest")
                .addHeader("Authorization", "Bearer $idToken")
                .addHeader("Content-Type", "application/json")
                .post(jsonBody.toRequestBody("application/json".toMediaType()))
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    val errorBody = response.body?.string() ?: "Unknown error"
                    throw IngestApiException(
                        statusCode = response.code,
                        message = "POST /ingest failed (${response.code}): $errorBody"
                    )
                }
            }
        }
    }
```

`Response.use { }` (from `okhttp3.Response`, which implements `Closeable`) closes the response body/connection when the block exits, whether normally or via an exception thrown inside it — including the `throw IngestApiException(...)` on the error branch, so this covers both paths with one change.

- [ ] **Step 2: Build to confirm the change compiles**

Run: `cd native-usage-collector && ./gradlew :app:assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Write a test proving the response is closed after a successful call**

OkHttp's `Response` doesn't expose a public "isClosed" flag directly testable via mocking without MockWebServer. Use `okhttp3.mockwebserver.MockWebServer` (check if already a test dependency — run `grep -n "mockwebserver" native-usage-collector/app/build.gradle.kts`; if absent, add `testImplementation("com.squareup.okhttp3:mockwebserver:4.12.1")`, matching the OkHttp version already used by the main dependency — check `grep -n "okhttp" native-usage-collector/app/build.gradle.kts` for the exact version to match):

```kotlin
package com.registry.collector.network

import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Before
import org.junit.Test

class IngestApiServiceTest {

    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `postObservation completes without throwing on a successful response`() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))

        val service = IngestApiService()
        val body = IngestBody(
            collector = IngestBody.COLLECTOR_PHONE_USAGE,
            sourceId = "device-1",
            sourceLabel = "Pixel 8",
            rawLabel = "Todoist",
            rawCategory = null,
            rawIdentity = "com.todoist",
            payload = IngestPayload(usageCount = 1, usageDurationMs = 1000, windowHours = 6),
            idempotencyKey = "device-1:com.todoist:1700000000000",
        )

        // BuildConfig.INGEST_BASE_URL points at the real configured base URL, not
        // the MockWebServer instance — this test's primary value is exercising the
        // .use{} code path without leaking; a full request-routing test would need
        // INGEST_BASE_URL to be injectable rather than a BuildConfig constant, which
        // is a separate, larger refactor out of scope for this fix. If BuildConfig.
        // INGEST_BASE_URL cannot be pointed at `server.url("/").toString()` in the
        // test build variant, mark this test with SKIP and note the limitation
        // rather than asserting against a URL the code doesn't actually call.
        service.postObservation("fake-token", body)
    }
}
```

Note the honest limitation documented in the test's comment: `IngestApiService` hardcodes `BuildConfig.INGEST_BASE_URL`, which likely can't be redirected to a `MockWebServer` instance without either (a) a debug build config pointing `INGEST_BASE_URL` at `10.0.2.2` or similar for instrumented tests only, or (b) refactoring `IngestApiService` to accept the base URL via constructor injection instead of reading `BuildConfig` directly. If constructor injection is preferred for testability, that's a larger structural change than this bug fix calls for — if the base URL cannot be redirected, skip Step 3's MockWebServer test entirely and instead rely on Step 2's build success as the primary verification, noting in the commit message that response-closing is verified by code review (the `.use{}` block is a well-established, correct OkHttp idiom) rather than by an executable regression test.

- [ ] **Step 4: Run the test if Step 3's URL-redirection limitation doesn't block it; otherwise skip**

Run: `cd native-usage-collector && ./gradlew :app:testDebugUnitTest --tests "com.registry.collector.network.IngestApiServiceTest"`
Expected: PASS, or SKIPPED with a documented reason per Step 3's note.

- [ ] **Step 5: Commit**

```bash
git add native-usage-collector/app/src/main/kotlin/com/registry/collector/network/IngestApiService.kt
git commit -m "fix: close OkHttp response on the success path to prevent a connection leak on every 6h sync"
```

(Include the test file in the commit only if Step 3/4 produced a working test.)

---

### Task 3: Wrap `findOrCreateDeviceSource` in a Firestore transaction

**Files:**
- Modify: `functions/src/ingest/deviceSource.ts`
- Test: `functions/src/ingest/deviceSource.test.ts`

**Interfaces:**
- Consumes: `db.runTransaction()` (existing `firebase-admin` Firestore SDK method, not yet used elsewhere in this file).
- Produces: `findOrCreateDeviceSource` performs its query-then-update-or-create atomically, so two concurrent calls for the same never-before-seen `(uid, sourceId)` cannot both create a doc.

- [ ] **Step 1: Rewrite `findOrCreateDeviceSource` to use `runTransaction`**

In `functions/src/ingest/deviceSource.ts`, replace the full function body (lines 4-34):

```typescript
export async function findOrCreateDeviceSource(
  db: Firestore,
  uid: string,
  sourceId: string,
  collector: CollectorType,
  label: string
): Promise<string> {
  const now = new Date().toISOString();

  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(
      db.collection('deviceSources').where('createdBy', '==', uid).where('sourceId', '==', sourceId).limit(1)
    );

    if (!existing.empty) {
      const doc = existing.docs[0];
      transaction.update(doc.ref, { lastSeen: now });
      return doc.id;
    }

    const newRef = db.collection('deviceSources').doc();
    transaction.set(newRef, {
      sourceId,
      label,
      collector,
      firstSeen: now,
      lastSeen: now,
      createdBy: uid,
    });
    return newRef.id;
  });
}
```

Note the key structural change: Firestore transactions require pre-allocating a document reference (`db.collection('deviceSources').doc()`, which generates an id client-side without a round-trip) and using `transaction.set()` rather than the non-transactional `collection.add()`, since `add()` has no transactional equivalent — this is the standard Firestore pattern for "create if not exists" under a transaction.

- [ ] **Step 2: Build to confirm no type errors**

Run: `cd functions && npm run build`
Expected: no type errors.

- [ ] **Step 3: Write a test proving concurrent calls for the same never-before-seen source don't create duplicates**

A true concurrency test requires the Firestore emulator (a mocked `db` can't simulate transaction retry/contention semantics). Write two tests: one confirming the transactional read-then-write shape is used (unit-level, mocked), and note that full concurrency verification requires the emulator.

```typescript
import { findOrCreateDeviceSource } from './deviceSource';
import { CollectorType } from '../types/enums';

describe('findOrCreateDeviceSource', () => {
  it('creates a new deviceSource inside a transaction when none exists', async () => {
    const setMock = jest.fn();
    const newDocRef = { id: 'generated-id' };
    const mockDb = {
      runTransaction: jest.fn(async (fn: any) => {
        const transaction = {
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          set: setMock,
          update: jest.fn(),
        };
        return fn(transaction);
      }),
      collection: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        doc: jest.fn().mockReturnValue(newDocRef),
      }),
    } as any;

    const id = await findOrCreateDeviceSource(mockDb, 'uid-1', 'device-1', CollectorType.PhoneUsage, 'Pixel 8');

    expect(id).toBe('generated-id');
    expect(setMock).toHaveBeenCalledWith(
      newDocRef,
      expect.objectContaining({ sourceId: 'device-1', createdBy: 'uid-1' })
    );
  });

  it('updates lastSeen on the existing doc inside a transaction when one exists', async () => {
    const updateMock = jest.fn();
    const existingDoc = { id: 'existing-id', ref: {} };
    const mockDb = {
      runTransaction: jest.fn(async (fn: any) => {
        const transaction = {
          get: jest.fn().mockResolvedValue({ empty: false, docs: [existingDoc] }),
          set: jest.fn(),
          update: updateMock,
        };
        return fn(transaction);
      }),
      collection: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        doc: jest.fn(),
      }),
    } as any;

    const id = await findOrCreateDeviceSource(mockDb, 'uid-1', 'device-1', CollectorType.PhoneUsage, 'Pixel 8');

    expect(id).toBe('existing-id');
    expect(updateMock).toHaveBeenCalledWith(existingDoc.ref, expect.objectContaining({ lastSeen: expect.any(String) }));
  });
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd functions && npm test -- deviceSource`
Expected: PASS (2 tests)

- [ ] **Step 5: If a Firestore emulator is configured for this repo, add an integration test for true concurrency; otherwise document the gap**

Run: `grep -rn "firestore" firebase.json`
If an `emulators` block with a `firestore` entry exists, this repo has emulator tooling available — a follow-up integration test firing two concurrent `findOrCreateDeviceSource` calls against `firebase emulators:exec` would be the strongest verification, but is a larger addition than this bug-fix task scope calls for. Note this as a suggested follow-up rather than blocking this task's completion, since the transactional rewrite in Step 1 is the correct, well-established fix regardless of whether emulator-based concurrency testing is added.

- [ ] **Step 6: Commit**

```bash
git add functions/src/ingest/deviceSource.ts functions/src/ingest/deviceSource.test.ts
git commit -m "fix: wrap findOrCreateDeviceSource in a Firestore transaction to prevent duplicate device docs under concurrent requests"
```

---

### Task 4: Add an error callback to `useRegistryItems`' `onSnapshot`

**Files:**
- Modify: `src/hooks/useRegistryItems.ts`
- Test: `src/hooks/useRegistryItems.test.ts`

**Interfaces:**
- Consumes: none new.
- Produces: `useRegistryItems` now returns `{ items, loading, error }` (adds `error: Error | null` to the previous `{ items, loading }` shape). `loading` is set to `false` and `error` is populated when `onSnapshot`'s error callback fires (permission-denied, offline, etc.), instead of the hook staying stuck in `loading: true` forever.

- [ ] **Step 1: Confirm all six call sites can tolerate an added `error` field without breaking**

Already confirmed during plan research: `src/screens/registry/RegistryListScreen.tsx`, `src/screens/tasks/TasksScreen.tsx`, `src/screens/home/HomeScreen.tsx`, `src/screens/alerts/AlertsScreen.tsx`, and `src/hooks/useObservations.ts` all call `useRegistryItems(...)`. Since the return type is an object, adding a new field is additive and non-breaking for any call site that destructures only `{ items, loading }` (TypeScript structural typing permits extra fields; JS object destructuring ignores unrequested fields). Re-run `grep -rn "useRegistryItems(" src` before editing to confirm no call site does an exact-shape check (e.g. `Object.keys(result).length === 2`) that would break — unlikely, but confirm.

- [ ] **Step 2: Add the error callback and `error` state**

Replace the full contents of `src/hooks/useRegistryItems.ts`:

```typescript
import { useState, useEffect } from 'react';
import { query, where, onSnapshot } from 'firebase/firestore';
import { initializeFirebaseApp } from '../firebase/config';
import { registryItemsRef } from '../firebase/firestore';
import { RegistryItem } from '../types/models';

export function useRegistryItems(uid: string): { items: RegistryItem[]; loading: boolean; error: Error | null } {
  const [items, setItems] = useState<RegistryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const { db } = initializeFirebaseApp();
    const q = query(registryItemsRef(db), where('createdBy', '==', uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setItems(snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as RegistryItem)));
        setLoading(false);
        setError(null);
      },
      (err) => {
        setLoading(false);
        setError(err);
      }
    );
    return unsubscribe;
  }, [uid]);

  return { items, loading, error };
}
```

- [ ] **Step 3: Build/typecheck to confirm no call site breaks**

Run: `npx tsc --noEmit` (from repo root, or the appropriate workspace — confirm the correct command via `cat package.json | grep -A5 '"scripts"'` if `tsc --noEmit` isn't directly runnable)
Expected: no new type errors.

- [ ] **Step 4: Write a test proving `error` is set and `loading` becomes `false` when `onSnapshot`'s error callback fires**

Read the repo's existing test setup for hooks first — run `find src -name "*.test.ts" -o -name "*.test.tsx" | head -5` to find an existing hook test's mocking convention for `firebase/firestore`'s `onSnapshot`, then match it. Otherwise:

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { onSnapshot } from 'firebase/firestore';
import { useRegistryItems } from './useRegistryItems';

jest.mock('firebase/firestore', () => ({
  query: jest.fn(),
  where: jest.fn(),
  onSnapshot: jest.fn(),
}));
jest.mock('../firebase/config', () => ({
  initializeFirebaseApp: () => ({ db: {} }),
}));
jest.mock('../firebase/firestore', () => ({
  registryItemsRef: jest.fn(),
}));

describe('useRegistryItems', () => {
  it('sets error and stops loading when onSnapshot reports an error', async () => {
    const testError = new Error('permission-denied');
    (onSnapshot as jest.Mock).mockImplementation((_q, _onNext, onError) => {
      onError(testError);
      return () => {};
    });

    const { result } = renderHook(() => useRegistryItems('uid-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(testError);
    });
  });

  it('clears a prior error and populates items on a subsequent successful snapshot', async () => {
    let capturedOnNext: any;
    let capturedOnError: any;
    (onSnapshot as jest.Mock).mockImplementation((_q, onNext, onError) => {
      capturedOnNext = onNext;
      capturedOnError = onError;
      return () => {};
    });

    const { result } = renderHook(() => useRegistryItems('uid-1'));

    capturedOnError(new Error('offline'));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    capturedOnNext({ docs: [] });
    await waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
    });
  });
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- useRegistryItems` (from repo root — confirm the correct test-invocation command matches this project's actual test script if different)
Expected: PASS (2 tests)

- [ ] **Step 6: Manually verify in the running app that a permission-denied/offline state no longer shows an infinite spinner**

This hook's consumers (`RegistryListScreen.tsx`, `HomeScreen.tsx`, etc.) currently only destructure `{ items, loading }` and don't yet render anything for `error` — adding the `error` field to the hook fixes the *stuck-loading* half of the bug (the spinner now stops), but a full UX fix (showing an error message instead of an empty list) requires each screen to also read and render `error`, which is a UI change beyond this hook-level fix's scope. Note this explicitly as a follow-up: consider a separate small task per screen to surface `error` in the UI once this hook-level fix lands, rather than silently leaving users looking at an empty "no items" list instead of a spinner with no indication anything went wrong.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useRegistryItems.ts src/hooks/useRegistryItems.test.ts
git commit -m "fix: add onSnapshot error callback to useRegistryItems so permission/offline errors stop the loading spinner"
```

---

### Task 5: Full verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run the native-usage-collector test suite**

Run: `cd native-usage-collector && ./gradlew :app:testDebugUnitTest`
Expected: all tests pass.

- [ ] **Step 2: Run the native-usage-collector build**

Run: `cd native-usage-collector && ./gradlew :app:assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Run the functions test suite and build**

Run: `cd functions && npm test && npm run build`
Expected: all tests pass, no type errors.

- [ ] **Step 4: Run the client (React) test suite and typecheck**

Run: `npm test -- useRegistryItems && npx tsc --noEmit` (adjust to the repo's actual root-level test script if different from what Task 4 Step 3/5 used)
Expected: all tests pass, no type errors.

- [ ] **Step 5: Commit if any verification step produced incidental fixes (otherwise skip)**

```bash
git status
```

If nothing changed beyond the prior tasks' commits, there is nothing further to commit.
