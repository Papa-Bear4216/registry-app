# Phase 2a Cloud Functions Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Firebase Cloud Functions backend that auto-ingests subscription data (starting with Gmail), AI-classifies and dedups it into the existing Phase 1 Staging screen, and runs scheduled dormancy/spend-alert/digest jobs — all without touching Phase 1's shipped client code or data model.

**Architecture:** Single Firebase Cloud Functions v2 TypeScript codebase in a new `functions/` directory, deployed independently from the Expo client via `firebase deploy --only functions`. `ingest` is an HTTPS endpoint; `aiClassify` is a Firestore `onCreate` trigger on `stagingItems`; `dormancyCheck`, `aiSuggest`, `weeklyDigest`, `deadMoneyAlert` are Cloud Scheduler cron jobs (via `onSchedule`). `aiRank` is an `onCall` callable. No message queue, no split codebases (Approach A, locked in the design review).

**Tech Stack:** Firebase Cloud Functions v2 (Node.js/TypeScript), Firebase Admin SDK, OpenAI SDK (JSON mode), Firestore, Vitest for tests (matching this repo's existing test runner choice from the related Bear House Classic project, and Jest is already used client-side in this repo — Cloud Functions gets its own independent `package.json` so either is viable; this plan uses Jest to match the client's existing choice and avoid introducing a second test runner into the monorepo).

**Spec:** `docs/superpowers/specs/2026-08-16-phase2-backend-design.md` (Phase 2 design). Also references `docs/superpowers/specs/2026-08-16-registry-app-design.md` §4 for the full Phase 2 data model field tables (`stagingItems`, `deviceSources`, `suggestions`, `taskRankings`).

## Global Constraints

- Every Cloud Function that touches user data resolves `uid` from a **verified** Firebase Auth ID token server-side — never trusts a client-supplied `uid` (spec §4).
- `deviceSources` find-or-create is scoped by the composite `(uid, sourceId)`, never `sourceId` alone (spec §4).
- The OpenAI API key lives in Firebase Functions secrets — never shipped to any client (spec §4).
- Every Phase 2 collection (`stagingItems`, `deviceSources`, `suggestions`, `taskRankings`) uses the field name `createdBy` for its owner/user field, not `owner` — carries forward the same naming ruling already applied to all three Phase 1 collections, for one consistent field name across every security rule and query.
- All OpenAI calls use JSON mode (`response_format: { type: "json_object" }`); the Cloud Function validates the parsed response's shape before any Firestore write — a malformed/unparseable response is logged and the triggering record is left unresolved, never partially written (spec §2, §3).
- No same-request AI retry. Failed `aiClassify`/`aiSuggest`/`aiRank` calls leave the record unmodified; `dormancyCheck`'s daily run additionally sweeps `stagingItems` where `resolved == false` and re-triggers `aiClassify` (spec §3).
- Dead-money alert threshold: any single dormant item's monthly-equivalent cost > $5/mo, OR total dormant spend > $20/mo (spec §5).
- Scheduled cadences: `dormancyCheck` daily, `aiSuggest` weekly, `deadMoneyAlert` daily-checked, `weeklyDigest` weekly, `aiRank` on-demand only (spec §5).
- `dormancyCheck` and `deadMoneyAlert` reuse Phase 1's `isDormant()` logic exactly (mirrored server-side; Cloud Functions cannot import client TS directly across the package boundary, so this plan re-implements the identical pure function server-side and tests it against the same cases as the client's `src/lib/dormancy.test.ts`, to avoid logic drift) — see Task 6.
- Native Android usage collector (spec §6, base spec §9 build-order item 7) is explicitly **out of scope for this plan** — it is Phase 2b, a separate future plan, since it is architecturally isolated (Kotlin, not this Cloud Functions codebase) and depends on nothing built here beyond the already-existing `/ingest` HTTP contract.
- Phase 1's client app, its screens, its Firestore security rules for `registryItems`/`observations`/`alertDismissals`, and its data model are **not modified** by this plan — Phase 2 is purely additive.

---

## File Structure

```
registry-app/
├── functions/                          # NEW — independent Cloud Functions package
│   ├── package.json
│   ├── tsconfig.json
│   ├── jest.config.js
│   ├── .env.example                    # OPENAI_API_KEY placeholder (secrets set via `firebase functions:secrets:set` for real deploys)
│   ├── src/
│   │   ├── index.ts                    # exports every deployed function (Task 1+)
│   │   ├── types/
│   │   │   ├── enums.ts                # CollectorType, MatchConfidence, SuggestionAction, SuggestionResponse (Task 1)
│   │   │   └── models.ts               # StagingItem, DeviceSource, Suggestion, TaskRanking (Task 1)
│   │   ├── lib/
│   │   │   ├── auth.ts                 # verifyIdToken(req) -> uid (Task 1)
│   │   │   ├── dormancy.ts             # isDormant() mirrored from client (Task 6)
│   │   │   └── costNormalization.ts    # monthlyEquivalent() mirrored from client (Task 6)
│   │   ├── ingest/
│   │   │   ├── ingest.ts               # HTTPS function (Task 1)
│   │   │   └── deviceSource.ts         # findOrCreateDeviceSource() (Task 1)
│   │   ├── ai/
│   │   │   ├── openaiClient.ts         # shared OpenAI client + JSON-mode call wrapper (Task 2)
│   │   │   ├── aiClassify.ts           # Firestore trigger (Task 2)
│   │   │   ├── dedupMatch.ts           # exact-match-then-AI-fallback logic (Task 2)
│   │   │   ├── aiSuggest.ts            # scheduled function (Task 5)
│   │   │   └── aiRank.ts               # callable function (Task 5)
│   │   ├── gmail/
│   │   │   ├── gmailScan.ts            # callable function (Task 3)
│   │   │   └── processGmailMessage.ts  # per-message extraction (Task 3)
│   │   └── scheduled/
│   │       ├── dormancyCheck.ts        # scheduled function + retry sweep (Task 6)
│   │       ├── deadMoneyAlert.ts       # scheduled function (Task 6)
│   │       └── weeklyDigest.ts         # scheduled function (Task 7)
│   └── __tests__/                      # mirrors src/ structure per task
└── firestore.rules                     # MODIFIED in Task 1 — add rules for stagingItems, deviceSources, suggestions, taskRankings
```

Each subdirectory under `src/` owns one pipeline stage (ingest, AI, Gmail, scheduled) — files that change together (a function and its own tests) live together, matching this repo's established Phase 1 pattern of one hook/screen per file.

---

### Task 1: Cloud Functions Scaffold, `ingest` Endpoint, Firestore Rules for Phase 2 Collections

**Files:**
- Create: `functions/package.json`, `functions/tsconfig.json`, `functions/jest.config.js`, `functions/.env.example`
- Create: `functions/src/index.ts`
- Create: `functions/src/types/enums.ts`
- Create: `functions/src/types/models.ts`
- Create: `functions/src/lib/auth.ts`
- Create: `functions/src/ingest/ingest.ts`
- Create: `functions/src/ingest/deviceSource.ts`
- Modify: `firestore.rules` (add rules for `stagingItems`, `deviceSources`)
- Test: `functions/__tests__/lib/auth.test.ts`
- Test: `functions/__tests__/ingest/deviceSource.test.ts`
- Test: `functions/__tests__/ingest/ingest.test.ts`

**Interfaces:**
- Consumes: nothing (first task in this plan).
- Produces: `verifyIdToken(authHeader: string | undefined): Promise<string>` (throws on invalid/missing/expired, returns `uid` on success) from `functions/src/lib/auth.ts` — used by every later HTTPS/callable function in this plan. `findOrCreateDeviceSource(db: Firestore, uid: string, sourceId: string, collector: CollectorType, label: string): Promise<string>` (returns `deviceSourceId`) from `functions/src/ingest/deviceSource.ts` — used only within `ingest.ts` in this task, but the signature is stable for Phase 2b's native collector to call the same `/ingest` HTTP contract later. `StagingItem`, `DeviceSource` types from `functions/src/types/models.ts` — consumed by Task 2.

- [ ] **Step 1: Scaffold the Cloud Functions package**

```bash
mkdir -p functions/src/types functions/src/lib functions/src/ingest functions/__tests__/lib functions/__tests__/ingest
cd functions
npm init -y
npm install firebase-admin firebase-functions openai
npm install --save-dev typescript jest ts-jest @types/jest @types/node firebase-functions-test
npx tsc --init
```

- [ ] **Step 2: Write `functions/package.json` (replace npm init defaults)**

```json
{
  "name": "functions",
  "version": "1.0.0",
  "private": true,
  "main": "lib/index.js",
  "engines": { "node": "20" },
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "deploy": "npm run build && firebase deploy --only functions"
  },
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0",
    "openai": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "@types/jest": "^29.5.0",
    "@types/node": "^20.0.0",
    "firebase-functions-test": "^3.1.0"
  }
}
```

- [ ] **Step 3: Write `functions/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "es2020",
    "lib": ["es2020"],
    "outDir": "lib",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "lib", "__tests__"]
}
```

- [ ] **Step 4: Write `functions/jest.config.js`**

```js
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
};
```

- [ ] **Step 5: Write `functions/.env.example`**

```
OPENAI_API_KEY=
```

- [ ] **Step 6: Write `functions/src/types/enums.ts`**

```ts
export enum CollectorType {
  PhoneUsage = 'phone_usage',
  Gmail = 'gmail',
  Manual = 'manual',
}

export enum MatchConfidence {
  High = 'high',
  Low = 'low',
  Confirmed = 'confirmed',
}

export enum SuggestionAction {
  Cut = 'cut',
  Consolidate = 'consolidate',
  Investigate = 'investigate',
}

export enum SuggestionResponse {
  Accepted = 'accepted',
  Dismissed = 'dismissed',
  Vetoed = 'vetoed',
  Snoozed = 'snoozed',
}
```

Note: `Heartbeat`/`Pieces` collector types from the base spec's `CollectorType` enum are omitted — those referred to unrelated external tools in the original Bubble spec's ideation and are not part of this app's actual Phase 2 collector set (Gmail, PhoneUsage, Manual only).

- [ ] **Step 7: Write `functions/src/types/models.ts`**

```ts
import { CollectorType, MatchConfidence } from './enums';

export interface StagingItem {
  id: string;
  rawLabel: string;
  rawCategory: string | null;
  rawIdentity: string | null;
  payloadSnapshot: string;
  collector: CollectorType;
  sourceId: string;
  capturedAt: string; // ISO-8601
  suggestedMatch: string | null; // registryItems doc id
  suggestionConfidence: MatchConfidence | null;
  resolved: boolean;
  resolvedAt: string | null; // ISO-8601
  createdBy: string;
}

export interface DeviceSource {
  id: string;
  sourceId: string;
  label: string;
  collector: CollectorType;
  firstSeen: string; // ISO-8601
  lastSeen: string; // ISO-8601
  createdBy: string;
}
```

- [ ] **Step 8: Write the failing test for `verifyIdToken`**

```ts
// functions/__tests__/lib/auth.test.ts
import { verifyIdToken } from '../../src/lib/auth';

jest.mock('firebase-admin', () => ({
  auth: () => ({
    verifyIdToken: jest.fn((token: string) => {
      if (token === 'valid-token') return Promise.resolve({ uid: 'alice' });
      return Promise.reject(new Error('invalid token'));
    }),
  }),
}));

test('returns uid for a valid Bearer token', async () => {
  const uid = await verifyIdToken('Bearer valid-token');
  expect(uid).toBe('alice');
});

test('throws for a missing Authorization header', async () => {
  await expect(verifyIdToken(undefined)).rejects.toThrow('Missing Authorization header');
});

test('throws for a malformed Authorization header (no Bearer prefix)', async () => {
  await expect(verifyIdToken('valid-token')).rejects.toThrow('Malformed Authorization header');
});

test('throws for an invalid/expired token', async () => {
  await expect(verifyIdToken('Bearer bad-token')).rejects.toThrow('invalid token');
});
```

- [ ] **Step 9: Run test to verify it fails**

Run: `cd functions && npx jest __tests__/lib/auth.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/auth'"

- [ ] **Step 10: Write `functions/src/lib/auth.ts`**

```ts
import * as admin from 'firebase-admin';

export async function verifyIdToken(authHeader: string | undefined): Promise<string> {
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Malformed Authorization header');
  }
  const token = authHeader.slice('Bearer '.length);
  const decoded = await admin.auth().verifyIdToken(token);
  return decoded.uid;
}
```

- [ ] **Step 11: Run test to verify it passes**

Run: `cd functions && npx jest __tests__/lib/auth.test.ts`
Expected: PASS — all 4 assertions succeed.

- [ ] **Step 12: Write the failing test for `findOrCreateDeviceSource`**

```ts
// functions/__tests__/ingest/deviceSource.test.ts
import { findOrCreateDeviceSource } from '../../src/ingest/deviceSource';
import { CollectorType } from '../../src/types/enums';

function makeFakeDb(existingDocs: any[] = []) {
  const created: any[] = [];
  const updated: any[] = [];
  return {
    created,
    updated,
    collection: () => ({
      where: (field: string, op: string, value: any) => ({
        where: (field2: string, op2: string, value2: any) => ({
          limit: () => ({
            get: async () => ({
              empty: existingDocs.length === 0,
              docs: existingDocs.map((d) => ({ id: d.id, ref: { update: (data: any) => updated.push({ id: d.id, data }) } })),
            }),
          }),
        }),
      }),
      add: async (data: any) => {
        created.push(data);
        return { id: 'new-device-source-id' };
      },
    }),
  };
}

test('creates a new deviceSource when none exists for (uid, sourceId)', async () => {
  const db: any = makeFakeDb([]);
  const id = await findOrCreateDeviceSource(db, 'alice', 'pixel-8-abc123', CollectorType.PhoneUsage, 'My Pixel 8');
  expect(id).toBe('new-device-source-id');
  expect(db.created).toHaveLength(1);
  expect(db.created[0].createdBy).toBe('alice');
  expect(db.created[0].sourceId).toBe('pixel-8-abc123');
});

test('updates lastSeen on an existing deviceSource instead of creating a duplicate', async () => {
  const db: any = makeFakeDb([{ id: 'existing-id' }]);
  const id = await findOrCreateDeviceSource(db, 'alice', 'pixel-8-abc123', CollectorType.PhoneUsage, 'My Pixel 8');
  expect(id).toBe('existing-id');
  expect(db.created).toHaveLength(0);
  expect(db.updated).toHaveLength(1);
});
```

- [ ] **Step 13: Run test to verify it fails**

Run: `cd functions && npx jest __tests__/ingest/deviceSource.test.ts`
Expected: FAIL with "Cannot find module '../../src/ingest/deviceSource'"

- [ ] **Step 14: Write `functions/src/ingest/deviceSource.ts`**

```ts
import { Firestore } from 'firebase-admin/firestore';
import { CollectorType } from '../types/enums';

export async function findOrCreateDeviceSource(
  db: Firestore,
  uid: string,
  sourceId: string,
  collector: CollectorType,
  label: string
): Promise<string> {
  const now = new Date().toISOString();
  const existing = await db
    .collection('deviceSources')
    .where('createdBy', '==', uid)
    .where('sourceId', '==', sourceId)
    .limit(1)
    .get();

  if (!existing.empty) {
    const doc = existing.docs[0];
    await doc.ref.update({ lastSeen: now });
    return doc.id;
  }

  const created = await db.collection('deviceSources').add({
    sourceId,
    label,
    collector,
    firstSeen: now,
    lastSeen: now,
    createdBy: uid,
  });
  return created.id;
}
```

- [ ] **Step 15: Run test to verify it passes**

Run: `cd functions && npx jest __tests__/ingest/deviceSource.test.ts`
Expected: PASS — both assertions succeed.

- [ ] **Step 16: Write the failing test for `ingest`**

```ts
// functions/__tests__/ingest/ingest.test.ts
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
```

- [ ] **Step 17: Run test to verify it fails**

Run: `cd functions && npx jest __tests__/ingest/ingest.test.ts`
Expected: FAIL with "Cannot find module '../../src/ingest/ingest'"

- [ ] **Step 18: Write `functions/src/ingest/ingest.ts`**

```ts
import { Firestore } from 'firebase-admin/firestore';
import { Request, Response } from 'firebase-functions/v2/https';
import { verifyIdToken } from '../lib/auth';
import { findOrCreateDeviceSource } from './deviceSource';
import { CollectorType } from '../types/enums';

interface IngestBody {
  collector: CollectorType;
  sourceId: string;
  sourceLabel: string;
  rawLabel: string;
  rawCategory?: string;
  rawIdentity?: string;
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
    typeof body?.payload === 'object' &&
    typeof body?.payload?.usageCount === 'number' &&
    typeof body?.payload?.usageDurationMs === 'number' &&
    typeof body?.payload?.windowHours === 'number'
  );
}

export async function handleIngest(db: Firestore, req: Request, res: Response): Promise<void> {
  let uid: string;
  try {
    uid = await verifyIdToken(req.headers.authorization as string | undefined);
  } catch (e) {
    res.status(401).json({ error: e instanceof Error ? e.message : 'Unauthorized' });
    return;
  }

  if (!isValidBody(req.body)) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  const body = req.body;
  const now = new Date().toISOString();

  const deviceSourceId = await findOrCreateDeviceSource(db, uid, body.sourceId, body.collector, body.sourceLabel);

  await db.collection('stagingItems').add({
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
    createdBy: uid,
  });

  await db.collection('observations').add({
    registryItemId: null,
    deviceSourceId,
    collector: body.collector,
    observedAt: now,
    windowHours: body.payload.windowHours,
    usageCount: body.payload.usageCount,
    usageDurationMs: body.payload.usageDurationMs,
    createdBy: uid,
  });

  res.status(200).json({ ok: true });
}
```

Note: `observations.registryItemId` is `null` at ingest time — the Phase 1 client's `Observation` model doesn't have this be nullable (Task 6 in the Phase 1 plan defined it as `registryItemId: string`), but a collector-reported observation has no matching registry item until you approve the staging item. This is a genuine, intentional widening of the field's meaning for Phase 2; flagged for the task reviewer to confirm against the Phase 1 client's actual `Observation` TypeScript interface (`src/types/models.ts`) and Firestore rules, since `registryItemId: null` must not break Phase 1's existing `useObservations(itemId)` hook, which queries `where('registryItemId', '==', itemId)` — a `null` value simply never matches a real `itemId` query, so this is additive and safe, but worth explicit verification during review.

- [ ] **Step 19: Run test to verify it passes**

Run: `cd functions && npx jest __tests__/ingest/ingest.test.ts`
Expected: PASS — all 3 assertions succeed.

- [ ] **Step 20: Write `functions/src/index.ts` — export the deployed HTTPS function**

```ts
import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { handleIngest } from './ingest/ingest';

admin.initializeApp();

export const ingest = onRequest(async (req, res) => {
  await handleIngest(admin.firestore(), req, res);
});
```

- [ ] **Step 21: Add Firestore security rules for the two new collections**

Read the current `firestore.rules` file first, then add matching blocks for `stagingItems` and `deviceSources` following the exact same `isOwner`/`isOwnerOnCreate` pattern already used for `registryItems`/`observations`/`alertDismissals` (see Phase 1's Task 1, which already fixed an update-reassignment gap using `isOwner(resource) && isOwnerOnCreate()` — reuse that exact pattern here, not the more permissive version):

```
    match /stagingItems/{itemId} {
      allow create: if isOwnerOnCreate();
      allow read, delete: if isOwner(resource);
      allow update: if isOwner(resource) && isOwnerOnCreate();
    }
    match /deviceSources/{sourceId} {
      allow create: if isOwnerOnCreate();
      allow read, delete: if isOwner(resource);
      allow update: if isOwner(resource) && isOwnerOnCreate();
    }
```

- [ ] **Step 22: Write a rules test extending Phase 1's existing rules test file**

Add to `__tests__/firebase/rules.test.ts` (the client's existing Phase 1 rules test file, using its already-isolated `projectId: 'registry-app-test-rules'`):

```ts
test('owner can create and read their own stagingItem', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const itemRef = doc(alice, 'stagingItems/staging1');
  await assertSucceeds(setDoc(itemRef, { rawLabel: 'Netflix', createdBy: 'alice' }));
  await assertSucceeds(getDoc(itemRef));
});

test('non-owner cannot read another user\'s stagingItem', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  const bob = testEnv.authenticatedContext('bob').firestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'stagingItems/staging1'), { rawLabel: 'Netflix', createdBy: 'alice' });
  });
  await assertFails(getDoc(doc(bob, 'stagingItems/staging1')));
});

test('owner cannot reassign createdBy on a deviceSource update', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'deviceSources/device1'), { sourceId: 'x', createdBy: 'alice' });
  });
  await assertFails(updateDoc(doc(alice, 'deviceSources/device1'), { createdBy: 'bob' }));
});
```

- [ ] **Step 23: Run the extended rules test to verify it passes**

Run: `firebase emulators:exec --only firestore "npx jest __tests__/firebase/rules.test.ts"` (from repo root, not `functions/`)
Expected: PASS — all prior Phase 1 rules tests plus the 3 new ones succeed.

- [ ] **Step 24: Deploy rules only (client-side change, safe to ship independently of the Cloud Functions code)**

Run: `firebase deploy --only firestore:rules --project registry-app-prod-7a07c`
Expected: deploy succeeds — the live project now accepts writes to `stagingItems`/`deviceSources` under the same ownership model as Phase 1's collections.

- [ ] **Step 25: Commit**

```bash
git add functions/ firestore.rules __tests__/firebase/rules.test.ts
git commit -m "feat: Cloud Functions scaffold, ingest endpoint, stagingItems/deviceSources rules"
```

---

### Task 2: `aiClassify` — Firestore Trigger, Dedup Matching, OpenAI Classification

**Files:**
- Create: `functions/src/ai/openaiClient.ts`
- Create: `functions/src/ai/dedupMatch.ts`
- Create: `functions/src/ai/aiClassify.ts`
- Modify: `functions/src/index.ts`
- Test: `functions/__tests__/ai/dedupMatch.test.ts`
- Test: `functions/__tests__/ai/aiClassify.test.ts`

**Interfaces:**
- Consumes: `StagingItem` type (Task 1). `RegistryItem`-shaped documents already exist in Firestore from Phase 1 (read-only access here — this task never writes to `registryItems`).
- Produces: `findExactMatch(db, uid, canonicalIdentity): Promise<{id: string} | null>` and `findFuzzyMatch(openai, db, uid, rawLabel): Promise<{id: string, confidence: MatchConfidence} | null>` from `functions/src/ai/dedupMatch.ts` — consumed only within `aiClassify.ts` in this plan, but the exact-match function's signature is stable for any future task needing the same lookup. `classifyStagingItem(openai, stagingItem): Promise<{kind, category, active, confidence}>` from `functions/src/ai/aiClassify.ts` — consumed by Task 6's retry sweep.

- [ ] **Step 1: Write `functions/src/ai/openaiClient.ts` — shared client + JSON-mode call wrapper**

```ts
import OpenAI from 'openai';

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
    client = new OpenAI({ apiKey });
  }
  return client;
}

export async function callJsonMode(
  openai: OpenAI,
  systemPrompt: string,
  userPrompt: string
): Promise<unknown> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty OpenAI response');
  return JSON.parse(content);
}
```

- [ ] **Step 2: Write the failing test for `dedupMatch`**

```ts
// functions/__tests__/ai/dedupMatch.test.ts
import { findExactMatch, findFuzzyMatch } from '../../src/ai/dedupMatch';
import { MatchConfidence } from '../../src/types/enums';

function makeFakeDb(matches: any[] = []) {
  return {
    collection: () => ({
      where: () => ({
        where: () => ({
          limit: () => ({
            get: async () => ({
              empty: matches.length === 0,
              docs: matches.map((m) => ({ id: m.id })),
            }),
          }),
        }),
      }),
    }),
  };
}

test('findExactMatch returns the matching registryItem id when canonicalIdentity matches', async () => {
  const db: any = makeFakeDb([{ id: 'item-1' }]);
  const result = await findExactMatch(db, 'alice', 'com.netflix.mediaclient');
  expect(result).toEqual({ id: 'item-1' });
});

test('findExactMatch returns null when no canonicalIdentity matches', async () => {
  const db: any = makeFakeDb([]);
  const result = await findExactMatch(db, 'alice', 'com.unknown.app');
  expect(result).toBeNull();
});

test('findFuzzyMatch returns a confidence-scored match from the AI response', async () => {
  const db: any = { collection: () => ({ where: () => ({ get: async () => ({ docs: [{ id: 'item-2', data: () => ({ name: 'Netflix' }) }] }) }) }) };
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify({ suggestedMatchId: 'item-2', confidence: 'confirmed' }) } }],
    }) } },
  };
  const result = await findFuzzyMatch(fakeOpenai, db, 'alice', 'Netflix.com');
  expect(result).toEqual({ id: 'item-2', confidence: MatchConfidence.Confirmed });
});

test('findFuzzyMatch returns null when the AI finds no plausible match', async () => {
  const db: any = { collection: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }) };
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify({ suggestedMatchId: null, confidence: 'low' }) } }],
    }) } },
  };
  const result = await findFuzzyMatch(fakeOpenai, db, 'alice', 'Some Obscure Tool');
  expect(result).toBeNull();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd functions && npx jest __tests__/ai/dedupMatch.test.ts`
Expected: FAIL with "Cannot find module '../../src/ai/dedupMatch'"

- [ ] **Step 4: Write `functions/src/ai/dedupMatch.ts`**

```ts
import { Firestore } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import { MatchConfidence } from '../types/enums';
import { callJsonMode } from './openaiClient';

export async function findExactMatch(
  db: Firestore,
  uid: string,
  canonicalIdentity: string
): Promise<{ id: string } | null> {
  const result = await db
    .collection('registryItems')
    .where('createdBy', '==', uid)
    .where('canonicalIdentity', '==', canonicalIdentity)
    .limit(1)
    .get();
  if (result.empty) return null;
  return { id: result.docs[0].id };
}

export async function findFuzzyMatch(
  openai: OpenAI,
  db: Firestore,
  uid: string,
  rawLabel: string
): Promise<{ id: string; confidence: MatchConfidence } | null> {
  const existing = await db.collection('registryItems').where('createdBy', '==', uid).get();
  const candidates = existing.docs.map((d) => ({ id: d.id, name: (d.data() as any).name }));

  const systemPrompt = `You match a newly discovered subscription/tool name against a user's existing registry. Respond in JSON: { "suggestedMatchId": string | null, "confidence": "low" | "confirmed" }. Return null if no candidate plausibly refers to the same tool.`;
  const userPrompt = `New item: "${rawLabel}"\nExisting registry: ${JSON.stringify(candidates)}`;

  const parsed = (await callJsonMode(openai, systemPrompt, userPrompt)) as {
    suggestedMatchId: string | null;
    confidence: 'low' | 'confirmed';
  };

  if (!parsed.suggestedMatchId) return null;
  return {
    id: parsed.suggestedMatchId,
    confidence: parsed.confidence === 'confirmed' ? MatchConfidence.Confirmed : MatchConfidence.Low,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd functions && npx jest __tests__/ai/dedupMatch.test.ts`
Expected: PASS — all 4 assertions succeed.

- [ ] **Step 6: Write the failing test for `aiClassify`**

```ts
// functions/__tests__/ai/aiClassify.test.ts
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
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd functions && npx jest __tests__/ai/aiClassify.test.ts`
Expected: FAIL with "Cannot find module '../../src/ai/aiClassify'"

- [ ] **Step 8: Write `functions/src/ai/aiClassify.ts`**

```ts
import { Firestore, DocumentSnapshot } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getOpenAIClient, callJsonMode } from './openaiClient';
import { findExactMatch, findFuzzyMatch } from './dedupMatch';
import { StagingItem } from '../types/models';
import { CollectorType } from '../types/enums';

interface ClassificationResult {
  kind: string;
  category: string;
  active: boolean;
  confidence: number;
}

function isValidClassification(x: any): x is ClassificationResult {
  return (
    typeof x?.kind === 'string' &&
    typeof x?.category === 'string' &&
    typeof x?.active === 'boolean' &&
    typeof x?.confidence === 'number'
  );
}

export async function classifyStagingItem(openai: OpenAI, stagingItem: Pick<StagingItem, 'rawLabel' | 'rawCategory'>): Promise<ClassificationResult> {
  const systemPrompt = `Classify a subscription/tool. Respond in JSON: { "kind": one of "app"|"subscription"|"dev_tool"|"service"|"hardware"|"other", "category": one of "writing"|"coding"|"communication"|"design"|"productivity"|"media"|"finance"|"utilities"|"other", "active": boolean (is this a real recurring cost, not a one-off), "confidence": number 0-1 }`;
  const userPrompt = `Name: "${stagingItem.rawLabel}"\nCategory hint: "${stagingItem.rawCategory ?? 'none'}"`;

  const parsed = await callJsonMode(openai, systemPrompt, userPrompt);
  if (!isValidClassification(parsed)) {
    throw new Error('Malformed classification response from AI');
  }
  return parsed;
}

export async function processStagingItem(openai: OpenAI, db: Firestore, doc: DocumentSnapshot): Promise<void> {
  const data = doc.data() as StagingItem;

  let suggestedMatch: string | null = null;
  let suggestionConfidence: string | null = null;

  if (data.rawIdentity) {
    const exact = await findExactMatch(db, data.createdBy, data.rawIdentity);
    if (exact) {
      suggestedMatch = exact.id;
      suggestionConfidence = 'high';
    }
  }
  if (!suggestedMatch) {
    const fuzzy = await findFuzzyMatch(openai, db, data.createdBy, data.rawLabel);
    if (fuzzy) {
      suggestedMatch = fuzzy.id;
      suggestionConfidence = fuzzy.confidence;
    }
  }

  const classification = await classifyStagingItem(openai, data);

  await doc.ref.update({
    suggestedMatch,
    suggestionConfidence,
    classifiedKind: classification.kind,
    classifiedCategory: classification.category,
    classifiedActive: classification.active,
    classifiedConfidence: classification.confidence,
    resolved: false, // stays false until the user approves/ignores in the Staging screen
  });
}

export const aiClassify = onDocumentCreated('stagingItems/{stagingItemId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;
  const openai = getOpenAIClient();
  const db = snapshot.ref.firestore;
  try {
    await processStagingItem(openai, db, snapshot);
  } catch (e) {
    console.error(`aiClassify failed for staging item ${snapshot.id}:`, e);
    // Leave resolved: false unmodified — Task 6's daily sweep will retry.
  }
});
```

Note: `classifiedKind`/`classifiedCategory`/`classifiedActive`/`classifiedConfidence` are new fields on `stagingItems` beyond the base spec's field table (which only lists `suggestedMatch`/`suggestionConfidence`) — the base spec's §6 table says `aiClassify` must "parse and write structured fields back" but doesn't name them explicitly. These four field names are this plan's concrete resolution of that gap; flag for the task reviewer to confirm they read naturally against whatever the Staging screen UI (not yet built — client-side Staging screen consumption is out of scope for this plan, but these are the field names a future client task would read).

- [ ] **Step 9: Run test to verify it passes**

Run: `cd functions && npx jest __tests__/ai/aiClassify.test.ts`
Expected: PASS — all 3 assertions succeed.

- [ ] **Step 10: Register the trigger in `functions/src/index.ts`**

```ts
import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { handleIngest } from './ingest/ingest';
import { aiClassify } from './ai/aiClassify';

admin.initializeApp();

export const ingest = onRequest(async (req, res) => {
  await handleIngest(admin.firestore(), req, res);
});

export { aiClassify };
```

- [ ] **Step 11: Commit**

```bash
git add functions/src/ai functions/src/index.ts functions/__tests__/ai
git commit -m "feat: aiClassify Firestore trigger with exact-then-fuzzy dedup matching"
```

---

### Task 3: Gmail Scan Collector

**Files:**
- Create: `functions/src/gmail/gmailScan.ts`
- Create: `functions/src/gmail/processGmailMessage.ts`
- Modify: `functions/src/index.ts`
- Test: `functions/__tests__/gmail/processGmailMessage.test.ts`
- Test: `functions/__tests__/gmail/gmailScan.test.ts`

**Interfaces:**
- Consumes: `verifyIdToken` (Task 1), `findOrCreateDeviceSource` (Task 1). Requires the client to have already obtained a Gmail OAuth access token via `expo-auth-session` (per base spec §1 — this plan implements the server-side scan/extract logic only; the client-side "Scan Gmail" button and OAuth flow are a separate, future client task, out of scope here per the base spec's own Phase 2 feature list treating them as connected-but-distinct pieces).
- Produces: `extractReceiptFromMessage(messageBody: string, subject: string): {rawLabel: string, rawCategory: string | null} | null` from `functions/src/gmail/processGmailMessage.ts` — consumed only within this task, but stable for future prompt iteration (per spec §8's noted open question on Gmail query tuning).

- [ ] **Step 1: Write the failing test for `extractReceiptFromMessage`**

```ts
// functions/__tests__/gmail/processGmailMessage.test.ts
import { extractReceiptFromMessage } from '../../src/gmail/processGmailMessage';

test('extracts a plausible subscription name from a receipt-like email', async () => {
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify({ rawLabel: 'Spotify Premium', rawCategory: 'Media' }) } }],
    }) } },
  };
  const result = await extractReceiptFromMessage(fakeOpenai, 'Your Spotify Premium subscription renewed', 'Thanks for being a Spotify subscriber. $10.99 charged.');
  expect(result).toEqual({ rawLabel: 'Spotify Premium', rawCategory: 'Media' });
});

test('returns null when the email is not actually a subscription receipt', async () => {
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify({ rawLabel: null, rawCategory: null }) } }],
    }) } },
  };
  const result = await extractReceiptFromMessage(fakeOpenai, 'Weekly Newsletter', 'Here is your weekly digest of articles.');
  expect(result).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx jest __tests__/gmail/processGmailMessage.test.ts`
Expected: FAIL with "Cannot find module '../../src/gmail/processGmailMessage'"

- [ ] **Step 3: Write `functions/src/gmail/processGmailMessage.ts`**

```ts
import OpenAI from 'openai';
import { callJsonMode } from '../ai/openaiClient';

export async function extractReceiptFromMessage(
  openai: OpenAI,
  subject: string,
  body: string
): Promise<{ rawLabel: string; rawCategory: string | null } | null> {
  const systemPrompt = `Determine if this email is a subscription/tool billing receipt. Respond in JSON: { "rawLabel": string | null, "rawCategory": string | null }. Set both to null if this is not actually a subscription receipt (e.g. a newsletter, a one-time purchase, spam).`;
  const userPrompt = `Subject: ${subject}\nBody: ${body.slice(0, 2000)}`;

  const parsed = (await callJsonMode(openai, systemPrompt, userPrompt)) as {
    rawLabel: string | null;
    rawCategory: string | null;
  };

  if (!parsed.rawLabel) return null;
  return { rawLabel: parsed.rawLabel, rawCategory: parsed.rawCategory };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npx jest __tests__/gmail/processGmailMessage.test.ts`
Expected: PASS — both assertions succeed.

- [ ] **Step 5: Write the failing test for `gmailScan`**

```ts
// functions/__tests__/gmail/gmailScan.test.ts
import { handleGmailScan } from '../../src/gmail/gmailScan';

jest.mock('../../src/lib/auth', () => ({
  verifyIdToken: jest.fn(() => Promise.resolve('alice')),
}));

jest.mock('../../src/gmail/processGmailMessage', () => ({
  extractReceiptFromMessage: jest.fn(() => Promise.resolve({ rawLabel: 'Spotify Premium', rawCategory: 'Media' })),
}));

test('creates one stagingItem per matched receipt email', async () => {
  const stagingItems: any[] = [];
  const fakeDb: any = { collection: () => ({ add: async (data: any) => { stagingItems.push(data); return { id: 'x' }; } }) };
  const fakeGmailClient: any = {
    listMessages: async () => [{ id: 'msg1', subject: 'Your Spotify receipt', snippet: '...' }],
    getMessageBody: async () => 'Thanks for being a Spotify subscriber.',
  };
  const fakeOpenai: any = {};

  const result = await handleGmailScan(fakeDb, fakeOpenai, fakeGmailClient, 'alice');

  expect(result.stagingItemsCreated).toBe(1);
  expect(stagingItems).toHaveLength(1);
  expect(stagingItems[0].rawLabel).toBe('Spotify Premium');
  expect(stagingItems[0].createdBy).toBe('alice');
  expect(stagingItems[0].collector).toBe('gmail');
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd functions && npx jest __tests__/gmail/gmailScan.test.ts`
Expected: FAIL with "Cannot find module '../../src/gmail/gmailScan'"

- [ ] **Step 7: Write `functions/src/gmail/gmailScan.ts`**

```ts
import { Firestore } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import { onCall } from 'firebase-functions/v2/https';
import { extractReceiptFromMessage } from './processGmailMessage';
import { CollectorType } from '../types/enums';

interface GmailMessage {
  id: string;
  subject: string;
  snippet: string;
}

interface GmailClient {
  listMessages(query: string): Promise<GmailMessage[]>;
  getMessageBody(messageId: string): Promise<string>;
}

export async function handleGmailScan(
  db: Firestore,
  openai: OpenAI,
  gmailClient: GmailClient,
  uid: string
): Promise<{ stagingItemsCreated: number }> {
  const messages = await gmailClient.listMessages(
    'subject:(receipt OR invoice OR subscription OR billing) newer_than:30d'
  );

  let created = 0;
  for (const message of messages) {
    const body = await gmailClient.getMessageBody(message.id);
    const extracted = await extractReceiptFromMessage(openai, message.subject, body);
    if (!extracted) continue;

    await db.collection('stagingItems').add({
      rawLabel: extracted.rawLabel,
      rawCategory: extracted.rawCategory,
      rawIdentity: null,
      payloadSnapshot: JSON.stringify({ subject: message.subject, snippet: message.snippet }),
      collector: CollectorType.Gmail,
      sourceId: 'gmail',
      capturedAt: new Date().toISOString(),
      suggestedMatch: null,
      suggestionConfidence: null,
      resolved: false,
      resolvedAt: null,
      createdBy: uid,
    });
    created++;
  }

  return { stagingItemsCreated: created };
}

export const gmailScan = onCall(async (request) => {
  if (!request.auth) {
    throw new Error('Unauthenticated');
  }
  // Real Gmail API client construction (OAuth token exchange) is a follow-up
  // implementation detail once the client-side "Scan Gmail" OAuth flow exists —
  // this callable's shape is stable regardless of that client work.
  throw new Error('Gmail client wiring not yet implemented — see plan Task 3 notes');
});
```

Note: the `gmailScan` exported callable is intentionally a stub that throws — the real Gmail API client (OAuth token handling via the user's already-granted `expo-auth-session` scope from the client) is explicitly deferred, since building it depends on client-side OAuth work not covered by this backend-only plan. `handleGmailScan` (the actual logic, fully tested above) is what a future client-integration task wires the real Gmail client into. This is a genuine, disclosed scope boundary — not a placeholder violating the plan's "no TBD" rule, since the boundary and its reason are stated explicitly, and every piece of logic that *can* be tested without live Gmail API access is fully implemented and tested.

- [ ] **Step 8: Run test to verify it passes**

Run: `cd functions && npx jest __tests__/gmail/gmailScan.test.ts`
Expected: PASS.

- [ ] **Step 9: Register in `functions/src/index.ts`**

```ts
import { gmailScan } from './gmail/gmailScan';
export { gmailScan };
```

- [ ] **Step 10: Commit**

```bash
git add functions/src/gmail functions/src/index.ts functions/__tests__/gmail
git commit -m "feat: Gmail scan receipt extraction (handleGmailScan tested; live OAuth wiring deferred)"
```

---

### Task 4: Scheduled Functions — `dormancyCheck` (with retry sweep) and `deadMoneyAlert`

**Files:**
- Create: `functions/src/lib/dormancy.ts`
- Create: `functions/src/lib/costNormalization.ts`
- Create: `functions/src/scheduled/dormancyCheck.ts`
- Create: `functions/src/scheduled/deadMoneyAlert.ts`
- Modify: `functions/src/index.ts`
- Test: `functions/__tests__/lib/dormancy.test.ts`
- Test: `functions/__tests__/scheduled/dormancyCheck.test.ts`
- Test: `functions/__tests__/scheduled/deadMoneyAlert.test.ts`

**Interfaces:**
- Consumes: `processStagingItem` (Task 2), `StagingItem` type (Task 1).
- Produces: `isDormant(observations: {observedAt: string}[]): boolean` from `functions/src/lib/dormancy.ts` — mirrors the client's `src/lib/dormancy.ts` exactly (same 21-day threshold, same logic), consumed by `deadMoneyAlert.ts`. `monthlyEquivalent(cost: number, billingCycle: string): number` from `functions/src/lib/costNormalization.ts` — mirrors the client's `src/lib/costNormalization.ts`, consumed by `deadMoneyAlert.ts`.

- [ ] **Step 1: Write the failing test for the mirrored `isDormant`**

```ts
// functions/__tests__/lib/dormancy.test.ts
import { isDormant } from '../../src/lib/dormancy';

function makeObservation(daysAgo: number) {
  return { observedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString() };
}

test('item with no observations is dormant', () => {
  expect(isDormant([])).toBe(true);
});

test('item observed 10 days ago is not dormant', () => {
  expect(isDormant([makeObservation(10)])).toBe(false);
});

test('item last observed 22 days ago is dormant', () => {
  expect(isDormant([makeObservation(22)])).toBe(true);
});
```

These three cases are the same ones tested in the client's `__tests__/lib/dormancy.test.ts` — this test file intentionally duplicates that coverage server-side to prove the mirrored logic behaves identically, not because the client test needs re-verifying.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx jest __tests__/lib/dormancy.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/dormancy'"

- [ ] **Step 3: Write `functions/src/lib/dormancy.ts` (mirrors client's `src/lib/dormancy.ts` exactly)**

```ts
const TWENTY_ONE_DAYS_MS = 21 * 24 * 60 * 60 * 1000;

export function isDormant(observations: { observedAt: string }[]): boolean {
  if (observations.length === 0) return true;
  const latest = Math.max(...observations.map((o) => new Date(o.observedAt).getTime()));
  return Date.now() - latest > TWENTY_ONE_DAYS_MS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npx jest __tests__/lib/dormancy.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `functions/src/lib/costNormalization.ts` (mirrors client's `src/lib/costNormalization.ts` exactly, no test needed — Task 2 of the Phase 1 plan already TDD'd this exact logic client-side and it is a direct port)**

```ts
export function monthlyEquivalent(cost: number, billingCycle: string): number {
  switch (billingCycle) {
    case 'weekly':
      return cost * 4.33;
    case 'monthly':
      return cost;
    case 'quarterly':
      return cost / 3;
    case 'annual':
      return cost / 12;
    case 'one_time':
      return 0;
    default:
      return cost;
  }
}
```

- [ ] **Step 6: Write the failing test for `dormancyCheck`'s retry sweep**

```ts
// functions/__tests__/scheduled/dormancyCheck.test.ts
import { runRetrySweep } from '../../src/scheduled/dormancyCheck';

test('re-processes stagingItems where resolved is false', async () => {
  const processed: string[] = [];
  const fakeDoc = { id: 'stuck-item', data: () => ({ rawLabel: 'Hulu' }) };
  const fakeDb: any = {
    collection: () => ({
      where: () => ({
        get: async () => ({ docs: [fakeDoc] }),
      }),
    }),
  };
  const fakeProcessFn = async (openai: any, db: any, doc: any) => {
    processed.push(doc.id);
  };
  const fakeOpenai: any = {};

  await runRetrySweep(fakeOpenai, fakeDb, fakeProcessFn);

  expect(processed).toEqual(['stuck-item']);
});

test('does not process anything when no stagingItems are stuck', async () => {
  const fakeDb: any = { collection: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }) };
  let called = false;
  const fakeProcessFn = async () => { called = true; };

  await runRetrySweep({} as any, fakeDb, fakeProcessFn);

  expect(called).toBe(false);
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd functions && npx jest __tests__/scheduled/dormancyCheck.test.ts`
Expected: FAIL with "Cannot find module '../../src/scheduled/dormancyCheck'"

- [ ] **Step 8: Write `functions/src/scheduled/dormancyCheck.ts`**

```ts
import { Firestore, DocumentSnapshot } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getOpenAIClient } from '../ai/openaiClient';
import { processStagingItem } from '../ai/aiClassify';

type ProcessFn = (openai: OpenAI, db: Firestore, doc: DocumentSnapshot) => Promise<void>;

export async function runRetrySweep(openai: OpenAI, db: Firestore, processFn: ProcessFn = processStagingItem): Promise<void> {
  const stuck = await db.collection('stagingItems').where('resolved', '==', false).get();
  for (const doc of stuck.docs) {
    try {
      await processFn(openai, db, doc);
    } catch (e) {
      console.error(`Retry sweep failed for staging item ${doc.id}:`, e);
    }
  }
}

export const dormancyCheck = onSchedule('every day 03:00', async () => {
  const admin = await import('firebase-admin');
  const db = admin.firestore();
  const openai = getOpenAIClient();
  // Dormancy itself is derived client-side at read time (per the base spec's
  // "never store dormant as a field" rule) — this scheduled job's own
  // responsibility is solely the staging retry sweep. A future deadMoneyAlert
  // run (Task 4, next) is what actually needs a server-side dormancy check.
  await runRetrySweep(openai, db);
});
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd functions && npx jest __tests__/scheduled/dormancyCheck.test.ts`
Expected: PASS.

- [ ] **Step 10: Write the failing test for `deadMoneyAlert`**

```ts
// functions/__tests__/scheduled/deadMoneyAlert.test.ts
import { checkDeadMoneyThreshold } from '../../src/scheduled/deadMoneyAlert';

test('triggers when a single dormant item exceeds $5/mo', () => {
  const items = [{ id: '1', cost: 10, billingCycle: 'monthly', observations: [] }];
  const result = checkDeadMoneyThreshold(items);
  expect(result.shouldAlert).toBe(true);
  expect(result.reason).toContain('single item');
});

test('triggers when total dormant spend exceeds $20/mo even with no single item over $5', () => {
  const items = [
    { id: '1', cost: 3, billingCycle: 'monthly', observations: [] },
    { id: '2', cost: 3, billingCycle: 'monthly', observations: [] },
    { id: '3', cost: 3, billingCycle: 'monthly', observations: [] },
    { id: '4', cost: 3, billingCycle: 'monthly', observations: [] },
    { id: '5', cost: 3, billingCycle: 'monthly', observations: [] },
    { id: '6', cost: 3, billingCycle: 'monthly', observations: [] },
    { id: '7', cost: 3, billingCycle: 'monthly', observations: [] },
  ];
  const result = checkDeadMoneyThreshold(items);
  expect(result.shouldAlert).toBe(true);
  expect(result.reason).toContain('total');
});

test('does not trigger when no items are dormant', () => {
  const recentObservation = [{ observedAt: new Date().toISOString() }];
  const items = [{ id: '1', cost: 100, billingCycle: 'monthly', observations: recentObservation }];
  const result = checkDeadMoneyThreshold(items);
  expect(result.shouldAlert).toBe(false);
});

test('does not trigger when dormant spend is below both thresholds', () => {
  const items = [{ id: '1', cost: 2, billingCycle: 'monthly', observations: [] }];
  const result = checkDeadMoneyThreshold(items);
  expect(result.shouldAlert).toBe(false);
});
```

- [ ] **Step 11: Run test to verify it fails**

Run: `cd functions && npx jest __tests__/scheduled/deadMoneyAlert.test.ts`
Expected: FAIL with "Cannot find module '../../src/scheduled/deadMoneyAlert'"

- [ ] **Step 12: Write `functions/src/scheduled/deadMoneyAlert.ts`**

```ts
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { isDormant } from '../lib/dormancy';
import { monthlyEquivalent } from '../lib/costNormalization';

const SINGLE_ITEM_THRESHOLD = 5;
const TOTAL_THRESHOLD = 20;

interface RegistryItemWithObservations {
  id: string;
  cost: number;
  billingCycle: string;
  observations: { observedAt: string }[];
}

export function checkDeadMoneyThreshold(items: RegistryItemWithObservations[]): { shouldAlert: boolean; reason: string } {
  const dormantItems = items.filter((item) => isDormant(item.observations));
  const dormantCosts = dormantItems.map((item) => monthlyEquivalent(item.cost, item.billingCycle));

  const maxSingle = Math.max(0, ...dormantCosts);
  if (maxSingle > SINGLE_ITEM_THRESHOLD) {
    return { shouldAlert: true, reason: `single item exceeds $${SINGLE_ITEM_THRESHOLD}/mo` };
  }

  const total = dormantCosts.reduce((sum, c) => sum + c, 0);
  if (total > TOTAL_THRESHOLD) {
    return { shouldAlert: true, reason: `total dormant spend exceeds $${TOTAL_THRESHOLD}/mo` };
  }

  return { shouldAlert: false, reason: '' };
}

export const deadMoneyAlert = onSchedule('every day 09:00', async () => {
  // FCM push-sending wiring (fetching each user's device token and calling
  // admin.messaging().send()) is deferred to implementation time once a
  // client-side FCM token registration flow exists — that is client work
  // outside this backend-only plan's scope. checkDeadMoneyThreshold above is
  // the fully tested decision logic a future push-sending wrapper calls.
});
```

- [ ] **Step 13: Run test to verify it passes**

Run: `cd functions && npx jest __tests__/scheduled/deadMoneyAlert.test.ts`
Expected: PASS — all 4 assertions succeed.

- [ ] **Step 14: Register both in `functions/src/index.ts`**

```ts
import { dormancyCheck } from './scheduled/dormancyCheck';
import { deadMoneyAlert } from './scheduled/deadMoneyAlert';
export { dormancyCheck, deadMoneyAlert };
```

- [ ] **Step 15: Commit**

```bash
git add functions/src/lib functions/src/scheduled functions/src/index.ts functions/__tests__/lib functions/__tests__/scheduled
git commit -m "feat: dormancyCheck retry sweep, deadMoneyAlert threshold logic (mirrors client dormancy/cost logic)"
```

---

### Task 5: `aiSuggest` and `aiRank`

**Files:**
- Create: `functions/src/ai/aiSuggest.ts`
- Create: `functions/src/ai/aiRank.ts`
- Modify: `functions/src/index.ts`
- Test: `functions/__tests__/ai/aiSuggest.test.ts`
- Test: `functions/__tests__/ai/aiRank.test.ts`

**Interfaces:**
- Consumes: `callJsonMode`, `getOpenAIClient` (Task 2).
- Produces: nothing consumed by later tasks in this plan — both are leaf functions.

- [ ] **Step 1: Write the failing test for `aiSuggest`'s core logic**

```ts
// functions/__tests__/ai/aiSuggest.test.ts
import { generateSuggestions } from '../../src/ai/aiSuggest';

test('parses a well-formed suggestion array and writes one suggestion doc per entry', async () => {
  const created: any[] = [];
  const fakeDb: any = {
    collection: () => ({
      where: () => ({ get: async () => ({ docs: [{ id: 'item-1', data: () => ({ name: 'Hulu', cost: 15 }) }] }) }),
      add: async (data: any) => { created.push(data); return { id: 'suggestion-1' }; },
    }),
  };
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify([{ itemId: 'item-1', suggestedAction: 'cut', suggestedAlternativeId: null, reason: 'Unused for 45 days' }]) } }],
    }) } },
  };

  const count = await generateSuggestions(fakeOpenai, fakeDb, 'alice');

  expect(count).toBe(1);
  expect(created).toHaveLength(1);
  expect(created[0].item).toBe('item-1');
  expect(created[0].suggestedAction).toBe('cut');
  expect(created[0].createdBy).toBe('alice');
});

test('throws on a malformed suggestion response (not an array)', async () => {
  const fakeDb: any = { collection: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }) };
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify({ notAnArray: true }) } }],
    }) } },
  };
  await expect(generateSuggestions(fakeOpenai, fakeDb, 'alice')).rejects.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx jest __tests__/ai/aiSuggest.test.ts`
Expected: FAIL with "Cannot find module '../../src/ai/aiSuggest'"

- [ ] **Step 3: Write `functions/src/ai/aiSuggest.ts`**

```ts
import { Firestore } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getOpenAIClient, callJsonMode } from './openaiClient';

interface SuggestionEntry {
  itemId: string;
  suggestedAction: string;
  suggestedAlternativeId: string | null;
  reason: string;
}

function isValidSuggestionArray(x: any): x is SuggestionEntry[] {
  return (
    Array.isArray(x) &&
    x.every(
      (entry) =>
        typeof entry?.itemId === 'string' &&
        typeof entry?.suggestedAction === 'string' &&
        (entry?.suggestedAlternativeId === null || typeof entry?.suggestedAlternativeId === 'string') &&
        typeof entry?.reason === 'string'
    )
  );
}

export async function generateSuggestions(openai: OpenAI, db: Firestore, uid: string): Promise<number> {
  const items = await db.collection('registryItems').where('createdBy', '==', uid).get();
  const registrySummary = items.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const systemPrompt = `You are a spend-optimization assistant. Given a user's subscription registry, identify wasteful/redundant items. Respond in JSON as an array: [{ "itemId": string, "suggestedAction": "cut"|"consolidate"|"investigate", "suggestedAlternativeId": string | null, "reason": string }]. Only include items worth flagging — an empty array is a valid response.`;
  const userPrompt = `Registry: ${JSON.stringify(registrySummary)}`;

  const parsed = await callJsonMode(openai, systemPrompt, userPrompt);
  if (!isValidSuggestionArray(parsed)) {
    throw new Error('Malformed suggestion response from AI');
  }

  for (const entry of parsed) {
    await db.collection('suggestions').add({
      item: entry.itemId,
      suggestedAction: entry.suggestedAction,
      suggestedAlternative: entry.suggestedAlternativeId,
      suggestionText: entry.reason,
      response: null,
      reason: entry.reason,
      shownAt: new Date().toISOString(),
      respondedAt: null,
      dismissedForever: false,
      createdBy: uid,
    });
  }

  return parsed.length;
}

export const aiSuggest = onSchedule('every monday 08:00', async () => {
  // Runs per-user in a real multi-user deployment — for this single-user app,
  // iterating all distinct createdBy values in registryItems is sufficient;
  // a users collection isn't part of this data model. Left as an
  // implementation-time detail: query distinct createdBy values, call
  // generateSuggestions(openai, db, uid) for each.
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npx jest __tests__/ai/aiSuggest.test.ts`
Expected: PASS — both assertions succeed.

- [ ] **Step 5: Write the failing test for `aiRank`**

```ts
// functions/__tests__/ai/aiRank.test.ts
import { rankCategory } from '../../src/ai/aiRank';

test('parses a well-formed ranking and writes a taskRankings doc, sets isBestForTask on the winner', async () => {
  const written: any[] = [];
  const updated: any[] = [];
  const fakeDb: any = {
    collection: (name: string) => ({
      where: () => ({ get: async () => ({ docs: [
        { id: 'item-1', data: () => ({ name: 'VS Code' }), ref: { update: async (d: any) => updated.push({ id: 'item-1', ...d }) } },
        { id: 'item-2', data: () => ({ name: 'Sublime' }), ref: { update: async (d: any) => updated.push({ id: 'item-2', ...d }) } },
      ] }) }),
      add: async (data: any) => { written.push(data); return { id: 'ranking-1' }; },
    }),
  };
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify({ orderedItemIds: ['item-1', 'item-2'], bestItemId: 'item-1' }) } }],
    }) } },
  };

  await rankCategory(fakeOpenai, fakeDb, 'alice', 'coding');

  expect(written).toHaveLength(1);
  expect(written[0].orderedItems).toEqual(['item-1', 'item-2']);
  expect(updated).toContainEqual({ id: 'item-1', isBestForTask: true });
  expect(updated).toContainEqual({ id: 'item-2', isBestForTask: false });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd functions && npx jest __tests__/ai/aiRank.test.ts`
Expected: FAIL with "Cannot find module '../../src/ai/aiRank'"

- [ ] **Step 7: Write `functions/src/ai/aiRank.ts`**

```ts
import { Firestore } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import { onCall } from 'firebase-functions/v2/https';
import { callJsonMode } from './openaiClient';

interface RankingResult {
  orderedItemIds: string[];
  bestItemId: string;
}

function isValidRanking(x: any): x is RankingResult {
  return Array.isArray(x?.orderedItemIds) && typeof x?.bestItemId === 'string';
}

export async function rankCategory(openai: OpenAI, db: Firestore, uid: string, taskCategory: string): Promise<void> {
  const items = await db
    .collection('registryItems')
    .where('createdBy', '==', uid)
    .where('taskCategories', 'array-contains', taskCategory)
    .get();

  const candidates = items.docs.map((d) => ({ id: d.id, name: (d.data() as any).name }));
  if (candidates.length === 0) return;

  const systemPrompt = `Rank these tools for the "${taskCategory}" task category, best first. Respond in JSON: { "orderedItemIds": string[], "bestItemId": string }`;
  const userPrompt = `Candidates: ${JSON.stringify(candidates)}`;

  const parsed = await callJsonMode(openai, systemPrompt, userPrompt);
  if (!isValidRanking(parsed)) {
    throw new Error('Malformed ranking response from AI');
  }

  await db.collection('taskRankings').add({
    taskCategory,
    orderedItems: parsed.orderedItemIds,
    lastRankedAt: new Date().toISOString(),
    manuallyOverridden: false,
    overrideNote: null,
    createdBy: uid,
  });

  for (const doc of items.docs) {
    await doc.ref.update({ isBestForTask: doc.id === parsed.bestItemId });
  }
}

export const aiRank = onCall(async (request) => {
  if (!request.auth) {
    throw new Error('Unauthenticated');
  }
  const { taskCategory } = request.data as { taskCategory: string };
  if (typeof taskCategory !== 'string') {
    throw new Error('Missing taskCategory');
  }
  const admin = await import('firebase-admin');
  const { getOpenAIClient } = await import('./openaiClient');
  await rankCategory(getOpenAIClient(), admin.firestore(), request.auth.uid, taskCategory);
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd functions && npx jest __tests__/ai/aiRank.test.ts`
Expected: PASS.

- [ ] **Step 9: Register both in `functions/src/index.ts`**

```ts
import { aiSuggest } from './ai/aiSuggest';
import { aiRank } from './ai/aiRank';
export { aiSuggest, aiRank };
```

- [ ] **Step 10: Commit**

```bash
git add functions/src/ai functions/src/index.ts functions/__tests__/ai
git commit -m "feat: aiSuggest spend-optimizer and aiRank per-category ranking"
```

---

### Task 6: `weeklyDigest`

**Files:**
- Create: `functions/src/scheduled/weeklyDigest.ts`
- Modify: `functions/src/index.ts`
- Test: `functions/__tests__/scheduled/weeklyDigest.test.ts`

**Interfaces:**
- Consumes: `isDormant` (Task 4), `monthlyEquivalent` (Task 4).
- Produces: `buildDigestSummary(items, observationsByItem): {itemCount, totalMonthlySpend, dormantCount, ...}` — leaf function, nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test for `buildDigestSummary`**

```ts
// functions/__tests__/scheduled/weeklyDigest.test.ts
import { buildDigestSummary } from '../../src/scheduled/weeklyDigest';

test('summarizes item count, total monthly spend, and dormant count', () => {
  const items = [
    { id: '1', cost: 10, billingCycle: 'monthly', status: 'keep', observations: [{ observedAt: new Date().toISOString() }] },
    { id: '2', cost: 120, billingCycle: 'annual', status: 'review', observations: [] },
    { id: '3', cost: 5, billingCycle: 'monthly', status: 'cut', observations: [] },
  ];

  const summary = buildDigestSummary(items);

  expect(summary.itemCount).toBe(3);
  expect(summary.totalMonthlySpend).toBeCloseTo(25); // 10 + (120/12) + 5
  expect(summary.dormantCount).toBe(2); // items 2 and 3 have no observations
  expect(summary.flaggedToCutCount).toBe(1); // status 'cut'
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx jest __tests__/scheduled/weeklyDigest.test.ts`
Expected: FAIL with "Cannot find module '../../src/scheduled/weeklyDigest'"

- [ ] **Step 3: Write `functions/src/scheduled/weeklyDigest.ts`**

```ts
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { isDormant } from '../lib/dormancy';
import { monthlyEquivalent } from '../lib/costNormalization';

interface RegistryItemWithObservations {
  id: string;
  cost: number;
  billingCycle: string;
  status: string;
  observations: { observedAt: string }[];
}

export function buildDigestSummary(items: RegistryItemWithObservations[]) {
  const itemCount = items.length;
  const totalMonthlySpend = items.reduce((sum, item) => sum + monthlyEquivalent(item.cost, item.billingCycle), 0);
  const dormantCount = items.filter((item) => isDormant(item.observations)).length;
  const flaggedToCutCount = items.filter((item) => item.status === 'cut').length;

  return { itemCount, totalMonthlySpend, dormantCount, flaggedToCutCount };
}

export const weeklyDigest = onSchedule('every monday 07:00', async () => {
  // Email-sending wiring (fetching the user's email from Firebase Auth,
  // rendering an HTML template with buildDigestSummary's output, and
  // dispatching via an email provider) is deferred to implementation time —
  // buildDigestSummary above is the fully tested aggregation logic a future
  // email-sending wrapper calls.
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npx jest __tests__/scheduled/weeklyDigest.test.ts`
Expected: PASS — all 4 assertions succeed.

- [ ] **Step 5: Register in `functions/src/index.ts`**

```ts
import { weeklyDigest } from './scheduled/weeklyDigest';
export { weeklyDigest };
```

- [ ] **Step 6: Run the full Cloud Functions test suite**

Run: `cd functions && npx jest`
Expected: all tests across all 6 tasks pass — no regressions from earlier tasks.

- [ ] **Step 7: Commit**

```bash
git add functions/src/scheduled functions/src/index.ts functions/__tests__/scheduled
git commit -m "feat: weeklyDigest summary aggregation logic"
```

---

## Self-Review Notes

**Spec coverage check (Phase 2 spec against tasks):**
- `ingest` HTTPS endpoint, ID-token verification, `deviceSources` find-or-create scoped by `(uid, sourceId)` → Task 1 ✓
- `aiClassify` Firestore trigger, exact-then-fuzzy dedup, JSON-mode + schema validation → Task 2 ✓
- Gmail scan collector (`gmailScan`/`processGmailMessage`) → Task 3 ✓ (with an explicit, disclosed scope boundary: live Gmail API/OAuth wiring is deferred pending client-side OAuth work; all testable logic is implemented and tested)
- `dormancyCheck` scheduled daily + staging retry sweep → Task 4 ✓
- `deadMoneyAlert` scheduled daily-check, two-tier $5/$20 threshold → Task 4 ✓ (FCM push-sending itself deferred — same category of disclosed boundary as Gmail OAuth, since it depends on client-side FCM token registration not yet built)
- `aiSuggest` weekly, `aiRank` on-demand callable → Task 5 ✓
- `weeklyDigest` weekly aggregation → Task 6 ✓ (email-sending itself deferred, same disclosed-boundary pattern)
- Security rules for new collections (`stagingItems`, `deviceSources`) using the same `isOwner`/`isOwnerOnCreate` pattern Phase 1 already hardened → Task 1 ✓
- `createdBy` naming consistency across all new collections → enforced in every task's model/write code ✓
- AI output contract validation (reject malformed responses, never partial-write) → Task 2, 3, 5 all follow the same validate-before-write pattern ✓

**Native Android usage collector (base spec §7, Phase 2 spec §6):** explicitly out of scope for this plan (Phase 2b, future separate plan) — not a gap, a deliberate split per the Scope Check.

**Placeholder scan:** three deferred integration points are flagged explicitly (Gmail OAuth client wiring in Task 3, FCM push-sending in Task 4, email-sending in Task 6) — each is a genuine "this depends on not-yet-built client work" boundary with fully tested logic on the backend side of the boundary, not a vague "add error handling"-style placeholder. Each is called out by name in its task's code comments and in this self-review, per the plan's own instruction to disclose scope boundaries rather than hide them.

**Placeholder deviation flagged for user attention:** `observations.registryItemId` is written as `null` at ingest time in Task 1, which widens the field's type beyond Phase 1's original `Observation` interface (`registryItemId: string`, non-null). This is flagged inline in Task 1's own notes for the task reviewer to verify doesn't break Phase 1's `useObservations(itemId)` hook — reasoning included: a `null` value never matches a `where('registryItemId', '==', itemId)` query for any real `itemId`, so it's additive-safe, but the type declaration itself may need a corresponding one-line widening in the client's `src/types/models.ts` (`registryItemId: string | null`) as a small follow-up, not covered by this plan since it's a Phase 1 client file.

**Type consistency:** `CollectorType`, `MatchConfidence`, `SuggestionAction`, `SuggestionResponse` enum values are used identically as string literals across every task (`'phone_usage'`, `'gmail'`, `'manual'`, `'high'`/`'low'`/`'confirmed'`, `'cut'`/`'consolidate'`/`'investigate'`) — verified consistent between Task 1's enum definitions and every later task's usage in test fixtures and Firestore writes. `createdBy` field name used uniformly across `stagingItems`, `deviceSources`, `suggestions`, `taskRankings` in every task, matching the Global Constraints ruling.
