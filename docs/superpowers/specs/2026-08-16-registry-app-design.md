# Registry App — Design Spec

> Personal subscription & tool-registry manager. Native rebuild of a broken Bubble prototype. Source of truth for the Phase 1 build.

**Status:** Approved. Stack locked, data model resolved, Phase 1 scope defined. Ready for implementation planning.
**Target:** Android only (iOS explicitly dropped).
**Origin:** Migrated off a mobile-only Bubble app that was largely non-functional.

---

## 0. Context & Guiding Principles

- The Bubble app is a **specification, not a source.** It was riddled with editor-level breakage (empty constraint fields, unset page data types, unwired buttons, duplicate "shadow" data types, and a "create a junk record to hold a search result" workaround pattern across 7 backend workflows). **None of that carries over. Do not port Bubble's bugs.**
- The data model below is the **cleaned, resolved** version. It already fixes the Bubble app's known modeling problems (see §8). Build from this, not from the Bubble schema.
- **Phase 1 = a fully working registry app with no auto-ingestion.** It's a real, shippable product on its own. Phase 2 bolts on collectors, the Gmail/AI pipeline, and scheduled jobs. Don't let Phase 2 infrastructure block a working v1.
- **A larger "contextual coach" vision exists but is explicitly out of scope** — see §11. Only groundwork that costs nothing now (three optional schema fields) is included in Phase 1.

---

## 1. Tech Stack & Platform

| Layer | Choice | Notes |
|---|---|---|
| App framework | **Expo (React Native)** | Dev builds + config plugins; not bare RN, not managed-jail |
| Language | **TypeScript** | |
| Data | **Firebase Firestore** | Per-user scoped, security rules = creator-only |
| Auth | **Firebase Auth** | |
| SDK | **Firebase JS SDK** | Sufficient for Firestore + Auth in Expo. Only move to React Native Firebase if a specific native need (e.g. certain FCM background behavior) forces it |
| Backend logic | **Cloud Functions** | AI pipeline, `/ingest`, scheduled jobs |
| Scheduling | **Cloud Scheduler / Pub-Sub** | Drives the recurring workflows |
| Push | **FCM** via `expo-notifications` + Admin SDK from a Cloud Function | Android-only, no APNs |
| Gmail | `expo-auth-session` (OAuth) + Gmail API (readonly scope) | Phase 2 |
| Secrets | `expo-secure-store` | Device tokens |
| Builds | **EAS Build** (cloud) | Local Android Studio build on Linux is available as a fallback |

**Platform decision rationale:** the app is Firestore CRUD + lists + forms + computed stats + one push — zero native Android APIs in the core, and the dev already writes React/TS, so RN is the fast path. The one genuinely native-Android piece (phone-usage tracking via `UsageStatsManager`) is isolated — see §7.

---

## 2. App Description & Core Loop

A mobile app for tracking every recurring tool, subscription, and expense the user pays for, surfacing which ones are wasted spend.

**The central loop that ties the app together:**

```
Collectors (Gmail scan / phone-usage / Pieces / Heartbeat / manual)
        │  push observed items → generic /ingest endpoint
        ▼
StagingItem queue  ──►  AI classify + match/dedup (canonical_identity)
        │  user reviews
        ▼
"Add to Registry"  ──►  RegistryItem     OR     "Ignore"
        │
        ▼
Registry (list / filter / edit)  +  Observations (usage events)
        │
        ▼
Derived signals:  dormancy (hero alert) · cost-per-use (stat) · AI suggestions
```

**Observation is the linchpin.** An Observation is a *windowed usage event* (how many times / how long a tool was used over a time window), logged either by a collector or manually. Observations drive last-used date, dormancy, and cost-per-use. Everything analytic hangs off them.

---

## 3. Key Features

**Phase 1 (shippable without auto-ingestion):**
- Registry list with search + status filter + kind filter
- Manual add-item form
- Item detail: view/edit, **log observation**, retire/reactivate, delete
- Tasks view: items grouped by task category, ranked within
- Alerts: **dormancy (primary)**, high cost-per-use / redundant
- Alert snooze / dismiss
- Home dashboard: counts by status, total monthly spend, summary stats
- Cost-per-use displayed as a stat (trailing 90-day window — see §8.4)

**Phase 2:**
- `/ingest` collector endpoint
- Gmail scan → staging pipeline
- AI classification of staging items
- AI dedup/matching of incoming items against existing registry (`canonical_identity`)
- AI spend-optimizer suggestions
- AI best-tool-per-category ranking
- Weekly digest email
- Dead-money push alert
- **Native Android usage collector** (separate app — see §7)

**Explicitly deferred (see §11):** real-time foreground-app monitoring, contextual interrupt notifications, cross-app work handoff. Not Phase 1 or Phase 2.

---

## 4. Data Model (resolved / native)

Per-user; every record carries an owner and is readable/writable only by its creator via Firestore security rules. Option sets are **TypeScript enums, not collections.**

### Enums

```ts
enum ItemStatus     { Keep, Review, Cut }              // user lifecycle only — see §8
enum ItemKind       { App, Subscription, DevTool, Service, Hardware, Other }
enum BillingCycle   { Weekly, Monthly, Annual, ... }   // finalize set — see OQ-9
enum TaskCategory   { Writing, Coding, Communication, Design, Productivity, Media, Finance, Utilities, Other }
enum CollectorType  { PhoneUsage, Gmail, Heartbeat, Pieces, Manual }
enum MatchConfidence{ High, Low, Confirmed }
enum AlertType      { Dormant, HighCost, Redundant }
enum SuggestionAction { Cut, Consolidate, Investigate }
enum SuggestionResponse { Accepted, Dismissed, Vetoed, Snoozed }
enum ActionType     { StatusChanged, CostConfirmed, AliasMerged, SuggestionAccepted,
                      SuggestionVetoed, Snoozed, Justified, ManuallyAdded, Deleted,
                      PreferenceUpdated, RankingOverridden, AlertSent, DigestSent }
```

### `registryItems`  *(core entity)*
| Field | Type | Notes |
|---|---|---|
| name | string | |
| cost | number | Store with `billingCycle`; normalize to monthly for aggregates |
| billingCycle | BillingCycle | |
| kind | ItemKind | |
| status | ItemStatus | Keep / Review / Cut **only** |
| taskCategories | TaskCategory[] | Multi-tag; this is the grouping mechanism (no clusters) |
| description | string | |
| canonicalIdentity | string | Dedup key (e.g. bundle ID) |
| justified | boolean | User-confirmed as justified spend (derived flag, not a status) |
| isBestForTask | boolean | Set by AI ranking (Phase 2) |
| useCases | string \| null | Optional. Not used in Phase 1 logic — groundwork for a future capability-aware phase (§11). Left blank unless user fills it in. |
| capabilitySummary | string \| null | Optional. Same as above. |
| sourceUrl | string \| null | Optional. Same as above. |
| createdBy | uid | |
| createdAt | timestamp | |

> `dormant` is **derived** (no observation in 21 days), never stored. Snooze state lives in `alertDismissals`, not here.

### `observations`  *(usage events — most important analytic type)*
| Field | Type | Notes |
|---|---|---|
| registryItemId | ref | |
| deviceSourceId | ref | |
| collector | CollectorType | |
| observedAt | timestamp | |
| windowHours | number | Window this observation covers |
| usageCount | number | Times used in window |
| usageDurationMs | number | Total active duration in window |
| lastUsed | timestamp | Denormalized convenience |
| rawPayload | string | Raw collector blob |

### `stagingItems`  *(inbound review queue)*
| Field | Type | Notes |
|---|---|---|
| rawLabel | string | Raw name from collector |
| rawCategory | string | Category hint |
| rawIdentity | string | Bundle ID / canonical identity |
| payloadSnapshot | string | Full JSON payload |
| collector | CollectorType | |
| sourceId | string | |
| capturedAt | timestamp | |
| suggestedMatch | ref → registryItems | AI-suggested existing match |
| suggestionConfidence | MatchConfidence | |
| resolved | boolean | |
| resolvedAt | timestamp | |

### `deviceSources`  *(named collectors)*
| Field | Type | Notes |
|---|---|---|
| sourceId | string | Unique per collector |
| label | string | |
| owner | uid | |
| collector | CollectorType | |
| firstSeen | timestamp | |
| lastSeen | timestamp | Updated per ingest |

### `suggestions`  *(AI recommendations — Phase 2)*
| Field | Type | Notes |
|---|---|---|
| item | ref | |
| suggestedAction | SuggestionAction | **Must be parsed from AI JSON** (Bubble stored raw text only) |
| suggestedAlternative | ref | Optional |
| taskCategory | TaskCategory | |
| suggestionText | string | Raw AI text |
| response | SuggestionResponse | |
| reason | string | |
| shownAt / respondedAt | timestamp | |
| dismissedForever | boolean | |

### `taskRankings`  *(AI ranking output — Phase 2)*
| Field | Type | Notes |
|---|---|---|
| taskCategory | TaskCategory | |
| orderedItems | ref[] | Ranked order |
| lastRankedAt | timestamp | |
| manuallyOverridden | boolean | |
| overrideNote | string | |

### `alertDismissals`  *(single source of truth for snooze/dismiss)*
| Field | Type | Notes |
|---|---|---|
| item | ref | |
| alertType | AlertType | Per-alert-type, so snoozing one alert doesn't kill others |
| dismissedAt | timestamp | |
| snoozedUntil | timestamp | |
| owner | uid | |

### `userVetoes`  *(rejected AI alternatives — Phase 2)*
| Field | Type | Notes |
|---|---|---|
| item | ref | |
| vetoedAlternative | ref | |
| owner | uid | |
| reason | string | |
| createdAt | timestamp | |

### `actionLogs`  *(audit trail)*
| Field | Type | Notes |
|---|---|---|
| actionType | ActionType | |
| actedBy | uid | |
| reason | string | |
| createdAt | timestamp | |

**Cut from the Bubble schema:** `TaskCluster` (never wired, no assignment mechanism — see §8 & OQ-4), and the duplicate "shadow" `RegistryItem`/`StagingItem` types (Bubble bug; one canonical type each here).

---

## 5. Screen & Navigation Flow

**Navigation:** React Navigation — bottom **tab navigator** (5 tabs) + a **native stack** for Add / Detail / auth.

```
Tab bar (global)
├── Home            Dashboard: counts by status, total monthly spend, summary stats
├── Registry        Main list · search + status filter + kind filter · FAB → Add Item
│     ├─[push]→ Add Item      Manual create: name, kind, categories, cost, cadence, description
│     └─[push]→ Item Detail   View/edit · Log Observation · Retire/Reactivate toggle · Delete
├── Tasks           Items grouped by task category, ranked within (AI ranking)
├── Alerts & Digest Dormant (primary) / High cost-per-use / Redundant · snooze + dismiss per alert
└── Staging         Review queue of unresolved staging items → Add to Registry / Ignore

Outside tabs (stack): Login · Reset Password
Reusable: offline banner (show app-wide, not just one screen as in Bubble)
```

**Screen build notes:**
- **Home** — "total spend" must **normalize all costs to a monthly equivalent** before summing (the Bubble version summed mixed billing cycles, so annual and monthly items counted equally). Normalize by `billingCycle`.
- **Item Detail** — the Retire/Reactivate button toggles label by state; with status collapsed (§8), "retire" maps to `Cut` and dormancy is derived, so reconcile the button's semantics to the new status model. Cost-per-use stat shown here uses the trailing 90-day observation window.
- **Tasks** — group by `taskCategories`; there are no clusters in v1.

---

## 6. Backend / API Architecture (Phase 2)

All AI calls and secrets run **server-side in Cloud Functions** — never ship OpenAI keys to the device.

| Workflow | Trigger | Purpose |
|---|---|---|
| `ingest` | HTTPS endpoint | Generic collector intake → creates `deviceSource` (dedup on `sourceId`), `stagingItem`, `observation`. **Real find-or-create, not the Bubble junk-record pattern.** |
| `gmailScan` → `processGmailMessage` | Callable (from a "Scan Gmail" action) | Search Gmail (`subject:(receipt OR invoice OR subscription OR billing) newer_than:30d`) → per-message → create staging item |
| `aiClassify` | Called after staging insert | OpenAI → JSON `{ kind, category, active }` → **parse and write structured fields back** |
| `aiSuggest` | Scheduled | OpenAI spend-optimizer over the user's registry → parse JSON array → create `suggestions` |
| `aiRank` | Callable per category | OpenAI ranks tools for a category → write `taskRankings` + set `isBestForTask` |
| `dormancyCheck` | Scheduled | Derive dormancy from latest observation per item (21-day no-observation threshold) |
| `weeklyDigest` | Scheduled (weekly) | HTML email: item count, monthly spend, dormant count, flagged-to-cut count, top suggestion |
| `deadMoneyAlert` | Scheduled | FCM push when dormant + costly items exceed a spend threshold |

The original prompts for classify / suggest / rank exist in the Bubble spec and are a good starting point — but their **JSON output contracts must be pinned down** so responses parse into structured fields (see OQ-5).

---

## 7. The Native Usage Collector (isolated)

Phone-usage tracking uses Android's `UsageStatsManager` (`PACKAGE_USAGE_STATS` permission) — a native Android capability with **no cross-platform equivalent**. Build it as a **separate small native Android (Kotlin) app** that reads usage stats and POSTs to the `/ingest` endpoint. Keeping it out of the RN app keeps the main codebase clean and avoids a native module in the core. This is Phase 2 and fully decoupled.

---

## 8. Resolved Design Decisions

1. **Status collapsed (approved).** `ItemStatus` = **Keep / Review / Cut** only. `Dormant` becomes **derived** (no observation in 21 days); `Justified` becomes a **boolean flag**. The old overloaded status set (Keep/Dormant/Cut/Justified + a parallel `justified` boolean) is gone — that overload is what kept breaking the Bubble constraint fields.
2. **Snooze/dismiss consolidated (approved).** All snooze/dismiss state lives in **`alertDismissals`** (per item + alert type). The item-level `snoozedUntil`/`snoozeReason` fields are dropped.
3. **TaskCluster cut for v1 (approved).** It was never assignable and would render an empty view. Grouping is via `taskCategories`. Named user-defined clusters remain a possible deliberate future feature (OQ-4).
4. **Cost-per-use = a computed read-time stat, not a stored field (approved, resolved).** Metric flavor: **per active hour** (duration-based), computed over a **trailing 90-day observation window**. No-telemetry subscriptions (e.g. Netflix) are entered as a plain monthly cost. **Dormancy is the primary "wasted spend" alert; cost-per-use is display-only — it is not a triggerable alert.** `AlertType.HighCost` is reserved in the enum for a possible future high-total-spend-outlier alert, but nothing in Phase 1 or Phase 2 triggers it from cost-per-use.
5. **Billing-cycle normalization** to monthly-equivalent for all spend aggregates.
6. **Duplicate shadow types and the placeholder junk-record pattern do not carry over.** One canonical type per entity; real queries pass results directly.

---

## 9. Open Questions (unresolved, non-blocking)

- **OQ-2 — Duration metric distortion.** Per-active-hour rewards time-sinks and punishes efficient background/utility tools (a backup service shows near-infinite cost-per-hour while doing its job). Known risk, acknowledged. Decide whether to show the honest raw pair (`$X/mo · used N× / N hrs in last 90d`) instead of a single ratio, and how no-usage-data items appear (excluded vs "log usage" prompt).
- **OQ-3 — Dedup/matching algorithm.** `canonicalIdentity` is the key, but the actual match logic (exact bundle-ID match vs fuzzy name match, confidence thresholds for `suggestedMatch`) is undefined.
- **OQ-4 — Named clusters.** Do we ever build user-defined named groupings ("Client A stack")? Deferred; not v1.
- **OQ-5 — AI output contracts.** Lock the exact JSON schemas for classify / suggest / rank so Cloud Functions parse them into structured fields. Bubble stored raw AI text unparsed — must not repeat.
- **OQ-6 — Collector auth/security.** How does an external collector authenticate to write into a specific user's data via `/ingest` (per-user API key? Firebase auth token?).
- **OQ-7 — Single- vs multi-user.** Bubble had Users + `createdBy` scoping (multi-user capable). Confirm whether this is a personal single-account app or genuinely multi-user — affects how much auth UX is needed.
- **OQ-8 — Scheduled cadences.** Digest is weekly; confirm dormancy-check and dead-money-alert frequencies and the dead-money spend threshold.
- **OQ-9 — Billing-cycle enum.** Finalize the full set of supported billing cycles.

All of the above are Phase 2 concerns or cosmetic; none block Phase 1 scaffolding or screen implementation.

---

## 10. Suggested Build Order

1. Firebase project + Firestore + Auth; security rules (creator-only).
2. TypeScript types + enums for the §4 model.
3. Expo app scaffold + React Navigation (tabs + stack).
4. **Registry** list (Firestore query, search, status/kind filters).
5. **Add Item** form → create `registryItem`.
6. **Item Detail** (view/edit, delete, retire/reactivate, log observation).
7. **Home** dashboard (with monthly normalization).
8. **Tasks** (group by category).
9. **Alerts** (derive dormancy; snooze/dismiss via `alertDismissals`).
10. — Phase 1 ships here —
11. Phase 2: `/ingest` + Staging pipeline, AI Cloud Functions, scheduled jobs, digest/push, native usage collector.

---

## 11. Explicitly Deferred: Contextual-Coach Vision (not Phase 1 or Phase 2)

A larger vision was raised alongside this spec: a real-time, context-aware system that would (a) monitor which app is in the foreground on the device, (b) understand each registry tool's capability profile in depth (sourced from Play Store listings, package metadata, web content), (c) cross-reference live activity against AI-ranked alternatives, (d) push a contextual interrupt notification ("you're doing X in App A, App B is better for X"), and (e) potentially hand off in-progress work to the suggested app.

This is a distinct, much larger system — closer to an OS-level productivity layer than a subscription registry — requiring:
- A native foreground-app monitor (Android accessibility service or equivalent) with no cross-platform equivalent, separate from the `UsageStatsManager` collector in §7.
- An app-capability enrichment pipeline (Play Store scraping / structured capability schema) that doesn't exist anywhere in this spec.
- A live (not scheduled) backend trigger workflow reacting to ingest events in real time.
- Work-context detection inside third-party apps and per-app handoff integrations (share sheets, file formats, APIs) — largely per-app, bespoke problems.

**Decision:** this vision is deliberately out of scope for Phase 1 and Phase 2. The only accommodation made now is three optional, unused `registryItems` fields (`useCases`, `capabilitySummary`, `sourceUrl` — §4) so that if this phase is built later, it doesn't require a schema migration on top of a populated registry. No behavior, workflow, or native component described above is built as part of this spec. If pursued, it needs its own brainstorming pass and its own design spec once Phase 1 exists and produces real usage data to build against.
