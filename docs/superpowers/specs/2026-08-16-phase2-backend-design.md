# Phase 2 — Backend & Auto-Ingestion: Design Spec

> Auto-ingestion, AI classification/dedup/suggestions, scheduled jobs, and the native Android usage collector. Builds on the shipped Phase 1 registry app (`2026-08-16-registry-app-design.md`). This is the backend/automation layer — Phase 1's client UI (Staging screen, Alerts, etc.) already exists and mostly sits unused until this phase wires real data into it.

**Status:** Design approved by user. Not yet handed to writing-plans.
**Depends on:** Phase 1 (shipped, live on `registry-app-prod-7a07c`) — `registryItems`, `observations`, `alertDismissals` collections and their security rules; the client's Staging screen UI (built but currently empty).
**Architecture:** Approach A — single Firebase Cloud Functions codebase. `ingest` is an HTTPS endpoint; `aiClassify` triggers automatically on `stagingItems` document creation; `dormancyCheck`, `aiSuggest`, `weeklyDigest`, `deadMoneyAlert` run on Cloud Scheduler cron. No message queue, no split codebases — right-sized for a single-user personal app, not an enterprise-scale system.

---

## 0. Relationship to Phase 1

Phase 1 shipped a fully manual registry app: add items by hand, log usage by hand, see dormancy/cost stats derived from what you entered. Phase 2 automates the "add items" and "log usage" steps — Gmail receipts and phone usage stats flow in automatically via collectors, get AI-classified, and land in the Staging screen (already built in Phase 1, never previously populated) for your one-tap approval.

Nothing in Phase 1's data model, security rules, or screens changes structurally. Phase 2 is additive: new Cloud Functions, new scheduled jobs, and one new native Android app (the usage collector) — none of it touches how `registryItems`/`observations`/`alertDismissals` are read or written by the existing client.

---

## 1. Core Pipeline

```
Collectors (Gmail scan action / native Android usage collector, every 6h)
        │  POST to /ingest with Firebase Auth ID token
        ▼
ingest (HTTPS Cloud Function)
  - verifies ID token server-side → resolves uid (never trusts a client-supplied uid)
  - find-or-create deviceSource, scoped by (uid, sourceId) — not sourceId alone
  - creates stagingItem + observation
        │
        ▼ (Firestore onCreate trigger — automatic, no polling)
aiClassify (Cloud Function)
  - exact canonicalIdentity match against registryItems? → suggestedMatch, confidence: High
  - no exact match → OpenAI fuzzy-match call → suggestedMatch, confidence: Low | Confirmed
  - OpenAI classify call → { kind, category, active } parsed into stagingItem's structured fields
        │  you review in the existing Phase 1 Staging screen
        ▼
"Add to Registry" (existing Phase 1 flow, unmodified) or "Ignore"

Independently, on schedule:
  dormancyCheck   (daily)   — derive dormancy per item (mirrors Phase 1's isDormant(), no new stored field);
                              also sweeps stuck stagingItems (resolved: false) and re-triggers aiClassify — see §3
  aiSuggest       (weekly)  — OpenAI spend-optimizer over full registry → suggestions
  aiRank          (callable, user-triggered per category from the Tasks screen)
  weeklyDigest    (weekly)  — HTML email summary
  deadMoneyAlert  (daily check) — FCM push if any single dormant item > $5/mo, OR total dormant spend > $20/mo
```

---

## 2. Data Flow & AI Output Contracts

Resolves OQ-5 from the base spec: exact JSON shapes for every AI call, validated server-side before any Firestore write. The Bubble app's known failure mode (storing raw AI text unparsed) does not carry over.

Every OpenAI call uses JSON mode (`response_format: { type: "json_object" }`) with the expected schema described in the system prompt. The Cloud Function validates the parsed response's shape before writing to Firestore — a malformed or unparseable response is logged and the triggering record is left unresolved (see §3), never written as partial/corrupt data.

```ts
// aiClassify — primary classification call
{ kind: ItemKind, category: TaskCategory, active: boolean, confidence: number }

// aiClassify — fuzzy-dedup fallback call (only invoked when exact canonicalIdentity match fails)
{ suggestedMatchId: string | null, confidence: "low" | "confirmed" }

// aiSuggest — spend-optimizer, object-wrapped array (one entry per flagged item);
// wrapped in a named key because json_object mode requires a top-level object
{ suggestions: [{ itemId: string, suggestedAction: SuggestionAction, suggestedAlternativeId: string | null, reason: string }] }

// aiRank — per-category ranking, callable on demand
{ orderedItemIds: string[], bestItemId: string }
```

**Dedup/matching resolution (OQ-3, resolved):** exact `canonicalIdentity` equality is checked first — cheap, deterministic, no AI call, `confidence: High`. Only when no exact match exists does the fuzzy-match OpenAI call run, returning `Low` or `Confirmed` confidence. Most real-world matches (the same app re-reported by two collectors) resolve via the exact path; the AI fallback only fires for genuine ambiguity (e.g. "Netflix" vs "Netflix.com").

---

## 3. Error Handling & Retry

- **`ingest`:** invalid/expired ID token → `401`, no write occurs. Malformed payload → `400`. All other failures → `500`, logged; the collector is responsible for its own retry (both collectors already retry naturally — Gmail scan is a user-triggered action, the native collector's next 6h cycle picks up unsynced data since `UsageStatsManager` data isn't lost on-device).
- **`aiClassify` / `aiSuggest` / `aiRank`:** an OpenAI call failing or timing out leaves the triggering record (`stagingItem` or `registryItem`) unmodified — no partial or corrupt writes. The failure is logged. No same-request retry (avoids burning API calls into a quota/outage).
- **Daily retry sweep (resolves the "stuck forever" risk):** `dormancyCheck`'s existing daily run additionally queries all `stagingItems` where `resolved == false` and re-triggers `aiClassify` for each. No retry-count tracking, no backoff logic — at this app's volume, "try again tomorrow" is sufficient, and it turns a silently-stuck-forever staging item into a self-healing-within-24h one. Piggybacks on the existing `dormancyCheck` schedule rather than adding a new cron job.
- **`deadMoneyAlert`:** an FCM push failure (expired/invalid device token) is logged, not retried same-day — the next day's scheduled check re-evaluates the threshold from scratch and will push again if still applicable.

---

## 4. Security & Scope Boundaries

- Every Cloud Function that touches user data resolves `uid` from the **verified** Firebase Auth ID token server-side — never trusts a client-supplied `uid` in the request body. This matches the security principle already established in this codebase family (see `resolveHouseholdId` pattern in the related Bear House Classic project's `api/_db.ts`) — the resolved identity from the verified token is the only thing enforcing per-user data isolation once a Cloud Function is running with elevated (admin-equivalent) privileges.
- The OpenAI API key lives in Firebase Functions config/secrets — never shipped to any client, including the native Android collector (already a stated constraint in the base spec §6, unchanged here).
- `deviceSources` find-or-create in `ingest` is scoped by the composite `(uid, sourceId)`, not `sourceId` alone — prevents a device identifier collision across different users' data. This matters even though the app is currently used by one person, since Phase 1's data model is genuinely multi-user by design (locked decision, OQ-7).

---

## 5. Scheduled Job Cadences (resolves OQ-8)

| Job | Cadence | Trigger detail |
|---|---|---|
| `dormancyCheck` | Daily | Derives dormancy per item (no new stored field, mirrors Phase 1's `isDormant()` exactly); also runs the staging retry sweep (§3) |
| `aiSuggest` | Weekly | Paired conceptually with the digest — AI suggestions are slower/costlier to generate and don't need daily freshness |
| `aiRank` | On-demand | Callable, user-triggered per category from the Tasks screen — not scheduled |
| `weeklyDigest` | Weekly | HTML email: item count, monthly spend, dormant count, flagged-to-cut count, top suggestion |
| `deadMoneyAlert` | Daily (check only) | Evaluates the threshold below; only actually sends a push when newly crossed |

**Dead-money alert threshold (resolved):** fires when any single dormant item's monthly-equivalent cost exceeds **$5/mo**, OR the sum of all dormant items' monthly-equivalent cost exceeds **$20/mo**. Two-tier by design — catches one meaningfully wasteful subscription on its own, and also catches many small dormant items accumulating even when no single one crosses the per-item bar.

---

## 6. Native Android Usage Collector

Separate small native Android (Kotlin) app, per base spec §7 — isolated from the main Expo/React Native client since `UsageStatsManager` has no cross-platform equivalent.

- **Cadence:** `WorkManager` periodic job, every 6 hours (resolved — battery-friendly, matches `Observation.windowHours`'s existing windowed-reporting design rather than live streaming).
- **Sync tracking:** last-successful-sync timestamp stored locally (`SharedPreferences`), not in Firestore — the collector reads `UsageStatsManager` data since that local timestamp on each run.
- **Auth:** signs in with the same Firebase Auth account as the main registry app (resolved — Phase 1 supports real multi-user, but this collector is fundamentally reporting data about "your" phone usage back to "your" account, not a separate identity).
- **Ingest call:** POSTs a batch of `Observation`-shaped records to `/ingest`, with the Firebase ID token in the `Authorization` header — same auth mechanism as every other Phase 2 collector (§4).
- **Failure behavior:** a failed POST does not trigger aggressive retry or crash the collector — `UsageStatsManager` data persists on-device regardless, so the next 6-hour cycle simply picks up everything since the last successful sync.

---

## 7. Testing Strategy

- **`ingest`:** unit tests for ID token verification (valid / expired / missing / malformed), and the `deviceSources` find-or-create dedup logic scoped by `(uid, sourceId)`.
- **Dedup/matching:** the exact-`canonicalIdentity` path is pure logic, unit-tested without any AI call. The fuzzy-match AI path is tested with a mocked OpenAI response, verifying the confidence-level branching (`Low` vs `Confirmed`) is parsed and applied correctly.
- **AI output contracts:** schema-validation tests using fixed sample OpenAI responses — both well-formed (proving successful parse-and-write) and deliberately malformed (proving the reject-and-log path works, with no partial Firestore write). No live OpenAI calls in the automated test suite.
- **Scheduled functions:** `dormancyCheck` and `deadMoneyAlert` reuse Phase 1's already-tested `isDormant()` pure function directly (`src/lib/dormancy.ts`) — not a reimplementation, avoiding logic drift between the client's derived-dormancy display and the server's alert-triggering derivation.
- **Retry sweep:** a dedicated test verifying a `stagingItem` left `resolved: false` after a simulated `aiClassify` failure gets picked up and re-processed by the next `dormancyCheck` run.

---

## 8. Open Questions (unresolved, non-blocking)

- **OQ-4 — Named clusters.** Still deferred from the base spec; not part of Phase 2.
- **Gmail search query tuning.** The base spec's placeholder search (`subject:(receipt OR invoice OR subscription OR billing) newer_than:30d`) is a reasonable starting point but may need iteration once real inbox results are seen — not a blocking design decision, tune during implementation.
- **`aiSuggest`/`aiRank` prompt content.** The base spec notes the original Bubble prompts are "a good starting point" — the exact prompt wording itself is an implementation-time detail, not architecture; this spec fixes the *output contract* (§2) that any prompt iteration must still satisfy.
- **OpenAI cost/rate-limit monitoring.** No budget cap or alerting on OpenAI spend is designed here — worth a lightweight follow-up (e.g. a monthly spend log) once real usage patterns are visible, but not blocking Phase 2's initial build.

---

## 9. Suggested Build Order

1. `ingest` Cloud Function (HTTPS, ID-token verification, `deviceSources` find-or-create, `stagingItem` + `observation` creation) — the foundation every collector depends on.
2. `aiClassify` (Firestore-triggered), including the exact-match-then-AI-fallback dedup logic and the JSON contract validation from §2.
3. Gmail scan action (`gmailScan` → `processGmailMessage`, callable from a client-side "Scan Gmail" action) — first real collector, exercises the `ingest` → `aiClassify` → Staging pipeline end-to-end.
4. `dormancyCheck` (daily, including the retry sweep from §3) and `deadMoneyAlert` (daily check) — both reuse Phase 1's `isDormant()`.
5. `aiSuggest` (weekly) and `aiRank` (on-demand callable).
6. `weeklyDigest` (weekly email).
7. Native Android usage collector app (separate project, per §6) — last, since it's the most isolated piece and benefits from `ingest` already being proven out by Gmail scan first.
