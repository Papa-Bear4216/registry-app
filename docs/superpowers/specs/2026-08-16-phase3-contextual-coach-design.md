# Phase 3 — Contextual Coach: Design Spec

> Real-time, on-device system that detects when the app currently in use is a meaningfully worse choice than a ranked alternative in the registry, and surfaces a minimal, privacy-neutral interrupt. Distinct sub-project, downstream of the Phase 1 registry app (`2026-08-16-registry-app-design.md`). Not scheduled for build yet — this is the design, not an implementation plan.

**Status:** Design approved by user. Not yet handed to writing-plans.
**Depends on:** Phase 1 (`registryItems`, `taskCategories`) and Phase 2 (`aiRank` → `TaskRanking`) from the base registry spec. Cannot be built before those exist and have real data.
**Governing rule: privacy-first.** No screen content or accessibility-tree data is ever transmitted off-device or persisted in any form, even temporarily, even in logs or crash reports. This constraint overrides convenience, debuggability, or feature richness anywhere they conflict.
**Governing rule: Play Store acceptance is a hard requirement at every stage**, not a later compliance pass. The feature's disclosed purpose, in-app disclosure flow, and bubble content are all designed around Google's accepted "digital wellbeing / screen-time" accessibility-use category from the start — see §11.5. Nothing in this spec should be built assuming a permissive review; if a design choice would not survive Play Store review, it is not an acceptable design choice here.

---

## 0. Relationship to the Base Spec

The base registry app (Phase 1/2) is a Keep/Review/Cut subscription tracker — passive, user-driven, no live monitoring. This document describes a **separate, later, opt-in feature layer** on top of it: instead of the user checking the registry, the registry reaches out at the moment a better tool exists for what they're doing right now.

This was explicitly deferred out of the base spec's §11. Building it requires its own native components, its own permission model, and its own privacy architecture, none of which exist in Phase 1/2.

---

## 1. Core Concept

**Disclosed purpose: a screen-time / digital-wellbeing awareness tool** — this is the framing used in the Play Store listing, the in-app disclosure screen, and the permission-request copy, and it is not just marketing language: it determines what the feature is allowed to do under Google's Accessibility API policy (see §11.5).

While the user is actively using their phone, if they open an app that is a *worse* choice than another app already in their registry for the same kind of task, a small collapsed bubble appears. **The bubble leads with a usage-awareness fact** (e.g. time already spent in this task category today) — not a ranked AI verdict. Tapping it expands to reveal the full picture: the registered alternative and the AI ranking reasoning behind the suggestion. The underlying trigger pipeline (§3) is unchanged by this framing — only what is surfaced first, and how the feature is described to the user and to Google, differs from a direct "AI says switch apps" interrupt.

Nothing is shown unless there is a real, meaningful gap — not on every app switch, not for system or sensitive apps.

---

## 2. Permission Model (all non-root, no device-owner enrollment)

| Permission | Purpose | Grant flow |
|---|---|---|
| `AccessibilityService` | Detect app-switch events; read on-screen content to infer task category | Dedicated Settings toggle, app deep-links user to it. Heaviest consent dialog Android offers — must be explicitly, individually granted. |
| `SYSTEM_ALERT_WINDOW` ("display over other apps") | Render the interrupt as a bubble overlay on top of the current app | Separate Settings toggle, deep-linked. |

No `PACKAGE_USAGE_STATS` polling is used for Phase 3 — event-driven `AccessibilityService` callbacks replace it (the base spec's §7 `UsageStatsManager` collector is a separate, Phase 2, non-live feature and is unaffected).

**Both permissions must also be revocable from inside the app itself** (§7), not only via Android Settings.

---

## 3. Trigger & Pipeline

Two-tier pipeline: cheap local pre-filter first, on-device LLM only when a candidate gap survives the pre-filter.

```
AccessibilityService: window-state-change event fires on app switch
        │
        ▼
Pre-filter (all local, cheap, no LLM, no accessibility-tree read yet):
  - is foreground app a system app (settings/launcher/dialer/camera)?        → skip
  - is foreground app on the sensitive-app denylist (banking, password
    managers, health apps)?                                                  → skip, never read
  - has the app been in the foreground ≥ 10s (dwell-time debounce)?          → else wait
  - does a cached local TaskRanking already show a plausible gap for this
    app's tagged taskCategory?                                               → cheap lookup only
        │  candidate gap survives every check above
        ▼
Gemini Nano (on-device, via Android AICore):
  - read the current accessibility-tree snapshot — held in memory only
  - confirm/refine task category from visible screen content
  - compare against the cached local TaskRanking for that category
  - decide: real gap (ranking score delta > threshold)?
        │  screen snapshot is discarded immediately after this call completes —
        │  never written to disk, never logged, never synced
        ▼
  yes → render collapsed bubble (SYSTEM_ALERT_WINDOW)
  no  → nothing shown; only an anonymized counter increments
```

**Dwell-time and denylist/system-app checks happen strictly before any accessibility-tree content is read** — not just before the bubble is shown. A skip at the pre-filter stage means zero screen content is ever accessed for that app switch.

---

## 4. Gap Criteria

A "real gap" is defined as: the current foreground app is not the top-ranked (`isBestForTask`) tool for the on-device-confirmed task category, and the ranking score delta between the current app and the top-ranked alternative exceeds a fixed threshold (exact threshold value is an implementation-time tuning decision, not fixed in this spec).

Ranking data (`TaskRanking`, `isBestForTask`) is produced by the existing Phase 2 `aiRank` Cloud Function (base spec §6) and synced to the device via the normal Firestore sync path — this is the user's own registry data, not screen content, and was never privacy-restricted.

---

## 5. Data Flow & Privacy Boundary

**Never leaves the device, never persisted in any form (including logs/crash reports), for any duration beyond one live check:**
- Accessibility-tree snapshots / raw screen content
- Per-instance task-category inference derived from screen content
- Per-instance gap decisions and their inputs

**Syncs to Firestore normally (unaffected by this feature — existing Phase 1/2 data):**
- `RegistryItem`, `TaskCategory` tags, `TaskRanking` — read-only mirror on-device, feeds the local ranking cache

**Syncs to Firestore as new, explicitly anonymized aggregates only:**
- Daily counters: `bubbleShownCount`, `bubbleExpandedCount`, `bubbleActedOnCount`
- No app names, no task categories, no timestamps paired with content, no per-event records — counters only, feeding the existing Home dashboard / digest, not a new screen

**Stored locally only, never synced:**
- Consent/toggle state (accessibility granted? overlay granted? feature enabled in-app?)
- Sensitive-app denylist — bundled static list shipped in the app binary, updated via app updates only. Deliberately **not** fetched remotely, to avoid a network call in the live path and to avoid the list itself becoming an exfiltration vector.

---

## 6. Error Handling

| Condition | Behavior |
|---|---|
| AICore/Gemini Nano unavailable on this device | Feature disabled entirely at startup (see §8) — not a runtime error path |
| Gemini Nano call fails at runtime (rare, e.g. resource exhaustion) | Treated as "no gap" — bubble never shows, no retry loop, no crash |
| AccessibilityService killed/disabled by OS (e.g. aggressive battery optimization) | Feature goes silently inactive; **the in-app toggle must reflect actual service status, not just user intent** — the user must never be shown "enabled" while the service isn't actually running |
| Overlay permission revoked mid-session | Bubble system stops rendering; no error surfaced beyond toggle state |

---

## 7. Consent & Trust Requirements

- Both permissions require explicit, individually-granted opt-in — no bundling behind a single "enable Phase 3" switch that obscures what's being granted.
- **A dedicated in-app disclosure screen must be shown before either permission request is triggered** — not a deep-link straight to Android Settings. This screen must state, in Google's required accessibility-disclosure form: what the service does (screen-time/task-category awareness), what it reads (on-screen content, ephemerally), and explicitly that nothing is stored or transmitted. This is a Play Store submission requirement, not just good practice — see §11.5.
- **In-app revoke toggle**, separate from Android Settings — disabling it in-app must immediately and verifiably halt accessibility-tree reads, not merely stop bubbles from displaying. (A gap between "no longer shows bubbles" and "no longer reads screens" is a privacy-rule violation even if it's invisible to the user.)
- Periodic, non-naggy passive reminder that the service is active (e.g. a persistent low-priority notification or status indicator), since silently-running accessibility services are the primary trust complaint against this category of app.
- Bubble UI must be visually distinct and unmistakable — cannot resemble a system dialog or a plausible spoofed-login overlay (anti-tapjacking hygiene; overlay permission is a known phishing vector, and this app must not be mistakable for one).
- Bubble content must match the disclosed purpose (§1): usage-awareness fact leads, AI ranking is supporting detail on expand. A bubble whose primary content is an unprompted AI verdict, with no usage-time framing, would misrepresent the disclosed accessibility-use category and put Play Store approval at risk.

---

## 8. Device Support & Fallback

Gemini Nano / Android AICore is only available on select newer devices. This makes Phase 3 a **device-gated feature**:
- At startup, the app checks AICore availability.
- If unavailable, the entire Phase 3 feature (permission prompts, toggles, bubble system) is hidden — not shown as a broken or greyed-out option.
- Phase 1/2 registry app functionality is completely unaffected on unsupported devices.
- No fallback model (cloud-based or alternate on-device runtime) is built for unsupported devices in this spec — out of scope.

---

## 9. Component Boundaries

Five isolated units, chosen so the privacy boundary is structural, not just a matter of discipline:

1. **AccessibilityMonitor** — owns the `AccessibilityService` lifecycle; emits app-switch events (package name + dwell duration). Has no knowledge of ranking or AI.
2. **DenylistFilter** — pure function: package name → allowed/blocked. Bundled static list. No dependencies, no I/O.
3. **LocalRankingCache** — read-only local mirror of synced `RegistryItem`/`TaskRanking`. No write path originates from this feature.
4. **GapEvaluator** — wraps the AICore/Gemini Nano call. Takes ephemeral screen content + cached ranking as input, returns a yes/no decision. Never persists its input; input does not outlive the call.
5. **BubbleRenderer** — owns the `SYSTEM_ALERT_WINDOW` UI. Receives only a final decision + minimal display data (suggested app name). Never receives raw screen content — this is enforced by the interface, not by convention.

`BubbleRenderer` and `LocalRankingCache` are structurally incapable of seeing screen content, since it never crosses their interface boundary.

---

## 10. Testing Strategy

- **Denylist correctness is the highest-priority test surface.** A false negative here (a sensitive app slipping past the filter and getting tree-read) is the worst possible failure mode under the privacy-first rule. Test: known sensitive-app package IDs never reach the accessibility-read code path, verified at the pre-filter layer.
- **No-logging enforcement via static analysis**, not manual review alone — a lint/CI check scanning for any logging call reachable from the accessibility-read code path, including debug builds.
- **AICore-unavailable path** tested on a non-AICore-capable device/emulator profile to confirm graceful feature-hide, not just a try/catch that happens to succeed.
- **Pre-filter logic (denylist, system-app check, dwell timer, cached-gap lookup)** is pure and unit-testable without any device or service involvement: input (package name, dwell duration, cached ranking) → output (candidate-gap yes/no).
- **Consent revocation** — toggling off in-app must be tested to confirm it immediately halts tree reads, not just bubble display.
- **Bubble visual distinctiveness** — not automatable; requires manual design review against real system dialogs and known spoofed-login overlay patterns before any release.

---

## 11. Security Concerns Identified & Resolved

Raised during design review; folded into the sections above rather than left as open risk:

1. **Play Store policy risk** — resolved via the digital-wellbeing reframe in §1/§7/§11.5. Accessibility use is now aligned to an accepted category rather than left as an undeclared risk — see §11.5 for the full justification and remaining review risk.
2. **Sensitive-app exposure** — resolved via the denylist in §3/§5/§9; banking, password-manager, and health apps are excluded from tree-reading entirely, not merely excluded from bubble display.
3. **Accidental leakage via logs/crash reports** — resolved via the static no-logging enforcement in §10; this is treated as an engineering rule, not a design intent.
4. **Overlay bubbles as a phishing/tapjacking vector** — resolved via the visual-distinctiveness requirement in §7; addressed with a manual review gate since it isn't automatable.
5. **Consent must be ongoing, not one-time** — resolved via the in-app revoke toggle and periodic passive reminder in §7.

---

## 11.5. Play Store Compliance (governing requirement, not deferred)

Per the updated governing rule in the header, this feature must be Play-Store-acceptable at every build stage, not brought into compliance after the fact.

**Accepted-category justification.** Google's Accessibility API policy grants a real, pre-recognized justification path for apps whose purpose is digital wellbeing / screen-time management (the same category covering Android's own Digital Wellbeing, and third-party apps like Opal and One Sec). This spec adopts that category as the app's disclosed purpose for the AccessibilityService declaration. The feature is not declared or marketed as an "AI productivity coach" — it is declared as screen-time/task-awareness tooling that happens to use on-device AI to make its awareness more accurate.

**What this requires, concretely:**
- **Play Console declaration** — the Accessibility API declaration form must name the specific accepted use case (screen-time/usage awareness) and describe the exact behavior: detects app switches, reads on-screen content only to classify task category, never stores or transmits any of it.
- **In-app disclosure screen** (§7) shown before permission request — required content, not optional UX polish, per Google's prominent-disclosure requirement for accessibility permission requests.
- **Data Safety form** — must declare that screen content is *accessed* even though nothing is collected or shared; "accessed but not collected" is itself a distinct, declarable category Google supports, and matches this design's actual behavior (§5) precisely, which is a genuine strength of the privacy-first architecture already in place.
- **Bubble content and behavior must match the declared purpose** (§1/§7) — this is not just an approval nicety; a mismatch between declared purpose and actual runtime behavior is grounds for suspension even after initial approval, so this constraint applies for the life of the app, not just at launch.

**Residual risk (not eliminated, only reduced):** Google's review is manual and category fit is not mechanically guaranteed even with correct framing — some apps in this exact category have still faced review friction or rejection on resubmission. This spec reduces the risk from "very likely rejected as designed" to "plausible path to approval, precedented by comparable shipped apps," not to zero. Ongoing compliance monitoring (watching for Play Store policy changes to the Accessibility API category, since Google has tightened this policy multiple times historically) is an operational responsibility beyond this spec's scope, but is flagged here so it isn't lost.

---

## 12. Explicitly Out of Scope (this spec)

- Work handoff (importing document/code state from one app into another) — the original vision included this; it is not designed here and would need its own spec if pursued, since it's a largely per-app, bespoke integration problem (share sheets, file formats, third-party APIs).
- App-capability enrichment pipeline (Play Store scraping, structured capability schema beyond the optional `useCases`/`capabilitySummary`/`sourceUrl` fields already added to `registryItems` in the base spec).
- Fallback experience for non-AICore devices.
- Exact gap-threshold tuning value, exact dwell-time value beyond the ~10s starting point — left as implementation-time tuning decisions.
- Exact Play Console submission copy/screenshots and the actual review submission process — §11.5 defines the required compliance shape; drafting the literal submission content is implementation-stage work.
