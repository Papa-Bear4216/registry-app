package com.registry.coach.ui

import com.registry.coach.evaluator.GapResult

/**
 * Spec section 9.5 — owns the SYSTEM_ALERT_WINDOW UI.
 *
 * STRUCTURAL PRIVACY GUARANTEE: This interface accepts ONLY [GapResult.RealGap],
 * which contains only strings and a TaskCategory enum — never AccessibilityNodeInfo
 * or any screen content. This is enforced by the type system, not by convention.
 *
 * BubbleRenderer is structurally incapable of seeing screen content since
 * it never crosses its interface boundary (spec section 9).
 */
interface BubbleRenderer {
    /** Show collapsed bubble. Input is ONLY pre-computed display data. */
    fun showCollapsed(gap: GapResult.RealGap)

    /** Expand the bubble to show the full suggestion. */
    fun expandBubble()

    /** Dismiss the bubble. */
    fun dismiss()

    /** Whether a bubble is currently showing. */
    fun isShowing(): Boolean
}