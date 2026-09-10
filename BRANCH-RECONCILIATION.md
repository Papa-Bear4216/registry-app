# Branch Reconciliation Report — registry-app

**Generated:** 2026-09-09  
**Repository:** `C:\Users\micha\projects\registry-app`  
**Current HEAD:** `6ba3aba` (local `master`, ahead of `origin/master` (`7304854`) by 1 commit)  
**Remote state:** `git fetch origin --prune` completed  

---

## Executive Summary

All 5 remote `fix/*` branches investigated have **already been merged** into `origin/master`.
One branch (`origin/fix/android-runtime-lifecycle`) was deleted on the remote and was pruned during fetch; its commit (`fb6d2cb`) landed via PR #9 (`bbb6c3c`). The remaining 4 remote branches (`origin/fix/cloud-functions-correctness`, `origin/fix/contextual-coach-di`, `origin/fix/data-model-consistency`, `origin/fix/native-collector-client`) are fully merged ancestors of `origin/master` with 0 unmerged commits.

None of the 5 branches fixes the 3 open ORION §2 findings:
1. **AICore `DOWNLOADING` bug** (`AiCoreAvailability.kt:36-40`) — **OPEN** (branch `fix/android-runtime-lifecycle` added `DOWNLOADABLE`, but `DOWNLOADING` still falls into `else -> UNAVAILABLE`).
2. **`POST_NOTIFICATIONS` missing** (`contextual-coach/app/src/main/AndroidManifest.xml`) — **OPEN** (not touched in any branch).
3. **`AddItemScreen.tsx` missing `keepClockExpiresAt`** on manual create — **OPEN** (not touched in any branch).

---

## Branch Details

### 1. `origin/fix/android-runtime-lifecycle`
- **Status:** **MERGED & PRUNED** (deleted on `origin`, pruned locally during `git fetch origin --prune`).
- **Branch Tip:** `fb6d2cb` ("fix(android): resolve runtime posture, lifecycle notification, and scheduler suppression").
- **Landed Commit on Master:** `bbb6c3c` ("fix(android): resolve runtime posture, lifecycle notification, and scheduler suppression (#9)"). `git diff fb6d2cb bbb6c3c` is identical (0 diff).
- **Changes:**
  - Moves coach active notification ownership to `AccessibilityMonitor` lifecycle.
  - Adds `DOWNLOADABLE` handling in `AiCoreAvailability.kt` with guided Play Store update link.
  - Cancels and suppresses `UsageCollector` periodic sync when auth or usage access is revoked (`CollectorScheduler.kt`, `UsageCollectorWorker.kt`).
- **ORION Cross-Reference:**
  - Addresses `CollectorScheduler` worker cancellation (`CONFIRMED FIXED` in `orion-verification.md` §2).
  - Partially touched `AiCoreAvailability.kt` (added `DOWNLOADABLE`), but did **not** add `DOWNLOADING` (which still falls through to `UNAVAILABLE`).
  - Did **not** add `POST_NOTIFICATIONS` to `contextual-coach/app/src/main/AndroidManifest.xml`.
  - Did **not** touch `AddItemScreen.tsx`.
- **Recommended Action:** **NO ACTION NEEDED / ALREADY MERGED**. Remote branch already deleted.

---

### 2. `origin/fix/cloud-functions-correctness`
- **Status:** **MERGED / STALE**.
- **Branch Tip:** `74b4dab` ("fix: seven Cloud Functions correctness bugs from ultra-review").
- **Merge-base Check:** `git merge-base --is-ancestor origin/fix/cloud-functions-correctness origin/master` returned `0` (`ALREADY MERGED`).
- **Landed Commit on Master:** Landed via merge commit `4c77168` ("Merge fix/native-collector-client into master (includes fix/cloud-functions-correctness)").
- **Changes:** Fixes seven Cloud Functions correctness bugs (Firestore trigger handling, batch limits, query constraints).
- **ORION Cross-Reference:** Does not address any of the 3 open findings.
- **Recommended Action:** **DELETE REMOTE BRANCH** (`git push origin --delete fix/cloud-functions-correctness` pending user approval).

---

### 3. `origin/fix/contextual-coach-di`
- **Status:** **MERGED / STALE**.
- **Branch Tip:** `1095714` ("fix: repair contextual-coach Hilt DI graph and dependent bugs").
- **Merge-base Check:** `git merge-base --is-ancestor origin/fix/contextual-coach-di origin/master` returned `0` (`ALREADY MERGED`).
- **Landed Commit on Master:** Ancestor of `4c77168` and `origin/master`.
- **Changes:** Repaired contextual-coach Hilt dependency injection graph and associated component bugs.
- **ORION Cross-Reference:** Does not address any of the 3 open findings.
- **Recommended Action:** **DELETE REMOTE BRANCH** (`git push origin --delete fix/contextual-coach-di` pending user approval).

---

### 4. `origin/fix/data-model-consistency`
- **Status:** **MERGED / STALE**.
- **Branch Tip:** `bd7c80e` ("fix: update lifecycle timestamps on ingest (#5) and align TaskCategory enums (#7)").
- **Merge-base Check:** `git merge-base --is-ancestor origin/fix/data-model-consistency origin/master` returned `0` (`ALREADY MERGED`).
- **Landed Commit on Master:** Directly part of `master` history as `bd7c80e`.
- **Changes:** Updates lifecycle timestamps on ingest (#5) and aligns `TaskCategory` enums (#7).
- **ORION Cross-Reference:**
  - Addressed `defaultAutomations.ts` enum mismatch (`CONFIRMED FIXED` in `orion-verification.md` §2).
  - Did **not** fix `AddItemScreen.tsx` missing `keepClockExpiresAt`.
  - Did **not** touch `AiCoreAvailability.kt` or `POST_NOTIFICATIONS`.
- **Recommended Action:** **DELETE REMOTE BRANCH** (`git push origin --delete fix/data-model-consistency` pending user approval).

---

### 5. `origin/fix/native-collector-client`
- **Status:** **MERGED / STALE**.
- **Branch Tip:** `69838c1` ("fix: four native-collector/client bugs plus two pre-existing build blockers").
- **Merge-base Check:** `git merge-base --is-ancestor origin/fix/native-collector-client origin/master` returned `0` (`ALREADY MERGED`).
- **Landed Commit on Master:** Landed via merge commit `4c77168` ("Merge fix/native-collector-client into master (includes fix/cloud-functions-correctness)").
- **Changes:** Fixes four native-collector/client bugs and resolves build blockers.
- **ORION Cross-Reference:** Does not address any of the 3 open findings.
- **Recommended Action:** **DELETE REMOTE BRANCH** (`git push origin --delete fix/native-collector-client` pending user approval).

---

## Conclusion & Recommendations

| Branch | State | In Master? | ORION Finding Addressed | Recommended Action |
|---|---|---|---|---|
| `fix/android-runtime-lifecycle` | Merged & Pruned | Yes (`bbb6c3c`) | `CollectorScheduler` cancellation (FIXED); AICore `DOWNLOADABLE` (partial) | Stale ref already pruned on origin. |
| `fix/cloud-functions-correctness` | Merged | Yes (`4c77168`) | None of 3 open findings | Safe to delete remote branch. |
| `fix/contextual-coach-di` | Merged | Yes (`4c77168`) | None of 3 open findings | Safe to delete remote branch. |
| `fix/data-model-consistency` | Merged | Yes (`bd7c80e`) | `defaultAutomations.ts` enum mismatch (FIXED) | Safe to delete remote branch. |
| `fix/native-collector-client` | Merged | Yes (`4c77168`) | None of 3 open findings | Safe to delete remote branch. |

Since no live unmerged branches remain, no rebasing onto local `master` (`6ba3aba`) is required. All 3 identified ORION §2 gaps (`AiCoreAvailability.kt` `DOWNLOADING` handling, `AndroidManifest.xml` `POST_NOTIFICATIONS`, and `AddItemScreen.tsx` `keepClockExpiresAt`) remain open for direct resolution.
