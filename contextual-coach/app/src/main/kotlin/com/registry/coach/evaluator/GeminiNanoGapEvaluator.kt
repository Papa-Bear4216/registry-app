package com.registry.coach.evaluator

import android.view.accessibility.AccessibilityNodeInfo
import com.google.mlkit.genai.prompt.Generation
import com.registry.coach.data.CachedTaskRanking
import com.registry.coach.data.TaskCategory
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

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

    @Serializable
    internal data class GapVerdict(
        val isGap: Boolean,
        val confidence: Double,
        val detectedCategory: String,
    )

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

            val prompt = buildPrompt(screenText, candidateRanking, currentPackage)
            val model = Generation.getClient()
            val response = model.generateContent(prompt)
            val raw = response.candidates.firstOrNull()?.text ?: return GapResult.NoGap
            // screenText/raw go out of scope after this line — never stored, never logged

            val verdict = parseVerdict(raw) ?: return GapResult.NoGap
            val detectedCategory = TaskCategory.fromWire(verdict.detectedCategory)

            // Guard against a hallucinated category the same way dedupMatch.ts
            // guards hallucinated ids — reject, don't coerce.
            if (detectedCategory != candidateRanking.taskCategory) {
                return GapResult.NoGap
            }

            if (verdict.isGap && verdict.confidence > GAP_THRESHOLD) {
                GapResult.RealGap(
                    suggestedAppName = candidateRanking.bestItemName,
                    taskCategory = candidateRanking.taskCategory,
                    usageFactText = formatUsageFact(candidateRanking.taskCategory, sessionMinutesInCategory),
                )
            } else {
                GapResult.NoGap
            }
        } catch (e: Exception) {
            // Section 6: AICore failure -> NoGap, no retry, no crash
            GapResult.NoGap
        }
    }

    /**
     * Builds the classification prompt. Instructs the model to respond with
     * ONLY a JSON object matching [GapVerdict] — no structured-output API is
     * used (that surface is alpha-only), so the response is parsed manually.
     */
    private fun buildPrompt(
        screenText: String,
        candidateRanking: CachedTaskRanking,
        currentPackage: String,
    ): String {
        return """
            You are classifying the on-screen content of an Android app to detect
            whether the user is doing a task better suited to a different app.

            Current app package: $currentPackage
            Candidate better-suited task category: ${candidateRanking.taskCategory.wire}
            Visible on-screen text: $screenText

            Respond with ONLY a JSON object, no other text, matching this shape:
            {"isGap": boolean, "confidence": number between 0 and 1, "detectedCategory": one of "writing","coding","communication","design","productivity","media","finance","utilities","other"}
        """.trimIndent()
    }

    /** Returns null on any malformed/non-JSON response — caller maps that to NoGap. */
    internal fun parseVerdict(raw: String): GapVerdict? {
        return try {
            val jsonStart = raw.indexOf('{')
            val jsonEnd = raw.lastIndexOf('}')
            if (jsonStart == -1 || jsonEnd == -1 || jsonEnd < jsonStart) return null
            Json.decodeFromString<GapVerdict>(raw.substring(jsonStart, jsonEnd + 1))
        } catch (e: Exception) {
            null
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