package com.registry.coach.evaluator

import android.view.accessibility.AccessibilityNodeInfo
import com.registry.coach.data.CachedTaskRanking
import com.registry.coach.data.TaskCategory

/**
 * Spec section 9.4 — wraps the AICore/Gemini Nano call.
 *
 * CONTRACT:
 * - [screenContent] is an ephemeral accessibility-tree snapshot.
 * - It MUST NOT be persisted, logged, passed to BubbleRenderer, or stored in any field.
 * - It is read once by the on-device model and then the reference is dropped.
 * - If the AI call fails for any reason, return [GapResult.NoGap] (section 6).
 */
interface GapEvaluator {
    suspend fun evaluate(
        screenContent: AccessibilityNodeInfo,
        candidateRanking: CachedTaskRanking,
        currentPackage: String,
        sessionMinutesInCategory: Int,
    ): GapResult
}

/**
 * BubbleRenderer structurally cannot receive screen content because
 * [GapResult.RealGap] contains only strings and an enum — this is
 * enforced by the type system, not by convention (spec section 9.5).
 */
sealed class GapResult {
    /** No meaningful gap — do nothing. */
    data object NoGap : GapResult()

    /** Real gap found. Contains ONLY display-safe data — never screen content. */
    data class RealGap(
        val suggestedAppName: String,
        val taskCategory: TaskCategory,
        val usageFactText: String,
    ) : GapResult()
}