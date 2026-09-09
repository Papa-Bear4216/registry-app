# SecondGuess Monorepo (`registry-app`)

Central monorepo for the SecondGuess platform, backing the React Native/Expo UI, native Android collectors, and Firebase Cloud Functions (`registry-app-prod-7a07c`).

---

## 1. Project Architecture

| Component | Location | Role |
|---|---|---|
| **SecondGuess App** | Repo root (`App.tsx`, `package.json`) | Expo SDK 57 / React Native 0.86 client UI |
| **Cloud Functions** | `functions/` | Node/TypeScript serverless backend |
| **native-usage-collector** | `native-usage-collector/` | Android service (`com.registry.usagecollector`) collecting background usage stats |
| **contextual-coach** | `contextual-coach/` | Android Accessibility coach (`com.registry.coach`) mirroring Gut-Instinct |

---

## 2. Cross-Project Data Flow

1. `native-usage-collector` → HTTP POST to `/ingest` (Cloud Function)
2. Cloud Functions (`aiClassify`, `aiRank`) process usage and write to Firestore collection `registryItems`
3. Firestore candidates read by:
   - Root Expo App (for user registry UI)
   - `exportCandidates` endpoint (`/exportCandidates`), which imports `@registry/pattern-analyzer` to apply decay and export candidate pools.
   - `contextual-coach` (for on-device gap nudging)

---

## 3. Key Files

- `functions/src/index.ts`: Entrypoint for Cloud Functions (`onRequest({ cors: true }, ...)`).
- `functions/src/export/exportCandidates.ts`: Candidate pool export handler with capacity clamping.
- `functions/src/ingest/ingest.ts`: Ingestion handler for mobile usage telemetry.
- `firestore.rules`: Security rules enforcing UID ownership of registryItems.
- `App.tsx`: Expo application entrypoint.

---

## WORK-IN-PROGRESS HANDOFF & STATUS (2026-09-08)

Status: **Build verification and prioritized code remediations COMPLETE.**

### 1. Build & Compilation Verification (Verified Clean)
- `registry-app/contextual-coach`: `compileDebugKotlin`, `assembleDebug` (44 tasks, APK generated), and `testDebugUnitTest` (35 tasks) **ALL PASSED** with 0 errors.
- `registry-app/native-usage-collector`: `compileDebugKotlin` (20 tasks) and `testDebugUnitTest` (35 tasks) **ALL PASSED** with 0 errors.
- `Gut-Instinct/contextual-coach`: `compileDebugKotlin` **PASSED** with 0 errors.
- Environment note: Runs against Android Studio JDK 21 (`C:\Program Files\Android\Android Studio\jbr`) with `--no-configuration-cache`.

### 2. Prioritized Remediations Applied
1. **Privacy Denylist Harmonized** (`Gut-Instinct/.../PatternEngine.kt`): Added `medical` and `health` regex patterns to match `ContextGuard.kt`.
2. **Main-Thread Jank Eliminated** (`Gut-Instinct/.../AccessibilityMonitor.kt`): Moved 200-event history serialization to a background coroutine on `Dispatchers.IO`.
3. **HTTP Method Guard Added** (`registry-app/functions/src/export/exportCandidates.ts`): Enforced `req.method === 'GET'`, returning 405 for all other HTTP methods.

### 3. Architecture & Consolidation Roadmap
- **Current Strategy (Option A):** Dual-app model maintained.
  - `registry-app`: Canonical production monorepo (Expo RN app + Cloud Functions + Hilt-based bubble overlay coach + background collector).
  - `Gut-Instinct`: Dedicated standalone workflow discovery & Compose UI engine (`PatternEngine` + `WorkflowExecutor` + Gemini Nano shortcut generator). Both sync sanitized suggestions to Firestore `registry-app-prod-7a07c`.
- **Deferred Consolidation (Option B):**
  - When ready to merge `Gut-Instinct`'s Compose UI and `PatternEngine` into `registry-app`, create a dedicated worktree:
    `git worktree add ..\registry-app-coach-merge -b feature/merge-gut-instinct`
