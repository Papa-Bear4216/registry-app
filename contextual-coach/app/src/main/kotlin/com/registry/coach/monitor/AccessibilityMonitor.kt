package com.registry.coach.monitor

import android.accessibilityservice.AccessibilityService
import android.content.pm.PackageManager
import android.os.Build
import android.view.accessibility.AccessibilityEvent
import com.registry.coach.data.LocalRankingCache
import com.registry.coach.evaluator.GapEvaluator
import com.registry.coach.evaluator.GapResult
import com.registry.coach.filter.DenylistFilter
import com.registry.coach.ui.BubbleRenderer
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Spec section 9.1 — owns the AccessibilityService lifecycle.
 * Emits app-switch events and runs the two-tier pipeline:
 *
 * 1. PRE-FILTER (all cheap, NO accessibility-tree read):
 *    a. System app check
 *    b. Sensitive-app denylist check
 *    c. Dwell-time debounce (>=10s)
 *    d. Cached ranking gap check (cheap Firestore cache lookup)
 *
 * 2. Only if ALL pre-filter checks pass:
 *    -> Read accessibility tree snapshot
 *    -> Pass to GapEvaluator (on-device Gemini Nano)
 *    -> GapResult.RealGap -> render bubble
 *    -> GapResult.NoGap -> increment anonymous counter
 *
 * PRE-FILTER ORDERING IS CRITICAL (spec section 3):
 * Denylist and system-app checks happen STRICTLY BEFORE any
 * accessibility-tree content is read. A skip at the pre-filter
 * stage means ZERO screen content is ever accessed for that event.
 */
@AndroidEntryPoint
class AccessibilityMonitor : AccessibilityService() {

    @Inject lateinit var denylistFilter: DenylistFilter
    @Inject lateinit var rankingCache: LocalRankingCache
    @Inject lateinit var gapEvaluator: GapEvaluator
    @Inject lateinit var bubbleRenderer: BubbleRenderer
    @Inject lateinit var counters: AnonymousCounters

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val dwellTimer = DwellTimer()
    private var currentForegroundPackage: String? = null
    private lateinit var systemPackages: Set<String>

    override fun onServiceConnected() {
        super.onServiceConnected()
        systemPackages = loadSystemPackages()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val packageName = event.packageName?.toString() ?: return

        // Same package as already tracked -> ignore (prevents re-triggering on in-app nav)
        if (packageName == currentForegroundPackage) return
        currentForegroundPackage = packageName

        // ============ PRE-FILTER (all cheap, NO tree read yet) ============

        // 1. System app check
        if (denylistFilter.isSystemApp(packageName, systemPackages)) return

        // 2. Sensitive-app denylist
        if (denylistFilter.isBlocked(packageName)) return

        // 3. Dwell-time debounce — wait for threshold before proceeding
        dwellTimer.start(packageName) {
            onDwellThresholdReached(packageName)
        }
    }

    private fun onDwellThresholdReached(packageName: String) {
        serviceScope.launch {
            // 4. Cached ranking gap check (cheap Firestore cache lookup)
            if (!rankingCache.hasPlausibleGap(packageName)) return@launch

            // ============ ALL PRE-FILTER CHECKS PASSED ============
            // NOW read the accessibility tree — this is the first and only
            // point where screen content is accessed for this event.

            val rootNode = rootInActiveWindow ?: return@launch

            // Resolve the category for this package
            val categories = rankingCache.getTaskCategories(packageName)
            val category = categories.firstOrNull() ?: return@launch
            val ranking = rankingCache.getRanking(category) ?: return@launch

            val result = gapEvaluator.evaluate(
                screenContent = rootNode,
                candidateRanking = ranking,
                currentPackage = packageName,
                sessionMinutesInCategory = counters.getSessionMinutes(category),
            )
            // rootNode reference is NOT retained past this point

            when (result) {
                is GapResult.RealGap -> {
                    bubbleRenderer.showCollapsed(result)
                    counters.incrementShown()
                }
                is GapResult.NoGap -> {
                    counters.incrementSuppressed()
                }
            }
        }
    }

    override fun onInterrupt() {
        // Required override — no-op
        dwellTimer.cancel()
    }

    override fun onDestroy() {
        super.onDestroy()
        dwellTimer.cancel()
    }

    /** Load the set of system-installed package names for isSystemApp checks. */
    private fun loadSystemPackages(): Set<String> {
        return try {
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                PackageManager.ApplicationInfoFlags.of(PackageManager.MATCH_SYSTEM_ONLY.toLong())
            } else {
                @Suppress("DEPRECATION")
                null
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && flags != null) {
                packageManager.getInstalledApplications(flags)
                    .map { it.packageName }
                    .toSet()
            } else {
                @Suppress("DEPRECATION")
                packageManager.getInstalledApplications(PackageManager.MATCH_SYSTEM_ONLY)
                    .map { it.packageName }
                    .toSet()
            }
        } catch (e: Exception) {
            emptySet()
        }
    }
}