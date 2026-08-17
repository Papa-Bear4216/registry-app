package com.registry.coach.evaluator

import android.view.accessibility.AccessibilityNodeInfo
import com.registry.coach.data.CachedTaskRanking
import com.registry.coach.data.TaskCategory
import javax.inject.Inject
import javax.inject.Singleton

/**
 * On-device Gemini Nano implementation of [GapEvaluator].
 *
 * Takes ephemeral screen content + cached ranking, returns a yes/no decision.
 * Input never outlives the call — screenContent is read once by the model,
 * then the reference is dropped. Never persisted, never logged (section 10
 * lint rule enforces this at build time).
 *
 * If the AICore call fails for any reason (resource exhaustion, timeout,
 * model unavailable), returns NoGap — no retry loop, no crash (section 6).
 */
@Singleton
class GeminiNanoGapEvaluator @Inject constructor() : GapEvaluator {

    companion object {
        /** Score delta threshold — tuning knob (spec section 4). */
        const val GAP_THRESHOLD = 0.3

        /** Dwell time threshold in seconds (spec section 3: ~10s starting point). */
        const val DWELL_THRESHOLD_SECONDS = 10L
    }

    override suspend fun evaluate(
        screenContent: AccessibilityNodeInfo,
        candidateRanking: CachedTaskRanking,
        currentPackage: String,
        sessionMinutesInCategory: Int,
    ): GapResult {
        return try {
            // Extract visible text from accessibility tree — held in memory only
            val screenText = extractVisibleText(screenContent)
            // screenContent reference is NOT stored beyond this point

            // TODO: Wire up actual GenerativeModel call when AICore SDK is available.
            // The prompt instructs Gemini Nano to:
            // 1. Classify visible content into a TaskCategory
            // 2. Confirm whether detected category matches the candidate ranking
            // 3. Return JSON: { "isGap": boolean, "confidence": number, "detectedCategory": string }
            //
            // For now, return NoGap — the scaffold is structurally correct but
            // the AI inference is stubbed until a real AICore device is available.
            //
            // val prompt = buildPrompt(screenText, candidateRanking, currentPackage)
            // val response = model.generateContent(prompt)
            // val parsed = parseResponse(response.text ?: return GapResult.NoGap)
            //
            // if (parsed.isGap && parsed.confidence > GAP_THRESHOLD) {
            //     GapResult.RealGap(...)
            // } else {
            //     GapResult.NoGap
            // }

            // screenText goes out of scope — never stored, never logged

            // Stub: always return NoGap until AICore is wired
            GapResult.NoGap
        } catch (e: Exception) {
            // Section 6: AICore failure -> NoGap, no retry, no crash
            GapResult.NoGap
        }
    }

    /**
     * Recursively extract visible text from the accessibility tree.
     * Returns a plain string summary. The AccessibilityNodeInfo reference
     * is NOT retained — only the extracted text string survives this call.
     */
    private fun extractVisibleText(node: AccessibilityNodeInfo): String {
        val builder = StringBuilder()
        extractTextRecursive(node, builder)
        return builder.toString()
    }

    private fun extractTextRecursive(node: AccessibilityNodeInfo, builder: StringBuilder) {
        node.text?.let { text ->
            if (text.isNotBlank()) {
                builder.append(text).append(' ')
            }
        }
        node.contentDescription?.let { desc ->
            if (desc.isNotBlank()) {
                builder.append(desc).append(' ')
            }
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            extractTextRecursive(child, builder)
            child.recycle()
        }
    }

    /**
     * Formats the usage-awareness fact text for the bubble.
     * This is the digital-wellbeing framing that leads the collapsed bubble
     * (spec section 1) — computed from local session time, not screen content.
     */
    internal fun formatUsageFact(category: TaskCategory, sessionMinutes: Int): String {
        val hours = sessionMinutes / 60.0
        return if (hours >= 1.0) {
            "%.1fh in %s apps today".format(hours, category.name)
        } else {
            "%dm in %s apps today".format(sessionMinutes, category.name)
        }
    }
}