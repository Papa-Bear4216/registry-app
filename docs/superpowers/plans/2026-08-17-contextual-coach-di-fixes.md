# Contextual-Coach Hilt/DI Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the build-breaking Hilt dependency injection gap in `contextual-coach` (zero `@Module`/`@Binds` for three injected interfaces), wire up the ranking cache's dormant listener, fix a silent-data-loss race in daily counter sync, and fix a name-resolution race between two Firestore listeners.

**Architecture:** Add one Hilt module (`DataModule`) providing `FirebaseFirestore`/`FirebaseAuth` and binding `LocalRankingCache`→`FirestoreRankingCache`, `GapEvaluator`→`GeminiNanoGapEvaluator`, `BubbleRenderer`→`BubbleOverlayService`-shaped binding. `BubbleRenderer` is implemented by an Android `Service` (`BubbleOverlayService`), which cannot be constructor-injected the normal way — it's bound as an interface satisfied by a separate always-on singleton wrapper is unnecessary complexity; instead this plan corrects the actual mismatch: `AccessibilityMonitor` should not inject `BubbleRenderer` as a Hilt-provided singleton, since the real implementation is a `Service` instance, not a value Hilt constructs. This plan documents and resolves that properly in Task 1. `startListening()` gets called from `AccessibilityMonitor.onServiceConnected()`, the first lifecycle point where the cache is actually used, guarded by `stopListening()` in `onDestroy()`. `AnonymousCounters.syncDailyAggregates()` awaits its Firestore write via `kotlinx-coroutines-play-services`. `FirestoreRankingCache`'s two listeners are merged into a single re-resolution step so ranking name lookups never race item loads.

**Tech Stack:** Kotlin, Hilt (dagger.hilt), Firebase Firestore/Auth Android SDK, kotlinx-coroutines-play-services, AccessibilityService/Service Android components.

**Spec:** Ultra code-review findings #1, #5, #7, #11 (registry-app full-repo review, 2026-08-17). No separate spec doc exists; this plan's "Global Constraints" section below captures the invariants the original code review flagged as must-preserve.

## Global Constraints

- Do not change `BubbleRenderer`, `GapEvaluator`, or `LocalRankingCache` interface signatures — they are structural privacy boundaries (see `GapEvaluator.kt` and `BubbleRenderer.kt` doc comments: screen content must never cross into `BubbleRenderer`).
- `contextual-coach/app/build.gradle.kts` already applies the `hilt` plugin and `ksp` — do not add a second DI framework.
- Firestore/Auth singletons must be constructed via `FirebaseFirestore.getInstance()` / `FirebaseAuth.getInstance()` (Android Firebase SDK convention already used implicitly by the `@Inject constructor(private val db: FirebaseFirestore, ...)` pattern in `FirestoreRankingCache` and `AnonymousCounters`).
- Do not add logging of screen content or accessibility-tree data anywhere (enforced by the module's own lint rule, `NoLoggingInPrivacyZoneDetector`).

---

### Task 1: Add Hilt module for Firebase providers and interface bindings

**Files:**
- Create: `contextual-coach/app/src/main/kotlin/com/registry/coach/di/FirebaseModule.kt`
- Create: `contextual-coach/app/src/main/kotlin/com/registry/coach/di/DataModule.kt`
- Modify: `contextual-coach/app/src/main/kotlin/com/registry/coach/monitor/AccessibilityMonitor.kt:11,46`
- Modify: `contextual-coach/app/src/main/kotlin/com/registry/coach/ui/BubbleOverlayService.kt` (no change needed to the file itself — confirmed in step 1)
- Test: `contextual-coach/app/src/test/kotlin/com/registry/coach/di/DataModuleTest.kt`

**Interfaces:**
- Consumes: `LocalRankingCache` (existing interface, `data/LocalRankingCache.kt`), `FirestoreRankingCache` (existing `@Inject constructor(db: FirebaseFirestore, auth: FirebaseAuth)`, implements `LocalRankingCache`), `GapEvaluator` (existing interface, `evaluator/GapEvaluator.kt`), `GeminiNanoGapEvaluator` (existing `@Inject constructor()`, implements `GapEvaluator`).
- Produces: `FirebaseModule` supplies `FirebaseFirestore` and `FirebaseAuth` as Hilt-injectable singletons app-wide. `DataModule` binds `LocalRankingCache` → `FirestoreRankingCache` and `GapEvaluator` → `GeminiNanoGapEvaluator`, both `@Singleton`, both `@InstallIn(SingletonComponent::class)`.

**Context — why `BubbleRenderer` is NOT bound here:**

`BubbleOverlayService` (in `ui/BubbleOverlayService.kt`) is an Android `Service` that implements `BubbleRenderer`. Hilt can constructor-inject a `Service`'s own fields (it's already `@AndroidEntryPoint`), but a `Service` instance itself cannot be provided as a plain Hilt binding for another class to `@Inject` — Android owns the `Service` lifecycle, not Hilt's object graph. `AccessibilityMonitor.kt:46` currently does `@Inject lateinit var bubbleRenderer: BubbleRenderer`, which is unsatisfiable no matter what `@Binds` you write, because there is no constructible, non-Android-lifecycle-owned class implementing `BubbleRenderer` to bind to.

The correct fix is in Task 2: `AccessibilityMonitor` must *bind* to `BubbleOverlayService` via `bindService()`/an Android `Messenger` or simpler, via `startService()` + `Intent` extras, not via Hilt field injection. Task 1 only fixes the two bindings that Hilt *can* legitimately satisfy (`LocalRankingCache`, `GapEvaluator`). Task 2 removes the illegitimate `BubbleRenderer` injection and replaces it with an `Intent`-based call into `BubbleOverlayService`.

- [ ] **Step 1: Confirm `BubbleOverlayService` is a `Service`, not a plain class**

Read `contextual-coach/app/src/main/kotlin/com/registry/coach/ui/BubbleOverlayService.kt:37`: `class BubbleOverlayService : Service(), BubbleRenderer`. Confirmed — this cannot be a Hilt-constructed singleton bound to the `BubbleRenderer` interface for injection into `AccessibilityMonitor`. No file change in this step; this just documents the constraint the next steps rely on.

- [ ] **Step 2: Write `FirebaseModule.kt` providing `FirebaseFirestore` and `FirebaseAuth`**

```kotlin
package com.registry.coach.di

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object FirebaseModule {

    @Provides
    @Singleton
    fun provideFirestore(): FirebaseFirestore = FirebaseFirestore.getInstance()

    @Provides
    @Singleton
    fun provideFirebaseAuth(): FirebaseAuth = FirebaseAuth.getInstance()
}
```

- [ ] **Step 3: Write `DataModule.kt` binding `LocalRankingCache` and `GapEvaluator`**

```kotlin
package com.registry.coach.di

import com.registry.coach.data.FirestoreRankingCache
import com.registry.coach.data.LocalRankingCache
import com.registry.coach.evaluator.GapEvaluator
import com.registry.coach.evaluator.GeminiNanoGapEvaluator
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class DataModule {

    @Binds
    @Singleton
    abstract fun bindLocalRankingCache(impl: FirestoreRankingCache): LocalRankingCache

    @Binds
    @Singleton
    abstract fun bindGapEvaluator(impl: GeminiNanoGapEvaluator): GapEvaluator
}
```

- [ ] **Step 4: Remove the `BubbleRenderer` field injection from `AccessibilityMonitor.kt` (unsatisfiable — see Task 2)**

In `contextual-coach/app/src/main/kotlin/com/registry/coach/monitor/AccessibilityMonitor.kt`, remove line 46 (`@Inject lateinit var bubbleRenderer: BubbleRenderer`) and the now-unused import at line 11 (`import com.registry.coach.ui.BubbleRenderer`). Task 2 replaces the removed field with an `Intent`-based call. Leaving the field in place at this step would still fail to compile since no binding exists or ever will for a `Service`-backed interface — removing it now keeps Task 1 independently buildable and testable before Task 2 lands.

- [ ] **Step 5: Build the module to confirm Hilt can now resolve `LocalRankingCache` and `GapEvaluator`**

Run: `cd contextual-coach && ./gradlew :app:assembleDebug`
Expected: BUILD SUCCESSFUL (or, if `BubbleRenderer` field removal in Step 4 was skipped, the build fails specifically on the missing `BubbleRenderer` binding — confirming the fix in Steps 2-3 already resolved the other two). Since Step 4 already removes the `BubbleRenderer` field, this build should fully succeed at this point, modulo the `AnonymousCounters` `Inject` on `db`/`auth` already resolving now that `FirebaseModule` exists.

- [ ] **Step 6: Write a unit test asserting Hilt module structure (bindings resolve to the right types)**

```kotlin
package com.registry.coach.di

import com.registry.coach.data.FirestoreRankingCache
import com.registry.coach.evaluator.GeminiNanoGapEvaluator
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import io.mockk.mockk
import org.junit.Assert.assertTrue
import org.junit.Test

class DataModuleTest {

    @Test
    fun `FirestoreRankingCache implements LocalRankingCache`() {
        val db = mockk<FirebaseFirestore>(relaxed = true)
        val auth = mockk<FirebaseAuth>(relaxed = true)
        val cache = FirestoreRankingCache(db, auth)
        assertTrue(cache is com.registry.coach.data.LocalRankingCache)
    }

    @Test
    fun `GeminiNanoGapEvaluator implements GapEvaluator`() {
        val evaluator = GeminiNanoGapEvaluator()
        assertTrue(evaluator is com.registry.coach.evaluator.GapEvaluator)
    }
}
```

This is a lightweight compile-time-shape test (not a Hilt-graph integration test — those require Robolectric/instrumented setup out of scope here) confirming the classes bound in `DataModule` actually satisfy the interfaces they're bound to.

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd contextual-coach && ./gradlew :app:testDebugUnitTest --tests "com.registry.coach.di.DataModuleTest"`
Expected: PASS (2 tests)

- [ ] **Step 8: Commit**

```bash
git add contextual-coach/app/src/main/kotlin/com/registry/coach/di/FirebaseModule.kt contextual-coach/app/src/main/kotlin/com/registry/coach/di/DataModule.kt contextual-coach/app/src/main/kotlin/com/registry/coach/monitor/AccessibilityMonitor.kt contextual-coach/app/src/test/kotlin/com/registry/coach/di/DataModuleTest.kt
git commit -m "fix: add missing Hilt bindings for LocalRankingCache and GapEvaluator"
```

---

### Task 2: Replace unsatisfiable `BubbleRenderer` injection with `Intent`-based service call

**Files:**
- Modify: `contextual-coach/app/src/main/kotlin/com/registry/coach/monitor/AccessibilityMonitor.kt`
- Modify: `contextual-coach/app/src/main/kotlin/com/registry/coach/ui/BubbleOverlayService.kt`
- Test: `contextual-coach/app/src/test/kotlin/com/registry/coach/monitor/AccessibilityMonitorBubbleDispatchTest.kt`

**Interfaces:**
- Consumes: `GapResult.RealGap` (existing, `evaluator/GapEvaluator.kt:35-39` — fields `suggestedAppName: String`, `taskCategory: TaskCategory`, `usageFactText: String`, all serializable primitives/enum).
- Produces: `AccessibilityMonitor` now calls a new package-private function `dispatchBubble(context: Context, gap: GapResult.RealGap)` that starts `BubbleOverlayService` via `Intent` extras instead of a Hilt-injected `BubbleRenderer` field. `BubbleOverlayService.onStartCommand` is extended to read those extras and call its own (already-implemented) `showCollapsed`.

- [ ] **Step 1: Add `Intent` extra constants and a companion factory to `BubbleOverlayService`**

In `contextual-coach/app/src/main/kotlin/com/registry/coach/ui/BubbleOverlayService.kt`, add imports and a companion object. Insert after line 19 (`import javax.inject.Inject`):

```kotlin
import com.registry.coach.data.TaskCategory
```

Insert after line 37 (`class BubbleOverlayService : Service(), BubbleRenderer {`), i.e. as the first member of the class body:

```kotlin
    companion object {
        private const val EXTRA_SUGGESTED_APP_NAME = "extra_suggested_app_name"
        private const val EXTRA_TASK_CATEGORY = "extra_task_category"
        private const val EXTRA_USAGE_FACT_TEXT = "extra_usage_fact_text"

        /** Build the [Intent] AccessibilityMonitor uses to request a collapsed bubble. */
        fun showCollapsedIntent(context: android.content.Context, gap: GapResult.RealGap): Intent {
            return Intent(context, BubbleOverlayService::class.java).apply {
                putExtra(EXTRA_SUGGESTED_APP_NAME, gap.suggestedAppName)
                putExtra(EXTRA_TASK_CATEGORY, gap.taskCategory.name)
                putExtra(EXTRA_USAGE_FACT_TEXT, gap.usageFactText)
            }
        }

        internal fun gapFromIntent(intent: Intent?): GapResult.RealGap? {
            intent ?: return null
            val appName = intent.getStringExtra(EXTRA_SUGGESTED_APP_NAME) ?: return null
            val categoryName = intent.getStringExtra(EXTRA_TASK_CATEGORY) ?: return null
            val category = TaskCategory.entries.find { it.name == categoryName } ?: return null
            val factText = intent.getStringExtra(EXTRA_USAGE_FACT_TEXT) ?: return null
            return GapResult.RealGap(appName, category, factText)
        }
    }
```

Check `TaskCategory`'s actual declaration shape first — read `contextual-coach/app/src/main/kotlin/com/registry/coach/data/TaskCategory.kt` before writing this step's final code; if `TaskCategory` is a `enum class` the `.entries` call above is correct for Kotlin 1.9+ (already implied by `fromWire` usage in `FirestoreRankingCache.kt:45-47`). If it exposes a different lookup helper (e.g. `TaskCategory.fromWire`), use that instead of manual `.entries.find`.

- [ ] **Step 2: Override `onStartCommand` in `BubbleOverlayService` to dispatch the parsed gap to the existing `showCollapsed`**

Insert after the `onCreate()` override (after line 51, before `override fun showCollapsed(...)` at line 53):

```kotlin
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val gap = Companion.gapFromIntent(intent)
        if (gap != null) {
            showCollapsed(gap)
        }
        return START_NOT_STICKY
    }
```

- [ ] **Step 3: Replace the removed field injection in `AccessibilityMonitor` with an `Intent`-dispatch call**

In `contextual-coach/app/src/main/kotlin/com/registry/coach/monitor/AccessibilityMonitor.kt`, add the import (restore, but pointing at the concrete service, not the interface):

```kotlin
import com.registry.coach.ui.BubbleOverlayService
```

Replace the `is GapResult.RealGap ->` branch (originally lines 106-109):

```kotlin
                is GapResult.RealGap -> {
                    startService(BubbleOverlayService.showCollapsedIntent(this, result))
                    counters.incrementShown()
                }
```

- [ ] **Step 4: Build to confirm no remaining Hilt binding errors**

Run: `cd contextual-coach && ./gradlew :app:assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Write a unit test for the `Intent` round-trip (`showCollapsedIntent` → `gapFromIntent`)**

```kotlin
package com.registry.coach.monitor

import android.content.Intent
import com.registry.coach.data.TaskCategory
import com.registry.coach.evaluator.GapResult
import com.registry.coach.ui.BubbleOverlayService
import io.mockk.every
import io.mockk.mockk
import org.junit.Assert.assertEquals
import org.junit.Test

class AccessibilityMonitorBubbleDispatchTest {

    @Test
    fun `gap round-trips through intent extras`() {
        val context = mockk<android.content.Context>(relaxed = true)
        every { context.packageName } returns "com.registry.coach"

        val gap = GapResult.RealGap(
            suggestedAppName = "Todoist",
            taskCategory = TaskCategory.entries.first(),
            usageFactText = "45m in productivity apps today",
        )
        val intent = BubbleOverlayService.showCollapsedIntent(context, gap)
        val parsed = BubbleOverlayService.gapFromIntent(intent)

        assertEquals(gap, parsed)
    }

    @Test
    fun `null intent produces no gap`() {
        assertEquals(null, BubbleOverlayService.gapFromIntent(null))
    }
}
```

Adjust `TaskCategory.entries.first()` to whatever the real enum's first constant is if `entries` doesn't exist on the actual declared type — confirm during Step 1 of this task.

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd contextual-coach && ./gradlew :app:testDebugUnitTest --tests "com.registry.coach.monitor.AccessibilityMonitorBubbleDispatchTest"`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add contextual-coach/app/src/main/kotlin/com/registry/coach/monitor/AccessibilityMonitor.kt contextual-coach/app/src/main/kotlin/com/registry/coach/ui/BubbleOverlayService.kt contextual-coach/app/src/test/kotlin/com/registry/coach/monitor/AccessibilityMonitorBubbleDispatchTest.kt
git commit -m "fix: dispatch bubble via Intent instead of unsatisfiable Hilt BubbleRenderer injection"
```

---

### Task 3: Call `FirestoreRankingCache.startListening()` from the monitor lifecycle

**Files:**
- Modify: `contextual-coach/app/src/main/kotlin/com/registry/coach/monitor/AccessibilityMonitor.kt`
- Modify: `contextual-coach/app/src/main/kotlin/com/registry/coach/data/FirestoreRankingCache.kt` (widen visibility only if needed — confirmed already `fun` not `private fun`, no change needed)
- Modify: `contextual-coach/app/src/main/kotlin/com/registry/coach/data/LocalRankingCache.kt`
- Test: `contextual-coach/app/src/test/kotlin/com/registry/coach/monitor/AccessibilityMonitorLifecycleTest.kt`

**Interfaces:**
- Consumes: `FirestoreRankingCache.startListening()` / `.stopListening()` (existing, `data/FirestoreRankingCache.kt:36,87` — currently public but not part of the `LocalRankingCache` interface).
- Produces: `LocalRankingCache` interface gains two new lifecycle methods (`startListening()`, `stopListening()`) so `AccessibilityMonitor` can call them without depending on the concrete `FirestoreRankingCache` type (preserves DI — `AccessibilityMonitor` only holds a `LocalRankingCache` reference).

- [ ] **Step 1: Add `startListening()`/`stopListening()` to the `LocalRankingCache` interface**

In `contextual-coach/app/src/main/kotlin/com/registry/coach/data/LocalRankingCache.kt`, add to the interface body (after line 22, before the closing `}` at line 23):

```kotlin

    /** Begin syncing from Firestore. Must be called once, after auth is available. */
    fun startListening()

    /** Stop syncing and release listener resources. */
    fun stopListening()
```

- [ ] **Step 2: Mark `FirestoreRankingCache.startListening`/`stopListening` as `override`**

In `contextual-coach/app/src/main/kotlin/com/registry/coach/data/FirestoreRankingCache.kt`, change line 36 from:

```kotlin
    fun startListening() {
```

to:

```kotlin
    override fun startListening() {
```

And change line 87 from:

```kotlin
    fun stopListening() {
```

to:

```kotlin
    override fun stopListening() {
```

- [ ] **Step 3: Call `startListening()`/`stopListening()` from `AccessibilityMonitor`'s lifecycle**

In `contextual-coach/app/src/main/kotlin/com/registry/coach/monitor/AccessibilityMonitor.kt`, modify `onServiceConnected` (originally lines 54-57):

```kotlin
    override fun onServiceConnected() {
        super.onServiceConnected()
        systemPackages = loadSystemPackages()
        rankingCache.startListening()
    }
```

And modify `onDestroy` (originally lines 122-125):

```kotlin
    override fun onDestroy() {
        super.onDestroy()
        dwellTimer.cancel()
        rankingCache.stopListening()
    }
```

- [ ] **Step 4: Build to confirm the interface change compiles across both the interface and its sole implementation**

Run: `cd contextual-coach && ./gradlew :app:assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Write a unit test asserting `onServiceConnected` starts listening and `onDestroy` stops it**

This test uses a fake `LocalRankingCache` rather than mocking `AccessibilityService` internals (which require Robolectric/instrumented tests out of scope here) — it validates the lifecycle call sites in isolation by extracting them into a small testable seam. Since `AccessibilityMonitor` extends the Android-framework `AccessibilityService`, direct instantiation in a JVM unit test isn't possible without Robolectric; write this as a Robolectric test guarded by the module's existing test setup (confirm `contextual-coach/app/build.gradle.kts` testImplementation block — currently only `junit`, `mockk`, `kotlinx-coroutines-test`, no Robolectric). Since Robolectric isn't already a dependency, add it minimally for this one test:

First, add to `contextual-coach/app/build.gradle.kts` dependencies block (after line 85, `testImplementation(libs.kotlinx.coroutines.test)`):

```kotlin
    testImplementation("org.robolectric:robolectric:4.13")
    testImplementation(libs.junit) // already present, no duplicate needed if already declared
```

(Only add the Robolectric line — `junit` is already present at line 83.)

```kotlin
package com.registry.coach.monitor

import com.registry.coach.data.CachedTaskRanking
import com.registry.coach.data.LocalRankingCache
import com.registry.coach.data.TaskCategory
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.Test
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.junit.runner.RunWith

@RunWith(RobolectricTestRunner::class)
class AccessibilityMonitorLifecycleTest {

    @Test
    fun `onServiceConnected starts ranking cache listener`() {
        val fakeCache = mockk<LocalRankingCache>(relaxed = true)
        val monitor = Robolectric.setupService(AccessibilityMonitor::class.java)
        monitor.rankingCache = fakeCache

        monitor.callOnServiceConnected()

        verify(exactly = 1) { fakeCache.startListening() }
    }

    @Test
    fun `onDestroy stops ranking cache listener`() {
        val fakeCache = mockk<LocalRankingCache>(relaxed = true)
        val monitor = Robolectric.setupService(AccessibilityMonitor::class.java)
        monitor.rankingCache = fakeCache

        monitor.onDestroy()

        verify(exactly = 1) { fakeCache.stopListening() }
    }
}
```

Note: `Robolectric.setupService` calls `onCreate()` but not the AccessibilityService-specific `onServiceConnected()` automatically — `callOnServiceConnected()` is a Robolectric shadow helper for this; if the installed Robolectric version's `ServiceController` doesn't expose it for `AccessibilityService` directly, call `monitor.onServiceConnected()` directly instead (it's a public override) since this test only needs the method body to execute, not a full framework-accurate lifecycle simulation.

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd contextual-coach && ./gradlew :app:testDebugUnitTest --tests "com.registry.coach.monitor.AccessibilityMonitorLifecycleTest"`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add contextual-coach/app/src/main/kotlin/com/registry/coach/data/LocalRankingCache.kt contextual-coach/app/src/main/kotlin/com/registry/coach/data/FirestoreRankingCache.kt contextual-coach/app/src/main/kotlin/com/registry/coach/monitor/AccessibilityMonitor.kt contextual-coach/app/build.gradle.kts contextual-coach/app/src/test/kotlin/com/registry/coach/monitor/AccessibilityMonitorLifecycleTest.kt
git commit -m "fix: call startListening/stopListening so the ranking cache actually populates"
```

---

### Task 4: Await the Firestore write in `AnonymousCounters.syncDailyAggregates()`

**Files:**
- Modify: `contextual-coach/app/src/main/kotlin/com/registry/coach/monitor/AnonymousCounters.kt`
- Modify: `contextual-coach/app/build.gradle.kts`
- Test: `contextual-coach/app/src/test/kotlin/com/registry/coach/monitor/AnonymousCountersTest.kt`

**Interfaces:**
- Consumes: `kotlinx-coroutines-play-services`'s `Task<T>.await()` extension (new dependency).
- Produces: `syncDailyAggregates()` no longer resets counters unless the write actually committed; on write failure the counters are preserved so the next sync attempt retries with the accumulated (not lost) totals.

- [ ] **Step 1: Add the `kotlinx-coroutines-play-services` dependency**

In `contextual-coach/app/build.gradle.kts`, add to the dependencies block, in the Coroutines section (after line 73, `implementation(libs.kotlinx.coroutines.android)`):

```kotlin
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.8.1")
```

(Version pinned to match the `kotlinx.coroutines.android` version already resolved via the version catalog — confirm the catalog's coroutines version in `gradle/libs.versions.toml` before finalizing; use the same version number for consistency. `native-usage-collector`'s `UsageCollectorWorker.kt:19` already imports `kotlinx.coroutines.tasks.await`, confirming this library is already used elsewhere in the monorepo — check that module's `build.gradle.kts` for the exact version string it pins and reuse it here rather than guessing 1.8.1.)

- [ ] **Step 2: Await the write and only reset counters on success**

In `contextual-coach/app/src/main/kotlin/com/registry/coach/monitor/AnonymousCounters.kt`, add the import (after line 6, `import javax.inject.Singleton`):

```kotlin
import kotlinx.coroutines.tasks.await
```

Replace `syncDailyAggregates()` (originally lines 54-73):

```kotlin
    suspend fun syncDailyAggregates() {
        val uid = auth.currentUser?.uid ?: return
        val today = java.time.LocalDate.now().toString()

        db.collection("coachDailyCounters").add(
            mapOf(
                "bubbleShownCount" to shownToday,
                "bubbleExpandedCount" to expandedToday,
                "bubbleActedOnCount" to actedOnToday,
                "date" to today,
                "createdBy" to uid,
            )
        ).await()

        // Reset only after the write is confirmed committed — an unawaited
        // reset here would silently drop the day's counts if the write
        // failed or was still in flight (spec section 5: these counters
        // are the ONLY record kept, so losing them is unrecoverable).
        shownToday = 0
        expandedToday = 0
        actedOnToday = 0
        suppressedToday = 0
    }
```

- [ ] **Step 3: Build to confirm the new dependency resolves and `.await()` compiles**

Run: `cd contextual-coach && ./gradlew :app:assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Write a unit test confirming counters are NOT reset when the write fails**

```kotlin
package com.registry.coach.monitor

import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.firestore.CollectionReference
import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.FirebaseFirestore
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class AnonymousCountersTest {

    @Test
    fun `counters are not reset when the Firestore write fails`() = runTest {
        val auth = mockk<FirebaseAuth>()
        val user = mockk<FirebaseUser>()
        every { auth.currentUser } returns user
        every { user.uid } returns "test-uid"

        val db = mockk<FirebaseFirestore>()
        val collection = mockk<CollectionReference>()
        every { db.collection("coachDailyCounters") } returns collection
        val failedTask: Task<DocumentReference> = Tasks.forException(RuntimeException("network error"))
        every { collection.add(any()) } returns failedTask

        val counters = AnonymousCounters(db, auth)
        counters.incrementShown()
        counters.incrementShown()

        try {
            counters.syncDailyAggregates()
        } catch (_: Exception) {
            // expected — write failed
        }

        assertEquals(2, counters.getSessionMinutesTestHook())
    }
}
```

Note: `getSessionMinutesTestHook()` does not exist on `AnonymousCounters` — this test needs a way to observe `shownToday` without a public getter. Rather than exposing a test-only getter that leaks internal state (against the spec's "counters only, minimal surface" intent), make the four `*Today` fields `internal` instead of `private` in `AnonymousCounters.kt` (internal is visible within the same Gradle module, including its test source set, but not from outside the module) and assert on `counters.shownToday` directly:

Change `contextual-coach/app/src/main/kotlin/com/registry/coach/monitor/AnonymousCounters.kt` lines 22-25 from:

```kotlin
    private var shownToday = 0
    private var expandedToday = 0
    private var actedOnToday = 0
    private var suppressedToday = 0
```

to:

```kotlin
    internal var shownToday = 0
    internal var expandedToday = 0
    internal var actedOnToday = 0
    internal var suppressedToday = 0
```

Then rewrite the test's final assertion to `assertEquals(2, counters.shownToday)`.

- [ ] **Step 5: Write a second test confirming counters ARE reset when the write succeeds**

```kotlin
    @Test
    fun `counters are reset after a successful Firestore write`() = runTest {
        val auth = mockk<FirebaseAuth>()
        val user = mockk<FirebaseUser>()
        every { auth.currentUser } returns user
        every { user.uid } returns "test-uid"

        val db = mockk<FirebaseFirestore>()
        val collection = mockk<CollectionReference>()
        every { db.collection("coachDailyCounters") } returns collection
        val docRef = mockk<DocumentReference>()
        val successTask: Task<DocumentReference> = Tasks.forResult(docRef)
        every { collection.add(any()) } returns successTask

        val counters = AnonymousCounters(db, auth)
        counters.incrementShown()

        counters.syncDailyAggregates()

        assertEquals(0, counters.shownToday)
    }
```

Add this as a second `@Test` method inside the same `AnonymousCountersTest` class from Step 4.

- [ ] **Step 6: Run both tests to verify they pass**

Run: `cd contextual-coach && ./gradlew :app:testDebugUnitTest --tests "com.registry.coach.monitor.AnonymousCountersTest"`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add contextual-coach/app/src/main/kotlin/com/registry/coach/monitor/AnonymousCounters.kt contextual-coach/app/build.gradle.kts contextual-coach/app/src/test/kotlin/com/registry/coach/monitor/AnonymousCountersTest.kt
git commit -m "fix: await Firestore write before resetting daily counters to prevent silent data loss"
```

---

### Task 5: Fix the cross-listener race on `bestItemName` resolution

**Files:**
- Modify: `contextual-coach/app/src/main/kotlin/com/registry/coach/data/FirestoreRankingCache.kt`
- Test: `contextual-coach/app/src/test/kotlin/com/registry/coach/data/FirestoreRankingCacheTest.kt`

**Interfaces:**
- Consumes: none new — uses the existing `rankings`, `itemsById`, `itemsByCanonical` internal maps.
- Produces: a new private method `rebuildRankingNames()` that both listener callbacks invoke, so `bestItemName` is always recomputed from the latest `itemsById` snapshot regardless of which listener fired last.

- [ ] **Step 1: Extract ranking-name resolution into a shared rebuild function**

In `contextual-coach/app/src/main/kotlin/com/registry/coach/data/FirestoreRankingCache.kt`, replace the whole class body's listener section (originally lines 27-84) with:

```kotlin
    // In-memory caches
    private val rankings = mutableMapOf<TaskCategory, CachedTaskRanking>()
    private val itemsByCanonical = mutableMapOf<String, CachedRegistryItem>()
    private val itemsById = mutableMapOf<String, CachedRegistryItem>()

    // Raw ranking data from Firestore, kept separately from `rankings` so
    // bestItemName can be recomputed whenever itemsById changes, without
    // needing a fresh Firestore snapshot.
    private data class RawRanking(val orderedIds: List<String>, val bestId: String)
    private val rawRankings = mutableMapOf<TaskCategory, RawRanking>()

    private var rankingListener: ListenerRegistration? = null
    private var itemListener: ListenerRegistration? = null

    /** Start listening for Firestore changes. Call once after auth. */
    override fun startListening() {
        val uid = auth.currentUser?.uid ?: return

        rankingListener = db.collection("taskRankings")
            .whereEqualTo("createdBy", uid)
            .addSnapshotListener { snapshot, _ ->
                snapshot ?: return@addSnapshotListener
                rawRankings.clear()
                for (doc in snapshot.documents) {
                    val category = TaskCategory.fromWire(
                        doc.getString("taskCategory") ?: continue
                    ) ?: continue
                    val orderedItems = doc.get("orderedItems") as? List<*> ?: continue
                    val orderedIds = orderedItems.filterIsInstance<String>()
                    val bestId = orderedIds.firstOrNull() ?: continue
                    rawRankings[category] = RawRanking(orderedIds, bestId)
                }
                rebuildRankings()
            }

        itemListener = db.collection("registryItems")
            .whereEqualTo("createdBy", uid)
            .addSnapshotListener { snapshot, _ ->
                snapshot ?: return@addSnapshotListener
                itemsByCanonical.clear()
                itemsById.clear()
                for (doc in snapshot.documents) {
                    val categories = (doc.get("taskCategories") as? List<*>)
                        ?.filterIsInstance<String>()
                        ?.mapNotNull { TaskCategory.fromWire(it) }
                        ?: emptyList()

                    val item = CachedRegistryItem(
                        id = doc.id,
                        name = doc.getString("name") ?: doc.id,
                        canonicalIdentity = doc.getString("canonicalIdentity"),
                        taskCategories = categories,
                        isBestForTask = doc.getBoolean("isBestForTask") ?: false,
                    )
                    itemsById[doc.id] = item
                    item.canonicalIdentity?.let { itemsByCanonical[it] = item }
                }
                rebuildRankings()
            }
    }

    /**
     * Recompute `rankings` (with resolved bestItemName) from the current
     * `rawRankings` + `itemsById` state. Called after EITHER listener fires,
     * so name resolution never depends on listener firing order — whichever
     * snapshot arrives first produces a best-effort id-as-name fallback,
     * and the next snapshot (from either collection) corrects it.
     */
    private fun rebuildRankings() {
        rankings.clear()
        for ((category, raw) in rawRankings) {
            val bestName = itemsById[raw.bestId]?.name ?: raw.bestId
            rankings[category] = CachedTaskRanking(
                taskCategory = category,
                orderedItemIds = raw.orderedIds,
                bestItemId = raw.bestId,
                bestItemName = bestName,
            )
        }
    }

    override fun stopListening() {
        rankingListener?.remove()
        itemListener?.remove()
    }
```

- [ ] **Step 2: Build to confirm the refactor compiles**

Run: `cd contextual-coach && ./gradlew :app:assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Write a unit test proving name resolution self-corrects regardless of listener order**

This test calls the private `rebuildRankings()` indirectly by driving the class through its public surface using reflection-free means isn't possible since the listeners are Firestore-internal callbacks. Instead, test the observable behavior via `hasPlausibleGap` and a package-visible test seam. Since `rebuildRankings` and the raw maps are `private`, add `@VisibleForTesting internal` visibility to `rawRankings`, `itemsById`, and a test-only trigger — the cleanest seam is to make `rebuildRankings()` `internal` (visible to the test source set within the same module) instead of `private`:

Change `private fun rebuildRankings()` to `internal fun rebuildRankings()`, and change `private val rawRankings` to `internal val rawRankings`, and change `private val itemsById` to `internal val itemsById` in the class from Step 1.

```kotlin
package com.registry.coach.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import io.mockk.mockk
import org.junit.Assert.assertEquals
import org.junit.Test

class FirestoreRankingCacheTest {

    @Test
    fun `bestItemName resolves to id when items have not loaded yet`() {
        val db = mockk<FirebaseFirestore>(relaxed = true)
        val auth = mockk<FirebaseAuth>(relaxed = true)
        val cache = FirestoreRankingCache(db, auth)

        cache.rawRankings[TaskCategory.entries.first()] =
            FirestoreRankingCacheTestAccess.rawRanking(listOf("item-1", "item-2"), "item-1")
        cache.rebuildRankings()

        val ranking = cache.getRanking(TaskCategory.entries.first())
        assertEquals("item-1", ranking?.bestItemName) // no item loaded yet -> id fallback
    }

    @Test
    fun `bestItemName resolves to the real name once items load, even if ranking listener fired first`() {
        val db = mockk<FirebaseFirestore>(relaxed = true)
        val auth = mockk<FirebaseAuth>(relaxed = true)
        val cache = FirestoreRankingCache(db, auth)

        // Ranking snapshot fires first (cold start ordering)
        cache.rawRankings[TaskCategory.entries.first()] =
            FirestoreRankingCacheTestAccess.rawRanking(listOf("item-1"), "item-1")
        cache.rebuildRankings()
        assertEquals("item-1", cache.getRanking(TaskCategory.entries.first())?.bestItemName)

        // Item snapshot arrives afterward
        cache.itemsById["item-1"] = CachedRegistryItem(
            id = "item-1",
            name = "Todoist",
            canonicalIdentity = "com.todoist",
            taskCategories = listOf(TaskCategory.entries.first()),
            isBestForTask = true,
        )
        cache.rebuildRankings()

        assertEquals("Todoist", cache.getRanking(TaskCategory.entries.first())?.bestItemName)
    }
}
```

`FirestoreRankingCacheTestAccess.rawRanking(...)` references the private nested `RawRanking` data class from Step 1, which is not directly constructible from the test file since it's `private data class RawRanking` inside `FirestoreRankingCache`. Change `private data class RawRanking` to `internal data class RawRanking` in Step 1's code, then construct it directly in the test instead of via a helper object — replace both `FirestoreRankingCacheTestAccess.rawRanking(...)` calls with `FirestoreRankingCache.RawRanking(listOf("item-1", "item-2"), "item-1")` (adjusting args per call site), and delete the nonexistent `FirestoreRankingCacheTestAccess` reference.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd contextual-coach && ./gradlew :app:testDebugUnitTest --tests "com.registry.coach.data.FirestoreRankingCacheTest"`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add contextual-coach/app/src/main/kotlin/com/registry/coach/data/FirestoreRankingCache.kt contextual-coach/app/src/test/kotlin/com/registry/coach/data/FirestoreRankingCacheTest.kt
git commit -m "fix: recompute ranking display names on every listener fire to avoid cold-start id fallback"
```

---

### Task 6: Full module verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `cd contextual-coach && ./gradlew :app:testDebugUnitTest`
Expected: All tests pass, including pre-existing `DenylistFilterTest`.

- [ ] **Step 2: Run a full assemble to confirm the module builds clean**

Run: `cd contextual-coach && ./gradlew :app:assembleDebug`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Run lint to confirm no new violations (including the custom no-logging-in-privacy-zone rule)**

Run: `cd contextual-coach && ./gradlew :app:lintDebug`
Expected: No new lint errors. Review `contextual-coach/app/build/reports/lint-results-debug.html` if any appear.

- [ ] **Step 4: Commit if any lint autofixes were applied (otherwise skip)**

```bash
git status
```

If lint made no changes, there is nothing to commit — this task is verification-only.
